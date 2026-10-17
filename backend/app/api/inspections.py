from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import FieldInspection, Intervention, iso, record_audit
from app.schemas.common import ErrorResponse, VerificationStatus
from app.schemas.inspections import InspectionCreate, InspectionOut, InspectionStatusUpdate

router = APIRouter(prefix="/api/v1/inspections", tags=["inspections"])
ERRORS = {404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


def to_out(r: FieldInspection) -> InspectionOut:
    return InspectionOut(
        id=r.id, farmer_id=r.farmer_id, field_id=r.field_id, assessment_id=r.assessment_id, intervention_id=r.intervention_id,
        inspection_date=r.inspection_date, inspector=r.inspector, observed_condition=r.observed_condition,
        possible_cause=r.possible_cause, confirmed_cause=r.confirmed_cause, photo_references=r.photo_references or [],
        action_taken=r.action_taken, notes=r.notes, verification_status=VerificationStatus(r.verification_status),
        created_at=iso(r.created_at), is_demo=r.is_demo,
    )


@router.post("", response_model=InspectionOut, responses=ERRORS, summary="Record a field inspection (becomes labelled data for future ML)")
def create(req: InspectionCreate, db: Session = Depends(get_db)) -> InspectionOut:
    if not (req.field_id or req.farmer_id or req.assessment_id or req.intervention_id):
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Provide at least one of field_id, farmer_id, assessment_id or intervention_id.")
    row = FieldInspection(**req.model_dump(exclude={"verification_status"}), verification_status=req.verification_status.value)
    db.add(row)
    db.flush()
    record_audit(db, entity_type="FieldInspection", entity_id=row.id, action="CREATED", actor_type="field_worker", actor_id=req.inspector,
                 new_state={"verification_status": row.verification_status, "confirmed_cause": row.confirmed_cause})
    if req.intervention_id:
        iv = db.get(Intervention, req.intervention_id)
        if iv is None:
            db.rollback()
            raise ApiError(ErrorCode.NOT_FOUND, f"Intervention {req.intervention_id} not found.")
        if iv.first_reviewed_at is None:
            iv.first_reviewed_at = datetime.now(timezone.utc)
            record_audit(db, entity_type="Intervention", entity_id=iv.id, action="FIRST_REVIEWED", actor_type="field_worker",
                         actor_id=req.inspector, new_state={"inspection_id": row.id})
    db.commit()
    return to_out(row)


@router.get("", response_model=list[InspectionOut], summary="List inspections")
def list_inspections(
    field_id: str | None = None,
    verification_status: VerificationStatus | None = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[InspectionOut]:
    q = select(FieldInspection).order_by(FieldInspection.created_at.desc()).limit(limit)
    if field_id:
        q = q.where(FieldInspection.field_id == field_id)
    if verification_status:
        q = q.where(FieldInspection.verification_status == verification_status.value)
    return [to_out(r) for r in db.scalars(q)]


@router.get("/{inspection_id}", response_model=InspectionOut, responses=ERRORS)
def get_inspection(inspection_id: str, db: Session = Depends(get_db)) -> InspectionOut:
    row = db.get(FieldInspection, inspection_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Inspection {inspection_id} not found.")
    return to_out(row)


@router.patch("/{inspection_id}/status", response_model=InspectionOut, responses=ERRORS, summary="Update verification status (audited)")
def update_status(inspection_id: str, req: InspectionStatusUpdate, db: Session = Depends(get_db)) -> InspectionOut:
    row = db.get(FieldInspection, inspection_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Inspection {inspection_id} not found.")
    if req.confirmed_cause and req.verification_status not in (VerificationStatus.CONFIRMED, VerificationStatus.RESOLVED):
        raise ApiError(ErrorCode.VALIDATION_ERROR, "confirmed_cause may only be set with CONFIRMED or RESOLVED status.")
    prev = {"verification_status": row.verification_status, "confirmed_cause": row.confirmed_cause}
    row.verification_status = req.verification_status.value
    if req.confirmed_cause:
        row.confirmed_cause = req.confirmed_cause
    if req.notes:
        row.notes = (row.notes + "\n" if row.notes else "") + req.notes
    record_audit(db, entity_type="FieldInspection", entity_id=row.id, action="STATUS_CHANGED", previous_state=prev,
                 new_state={"verification_status": row.verification_status, "confirmed_cause": row.confirmed_cause},
                 actor_type="field_worker", actor_id=req.actor)
    db.commit()
    return to_out(row)
