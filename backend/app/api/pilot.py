"""Yavatmal real-data pilot endpoints (regional vegetation monitoring; not farmer fields)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.errors import ApiError, ErrorCode
from app.pilot.region import pilot_dir, processed_dir, read_json, reports_dir
from app.schemas.common import ErrorResponse

router = APIRouter(prefix="/api/v1/pilot/yavatmal", tags=["pilot: yavatmal"])
ERRORS = {404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}


def _load(name: str, base=None) -> Any:
    path = (base or processed_dir()) / name
    if not path.exists():
        raise ApiError(ErrorCode.PILOT_NOT_BUILT, "Pilot artifacts not built yet. Run: python scripts/build_yavatmal_pilot.py", {"missing": str(path.name)})
    return read_json(path)


@router.get("/summary", responses=ERRORS, summary="Regional summary built from real MOD13Q1 + Open-Meteo data")
def summary() -> dict[str, Any]:
    return _load("pilot_snapshot.json")["summary"]


@router.get("/cells", responses=ERRORS, summary="Current state of every monitoring cell (map layer)")
def cells(include_details: bool = Query(False, description="Include reasoning, weather, components and provenance per cell.")) -> dict[str, Any]:
    snap = _load("pilot_snapshot.json")
    out = []
    for c in snap["cells"]:
        row = {
            "cell_id": c["cell_id"], "lat": c["lat"], "lon": c["lon"],
            "cell_type": c["cell_type"], "is_farmer_field": False, "is_demo": False,
            "latest_observation_date": c["latest_observation_date"], "observation_age_days": c["observation_age_days"],
            "latest_ndvi": c["latest_ndvi"], "baseline_ndvi": c["baseline_ndvi"], "ndvi_anomaly_pct": c["ndvi_anomaly_pct"],
            "ndvi_trend_per_10d": c["ndvi_trend_per_10d"],
            "risk_level": c["risk"]["level"], "risk_score": c["risk"]["score"], "risk_method": c["risk"]["method"],
            "evidence_score": c["evidence_quality"]["score"], "evidence_level": c["evidence_quality"]["level"],
            "priority": c["priority"]["level"], "priority_rank": c["priority"]["rank"],
            "possible_factors": c["possible_factors"], "recommended_next_step": c["recommended_next_step"],
            "prediction_status": c["prediction"]["status"], "prediction_probability": c["prediction"]["probability"],
        }
        if include_details:
            row["details"] = {k: c[k] for k in ("risk", "evidence_quality", "weather", "reasoning", "prediction", "priority", "warnings", "provenance",
                                                "baseline_observation_count", "baseline_years", "latest_valid_pixel_pct")}
        out.append(row)
    s = snap["summary"]
    return {"demo": False, "is_demo": False, "as_of_date": s["as_of_date"], "latest_observation_date": s["latest_observation_date"],
            "note": "Regional vegetation monitoring cells (~2.25 km MODIS sampling squares). Not farmer fields; not verified cotton fields.",
            "count": len(out), "cells": out}


@router.get("/cells/{cell_id}", responses=ERRORS, summary="Full assessment and history for one monitoring cell")
def cell_detail(cell_id: str) -> dict[str, Any]:
    snap = _load("pilot_snapshot.json")
    match = [c for c in snap["cells"] if c["cell_id"] == cell_id]
    if not match:
        raise ApiError(ErrorCode.NOT_FOUND, f"Monitoring cell {cell_id} not found.")
    ts = _load("pilot_timeseries.json")
    return {"demo": False, **match[0], "timeseries": ts["cells"].get(cell_id, [])}


@router.get("/timeseries", responses=ERRORS, summary="Regional (or per-cell) NDVI, past-only baseline and anomaly over time")
def timeseries(cell_id: str | None = None, start: str | None = None, end: str | None = None) -> dict[str, Any]:
    ts = _load("pilot_timeseries.json")
    if cell_id:
        if cell_id not in ts["cells"]:
            raise ApiError(ErrorCode.NOT_FOUND, f"Monitoring cell {cell_id} not found.")
        series = ts["cells"][cell_id]
    else:
        series = ts["regional"]
    series = [p for p in series if (not start or p["date"] >= start) and (not end or p["date"] <= end)]
    return {"demo": False, "is_demo": False, "source_type": "OBSERVED", "scope": cell_id or "regional", "note": ts["note"],
            "baseline_method": "past-only seasonal baseline (prior seasons, same period of year)", "points": series}


@router.get("/boundary", responses=ERRORS, summary="Pilot boundary (geoBoundaries ADM2) and monitoring-cell squares as GeoJSON")
def boundary() -> dict[str, Any]:
    return {"boundary": _load("boundary.geojson", pilot_dir()), "monitoring_cells": _load("monitoring_cells.geojson", pilot_dir())}


@router.get("/model", responses=ERRORS, summary="Pilot model evaluation (temporal test + separate spatial holdout)")
def model_evaluation() -> dict[str, Any]:
    ev = _load("model_evaluation.json", reports_dir())
    return {"summary": ev["summary"], "dataset": ev.get("dataset")}
