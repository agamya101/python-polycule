from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import Provenance


class DailyWeather(BaseModel):
    date: str
    precipitation_mm: float | None = None
    temperature_2m_max_c: float | None = None
    temperature_2m_min_c: float | None = None
    temperature_2m_mean_c: float | None = None
    et0_mm: float | None = Field(None, description="FAO-56 reference evapotranspiration.")
    soil_moisture_0_7cm_m3m3: float | None = Field(None, description="Modelled volumetric soil moisture (daily mean of hourly values), where available.")


class WeatherFeatures(BaseModel):
    """Environmental indicators derived from daily weather up to and including ``as_of``.

    ``water_balance_14d`` = sum(precipitation) - sum(ET0) over 14 days. It is an
    environmental water-balance indicator, not a measurement of crop water stress.
    """

    as_of: str
    rainfall_7d_mm: float | None = None
    rainfall_14d_mm: float | None = None
    rainfall_30d_mm: float | None = None
    et0_7d_mm: float | None = None
    et0_14d_mm: float | None = None
    water_balance_14d_mm: float | None = None
    max_temperature_7d_c: float | None = None
    heat_days_7d: int | None = None
    dry_spell_length_days: int | None = None
    soil_moisture_mean_7d_m3m3: float | None = None
    water_balance_14d_climatology_mm: float | None = Field(None, description="Past-only seasonal norm: median 14-day water balance at the same date in prior years.")
    water_balance_14d_anomaly_mm: float | None = Field(None, description="water_balance_14d_mm minus its seasonal norm (negative = drier than usual).")
    dry_spell_climatology_days: float | None = Field(None, description="Past-only seasonal norm of dry-spell length at the same date in prior years.")
    climatology_years: list[int] = Field(default_factory=list)
    days_available: int = 0
    missing_values: int = 0
    thresholds: dict[str, float] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class CacheStatus(str, Enum):
    LIVE = "LIVE"
    CACHED_FRESH = "CACHED_FRESH"
    CACHED_STALE = "CACHED_STALE"
    DEMO = "DEMO"


class CacheInfo(BaseModel):
    status: CacheStatus
    age_seconds: float | None = None
    note: str | None = None


class WeatherHistoryResponse(BaseModel):
    status: str = "OK"
    latitude: float
    longitude: float
    start_date: str
    end_date: str
    daily: list[DailyWeather]
    features: WeatherFeatures
    cache: CacheInfo
    provenance: list[Provenance]


class WeatherAlert(BaseModel):
    rule: str = Field(..., examples=["HEAT_STRESS"])
    triggered: bool
    severity: str | None = None
    input_values: dict[str, Any]
    configured_threshold: dict[str, Any]
    dates: list[str] = Field(default_factory=list)
    evaluated_at: str
    note: str = "Configurable rule threshold; not a universally validated crop-damage threshold."


class WeatherForecastResponse(BaseModel):
    status: str = "OK"
    latitude: float
    longitude: float
    daily: list[DailyWeather]
    alerts: list[WeatherAlert]
    cache: CacheInfo
    provenance: list[Provenance]
