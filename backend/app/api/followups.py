from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import FollowUpObservation, Intervention, record_audit
from app.schemas.common import ErrorResponse
from app.schemas.inspections import FollowUpEvaluateRequest, FollowUpEvaluateResponse
from app.schemas.interventions import InterventionStatus
from app.services.followup_engine import evaluate_followup

router = APIRouter(prefix="/api/v1/followups", tags=["followups"])


@router.post("/evaluate", response_model=FollowUpEvaluateResponse, responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
             summary="Evaluate post-intervention trajectory whenever a new usable observation is available")
def evaluate(req: FollowUpEvaluateRequest, db: Session = Depends(get_db)) -> FollowUpEvaluateResponse:
    result = evaluate_followup(req)
    if req.persist:
        if not req.intervention_id:
            raise ApiError(ErrorCode.VALIDATION_ERROR, "persist=true requires intervention_id.")
        iv = db.get(Intervention, req.intervention_id)
        if iv is None:
            raise ApiError(ErrorCode.NOT_FOUND, f"Intervention {req.intervention_id} not found.")
        for o in req.observations:
            db.add(FollowUpObservation(intervention_id=iv.id, observation_date=o.date, ndvi=o.ndvi, ndmi=o.ndmi,
                                       valid_pixel_pct=o.valid_pixel_pct, source_type=o.source_type, evaluated_outcome=result.outcome.value))
        record_audit(db, entity_type="Intervention", entity_id=iv.id, action="FOLLOWUP_EVALUATED",
                     new_state={"outcome": result.outcome.value, "escalate": result.escalate}, metadata={"reasons": result.reasons})
        if result.escalate and iv.status in (InterventionStatus.OPEN.value, InterventionStatus.IN_REVIEW.value):
            prev = iv.status
            iv.status = InterventionStatus.ESCALATED.value
            record_audit(db, entity_type="Intervention", entity_id=iv.id, action="STATUS_CHANGED", previous_state={"status": prev},
                         new_state={"status": iv.status}, metadata={"reason": f"follow-up outcome {result.outcome.value}"})
        db.commit()
    return result
