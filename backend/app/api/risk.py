from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_satellite_provider, get_weather_provider
from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import RiskAssessment, iso
from app.providers.base import FieldSatelliteProvider, WeatherProvider
from app.schemas.common import ErrorResponse
from app.schemas.risk import RiskAnalyzeRequest, RiskAnalyzeResponse
from app.services.assessment import run_assessment

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])

ERRORS = {422: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


@router.post("/analyze", response_model=RiskAnalyzeResponse, responses=ERRORS, summary="Heuristic risk assessment with evidence quality and reasoning")
def analyze(
    req: RiskAnalyzeRequest,
    db: Session = Depends(get_db),
    weather: WeatherProvider = Depends(get_weather_provider),
    satellite: FieldSatelliteProvider = Depends(get_satellite_provider),
) -> RiskAnalyzeResponse:
    return run_assessment(req, db, weather, satellite)


@router.get("/assessments", summary="Recent stored assessments (summary)")
def list_assessments(location_id: str | None = None, limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    q = select(RiskAssessment).order_by(RiskAssessment.created_at.desc()).limit(limit)
    if location_id:
        q = q.where(RiskAssessment.location_id == location_id)
    return [
        {
            "assessment_id": r.id, "location_id": r.location_id, "field_id": r.field_id, "as_of_date": r.as_of_date,
            "method": r.method, "score": r.score, "level": r.level, "evidence_score": r.evidence_score,
            "evidence_level": r.evidence_level, "recommended_next_step": r.recommended_next_step,
            "is_demo": r.is_demo, "created_at": iso(r.created_at),
        }
        for r in db.scalars(q)
    ]


@router.get("/assessments/{assessment_id}", response_model=RiskAnalyzeResponse, responses=ERRORS, summary="Full stored assessment")
def get_assessment(assessment_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(RiskAssessment, assessment_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Assessment {assessment_id} not found.")
    return row.payload
