from __future__ import annotations

import statistics
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import Advisory, Field, FieldInspection, Intervention, iso, record_audit
from app.schemas.common import ErrorResponse
from app.schemas.interventions import (
    InterventionCreate,
    InterventionOut,
    InterventionStatus,
    InterventionStatusUpdate,
    OperationalMetrics,
    PrioritizeRequest,
    PrioritizeResponse,
    PriorityLevel,
)
from app.services.intervention_engine import prioritize

router = APIRouter(prefix="/api/v1/interventions", tags=["interventions"])
metrics_router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])
ERRORS = {404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}

ALLOWED = {
    InterventionStatus.OPEN: {InterventionStatus.IN_REVIEW, InterventionStatus.ESCALATED, InterventionStatus.RESOLVED},
    InterventionStatus.IN_REVIEW: {InterventionStatus.OPEN, InterventionStatus.ESCALATED, InterventionStatus.RESOLVED},
    InterventionStatus.ESCALATED: {InterventionStatus.IN_REVIEW, InterventionStatus.RESOLVED},
    InterventionStatus.RESOLVED: {InterventionStatus.CLOSED, InterventionStatus.OPEN},
    InterventionStatus.CLOSED: set(),
}
OPEN_STATES = (InterventionStatus.OPEN.value, InterventionStatus.IN_REVIEW.value, InterventionStatus.ESCALATED.value)


def to_out(r: Intervention) -> InterventionOut:
    return InterventionOut(
        id=r.id, case_id=r.case_id, assessment_id=r.assessment_id, field_id=r.field_id, priority=r.priority, status=r.status,
        priority_score=r.priority_score, factors=r.factors or [], description=r.description, created_at=iso(r.created_at),
        first_reviewed_at=iso(r.first_reviewed_at), is_demo=r.is_demo,
    )


@router.post("/prioritize", response_model=PrioritizeResponse, responses=ERRORS, summary="Rank risk cases for field review (rule-based)")
def prioritize_cases(req: PrioritizeRequest, db: Session = Depends(get_db)) -> PrioritizeResponse:
    ranked = prioritize(req.cases)
    if req.persist:
        by_id = {c.case_id: c for c in req.cases}
        for r in ranked:
            if r.priority == PriorityLevel.NO_ACTION:
                continue
            c = by_id[r.case_id]
            row = Intervention(case_id=r.case_id, assessment_id=c.assessment_id, field_id=c.field_id, priority=r.priority.value,
                               priority_score=r.priority_score, factors=[f.model_dump() for f in r.factors], description=r.rationale)
            db.add(row)
            db.flush()
            r.intervention_id = row.id
            record_audit(db, entity_type="Intervention", entity_id=row.id, action="CREATED",
                         new_state={"priority": row.priority, "status": row.status}, metadata={"case_id": r.case_id, "via": "prioritize"})
        db.commit()
    return PrioritizeResponse(ranked=ranked)


@router.post("", response_model=InterventionOut, summary="Create an intervention manually")
def create(req: InterventionCreate, db: Session = Depends(get_db)) -> InterventionOut:
    row = Intervention(case_id=req.case_id, assessment_id=req.assessment_id, field_id=req.field_id, priority=req.priority.value,
                       description=req.description, factors=[])
    db.add(row)
    db.flush()
    record_audit(db, entity_type="Intervention", entity_id=row.id, action="CREATED", actor_type="user",
                 new_state={"priority": row.priority, "status": row.status}, metadata=req.metadata)
    db.commit()
    return to_out(row)


@router.get("", response_model=list[InterventionOut], summary="List interventions")
def list_interventions(status: InterventionStatus | None = None, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)) -> list[InterventionOut]:
    q = select(Intervention).order_by(Intervention.created_at.desc()).limit(limit)
    if status:
        q = q.where(Intervention.status == status.value)
    return [to_out(r) for r in db.scalars(q)]


@router.patch("/{intervention_id}/status", response_model=InterventionOut, responses=ERRORS, summary="Change intervention status (audited)")
def update_status(intervention_id: str, req: InterventionStatusUpdate, db: Session = Depends(get_db)) -> InterventionOut:
    row = db.get(Intervention, intervention_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Intervention {intervention_id} not found.")
    current = InterventionStatus(row.status)
    if req.status not in ALLOWED[current]:
        raise ApiError(ErrorCode.INVALID_STATE_TRANSITION, f"Cannot move from {current.value} to {req.status.value}.",
                       {"allowed": sorted(s.value for s in ALLOWED[current])})
    row.status = req.status.value
    if row.first_reviewed_at is None and req.status != InterventionStatus.OPEN:
        row.first_reviewed_at = datetime.now(timezone.utc)
    record_audit(db, entity_type="Intervention", entity_id=row.id, action="STATUS_CHANGED", previous_state={"status": current.value},
                 new_state={"status": row.status}, actor_type="user", actor_id=req.actor, metadata={"note": req.note})
    db.commit()
    return to_out(row)


@metrics_router.get("/operations", response_model=OperationalMetrics, summary="Operational workflow metrics (measured counts only)")
def operations(db: Session = Depends(get_db)) -> OperationalMetrics:
    rows = list(db.scalars(select(Intervention)))
    open_rows = [r for r in rows if r.status in OPEN_STATES]
    unverified_inspections = db.scalar(select(func.count()).select_from(FieldInspection).where(FieldInspection.verification_status == "UNVERIFIED")) or 0
    hours = []
    for r in rows:
        if r.first_reviewed_at and r.created_at:
            a, b = r.created_at, r.first_reviewed_at
            a = a if a.tzinfo else a.replace(tzinfo=timezone.utc)
            b = b if b.tzinfo else b.replace(tzinfo=timezone.utc)
            hours.append((b - a).total_seconds() / 3600)
    sent = db.scalar(select(func.count()).select_from(Advisory).where(Advisory.sent_at.is_not(None))) or 0
    acked = db.scalar(select(func.count()).select_from(Advisory).where(Advisory.acknowledged_at.is_not(None))) or 0
    notes = ["Counts are computed from recorded workflow data only. No yield, income or loss-prevention estimates are made."]
    if sent == 0:
        notes.append("Farmer acknowledgement is not tracked yet (no sent advisories recorded).")
    return OperationalMetrics(
        fields_monitored=db.scalar(select(func.count()).select_from(Field)) or 0,
        open_interventions=len(open_rows),
        high_priority_cases=sum(1 for r in open_rows if r.priority in (PriorityLevel.P1_IMMEDIATE_REVIEW.value, PriorityLevel.P2_HIGH_PRIORITY.value)),
        cases_requiring_verification=sum(1 for r in open_rows if r.priority == PriorityLevel.VERIFY_FIRST.value) + unverified_inspections,
        cases_resolved=sum(1 for r in rows if r.status in (InterventionStatus.RESOLVED.value, InterventionStatus.CLOSED.value)),
        unresolved_cases=len(open_rows),
        median_alert_to_review_hours=round(statistics.median(hours), 2) if hours else None,
        advisories_acknowledged=acked if sent else None,
        advisories_sent=sent if sent else None,
        notes=notes,
    )
