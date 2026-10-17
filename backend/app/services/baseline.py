"""Seasonal vegetation baselines.

A crop is never compared against an annual average. The baseline for a target
date is built from previous seasons' usable observations at a comparable point
in the season:

* ``crop_stage_aligned`` — when sowing dates are known for the current and the
  historical seasons, observations are matched by days-since-sowing.
* ``day_of_year_window`` — otherwise, observations within +/- ``window_days``
  of the same day of year are used. This is a vegetation-season baseline, not a
  crop-specific one; the response says so.

The baseline value is the median of matching observations (robust to the odd
mis-masked cloud pixel).
"""

from __future__ import annotations

import statistics
from datetime import date

from app.schemas.satellite import BaselineInfo, SatelliteObservation

DEFAULT_WINDOW_DAYS = 15
# Observations newer than this (relative to the target) belong to the current
# season and are excluded from the baseline.
CURRENT_SEASON_EXCLUSION_DAYS = 300


def _doy_distance(a: date, b: date) -> int:
    d = abs(a.timetuple().tm_yday - b.timetuple().tm_yday)
    return min(d, 365 - d)


def compute_seasonal_baseline(
    historical: list[SatelliteObservation],
    target: date,
    *,
    attr: str = "ndvi",
    min_valid_pixel_pct: float = 40.0,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_sowing_date: str | None = None,
    historical_sowing_dates: dict[int, str] | None = None,
    crop_type: str | None = None,
) -> BaselineInfo:
    usable: list[tuple[date, float]] = []
    for o in historical:
        v = getattr(o, attr)
        if v is None:
            continue
        if o.valid_pixel_pct is not None and o.valid_pixel_pct < min_valid_pixel_pct:
            continue
        d = date.fromisoformat(o.date)
        if (target - d).days < CURRENT_SEASON_EXCLUSION_DAYS:
            continue
        usable.append((d, float(v)))

    notes: list[str] = []
    matched: list[tuple[date, float]] = []
    method = "day_of_year_window"
    crop_specific = False

    if current_sowing_date and historical_sowing_dates:
        target_das = (target - date.fromisoformat(current_sowing_date)).days
        for d, v in usable:
            sow = historical_sowing_dates.get(d.year)
            if sow is None:
                continue
            das = (d - date.fromisoformat(sow)).days
            if abs(das - target_das) <= window_days:
                matched.append((d, v))
        if matched:
            method = "crop_stage_aligned"
            crop_specific = crop_type is not None
            notes.append(f"Matched by days since sowing ({target_das} +/- {window_days} days).")
        else:
            notes.append("Sowing dates supplied but no historical observations aligned by crop stage; fell back to day-of-year window.")

    if not matched:
        matched = [(d, v) for d, v in usable if _doy_distance(d, target) <= window_days]
        notes.append(
            "Baseline is vegetation-season based (same period of year in previous seasons), not crop-specific."
        )

    if not matched:
        return BaselineInfo(
            value=None,
            n_observations=0,
            years=[],
            method="unavailable",
            crop_specific=False,
            window_days=window_days,
            notes=notes + ["No usable historical observations for this period of the season."],
        )

    years = sorted({d.year for d, _ in matched})
    return BaselineInfo(
        value=round(statistics.median(v for _, v in matched), 4),
        n_observations=len(matched),
        years=years,
        method=method,
        crop_specific=crop_specific,
        window_days=window_days,
        notes=notes,
    )


def supplied_baseline(value: float | None, n_obs: int | None, years: list[int] | None) -> BaselineInfo:
    if value is None:
        return BaselineInfo(value=None, method="unavailable", notes=["No baseline supplied or computable."])
    notes = ["Baseline supplied by the caller; method not verified by this service."]
    return BaselineInfo(value=value, n_observations=n_obs or 0, years=sorted(years or []), method="supplied", notes=notes)
