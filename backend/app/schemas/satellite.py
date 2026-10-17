from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CropContext, GeoJSONPolygon, Provenance, SourceType


class SatelliteObservation(BaseModel):
    """One field-level statistic for one acquisition date."""

    date: str = Field(..., description="Acquisition date (YYYY-MM-DD).")
    ndvi: float | None = Field(None, ge=-1, le=1, description="Mean NDVI = (B08 - B04) / (B08 + B04) over valid pixels.")
    ndmi: float | None = Field(None, ge=-1, le=1, description="Mean NDMI = (B08 - B11) / (B08 + B11) over valid pixels. Vegetation-moisture index, not an irrigation measurement.")
    valid_pixel_pct: float | None = Field(None, ge=0, le=100, description="Percentage of field pixels that are cloud/shadow free and have data.")
    cloud_pct: float | None = Field(None, ge=0, le=100)
    pixel_count: int | None = Field(None, ge=0)
    source: str = "supplied"
    source_type: SourceType = SourceType.OBSERVED
    is_demo: bool = False

    @field_validator("date")
    @classmethod
    def _iso(cls, v: str) -> str:
        date.fromisoformat(v)
        return v


class BaselineInfo(BaseModel):
    value: float | None = None
    n_observations: int = 0
    years: list[int] = Field(default_factory=list)
    method: str = Field(..., description="supplied | crop_stage_aligned | day_of_year_window | unavailable")
    crop_specific: bool = False
    window_days: int | None = None
    notes: list[str] = Field(default_factory=list)


class VegetationSummary(BaseModel):
    latest_usable_date: str | None = None
    latest_ndvi: float | None = None
    latest_ndmi: float | None = None
    latest_valid_pixel_pct: float | None = None
    observation_age_days: int | None = None
    usable_observations_30d: int = Field(0, description="Usable observations within recent_window_days (30 by default; product-specific for composites).")
    recent_window_days: int = 30
    usable_observations_total: int = 0
    ndvi_baseline: BaselineInfo
    ndmi_baseline: BaselineInfo
    ndvi_anomaly_pct: float | None = None
    ndmi_delta_from_baseline: float | None = None
    ndvi_trend_per_10d: float | None = None
    ndmi_trend_per_10d: float | None = None
    quality_flags: list[str] = Field(default_factory=list)


class FieldStatsRequest(BaseModel):
    geometry: GeoJSONPolygon
    start_date: str | None = Field(None, description="Defaults to 60 days before end_date.")
    end_date: str | None = Field(None, description="Defaults to today.")
    baseline_years: int = Field(3, ge=1, le=6, description="Number of previous seasons used for the seasonal baseline.")
    crop: CropContext = Field(default_factory=CropContext)


class FieldGeometryInfo(BaseModel):
    area_ha: float
    approx_pixels_10m: int
    centroid_lat: float
    centroid_lon: float
    warnings: list[str] = Field(default_factory=list)


class FieldStatsResponse(BaseModel):
    status: str = "OK"
    geometry: FieldGeometryInfo
    observations: list[SatelliteObservation]
    baseline_observations_count: int
    summary: VegetationSummary
    warnings: list[str] = Field(default_factory=list)
    provenance: list[Provenance]
