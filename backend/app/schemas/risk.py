from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import CropContext, GeoJSONPolygon, Provenance, SourceType
from app.schemas.satellite import SatelliteObservation, VegetationSummary
from app.schemas.soil import SoilParameters
from app.schemas.weather import WeatherFeatures


class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class EvidenceLevel(str, Enum):
    POOR = "POOR"
    LIMITED = "LIMITED"
    MODERATE = "MODERATE"
    GOOD = "GOOD"


class NextStep(str, Enum):
    URGENT_FIELD_REVIEW = "URGENT_FIELD_REVIEW"
    FIELD_VERIFICATION = "FIELD_VERIFICATION"
    IMPROVE_EVIDENCE = "IMPROVE_EVIDENCE"
    MONITOR = "MONITOR"
    ROUTINE_MONITORING = "ROUTINE_MONITORING"


class RiskAnalyzeRequest(BaseModel):
    """Inputs for a heuristic risk assessment.

    Data can be supplied directly (``satellite_observations``, ``weather_features``)
    with explicit ``source_type``, or fetched live: weather from Open-Meteo when
    ``lat``/``lon`` are given, satellite statistics from Sentinel Hub when
    ``geometry`` is given and credentials are configured.
    """

    location_id: str = Field(..., examples=["field-123"])
    field_id: str | None = None
    lat: float | None = Field(None, description="Latitude (WGS84) for live weather retrieval.")
    lon: float | None = Field(None, description="Longitude (WGS84) for live weather retrieval.")
    geometry: GeoJSONPolygon | None = None
    as_of_date: str | None = Field(None, description="Assessment date (YYYY-MM-DD); defaults to today.")
    crop: CropContext = Field(default_factory=CropContext)

    satellite_observations: list[SatelliteObservation] | None = Field(None, description="Pre-computed field statistics. Each item declares its source_type.")
    baseline_ndvi: float | None = Field(None, ge=-1, le=1, description="Externally computed seasonal NDVI baseline for the latest observation date.")
    baseline_ndmi: float | None = Field(None, ge=-1, le=1)
    baseline_observation_count: int | None = Field(None, ge=0)
    baseline_years: list[int] | None = None
    historical_observations: list[SatelliteObservation] | None = Field(None, description="Observations from previous seasons used to compute a seasonal baseline when baseline_ndvi is not given.")

    weather_features: WeatherFeatures | None = None
    weather_source_type: SourceType = Field(SourceType.OBSERVED, description="Source type of supplied weather_features.")

    soil: SoilParameters | None = None
    soil_verified: bool = Field(False, description="Soil values are from a laboratory Soil Health Card. Unverified soil values do not enter the risk score.")

    demo_fixture_id: str | None = Field(None, description="Load inputs from a DEMO fixture (only when USE_DEMO_DATA=true). Results are flagged demo.")
    persist: bool = True

    @field_validator("lat")
    @classmethod
    def _lat(cls, v: float | None) -> float | None:
        if v is not None and not -90 <= v <= 90:
            raise ValueError("Latitude must be within [-90, 90].")
        return v

    @field_validator("lon")
    @classmethod
    def _lon(cls, v: float | None) -> float | None:
        if v is not None and not -180 <= v <= 180:
            raise ValueError("Longitude must be within [-180, 180].")
        return v

    @model_validator(mode="after")
    def _pair(self) -> "RiskAnalyzeRequest":
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat and lon must be supplied together (latitude/longitude pair).")
        return self


class RiskComponent(BaseModel):
    name: str
    available: bool
    value: float | None = Field(None, description="Normalised stress 0-1 (0 = no stress signal).")
    nominal_weight: float
    effective_weight: float = Field(..., description="Weight after renormalising over available components.")
    contribution: float | None = Field(None, description="Points contributed to the 0-100 score.")
    inputs: dict[str, Any] = Field(default_factory=dict)
    reason: str | None = None


class RiskBlock(BaseModel):
    score: float | None = Field(None, description="0-100 heuristic score; null when classification is withheld.")
    provisional_score: float | None = Field(None, description="Score computed from available data even when classification is withheld. Do not present as a classification.")
    level: RiskLevel
    method: str = "heuristic_v1"
    components: list[RiskComponent]
    available_weight_fraction: float
    classification_withheld: bool = False
    notes: list[str] = Field(default_factory=list)


class EvidenceComponent(BaseModel):
    name: str
    score: float = Field(..., description="0-1")
    weight: float
    detail: str


class EvidenceQuality(BaseModel):
    score: float = Field(..., description="0-100. Describes data quality/quantity; NOT a model confidence.")
    level: EvidenceLevel
    components: list[EvidenceComponent]
    reasons: list[str]
    warnings: list[str] = Field(default_factory=list)


class PredictionBlock(BaseModel):
    status: str = Field(..., examples=["MODEL_NOT_AVAILABLE"], description="AVAILABLE | MODEL_NOT_AVAILABLE | MODEL_DISABLED | MODEL_NOT_VALIDATED | INSUFFICIENT_FEATURES")
    task: str = "next_observation_deterioration"
    probability: float | None = Field(None, description="Model-estimated deterioration probability; only present when status=AVAILABLE.")
    model_version: str | None = None
    important_features: list[dict[str, Any]] = Field(default_factory=list)
    reason: str | None = None


class Reasoning(BaseModel):
    observed: list[str]
    inferred: list[str]
    not_confirmed: list[str]
    recommended: list[str]


class Observations(BaseModel):
    vegetation: VegetationSummary | None = None
    weather: WeatherFeatures | None = None
    soil: dict[str, Any] | None = None


class RiskAnalyzeResponse(BaseModel):
    assessment_id: str | None
    location_id: str
    field_id: str | None = None
    as_of_date: str
    demo: bool
    risk: RiskBlock
    evidence_quality: EvidenceQuality
    observations: Observations
    prediction: PredictionBlock
    possible_factors: list[str]
    reasoning: Reasoning
    recommended_next_step: NextStep
    warnings: list[str] = Field(default_factory=list)
    provenance: list[Provenance]
