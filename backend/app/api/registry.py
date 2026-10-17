"""Minimal farmer/field registry and audit log access."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field as PField
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError, ErrorCode
from app.models.database_models import AuditEvent, Farmer, Field, iso, record_audit
from app.schemas.common import ErrorResponse, GeoJSONPolygon
from app.utils.geo import validate_polygon

router = APIRouter(prefix="/api/v1", tags=["registry"])


class FarmerCreate(BaseModel):
    external_ref: str | None = PField(None, description="ID in the organisation's own farmer registry.")
    display_name: str | None = None
    village: str | None = None
    consent_recorded: bool = False


class FieldCreate(BaseModel):
    farmer_id: str | None = None
    name: str | None = None
    geometry: GeoJSONPolygon | None = None
    geometry_verified: bool = PField(False, description="True only if the boundary was surveyed or verified on the ground.")
    crop_type: str | None = None
    sowing_date: str | None = None
    district: str | None = None


@router.post("/farmers", summary="Register a farmer")
def create_farmer(req: FarmerCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = Farmer(**req.model_dump())
    db.add(row)
    db.flush()
    record_audit(db, entity_type="Farmer", entity_id=row.id, action="CREATED", actor_type="user", new_state={"external_ref": row.external_ref})
    db.commit()
    return {"id": row.id, **req.model_dump(), "is_demo": row.is_demo}


@router.post("/fields", responses={422: {"model": ErrorResponse}}, summary="Register a field (GeoJSON boundary validated)")
def create_field(req: FieldCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    warnings: list[str] = []
    area = None
    geom = req.geometry.as_dict() if req.geometry else None
    if geom:
        g = validate_polygon(geom)
        warnings, area = g.warnings, round(g.area_ha, 4)
    if req.farmer_id and db.get(Farmer, req.farmer_id) is None:
        raise ApiError(ErrorCode.NOT_FOUND, f"Farmer {req.farmer_id} not found.")
    row = Field(farmer_id=req.farmer_id, name=req.name, geometry=geom, geometry_verified=req.geometry_verified, area_ha=area,
                crop_type=req.crop_type, sowing_date=req.sowing_date, district=req.district)
    db.add(row)
    db.flush()
    record_audit(db, entity_type="Field", entity_id=row.id, action="CREATED", actor_type="user", new_state={"area_ha": area, "warnings": warnings})
    db.commit()
    return {"id": row.id, "area_ha": area, "warnings": warnings, "geometry_verified": row.geometry_verified, "is_demo": row.is_demo}


@router.get("/fields", summary="List fields")
def list_fields(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return [
        {"id": f.id, "farmer_id": f.farmer_id, "name": f.name, "area_ha": f.area_ha, "crop_type": f.crop_type, "sowing_date": f.sowing_date,
         "district": f.district, "geometry": f.geometry, "geometry_verified": f.geometry_verified, "is_demo": f.is_demo}
        for f in db.scalars(select(Field).limit(limit))
    ]


@router.get("/audit", tags=["audit"], summary="Audit events (newest first)")
def audit(entity_type: str | None = None, entity_id: str | None = None, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)
    if entity_type:
        q = q.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditEvent.entity_id == entity_id)
    return [
        {"id": e.id, "timestamp": iso(e.timestamp), "entity_type": e.entity_type, "entity_id": e.entity_id, "action": e.action,
         "previous_state": e.previous_state, "new_state": e.new_state, "actor_type": e.actor_type, "actor_id": e.actor_id,
         "metadata": e.metadata_json}
        for e in db.scalars(q)
    ]
