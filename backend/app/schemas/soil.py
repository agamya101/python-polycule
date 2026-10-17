from __future__ import annotations

import math
from enum import Enum

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import Provenance

SOIL_PARAMETERS = ("pH", "EC", "OC", "N", "P", "K", "S", "Zn", "Fe", "Cu", "Mn", "B")


class SoilParameters(BaseModel):
    """The 12 common Soil Health Card parameters. Omit unknown values (do not send 0)."""

    pH: float | None = Field(None, examples=[8.1])
    EC: float | None = Field(None, description="dS/m", examples=[0.42])
    OC: float | None = Field(None, description="%", examples=[0.38])
    N: float | None = Field(None, description="Available N, kg/ha", examples=[210])
    P: float | None = Field(None, description="Available P, kg/ha", examples=[14.5])
    K: float | None = Field(None, description="Available K, kg/ha", examples=[310])
    S: float | None = Field(None, description="ppm", examples=[8.2])
    Zn: float | None = Field(None, description="ppm", examples=[0.48])
    Fe: float | None = Field(None, description="ppm", examples=[5.1])
    Cu: float | None = Field(None, description="ppm", examples=[0.9])
    Mn: float | None = Field(None, description="ppm", examples=[3.4])
    B: float | None = Field(None, description="ppm", examples=[0.41])

    @field_validator("*")
    @classmethod
    def _finite(cls, v: float | None) -> float | None:
        if v is not None and not math.isfinite(v):
            raise ValueError("Soil values must be finite numbers.")
        return v


class SoilStatus(str, Enum):
    NORMAL = "NORMAL"
    LOW = "LOW"
    HIGH = "HIGH"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    UNKNOWN = "UNKNOWN"


class AdvisoryStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class SoilInterpretRequest(BaseModel):
    values: SoilParameters
    sampling_date: str | None = Field(None, description="YYYY-MM-DD; used for staleness.")
    farmer_id: str | None = None
    field_id: str | None = None
    lab_name: str | None = None
    verified: bool = Field(False, description="True only when values come from a laboratory-issued Soil Health Card. Only verified records feed the risk engine.")
    original_recommendation: str | None = Field(None, description="Recommendation text exactly as printed on the Soil Health Card, stored verbatim.")
    recommendation_source: str | None = Field(None, examples=["Soil Health Card, District Soil Testing Laboratory"])
    persist: bool = Field(False, description="Store the record (requires farmer_id or field_id).")


class SoilParameterResult(BaseModel):
    parameter: str
    label: str
    value: float | None
    unit: str
    status: SoilStatus
    normal_range: dict[str, float | None]
    interpretation: str


class SoilAdvisory(BaseModel):
    status: AdvisoryStatus
    original_recommendation: str | None
    recommendation_source: str | None
    note: str


class SoilInterpretResponse(BaseModel):
    status: str = "OK"
    record_id: str | None = None
    results: list[SoilParameterResult]
    abnormal_parameters: list[str]
    out_of_range_parameters: list[str]
    summary: list[str]
    is_stale: bool | None = None
    verified: bool
    soil_risk_severity: float | None = Field(None, description="0-1 heuristic severity used by the risk engine; null when record is not verified.")
    threshold_source: str
    advisory: SoilAdvisory
    provenance: list[Provenance]


class SoilApprovalRequest(BaseModel):
    approver: str = Field(..., min_length=2, description="Name / ID of the agronomist approving the advisory.")
    decision: str = Field(..., pattern="^(APPROVE|REJECT)$")
    reason: str | None = None
