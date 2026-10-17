from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import VerificationStatus


class PriorityLevel(str, Enum):
    P1_IMMEDIATE_REVIEW = "P1_IMMEDIATE_REVIEW"
    P2_HIGH_PRIORITY = "P2_HIGH_PRIORITY"
    VERIFY_FIRST = "VERIFY_FIRST"
    P3_MONITOR = "P3_MONITOR"
    NO_ACTION = "NO_ACTION"


class InterventionStatus(str, Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    ESCALATED = "ESCALATED"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class RiskCase(BaseModel):
    case_id: str = Field(..., examples=["field-123"])
    assessment_id: str | None = None
    field_id: str | None = None
    risk_score: float | None = Field(None, ge=0, le=100, description="Heuristic score; for withheld classifications pass the provisional score.")
    risk_level: str | None = Field(None, examples=["HIGH"])
    evidence_quality_score: float | None = Field(None, ge=0, le=100)
    deteriorating: bool | None = Field(None, description="True when the vegetation trend is continuing downward.")
    ndvi_trend_per_10d: float | None = None
    crop_stage: str | None = None
    crop_stage_sensitivity: str | None = Field(None, description="HIGH | MEDIUM | LOW; overrides the generic stage lookup.")
    affected_farmers: int | None = Field(None, ge=0)
    unresolved_alerts: int = Field(0, ge=0)
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED


class PrioritizeRequest(BaseModel):
    cases: list[RiskCase] = Field(..., min_length=1)
    persist: bool = Field(False, description="Create Intervention records for ranked cases (except NO_ACTION).")


class PriorityFactor(BaseModel):
    factor: str
    points: float
    detail: str


class PrioritizedCase(BaseModel):
    rank: int
    case_id: str
    priority: PriorityLevel
    priority_score: float
    factors: list[PriorityFactor]
    rationale: str
    intervention_id: str | None = None


class PrioritizeResponse(BaseModel):
    method: str = "rule_based_prioritisation_v1"
    note: str = "Transparent rule-based ranking; not a machine-learning model."
    ranked: list[PrioritizedCase]


class InterventionCreate(BaseModel):
    case_id: str
    assessment_id: str | None = None
    field_id: str | None = None
    priority: PriorityLevel
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class InterventionStatusUpdate(BaseModel):
    status: InterventionStatus
    actor: str = Field("officer", description="Who made the change.")
    note: str | None = None


class InterventionOut(BaseModel):
    id: str
    case_id: str
    assessment_id: str | None
    field_id: str | None
    priority: str
    status: str
    priority_score: float | None
    factors: list[dict[str, Any]]
    description: str | None
    created_at: str
    first_reviewed_at: str | None
    is_demo: bool


class OperationalMetrics(BaseModel):
    fields_monitored: int
    open_interventions: int
    high_priority_cases: int
    cases_requiring_verification: int
    cases_resolved: int
    unresolved_cases: int
    median_alert_to_review_hours: float | None
    advisories_acknowledged: int | None
    advisories_sent: int | None
    notes: list[str]
