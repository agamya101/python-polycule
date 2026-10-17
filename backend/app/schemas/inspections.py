from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import VerificationStatus


class InspectionCreate(BaseModel):
    farmer_id: str | None = None
    field_id: str | None = None
    assessment_id: str | None = None
    intervention_id: str | None = None
    inspection_date: str = Field(..., examples=["2026-10-17"])
    inspector: str = Field(..., min_length=1, description="Field worker name or ID.")
    observed_condition: str = Field(..., min_length=1, examples=["Wilting on ~30% of plants in the north-east block"])
    possible_cause: str | None = Field(None, examples=["Moisture stress suspected"])
    confirmed_cause: str | None = Field(None, description="Only when confirmed by inspection or laboratory.")
    photo_references: list[str] = Field(default_factory=list, description="URLs/object keys of photos; photos are not stored by this API.")
    action_taken: str | None = None
    notes: str | None = None
    verification_status: VerificationStatus = VerificationStatus.VISITED

    @field_validator("inspection_date")
    @classmethod
    def _iso(cls, v: str) -> str:
        d = date.fromisoformat(v)
        if d > date.today():
            raise ValueError("inspection_date cannot be in the future.")
        return v

    @model_validator(mode="after")
    def _confirmed_needs_status(self) -> "InspectionCreate":
        if self.confirmed_cause and self.verification_status not in (VerificationStatus.CONFIRMED, VerificationStatus.RESOLVED):
            raise ValueError("confirmed_cause may only be set when verification_status is CONFIRMED or RESOLVED.")
        return self


class InspectionStatusUpdate(BaseModel):
    verification_status: VerificationStatus
    actor: str = "field_worker"
    confirmed_cause: str | None = None
    notes: str | None = None


class InspectionOut(BaseModel):
    id: str
    farmer_id: str | None
    field_id: str | None
    assessment_id: str | None
    intervention_id: str | None
    inspection_date: str
    inspector: str
    observed_condition: str
    possible_cause: str | None
    confirmed_cause: str | None
    photo_references: list[str]
    action_taken: str | None
    notes: str | None
    verification_status: VerificationStatus
    created_at: str
    is_demo: bool


class FollowUpOutcome(str, Enum):
    RECOVERING = "RECOVERING"
    NOT_RECOVERING = "NOT_RECOVERING"
    DETERIORATING = "DETERIORATING"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    HUMAN_VERIFICATION_REQUIRED = "HUMAN_VERIFICATION_REQUIRED"


class FollowUpObservationIn(BaseModel):
    date: str
    ndvi: float | None = Field(None, ge=-1, le=1)
    ndmi: float | None = Field(None, ge=-1, le=1)
    valid_pixel_pct: float | None = Field(None, ge=0, le=100)
    source_type: str = "OBSERVED"

    @field_validator("date")
    @classmethod
    def _iso(cls, v: str) -> str:
        date.fromisoformat(v)
        return v


class FollowUpEvaluateRequest(BaseModel):
    intervention_id: str | None = None
    start_date: str = Field(..., description="Date of the intervention / advisory.")
    ndvi_at_start: float = Field(..., ge=-1, le=1)
    observations: list[FollowUpObservationIn] = Field(default_factory=list, description="Usable or unusable observations since start_date, any spacing.")
    verification_status: VerificationStatus | None = None
    as_of_date: str | None = None
    persist: bool = False


class FollowUpEvaluateResponse(BaseModel):
    outcome: FollowUpOutcome
    can_close_case: bool
    escalate: bool
    usable_observations: int
    ignored_observations: int
    latest_delta_ndvi: float | None
    ndvi_trend_per_10d: float | None
    days_since_start: int | None
    reasons: list[str]
    recommended_action: str
    method: str = "followup_rules_v1"
