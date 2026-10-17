"""ORM models for the KrishiMitra workflow.

Field geometry is stored as GeoJSON in a JSON column for the prototype; a
PostGIS geometry column can replace it in production.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.database import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Farmer(Base):
    __tablename__ = "farmers"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    external_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, doc="ID in the organisation's own registry.")
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    village: Mapped[str | None] = mapped_column(String(200), nullable=True)
    consent_recorded: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Field(Base):
    __tablename__ = "fields"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    farmer_id: Mapped[str | None] = mapped_column(ForeignKey("farmers.id"), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    geometry_verified: Mapped[bool] = mapped_column(Boolean, default=False, doc="True only when boundary was surveyed/verified.")
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    crop_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sowing_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    district: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    location_id: Mapped[str] = mapped_column(String(128), index=True)
    field_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    as_of_date: Mapped[str] = mapped_column(String(10))
    method: Mapped[str] = mapped_column(String(32))
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    provisional_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    level: Mapped[str] = mapped_column(String(32))
    evidence_score: Mapped[float] = mapped_column(Float)
    evidence_level: Mapped[str] = mapped_column(String(16))
    recommended_next_step: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SoilRecord(Base):
    __tablename__ = "soil_records"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    farmer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    field_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sampling_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    lab_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    values: Mapped[dict[str, Any]] = mapped_column(JSON)
    interpretation: Mapped[dict[str, Any]] = mapped_column(JSON)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    original_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation_source: Mapped[str | None] = mapped_column(String(300), nullable=True)
    advisory_status: Mapped[str] = mapped_column(String(32), default="DRAFT")
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Intervention(Base):
    __tablename__ = "interventions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(String(128), index=True)
    assessment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    field_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    priority: Mapped[str] = mapped_column(String(32))
    priority_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    factors: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FieldInspection(Base):
    __tablename__ = "field_inspections"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    farmer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    field_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assessment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    intervention_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    inspection_date: Mapped[str] = mapped_column(String(10))
    inspector: Mapped[str] = mapped_column(String(200))
    observed_condition: Mapped[str] = mapped_column(Text)
    possible_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_references: Mapped[list[str]] = mapped_column(JSON, default=list)
    action_taken: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FollowUpObservation(Base):
    __tablename__ = "followup_observations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    intervention_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    observation_date: Mapped[str] = mapped_column(String(10))
    ndvi: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndmi: Mapped[float | None] = mapped_column(Float, nullable=True)
    valid_pixel_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_type: Mapped[str] = mapped_column(String(16), default="OBSERVED")
    evaluated_outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Advisory(Base):
    __tablename__ = "advisories"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    farmer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    soil_record_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    intervention_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    advisory_type: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64))
    previous_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    new_state: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    actor_type: Mapped[str] = mapped_column(String(32), default="system")
    actor_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)


def record_audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    new_state: dict[str, Any] | None = None,
    previous_state: dict[str, Any] | None = None,
    actor_type: str = "system",
    actor_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    """Add an audit event to the session (caller commits)."""
    ev = AuditEvent(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        previous_state=previous_state,
        new_state=new_state,
        actor_type=actor_type,
        actor_id=actor_id,
        metadata_json=metadata or {},
    )
    db.add(ev)
    return ev


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.replace(microsecond=0).isoformat()
