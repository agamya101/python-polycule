from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import load_rules
from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import SoilRecord, iso, record_audit
from app.schemas.common import ErrorResponse
from app.schemas.soil import AdvisoryStatus, SoilApprovalRequest, SoilInterpretRequest, SoilInterpretResponse
from app.services.soil_engine import interpret_soil
from app.utils.provenance import SourceType, make_provenance

router = APIRouter(prefix="/api/v1/soil", tags=["soil"])
ERRORS = {422: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}}


@router.post("/interpret", response_model=SoilInterpretResponse, responses=ERRORS, summary="Classify Soil Health Card values (no dose calculation)")
def interpret(req: SoilInterpretRequest, db: Session = Depends(get_db)) -> SoilInterpretResponse:
    if req.sampling_date:
        try:
            datetime.fromisoformat(req.sampling_date)
        except ValueError as exc:
            raise ApiError(ErrorCode.INVALID_SOIL_PARAMETER, "sampling_date must be YYYY-MM-DD.") from exc
    result = interpret_soil(
        req.values,
        sampling_date=req.sampling_date,
        verified=req.verified,
        original_recommendation=req.original_recommendation,
        recommendation_source=req.recommendation_source,
    )
    record_id = None
    if req.persist:
        if not (req.farmer_id or req.field_id):
            raise ApiError(ErrorCode.INVALID_SOIL_PARAMETER, "persist=true requires farmer_id or field_id.")
        row = SoilRecord(
            farmer_id=req.farmer_id, field_id=req.field_id, sampling_date=req.sampling_date, lab_name=req.lab_name,
            values=req.values.model_dump(), interpretation={k: v for k, v in result.items() if k not in ("results", "advisory")},
            verified=req.verified, original_recommendation=req.original_recommendation,
            recommendation_source=req.recommendation_source, advisory_status=result["advisory"].status.value,
        )
        db.add(row)
        db.flush()
        record_audit(db, entity_type="SoilRecord", entity_id=row.id, action="CREATED",
                     new_state={"advisory_status": row.advisory_status, "verified": row.verified},
                     actor_type="user", metadata={"abnormal": result["abnormal_parameters"]})
        db.commit()
        record_id = row.id

    prov = [make_provenance("soil_health_card", SourceType.CONFIRMED if req.verified else SourceType.OBSERVED, observed_at=req.sampling_date,
                            quality_flags=[] if req.verified else ["UNVERIFIED_SOIL_VALUES"]),
            make_provenance("soil_engine", SourceType.INFERRED, provider_metadata={"thresholds": result["threshold_source"]})]
    return SoilInterpretResponse(record_id=record_id, provenance=prov, **result)


@router.post("/records/{record_id}/approval", responses=ERRORS, summary="Approve or reject the stored Soil Health Card recommendation (manual step)")
def approve(record_id: str, req: SoilApprovalRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(SoilRecord, record_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Soil record {record_id} not found.")
    if row.advisory_status in (AdvisoryStatus.APPROVED.value, AdvisoryStatus.REJECTED.value):
        raise ApiError(ErrorCode.INVALID_STATE_TRANSITION, f"Advisory already {row.advisory_status}.")
    if req.decision == "APPROVE" and not row.original_recommendation:
        raise ApiError(ErrorCode.INVALID_STATE_TRANSITION, "Cannot approve: no recommendation from an approved source is stored for this record.")
    prev = row.advisory_status
    row.advisory_status = AdvisoryStatus.APPROVED.value if req.decision == "APPROVE" else AdvisoryStatus.REJECTED.value
    row.approved_by = req.approver
    row.approved_at = datetime.now(timezone.utc)
    record_audit(db, entity_type="SoilRecord", entity_id=row.id, action=f"ADVISORY_{row.advisory_status}",
                 previous_state={"advisory_status": prev}, new_state={"advisory_status": row.advisory_status},
                 actor_type="agronomist", actor_id=req.approver, metadata={"reason": req.reason})
    db.commit()
    return {"record_id": row.id, "advisory_status": row.advisory_status, "approved_by": row.approved_by, "approved_at": iso(row.approved_at)}


@router.get("/records/{record_id}", responses=ERRORS, summary="Stored soil record")
def get_record(record_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(SoilRecord, record_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Soil record {record_id} not found.")
    return {
        "record_id": row.id, "farmer_id": row.farmer_id, "field_id": row.field_id, "sampling_date": row.sampling_date,
        "values": row.values, "interpretation": row.interpretation, "verified": row.verified,
        "original_recommendation": row.original_recommendation, "recommendation_source": row.recommendation_source,
        "advisory_status": row.advisory_status, "approved_by": row.approved_by, "approved_at": iso(row.approved_at),
        "is_demo": row.is_demo, "created_at": iso(row.created_at),
    }


@router.get("/thresholds", summary="Configured soil classification thresholds")
def thresholds() -> dict[str, Any]:
    return load_rules("soil_thresholds")
