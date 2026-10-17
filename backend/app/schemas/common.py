from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.utils.geo import GeometryError, validate_polygon
from app.utils.provenance import Provenance, SourceType

__all__ = [
    "Provenance",
    "SourceType",
    "ErrorDetail",
    "ErrorResponse",
    "GeoJSONPolygon",
    "CropContext",
    "VerificationStatus",
]


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    status: str = Field(..., description="Machine-readable error code, identical to error.code.")
    error: ErrorDetail


class GeoJSONPolygon(BaseModel):
    """GeoJSON Polygon or MultiPolygon in WGS84 (longitude, latitude order)."""

    type: str = Field(..., examples=["Polygon"])
    coordinates: list[Any]

    @field_validator("coordinates")
    @classmethod
    def _check(cls, v: list[Any], info) -> list[Any]:
        try:
            validate_polygon({"type": info.data.get("type"), "coordinates": v})
        except GeometryError as exc:
            raise ValueError(f"Invalid polygon geometry: {exc}") from exc
        return v

    def as_dict(self) -> dict[str, Any]:
        return {"type": self.type, "coordinates": self.coordinates}


class CropContext(BaseModel):
    crop_type: str | None = Field(None, examples=["cotton"])
    crop_stage: str | None = Field(None, examples=["flowering"])
    sowing_date: str | None = Field(None, description="ISO date (YYYY-MM-DD).", examples=["2026-06-22"])


class VerificationStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    VISITED = "VISITED"
    CONFIRMED = "CONFIRMED"
    INCONCLUSIVE = "INCONCLUSIVE"
    RESOLVED = "RESOLVED"
