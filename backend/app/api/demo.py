"""Explicit DEMO endpoints. Everything returned here is synthetic and flagged demo."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_satellite_provider, get_weather_provider
from app.errors import ApiError, ErrorCode
from app.providers.base import FieldSatelliteProvider, WeatherProvider
from app.providers.local_fixture import FixtureNotFound, fixture_weather, list_fixtures, load_fixture
from app.schemas.common import VerificationStatus
from app.schemas.inspections import FollowUpEvaluateRequest, FollowUpObservationIn
from app.schemas.interventions import RiskCase
from app.schemas.risk import RiskAnalyzeRequest
from app.schemas.weather import DailyWeather
from app.services.assessment import run_assessment
from app.services.followup_engine import evaluate_followup
from app.services.intervention_engine import prioritize
from app.services.weather_service import evaluate_alerts
from app.utils.provenance import SourceType, make_provenance

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

DISCLAIMER = (
    "DEMO DATA. This farmer-level workflow is generated from a synthetic fixture to illustrate how verified, registered field "
    "boundaries plug into the system (assessment -> intervention -> inspection -> follow-up). The field polygon, satellite values "
    "and weather values are not real observations and do not represent any real farmer or field. Real regional intelligence for "
    "Yavatmal is served separately at /api/v1/pilot/yavatmal/*."
)


@router.get("/fixtures", summary="Available demo fixtures")
def fixtures() -> dict[str, Any]:
    return {"demo": True, "fixtures": list_fixtures()}


@router.get("/scenario", summary="One coherent DEMO journey through the full workflow")
def scenario(
    fixture_id: str = Query("yavatmal_demo"),
    weather: WeatherProvider = Depends(get_weather_provider),
    satellite: FieldSatelliteProvider = Depends(get_satellite_provider),
) -> dict[str, Any]:
    try:
        fx = load_fixture(fixture_id)
    except FixtureNotFound as exc:
        raise ApiError(ErrorCode.NOT_FOUND, str(exc)) from exc

    field = fx["field"]
    assessment = run_assessment(
        RiskAnalyzeRequest(location_id=field["field_id"], field_id=field["field_id"], demo_fixture_id=fixture_id, persist=False),
        None, weather, satellite, allow_demo=True,
    )
    as_of = assessment.as_of_date
    recent = [d for d in fixture_weather(fx) if d.date <= as_of]
    forecast = [DailyWeather(**d) for d in fx.get("weather_forecast", [])]
    alerts = evaluate_alerts(recent, forecast, now=f"{as_of}T06:00:00+00:00")

    veg = assessment.observations.vegetation
    case = RiskCase(
        case_id=field["field_id"],
        risk_score=assessment.risk.score if assessment.risk.score is not None else assessment.risk.provisional_score,
        risk_level=assessment.risk.level.value,
        evidence_quality_score=assessment.evidence_quality.score,
        ndvi_trend_per_10d=veg.ndvi_trend_per_10d if veg else None,
        crop_stage=fx["crop"].get("crop_stage"),
        affected_farmers=fx.get("context", {}).get("affected_farmers_demo"),
        unresolved_alerts=0,
        verification_status=VerificationStatus.UNVERIFIED,
    )
    ranked = prioritize([case])[0]

    fu = fx["followup"]
    followup = evaluate_followup(FollowUpEvaluateRequest(
        start_date=fu["start_date"], ndvi_at_start=fu["ndvi_at_start"],
        observations=[FollowUpObservationIn(**o, source_type="DEMO") for o in fu["observations"]],
        verification_status=None,
    ))

    demo_prov = make_provenance("demo_fixture", SourceType.DEMO, provider_metadata={"fixture": fixture_id})
    return {
        "demo": True,
        "is_demo": True,
        "source_type": "DEMO",
        "disclaimer": DISCLAIMER,
        "fixture_id": fixture_id,
        "field": {"field_id": field["field_id"], "label": field["label"], "geometry": field["geometry"], "note": field["note"]},
        "steps": [
            {"step": 1, "name": "environmental_observation", "source_type": "DEMO", "data": assessment.observations.weather},
            {"step": 2, "name": "negative_vegetation_anomaly", "source_type": "DEMO", "data": veg},
            {"step": 3, "name": "weather_stress_evidence", "source_type": "INFERRED", "data": {"alerts": alerts, "possible_factors": assessment.possible_factors}},
            {"step": 4, "name": "risk_calculation", "source_type": "INFERRED", "data": assessment.risk},
            {"step": 5, "name": "evidence_quality", "source_type": "INFERRED", "data": assessment.evidence_quality},
            {"step": 6, "name": "intervention_recommendation", "source_type": "INFERRED",
             "data": {"priority": ranked, "recommended_next_step": assessment.recommended_next_step, "reasoning": assessment.reasoning}},
            {"step": 7, "name": "field_inspection", "source_type": "CONFIRMED",
             "data": {"status": "PLACEHOLDER", "verification_status": "UNVERIFIED",
                      "note": "No inspection recorded. A field worker records one via POST /api/v1/inspections; only then can a cause be CONFIRMED."}},
            {"step": 8, "name": "follow_up", "source_type": "INFERRED", "data": followup},
        ],
        "prediction": assessment.prediction,
        "assessment": assessment,
        "provenance": [demo_prov] + assessment.provenance,
        "generated_for_date": date.today().isoformat(),
    }
