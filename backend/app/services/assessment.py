"""Risk assessment orchestration.

Collects evidence (supplied, live provider, or explicit DEMO fixture), runs the
evidence, risk and explanation engines, attaches the (gated) ML prediction
status, records provenance and persists the assessment.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings, load_rules
from app.errors import ApiError, ErrorCode
from app.ml.features import build_feature_row
from app.ml.inference import predict
from app.models.database_models import RiskAssessment, record_audit
from app.providers.base import FieldSatelliteProvider, WeatherProvider
from app.providers.local_fixture import FixtureNotFound, fixture_observations, fixture_weather, load_fixture
from app.schemas.risk import Observations, RiskAnalyzeRequest, RiskAnalyzeResponse
from app.schemas.satellite import BaselineInfo, SatelliteObservation, VegetationSummary
from app.schemas.weather import WeatherFeatures
from app.services.baseline import compute_seasonal_baseline, supplied_baseline
from app.services.evidence_engine import MetadataContext, compute_evidence
from app.services.explanation_engine import build_explanation
from app.services.feature_engineering import compute_weather_features, summarize_vegetation, usable_observations, weather_features_available
from app.services.risk_engine import compute_risk
from app.services.satellite_service import fetch_field_series
from app.services.soil_engine import interpret_soil
from app.services.weather_service import fetch_history, weather_provenance
from app.utils.geo import GeometryError, validate_polygon
from app.utils.provenance import Provenance, SourceType, any_demo, make_provenance

WEATHER_LOOKBACK_DAYS = 45


def _normalise_obs(obs: list[SatelliteObservation]) -> list[SatelliteObservation]:
    """Ensure demo-ness is consistent: DEMO source type <-> is_demo flag."""
    out = []
    for o in obs:
        if o.is_demo or o.source_type == SourceType.DEMO:
            o = o.model_copy(update={"is_demo": True, "source_type": SourceType.DEMO})
        out.append(o)
    return out


def run_assessment(
    req: RiskAnalyzeRequest,
    db: Session | None,
    weather_provider: WeatherProvider,
    satellite_provider: FieldSatelliteProvider,
    *,
    allow_demo: bool = False,
) -> RiskAnalyzeResponse:
    as_of = date.fromisoformat(req.as_of_date) if req.as_of_date else date.today()
    warnings: list[str] = []
    provenance: list[Provenance] = []
    crop = req.crop
    geometry = req.geometry.as_dict() if req.geometry else None

    # ------------------------------------------------------------ demo fixture
    fixture: dict[str, Any] | None = None
    if req.demo_fixture_id:
        if not (allow_demo or get_settings().use_demo_data):
            raise ApiError(ErrorCode.DEMO_DATA_DISABLED, "Demo fixtures are disabled (set USE_DEMO_DATA=true) or use GET /api/v1/demo/scenario.")
        try:
            fixture = load_fixture(req.demo_fixture_id)
        except FixtureNotFound as exc:
            raise ApiError(ErrorCode.NOT_FOUND, str(exc)) from exc
        as_of = date.fromisoformat(req.as_of_date or fixture["as_of_date"])
        crop = crop if crop.crop_type else crop.model_copy(update=fixture.get("crop", {}))
        geometry = geometry or fixture.get("field", {}).get("geometry")
        warnings.append("DEMO_DATA: inputs loaded from a synthetic demo fixture; results are not real observations.")

    # ---------------------------------------------------------------- geometry
    geo_warnings: list[str] = []
    centroid = None
    if geometry:
        try:
            g = validate_polygon(geometry)
            geo_warnings = g.warnings
            centroid = g.centroid
        except GeometryError as exc:
            raise ApiError(ErrorCode.INVALID_FIELD_GEOMETRY, str(exc)) from exc
        warnings.extend(geo_warnings)

    # ----------------------------------------------------------------- weather
    weather: WeatherFeatures | None = None
    if req.weather_features is not None:
        weather = req.weather_features
        provenance.append(make_provenance("client_supplied_weather", req.weather_source_type, observed_at=weather.as_of,
                                          is_demo=req.weather_source_type == SourceType.DEMO))
    elif fixture is not None:
        weather = compute_weather_features(fixture_weather(fixture), as_of)
        provenance.append(make_provenance("demo_fixture", SourceType.DEMO, observed_at=as_of.isoformat(),
                                          provider_metadata={"fixture": req.demo_fixture_id, "kind": "weather"}))
    else:
        lat, lon = (req.lat, req.lon) if req.lat is not None else (centroid if centroid else (None, None))
        if lat is not None and lon is not None:
            try:
                result = fetch_history(weather_provider, lat, lon, as_of - timedelta(days=WEATHER_LOOKBACK_DAYS), as_of)
                weather = compute_weather_features(result.daily, as_of)
                provenance.append(weather_provenance(result, observed_at=as_of.isoformat()))
                if result.cache.status.value == "CACHED_STALE":
                    warnings.append("WEATHER_FROM_STALE_CACHE")
            except ApiError as exc:
                warnings.append(f"{exc.code.value}: {exc.message}")
        else:
            warnings.append("WEATHER_NOT_REQUESTED: supply lat/lon, geometry or weather_features.")

    # --------------------------------------------------------------- satellite
    observations: list[SatelliteObservation] = []
    historical: list[SatelliteObservation] = []
    sat_source = None
    if req.satellite_observations:
        observations = _normalise_obs(req.satellite_observations)
        historical = _normalise_obs(req.historical_observations or [])
        sat_source = "client_supplied_satellite"
    elif fixture is not None:
        observations = fixture_observations(fixture)
        historical = fixture_observations(fixture, "historical_observations")
        sat_source = "demo_fixture"
    elif geometry:
        try:
            observations, historical, _meta = fetch_field_series(satellite_provider, geometry, as_of - timedelta(days=60), as_of, 3)
            sat_source = satellite_provider.name
        except ApiError as exc:
            warnings.append(f"{exc.code.value}: {exc.message}")
    else:
        warnings.append("SATELLITE_NOT_REQUESTED: supply geometry or satellite_observations.")

    min_valid = load_rules("evidence_config")["min_usable_valid_pixel_pct"]
    veg: VegetationSummary | None = None
    if observations:
        usable, _ = usable_observations(observations, as_of, min_valid)
        target = date.fromisoformat(usable[-1].date) if usable else as_of
        if req.baseline_ndvi is not None:
            b_ndvi = supplied_baseline(req.baseline_ndvi, req.baseline_observation_count, req.baseline_years)
            b_ndmi = supplied_baseline(req.baseline_ndmi, req.baseline_observation_count, req.baseline_years)
        elif historical:
            b_ndvi = compute_seasonal_baseline(historical, target, attr="ndvi", min_valid_pixel_pct=min_valid, crop_type=crop.crop_type)
            b_ndmi = compute_seasonal_baseline(historical, target, attr="ndmi", min_valid_pixel_pct=min_valid, crop_type=crop.crop_type)
        else:
            b_ndvi = BaselineInfo(method="unavailable", notes=["No baseline supplied and no historical observations."])
            b_ndmi = BaselineInfo(method="unavailable")
        veg = summarize_vegetation(observations, as_of, b_ndvi, b_ndmi, min_valid)
        is_demo_sat = any(o.is_demo for o in observations)
        types = {o.source_type for o in observations}
        stype = SourceType.DEMO if is_demo_sat else (types.pop() if len(types) == 1 else SourceType.OBSERVED)
        provenance.append(make_provenance(sat_source or "satellite", stype, observed_at=veg.latest_usable_date, is_demo=is_demo_sat,
                                          quality_flags=veg.quality_flags + geo_warnings,
                                          provider_metadata={"usable_observations": veg.usable_observations_total}))
        if b_ndvi.value is not None:
            provenance.append(make_provenance("seasonal_baseline", SourceType.INFERRED, observed_at=target.isoformat(), is_demo=is_demo_sat,
                                              provider_metadata={"method": b_ndvi.method, "n_observations": b_ndvi.n_observations}))

    # -------------------------------------------------------------------- soil
    soil_summary = None
    soil_severity = None
    if req.soil is not None:
        si = interpret_soil(req.soil, verified=req.soil_verified)
        soil_severity = si["soil_risk_severity"]
        soil_summary = {
            "verified": req.soil_verified,
            "abnormal_parameters": si["abnormal_parameters"],
            "out_of_range_parameters": si["out_of_range_parameters"],
            "severity": soil_severity,
        }
        provenance.append(make_provenance("soil_health_card", SourceType.CONFIRMED if req.soil_verified else SourceType.OBSERVED,
                                          is_demo=fixture is not None,
                                          quality_flags=[] if req.soil_verified else ["UNVERIFIED_SOIL_VALUES"]))

    # ----------------------------------------------------------------- engines
    meta = MetadataContext(crop_type=crop.crop_type, crop_stage=crop.crop_stage, sowing_date=crop.sowing_date,
                           has_geometry=geometry is not None, geometry_warnings=tuple(geo_warnings))
    evidence = compute_evidence(veg, meta, weather_features_available(weather))
    risk = compute_risk(veg, weather, soil_severity=soil_severity if req.soil is not None else None,
                        soil_verified=req.soil_verified, evidence_score=evidence.score)
    factors, reasoning, step = build_explanation(risk, evidence, veg, weather, soil_summary)

    prev_ndvi = days_prev = None
    if observations:
        usable, _ = usable_observations(observations, as_of, min_valid)
        if len(usable) >= 2:
            prev_ndvi = usable[-2].ndvi
            days_prev = (date.fromisoformat(usable[-1].date) - date.fromisoformat(usable[-2].date)).days
    prediction = predict(build_feature_row(veg, weather, as_of, prev_ndvi=prev_ndvi, days_since_prev_obs=days_prev, sowing_date=crop.sowing_date))

    demo = fixture is not None or any_demo(provenance)
    provenance.append(make_provenance("heuristic_v1", SourceType.INFERRED, observed_at=as_of.isoformat(), is_demo=demo,
                                      provider_metadata={"engine": "risk_engine", "note": "rule-based, not a trained model"}))
    provenance.append(make_provenance("evidence_quality_v1", SourceType.INFERRED, observed_at=as_of.isoformat(), is_demo=demo))
    if prediction.status == "AVAILABLE":
        provenance.append(make_provenance("ml_model", SourceType.PREDICTED, is_demo=demo, provider_metadata={"model_version": prediction.model_version}))
    warnings.extend(w for w in evidence.warnings if w not in warnings)

    response = RiskAnalyzeResponse(
        assessment_id=None,
        location_id=req.location_id,
        field_id=req.field_id,
        as_of_date=as_of.isoformat(),
        demo=demo,
        risk=risk,
        evidence_quality=evidence,
        observations=Observations(vegetation=veg, weather=weather, soil=soil_summary),
        prediction=prediction,
        possible_factors=factors,
        reasoning=reasoning,
        recommended_next_step=step,
        warnings=warnings,
        provenance=provenance,
    )

    if req.persist and db is not None:
        row = RiskAssessment(
            location_id=req.location_id, field_id=req.field_id, as_of_date=as_of.isoformat(), method=risk.method,
            score=risk.score, provisional_score=risk.provisional_score, level=risk.level.value,
            evidence_score=evidence.score, evidence_level=evidence.level.value, recommended_next_step=step.value,
            payload={}, is_demo=demo,
        )
        db.add(row)
        db.flush()
        response.assessment_id = row.id
        row.payload = response.model_dump(mode="json")
        record_audit(db, entity_type="RiskAssessment", entity_id=row.id, action="CREATED",
                     new_state={"level": risk.level.value, "score": risk.score, "evidence": evidence.score},
                     metadata={"location_id": req.location_id, "is_demo": demo})
        db.commit()
    return response
