"""Real Yavatmal pilot assessment snapshot.

Runs the existing engines (vegetation summary, evidence quality, heuristic_v1
risk, explanation, prioritisation, gated ML inference) on every monitored cell
using its latest usable MOD13Q1 composite, its past-only seasonal baseline and
current Open-Meteo weather. Monitoring cells are regional sampling locations,
not farmer fields.
"""

from __future__ import annotations

import json
import logging
import math
import statistics
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import load_rules
from app.ml.features import CORE_FEATURES, OPTIONAL_FEATURES
from app.ml.inference import predict
from app.ml.model_registry import model_status
from app.pilot.dataset import fetch_cell_weather, past_only_baseline
from app.pilot.region import processed_dir
from app.providers.base import ProviderError
from app.providers.open_meteo import OpenMeteoProvider
from app.schemas.common import VerificationStatus
from app.schemas.interventions import PriorityLevel, RiskCase
from app.schemas.risk import NextStep, RiskLevel
from app.schemas.satellite import BaselineInfo, SatelliteObservation
from app.services.evidence_engine import MetadataContext, compute_evidence
from app.services.explanation_engine import build_explanation
from app.services.feature_engineering import add_seasonal_climatology, compute_weather_features, summarize_vegetation
from app.services.intervention_engine import prioritize
from app.services.risk_engine import compute_risk
from app.services.weather_service import evaluate_alerts
from app.utils.provenance import SourceType, make_provenance, utcnow_iso

log = logging.getLogger("pilot")
PRODUCT_PROFILE = "modis_mod13q1"
REVIEW_STEPS = {NextStep.URGENT_FIELD_REVIEW.value, NextStep.FIELD_VERIFICATION.value}

LIMITATIONS = [
    "Monitoring cells are ~2.25 km regional sampling squares of 250 m MODIS pixels, not farmer fields and not verified cotton fields.",
    "No verified crop mask is used; signals describe mixed vegetation/cropland within each cell.",
    "MOD13Q1 is a 16-day maximum-value composite released with a delay of roughly 1-3 weeks; it cannot detect very recent changes.",
    "Seasonal baselines use prior seasons since 2019 only (median of the same period of year); they are vegetation-season, not crop-specific, baselines.",
    "Weather values are gridded Open-Meteo reanalysis/model data, not station measurements; water balance ignores irrigation.",
    "Risk is the transparent heuristic_v1 score, not a validated agronomic model; no pest or disease can be inferred from these signals.",
    "NDMI is not available from MOD13Q1 and is left missing.",
]


