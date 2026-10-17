"""Model feature contract shared by training and inference.

Every feature must be computable from information available at prediction
time ``t``. Columns that describe the future (``next_*``, ``future_*``,
``label*``) are forbidden as features.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from app.schemas.satellite import VegetationSummary
from app.schemas.weather import WeatherFeatures

CORE_FEATURES = [
    "ndvi_current",
    "ndvi_anomaly_pct",
    "ndvi_trend",
    "ndmi_current",
    "ndmi_trend",
    "rainfall_7d",
    "rainfall_14d",
    "rainfall_30d",
    "et0_7d",
    "et0_14d",
    "water_balance_14d",
    "temperature_max_7d",
    "heat_days_7d",
    "dry_spell_length",
    "month_sin",
    "month_cos",
    "observation_quality",
    "days_since_prev_obs",
    "ndvi_delta_prev",
]
OPTIONAL_FEATURES = ["days_since_sowing"]
REQUIRED_AT_INFERENCE = ["ndvi_current"]
FORBIDDEN_PREFIXES = ("next_", "future_", "label", "target")


def month_cyclic(d: date) -> tuple[float, float]:
    angle = 2 * math.pi * (d.month - 1) / 12
    return round(math.sin(angle), 6), round(math.cos(angle), 6)


def assert_no_leakage(columns: list[str]) -> None:
    bad = [c for c in columns if c.lower().startswith(FORBIDDEN_PREFIXES)]
    if bad:
        raise ValueError(f"Feature set contains future/label columns (leakage): {bad}")


def build_feature_row(
    veg: VegetationSummary | None,
    weather: WeatherFeatures | None,
    as_of: date,
    *,
    prev_ndvi: float | None = None,
    days_since_prev_obs: float | None = None,
    sowing_date: str | None = None,
) -> dict[str, Any]:
    ms, mc = month_cyclic(as_of)
    row: dict[str, Any] = {k: None for k in CORE_FEATURES + OPTIONAL_FEATURES}
    row.update(month_sin=ms, month_cos=mc)
    if veg is not None:
        row.update(
            ndvi_current=veg.latest_ndvi,
            ndvi_anomaly_pct=veg.ndvi_anomaly_pct,
            ndvi_trend=veg.ndvi_trend_per_10d,
            ndmi_current=veg.latest_ndmi,
            ndmi_trend=veg.ndmi_trend_per_10d,
            observation_quality=veg.latest_valid_pixel_pct,
        )
    if weather is not None:
        row.update(
            rainfall_7d=weather.rainfall_7d_mm,
            rainfall_14d=weather.rainfall_14d_mm,
            rainfall_30d=weather.rainfall_30d_mm,
            et0_7d=weather.et0_7d_mm,
            et0_14d=weather.et0_14d_mm,
            water_balance_14d=weather.water_balance_14d_mm,
            temperature_max_7d=weather.max_temperature_7d_c,
            heat_days_7d=weather.heat_days_7d,
            dry_spell_length=weather.dry_spell_length_days,
        )
    if prev_ndvi is not None and row["ndvi_current"] is not None:
        row["ndvi_delta_prev"] = row["ndvi_current"] - prev_ndvi
    row["days_since_prev_obs"] = days_since_prev_obs
    if sowing_date:
        row["days_since_sowing"] = (as_of - date.fromisoformat(sowing_date)).days
    return row
