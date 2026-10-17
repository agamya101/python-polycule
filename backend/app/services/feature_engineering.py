"""Environmental and vegetation feature engineering.

All features are computed *as of* a date using only data on or before it, so
the same functions can be used for retrospective training without leakage.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.config import load_rules
from app.schemas.satellite import BaselineInfo, SatelliteObservation, VegetationSummary
from app.schemas.weather import DailyWeather, WeatherFeatures
from app.utils.normalization import linear_slope, safe_anomaly_pct

TREND_WINDOW_DAYS = 45
RECENT_WINDOW_DAYS = 30


# --------------------------------------------------------------------- weather
def _window(rows_by_date: dict[str, DailyWeather], as_of: date, days: int) -> list[DailyWeather | None]:
    return [rows_by_date.get((as_of - timedelta(days=i)).isoformat()) for i in range(days)]


def _window_sum(window: list[DailyWeather | None], attr: str) -> tuple[float | None, int]:
    vals = [getattr(r, attr) if r else None for r in window]
    missing = sum(v is None for v in vals)
    if missing:
        return None, missing
    return round(sum(vals), 2), 0  # type: ignore[arg-type]


def compute_weather_features(daily: list[DailyWeather], as_of: date) -> WeatherFeatures:
    """Derive rainfall, ET0, water-balance, heat and dry-spell indicators.

    A windowed value is returned only when every day in the window has data;
    otherwise it is ``None`` and a note explains why. Missing days are never
    filled with assumed values.
    """
    cfg = load_rules("weather_rules")["features"]
    heat_t = float(cfg["heat_day_tmax_c"])
    dry_mm = float(cfg["dry_day_precip_mm"])

    rows = {r.date: r for r in daily if r.date <= as_of.isoformat()}
    notes: list[str] = []
    feats: dict[str, float | int | None] = {}
    missing_total = 0

    for name, attr, days in [
        ("rainfall_7d_mm", "precipitation_mm", 7),
        ("rainfall_14d_mm", "precipitation_mm", 14),
        ("rainfall_30d_mm", "precipitation_mm", 30),
        ("et0_7d_mm", "et0_mm", 7),
        ("et0_14d_mm", "et0_mm", 14),
    ]:
        value, missing = _window_sum(_window(rows, as_of, days), attr)
        feats[name] = value
        if missing:
            missing_total += missing
            notes.append(f"{name} unavailable: {missing} of {days} days missing.")

    if feats["rainfall_14d_mm"] is not None and feats["et0_14d_mm"] is not None:
        feats["water_balance_14d_mm"] = round(feats["rainfall_14d_mm"] - feats["et0_14d_mm"], 2)  # type: ignore[operator]
    else:
        feats["water_balance_14d_mm"] = None

    w7 = _window(rows, as_of, 7)
    tmax = [r.temperature_2m_max_c if r else None for r in w7]
    if all(t is not None for t in tmax):
        feats["max_temperature_7d_c"] = round(max(tmax), 2)  # type: ignore[type-var]
        feats["heat_days_7d"] = sum(1 for t in tmax if t >= heat_t)  # type: ignore[operator]
    else:
        feats["max_temperature_7d_c"] = None
        feats["heat_days_7d"] = None
        notes.append("Temperature features unavailable: incomplete 7-day maximum temperature record.")

    # Dry spell: consecutive days ending at as_of with precipitation below threshold.
    spell = 0
    i = 0
    complete = False
    while True:
        r = rows.get((as_of - timedelta(days=i)).isoformat())
        if r is None or r.precipitation_mm is None:
            break
        if r.precipitation_mm >= dry_mm:
            complete = True
            break
        spell += 1
        i += 1
    if not rows:
        feats["dry_spell_length_days"] = None
    else:
        feats["dry_spell_length_days"] = spell
        if not complete and spell > 0:
            notes.append(f"Dry spell length is a lower bound ({spell} days): record ends before the spell starts.")

    sm = [r.soil_moisture_0_7cm_m3m3 for r in w7 if r and r.soil_moisture_0_7cm_m3m3 is not None]
    feats["soil_moisture_mean_7d_m3m3"] = round(sum(sm) / len(sm), 4) if len(sm) >= 4 else None

    return WeatherFeatures(
        as_of=as_of.isoformat(),
        days_available=len(rows),
        missing_values=missing_total,
        thresholds={"heat_day_tmax_c": heat_t, "dry_day_precip_mm": dry_mm},
        notes=notes,
        **feats,  # type: ignore[arg-type]
    )


def add_seasonal_climatology(features: WeatherFeatures, history: list[DailyWeather], as_of: date, *,
                             years_back: int = 8, offsets: tuple[int, ...] = (-7, 0, 7), min_years: int = 3) -> WeatherFeatures:
    """Attach a PAST-ONLY seasonal norm for water balance and dry-spell length.

    For each prior year (as_of.year - 1 ... as_of.year - years_back) the 14-day
    water balance and dry-spell length are computed at the same calendar date
    (+/- ``offsets`` days) from ``history``. The norm is the median over those
    values. Only dates strictly before ``as_of`` are used. With fewer than
    ``min_years`` usable years the fields stay None.
    """
    wb_vals: list[float] = []
    ds_vals: list[float] = []
    years: set[int] = set()
    for k in range(1, years_back + 1):
        try:
            anchor = as_of.replace(year=as_of.year - k)
        except ValueError:  # 29 Feb
            anchor = as_of.replace(year=as_of.year - k, day=28)
        got = False
        for off in offsets:
            t = anchor + timedelta(days=off)
            if t >= as_of:
                continue
            f = compute_weather_features(history, t)
            if f.water_balance_14d_mm is not None:
                wb_vals.append(f.water_balance_14d_mm)
                got = True
            if f.dry_spell_length_days is not None and f.days_available > 60:
                ds_vals.append(float(f.dry_spell_length_days))
        if got:
            years.add(anchor.year)
    if len(years) < min_years:
        features.notes.append(f"Seasonal water climatology unavailable ({len(years)} prior years < {min_years}).")
        return features
    wb_norm = round(float(np.median(wb_vals)), 2)
    features.water_balance_14d_climatology_mm = wb_norm
    if features.water_balance_14d_mm is not None:
        features.water_balance_14d_anomaly_mm = round(features.water_balance_14d_mm - wb_norm, 2)
    if ds_vals:
        features.dry_spell_climatology_days = round(float(np.median(ds_vals)), 1)
    features.climatology_years = sorted(years)
    return features


def weather_features_available(f: WeatherFeatures | None) -> bool:
    if f is None:
        return False
    return any(
        v is not None
        for v in (f.water_balance_14d_mm, f.dry_spell_length_days, f.max_temperature_7d_c, f.rainfall_14d_mm)
    )


# ------------------------------------------------------------------ vegetation
def usable_observations(obs: list[SatelliteObservation], as_of: date, min_valid_pixel_pct: float) -> tuple[list[SatelliteObservation], list[str]]:
    flags: list[str] = []
    out = []
    for o in obs:
        if o.date > as_of.isoformat() or o.ndvi is None:
            continue
        if o.valid_pixel_pct is None:
            if "VALID_PIXEL_PCT_UNKNOWN" not in flags:
                flags.append("VALID_PIXEL_PCT_UNKNOWN")
            out.append(o)
        elif o.valid_pixel_pct >= min_valid_pixel_pct:
            out.append(o)
    out.sort(key=lambda o: o.date)
    return out, flags


def trend_per_10d(obs: list[SatelliteObservation], as_of: date, attr: str = "ndvi", window_days: int = TREND_WINDOW_DAYS) -> float | None:
    pts = [
        ((date.fromisoformat(o.date) - as_of).days, getattr(o, attr))
        for o in obs
        if getattr(o, attr) is not None and (as_of - date.fromisoformat(o.date)).days <= window_days
    ]
    if len(pts) < 2:
        return None
    slope = linear_slope([p[0] for p in pts], [p[1] for p in pts])
    return None if slope is None else round(slope * 10, 4)


def summarize_vegetation(
    observations: list[SatelliteObservation],
    as_of: date,
    ndvi_baseline: BaselineInfo,
    ndmi_baseline: BaselineInfo,
    min_valid_pixel_pct: float,
    *,
    recent_window_days: int = RECENT_WINDOW_DAYS,
    trend_window_days: int = TREND_WINDOW_DAYS,
) -> VegetationSummary:
    usable, flags = usable_observations(observations, as_of, min_valid_pixel_pct)
    ignored = len([o for o in observations if o.date <= as_of.isoformat()]) - len(usable)
    if ignored > 0:
        flags.append(f"{ignored}_OBSERVATIONS_EXCLUDED_LOW_QUALITY_OR_MISSING")

    if not usable:
        flags.append("NO_USABLE_SATELLITE_OBSERVATION")
        return VegetationSummary(ndvi_baseline=ndvi_baseline, ndmi_baseline=ndmi_baseline, quality_flags=flags, recent_window_days=recent_window_days)

    latest = usable[-1]
    age = (as_of - date.fromisoformat(latest.date)).days
    recent = [o for o in usable if (as_of - date.fromisoformat(o.date)).days <= recent_window_days]

    anomaly, aflag = safe_anomaly_pct(latest.ndvi, ndvi_baseline.value)
    if aflag and ndvi_baseline.value is not None:
        flags.append(aflag)
    if ndvi_baseline.value is None:
        flags.append("NO_SEASONAL_BASELINE")

    ndmi_delta = None
    if latest.ndmi is not None and ndmi_baseline.value is not None:
        ndmi_delta = round(latest.ndmi - ndmi_baseline.value, 4)

    return VegetationSummary(
        latest_usable_date=latest.date,
        latest_ndvi=latest.ndvi,
        latest_ndmi=latest.ndmi,
        latest_valid_pixel_pct=latest.valid_pixel_pct,
        observation_age_days=age,
        usable_observations_30d=len(recent),
        recent_window_days=recent_window_days,
        usable_observations_total=len(usable),
        ndvi_baseline=ndvi_baseline,
        ndmi_baseline=ndmi_baseline,
        ndvi_anomaly_pct=None if anomaly is None else round(anomaly, 2),
        ndmi_delta_from_baseline=ndmi_delta,
        ndvi_trend_per_10d=trend_per_10d(usable, as_of, "ndvi", trend_window_days),
        ndmi_trend_per_10d=trend_per_10d(usable, as_of, "ndmi", trend_window_days),
        quality_flags=flags,
    )