def _clean(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _median(vals: list[float | None]) -> float | None:
    xs = [v for v in vals if v is not None]
    return round(statistics.median(xs), 4) if xs else None


def cell_observations(comp: pd.DataFrame, cell_id: str) -> list[SatelliteObservation]:
    g = comp[comp["location_id"] == cell_id].sort_values("observation_date")
    out = []
    for r in g.itertuples():
        ndvi = _clean(r.ndvi)
        out.append(SatelliteObservation(date=str(r.observation_date)[:10], ndvi=None if ndvi is None else float(ndvi),
                                        valid_pixel_pct=float(r.valid_pixel_pct), pixel_count=int(r.pixel_count),
                                        source="ornl_daac_tesvis", source_type=SourceType.OBSERVED, is_demo=False))
    return out


def current_weather(cell: dict[str, Any], as_of: date, cfg: dict[str, Any], archive_end: date | None = None):
    """Current weather features (live Open-Meteo) plus a past-only seasonal norm from the cached archive."""
    try:
        res = OpenMeteoProvider(rate_limit_retries=3).history(cell["lat"], cell["lon"], as_of - timedelta(days=45), as_of, include_soil_moisture=False)
    except ProviderError as exc:
        return None, None, str(exc)
    features = compute_weather_features(res.daily, as_of)
    try:
        end = archive_end or as_of - timedelta(days=7)
        archive, _meta = fetch_cell_weather(cell, date.fromisoformat(cfg["weather"]["start_date"]), end, refresh=False)
        min_years = load_rules("risk_config")["water"]["seasonal"]["min_climatology_years"]
        features = add_seasonal_climatology(features, archive, as_of, min_years=min_years)
    except ProviderError as exc:
        features.notes.append(f"Seasonal water climatology unavailable: {exc}")
    return features, res, None


def assess_cell(cell: dict[str, Any], comp: pd.DataFrame, table: pd.DataFrame, cfg: dict[str, Any], as_of: date,
                model_dir: Path, model_enabled: bool, archive_end: date | None = None) -> dict[str, Any]:
    min_valid = cfg["satellite"]["min_valid_pixel_pct"]
    profile = load_rules("evidence_config")["product_profiles"][PRODUCT_PROFILE]
    obs = cell_observations(comp, cell["cell_id"])
    usable = [o for o in obs if o.ndvi is not None and (o.valid_pixel_pct or 0) >= min_valid and o.date <= as_of.isoformat()]
    warnings: list[str] = []

    baseline = BaselineInfo(method="unavailable", notes=["No usable observation."])
    if usable:
        latest = date.fromisoformat(usable[-1].date)
        b = cfg["baseline"]
        val, n, years = past_only_baseline([date.fromisoformat(o.date) for o in usable], [o.ndvi for o in usable], latest,
                                           window_days=b["window_days"], min_days_before=b["min_days_before"],
                                           min_prior_years=b["min_prior_years"], min_observations=b["min_observations"])
        baseline = BaselineInfo(
            value=val, n_observations=n, years=years, method="past_only_day_of_year_window" if val is not None else "unavailable",
            crop_specific=False, window_days=b["window_days"],
            notes=["Median NDVI of this cell in prior seasons within +/- %d days of the same day of year; prior years only. "
                   "Vegetation-season baseline, not crop-specific." % b["window_days"]] if val is not None else
                  [f"Fewer than {b['min_prior_years']} prior seasons / {b['min_observations']} observations available."],
        )
    veg = summarize_vegetation(obs, as_of, baseline, BaselineInfo(method="unavailable", notes=["NDMI not provided by MOD13Q1."]),
                               min_valid, recent_window_days=profile["observation_count"]["window_days"],
                               trend_window_days=profile["trend_window_days"])
    weather, wres, werr = current_weather(cell, as_of, cfg, archive_end)
    if werr:
        warnings.append(f"WEATHER_PROVIDER_UNAVAILABLE: {werr}")

    meta = MetadataContext(crop_type=None, crop_stage=None, sowing_date=None, has_geometry=True)
    evidence = compute_evidence(veg, meta, weather is not None, product=PRODUCT_PROFILE)
    risk = compute_risk(veg, weather, evidence_score=evidence.score)
    factors, reasoning, step = build_explanation(risk, evidence, veg, weather)

    rows = table[(table["location_id"] == cell["cell_id"])].sort_values("observation_date")
    features: dict[str, Any] = {}
    feature_date = None
    if len(rows):
        last = rows.iloc[-1]
        feature_date = str(last["observation_date"])[:10]
        features = {c: _clean(float(last[c])) if c in last and _clean(last[c]) is not None else None for c in CORE_FEATURES + OPTIONAL_FEATURES}
    prediction = predict(features, directory=model_dir, enabled=model_enabled)

    last_comp = comp[(comp["location_id"] == cell["cell_id"]) & (comp["observation_date"].astype(str).str[:10] == (veg.latest_usable_date or ""))]
    prov = [make_provenance("ornl_daac_tesvis", SourceType.OBSERVED, observed_at=veg.latest_usable_date,
                            retrieved_at=str(last_comp["retrieved_at"].iloc[0]) if len(last_comp) else None,
                            quality_flags=veg.quality_flags,
                            provider_metadata={"product": "MOD13Q1 C6.1", "resolution_m": 250, "composite_days": 16,
                                               "composite_end_date": str(last_comp["composite_end_date"].iloc[0]) if len(last_comp) else None,
                                               "tile": str(last_comp["tile"].iloc[0]) if len(last_comp) else None,
                                               "aggregation": "median of quality-accepted pixels (reliability 0/1) in a 9x9 pixel subset"})]
    if wres is not None:
        prov.append(make_provenance(wres.source, SourceType.OBSERVED, observed_at=as_of.isoformat(), retrieved_at=wres.retrieved_at,
                                    quality_flags=wres.quality_flags, provider_metadata=wres.metadata | {"cache_status": wres.cache.status.value}))
    if baseline.value is not None:
        prov.append(make_provenance("past_only_seasonal_baseline", SourceType.INFERRED, observed_at=veg.latest_usable_date,
                                    provider_metadata={"n_observations": baseline.n_observations, "years": baseline.years}))
    prov.append(make_provenance("heuristic_v1", SourceType.INFERRED, observed_at=as_of.isoformat()))
    prov.append(make_provenance("evidence_quality_v1", SourceType.INFERRED, observed_at=as_of.isoformat(), provider_metadata={"profile": PRODUCT_PROFILE}))
    if prediction.status == "AVAILABLE":
        prov.append(make_provenance("pilot_ml_model", SourceType.PREDICTED, observed_at=feature_date,
                                    provider_metadata={"model_version": prediction.model_version}))

    return {
        "cell_id": cell["cell_id"], "lat": cell["lat"], "lon": cell["lon"],
        "is_farmer_field": False, "is_demo": False, "cell_type": "regional_vegetation_monitoring_cell",
        "latest_observation_date": veg.latest_usable_date,
        "observation_age_days": veg.observation_age_days,
        "latest_ndvi": veg.latest_ndvi,
        "latest_valid_pixel_pct": veg.latest_valid_pixel_pct,
        "baseline_ndvi": baseline.value,
        "baseline_observation_count": baseline.n_observations,
        "baseline_years": baseline.years,
        "ndvi_anomaly_pct": veg.ndvi_anomaly_pct,
        "ndvi_trend_per_10d": veg.ndvi_trend_per_10d,
        "risk": risk.model_dump(mode="json"),
        "evidence_quality": evidence.model_dump(mode="json"),
        "weather": weather.model_dump(mode="json") if weather else None,
        "possible_factors": factors,
        "reasoning": reasoning.model_dump(mode="json"),
        "recommended_next_step": step.value,
        "prediction": prediction.model_dump(mode="json") | {"features_as_of": feature_date},
        "warnings": warnings + [w for w in evidence.warnings if w not in warnings],
        "provenance": [p.model_dump(mode="json") for p in prov],
    }


def build_snapshot(cfg: dict[str, Any], cells: list[dict[str, Any]], screening: dict[str, dict[str, Any]], comp: pd.DataFrame,
                   table: pd.DataFrame, model_dir: Path, model_enabled: bool, evaluation: dict[str, Any] | None,
                   as_of: date | None = None) -> dict[str, Any]:
    as_of = as_of or date.today()
    comp = comp.copy()
    comp["observation_date"] = comp["observation_date"].astype(str).str[:10]
    monitored = [c for c in cells if screening.get(c["cell_id"], {}).get("status") == "monitored"]
    # Same archive window as the dataset build -> identical cache keys, no re-download.
    archive_end = min(as_of - timedelta(days=7), date.fromisoformat(max(comp["observation_date"])) + timedelta(days=1)) if len(comp) else None
    results = [assess_cell(c, comp, table, cfg, as_of, model_dir, model_enabled, archive_end) for c in monitored]

    cases = [RiskCase(case_id=r["cell_id"], risk_score=r["risk"]["score"] if r["risk"]["score"] is not None else r["risk"]["provisional_score"],
                      risk_level=r["risk"]["level"], evidence_quality_score=r["evidence_quality"]["score"],
                      ndvi_trend_per_10d=r["ndvi_trend_per_10d"], verification_status=VerificationStatus.UNVERIFIED)
             for r in results]
    ranked = {p.case_id: p for p in prioritize(cases)} if cases else {}
    for r in results:
        p = ranked[r["cell_id"]]
        r["priority"] = {"level": p.priority.value, "rank": p.rank, "score": p.priority_score, "rationale": p.rationale,
                         "factors": [f.model_dump() for f in p.factors]}
    results.sort(key=lambda r: r["priority"]["rank"])

    latest_dates = [r["latest_observation_date"] for r in results if r["latest_observation_date"]]
    latest = max(latest_dates) if latest_dates else None
    usable_latest = [r for r in results if r["latest_observation_date"] == latest]
    levels = [r["risk"]["level"] for r in results]
    dist = {lvl.value: levels.count(lvl.value) for lvl in RiskLevel}
    anomalies = [r["ndvi_anomaly_pct"] for r in results]
    weathers = [r["weather"] for r in results if r["weather"]]

    # Regional weather alerts at the most central monitored cell.
    alerts: list[dict[str, Any]] = []
    weather_note = None
    if monitored:
        clat = statistics.mean(c["lat"] for c in monitored)
        clon = statistics.mean(c["lon"] for c in monitored)
        centre = min(monitored, key=lambda c: (c["lat"] - clat) ** 2 + (c["lon"] - clon) ** 2)
        try:
            prov_om = OpenMeteoProvider(rate_limit_retries=3)
            recent = prov_om.history(centre["lat"], centre["lon"], as_of - timedelta(days=29), as_of, include_soil_moisture=False).daily
            fc = prov_om.forecast(centre["lat"], centre["lon"], 7).daily
            alerts = [a.model_dump(mode="json") for a in evaluate_alerts(recent, fc)]
            weather_note = f"Alerts evaluated at the central monitoring cell {centre['cell_id']}."
        except ProviderError as exc:
            weather_note = f"Weather alerts unavailable: {exc}"

    status = model_status(model_dir, model_enabled)
    freshness = (as_of - date.fromisoformat(latest)).days if latest else None
    kpis = {
        "monitoring_cells_analysed": len(results),
        "cells_requiring_review": sum(1 for r in results if r["recommended_next_step"] in REVIEW_STEPS),
        "cells_insufficient_evidence": dist.get(RiskLevel.INSUFFICIENT_EVIDENCE.value, 0),
        "high_priority_cases": sum(1 for r in results if r["priority"]["level"] in (PriorityLevel.P1_IMMEDIATE_REVIEW.value, PriorityLevel.P2_HIGH_PRIORITY.value)),
        "verify_first_cases": sum(1 for r in results if r["priority"]["level"] == PriorityLevel.VERIFY_FIRST.value),
        "latest_observation_freshness_days": freshness,
        "note": "Operational counts only. No yield, income or loss-prevention figures are estimated.",
    }
    summary = {
        "demo": False,
        "is_demo": False,
        "generated_at": utcnow_iso(),
        "as_of_date": as_of.isoformat(),
        "pilot": {
            "id": cfg["pilot_id"], "region": cfg["region"], "primary_crop_context": cfg["primary_crop_context"],
            "scope": cfg["scope"], "not_farmer_fields": True, "positioning": cfg["positioning"],
        },
        "latest_observation_date": latest,
        "satellite": {"source": "NASA MODIS/Terra via ORNL DAAC TESViS", "provider": cfg["satellite"]["provider"],
                      "product": f"{cfg['satellite']['product']} Collection {cfg['satellite']['collection']}",
                      "resolution_m": cfg["satellite"]["resolution_m"], "composite_interval_days": cfg["satellite"]["composite_interval_days"],
                      "ndmi_available": False},
        "coverage": {"candidate_cells": len(cells), "monitoring_cells": len(results), "excluded_cells": len(cells) - len(results),
                     "usable_cells_latest_composite": len(usable_latest)},
        "regional_condition": {
            "median_ndvi": _median([r["latest_ndvi"] for r in usable_latest]),
            "median_baseline_ndvi": _median([r["baseline_ndvi"] for r in usable_latest]),
            "median_ndvi_anomaly_pct": _median([r["ndvi_anomaly_pct"] for r in usable_latest]),
            "cells_below_baseline": sum(1 for a in anomalies if a is not None and a < 0),
            "cells_above_baseline": sum(1 for a in anomalies if a is not None and a >= 0),
            "cells_without_anomaly": sum(1 for a in anomalies if a is None),
            "cells_high_risk": sum(1 for lvl in levels if lvl in ("HIGH", "CRITICAL")),
            "basis": "latest usable composite per cell; medians over cells observed in the latest composite",
        },
        "weather": {
            "as_of": as_of.isoformat(),
            "median_rainfall_14d_mm": _median([w["rainfall_14d_mm"] for w in weathers]),
            "median_rainfall_30d_mm": _median([w["rainfall_30d_mm"] for w in weathers]),
            "median_water_balance_14d_mm": _median([w["water_balance_14d_mm"] for w in weathers]),
            "median_dry_spell_days": _median([w["dry_spell_length_days"] for w in weathers]),
            "median_max_temperature_7d_c": _median([w["max_temperature_7d_c"] for w in weathers]),
            "alerts": alerts, "note": weather_note,
            "source": "Open-Meteo (gridded model/reanalysis, not station data)",
        },
        "risk_distribution": dist,
        "top_priority_cells": [{k: r[k] for k in ("cell_id", "lat", "lon", "latest_ndvi", "baseline_ndvi", "ndvi_anomaly_pct", "possible_factors", "recommended_next_step")}
                               | {"risk_level": r["risk"]["level"], "risk_score": r["risk"]["score"], "evidence_score": r["evidence_quality"]["score"],
                                  "priority": r["priority"]["level"]} for r in results[:5]],
        "operational_kpis": kpis,
        "model": {
            "status": "AVAILABLE" if (status["available"] and status["validated"] and status["enabled"]) else
                      ("MODEL_NOT_VALIDATED" if status["available"] and not status["validated"] else
                       ("MODEL_DISABLED" if status["available"] else "MODEL_NOT_AVAILABLE")),
            "available": status["available"], "validated": status["validated"], "enabled_for_pilot": status["enabled"],
            "model_version": status["model_version"], "reason": status["reason"],
            "evaluation_summary": evaluation,
            "operational_engine": "heuristic_v1",
        },
        "limitations": LIMITATIONS,
        "provenance": [
            make_provenance("ornl_daac_tesvis", SourceType.OBSERVED, observed_at=latest,
                            provider_metadata={"product": "MOD13Q1 C6.1", "url": "https://modis.ornl.gov/rst/api/v1/"}).model_dump(mode="json"),
            make_provenance("open_meteo", SourceType.OBSERVED, observed_at=as_of.isoformat(),
                            quality_flags=["GRIDDED_MODEL_OR_REANALYSIS_DATA_NOT_STATION_OBSERVATION"]).model_dump(mode="json"),
            make_provenance("geoboundaries_adm2", SourceType.OBSERVED, provider_metadata={"dataset": cfg["boundary"]["dataset"]}).model_dump(mode="json"),
            make_provenance("heuristic_v1", SourceType.INFERRED, observed_at=as_of.isoformat()).model_dump(mode="json"),
        ] + ([make_provenance("pilot_ml_model", SourceType.PREDICTED, provider_metadata={"model_version": status["model_version"]}).model_dump(mode="json")]
             if status["available"] and status["validated"] and status["enabled"] else []),
    }
    return {"summary": summary, "cells": results}


def build_timeseries(table: pd.DataFrame, comp: pd.DataFrame) -> dict[str, Any]:
    t = table.copy()
    t["date"] = t["observation_date"].astype(str).str[:10]
    def med(g: pd.DataFrame, col: str, nd: int) -> float | None:
        if col not in g or g[col].dropna().empty:
            return None
        return round(float(g[col].median()), nd)

    regional = []
    for d, g in t.groupby("date"):
        an = g["ndvi_anomaly_pct"].dropna()
        regional.append({
            "date": d,
            "cells_observed": int(len(g)),
            "median_ndvi": round(float(g["ndvi"].median()), 4),
            "median_baseline_ndvi": med(g, "baseline_ndvi", 4),
            "median_ndvi_anomaly_pct": None if an.empty else round(float(an.median()), 2),
            "pct_cells_below_baseline": None if an.empty else round(100 * float((an < 0).mean()), 1),
            "median_rainfall_30d_mm": med(g, "rainfall_30d", 1),
            "median_water_balance_14d_mm": med(g, "water_balance_14d", 1),
        })
    per_cell: dict[str, list[dict[str, Any]]] = {}
    for r in t.itertuples():
        per_cell.setdefault(r.location_id, []).append({
            "date": r.date, "ndvi": _clean(r.ndvi), "baseline_ndvi": _clean(r.baseline_ndvi), "ndvi_anomaly_pct": _clean(r.ndvi_anomaly_pct),
            "valid_pixel_pct": _clean(r.valid_pixel_pct), "rainfall_30d_mm": _clean(getattr(r, "rainfall_30d", None)), "label": _clean(r.label),
        })
    return {"demo": False, "is_demo": False, "source_type": "OBSERVED", "regional": regional, "cells": per_cell,
            "note": "Usable composites only (quality-filtered). Baseline/anomaly are past-only; null where prior history is insufficient."}


def write_snapshot(snapshot: dict[str, Any], timeseries: dict[str, Any]) -> None:
    d = processed_dir()
    (d / "pilot_snapshot.json").write_text(json.dumps(snapshot, indent=1, default=str), encoding="utf-8")
    (d / "pilot_timeseries.json").write_text(json.dumps(timeseries, default=str), encoding="utf-8")
