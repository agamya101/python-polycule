"""Small, explicit numeric helpers used by the heuristic engines."""

from __future__ import annotations

import math
from typing import Sequence

# Below this absolute baseline NDVI, a percentage anomaly is not meaningful
# (bare soil / water / fallow). Callers receive None plus a quality flag.
MIN_ABS_BASELINE_NDVI = 0.10


def clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


def linear_score(value: float, zero_at: float, full_at: float) -> float:
    """Map ``value`` linearly so that ``zero_at`` -> 0 and ``full_at`` -> 1, clipped.

    Works in either direction (``full_at`` may be smaller than ``zero_at``).
    """
    if full_at == zero_at:
        return 1.0 if value >= full_at else 0.0
    return clip01((value - zero_at) / (full_at - zero_at))


def safe_anomaly_pct(current: float | None, baseline: float | None, min_abs_baseline: float = MIN_ABS_BASELINE_NDVI) -> tuple[float | None, str | None]:
    """Percentage anomaly ``(current - baseline) / |baseline| * 100``.

    Returns ``(None, flag)`` when inputs are missing or the baseline is too
    close to zero for a percentage to be meaningful.
    """
    if current is None or baseline is None:
        return None, "ANOMALY_INPUT_MISSING"
    if not (math.isfinite(current) and math.isfinite(baseline)):
        return None, "ANOMALY_INPUT_NOT_FINITE"
    if abs(baseline) < min_abs_baseline:
        return None, "BASELINE_TOO_LOW_FOR_PERCENT_ANOMALY"
    return (current - baseline) / abs(baseline) * 100.0, None


def linear_slope(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Ordinary least-squares slope; None if fewer than two distinct x values."""
    n = len(xs)
    if n < 2 or n != len(ys):
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx


def band_for(score: float, bands: list[dict]) -> str:
    """Return the band label for a score given ``[{level, min, max}]`` (max exclusive)."""
    for b in bands:
        if b["min"] <= score < b["max"]:
            return b["level"]
    return bands[-1]["level"] if score >= bands[-1]["min"] else bands[0]["level"]
