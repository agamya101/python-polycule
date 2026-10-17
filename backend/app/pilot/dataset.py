"""Build the real Yavatmal observation / training table.

Inputs are only real downloaded data:
* ``processed/modis_composites.csv`` (ORNL DAAC MOD13Q1 cell statistics)
* Open-Meteo archive daily weather per cell (cached under ``raw/weather``)

Key guarantees:
* Seasonal baselines are PAST-ONLY: an observation at date t uses the same
  cell's accepted observations at least ``min_days_before`` days earlier (prior
  seasons) whose day-of-year is within ``window_days``. Future years never
  influence an earlier baseline. Too little prior history -> baseline missing.
* Weather features at t use only days <= t.
* No synthetic rows are created.
"""

from __future__ import annotations

import json
import logging
import statistics
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.pilot.region import processed_dir, raw_dir
from app.providers.base import ProviderError
from app.providers.open_meteo import OpenMeteoProvider
from app.schemas.weather import DailyWeather
from app.services.feature_engineering import compute_weather_features
from app.utils.normalization import safe_anomaly_pct

log = logging.getLogger("pilot")

WEATHER_COLUMNS = {
    "rainfall_7d_mm": "rainfall_7d",
    "rainfall_14d_mm": "rainfall_14d",
    "rainfall_30d_mm": "rainfall_30d",
    "et0_7d_mm": "et0_7d",
    "et0_14d_mm": "et0_14d",
    "water_balance_14d_mm": "water_balance_14d",
    "max_temperature_7d_c": "temperature_max_7d",
    "heat_days_7d": "heat_days_7d",
    "dry_spell_length_days": "dry_spell_length",
}


# --------------------------------------------------------------- screening
def screen_cells(comp: pd.DataFrame, cfg: dict[str, Any]) -> dict[str, dict[str, Any]]:
    sc = cfg["cells"]["screening"]
    min_valid = cfg["satellite"]["min_valid_pixel_pct"]
    out: dict[str, dict[str, Any]] = {}
    for cell, g in comp.groupby("location_id"):
        usable = g[g["ndvi"].notna() & (g["valid_pixel_pct"] >= min_valid)]
        frac = len(usable) / len(g) if len(g) else 0.0
        med = float(usable["ndvi"].median()) if len(usable) else None
        reasons = []
        if med is None or med < sc["min_median_ndvi"]:
            reasons.append(f"long-term median NDVI {med if med is None else round(med, 3)} < {sc['min_median_ndvi']} (likely water/built-up/bare)")
        if frac < sc["min_usable_fraction"]:
            reasons.append(f"usable composite fraction {frac:.2f} < {sc['min_usable_fraction']}")
        out[str(cell)] = {
            "status": "excluded" if reasons else "monitored",
            "median_ndvi": None if med is None else round(med, 4),
            "usable_fraction": round(frac, 3),
            "composites": int(len(g)),
            "reasons": reasons,
        }
    return out


# ------------------------------------------------------- past-only baseline
def _doy_distance(a: date, b: date) -> int:
    d = abs(a.timetuple().tm_yday - b.timetuple().tm_yday)
    return min(d, 365 - d)


def past_only_baseline(dates: list[date], values: list[float], target: date, *, window_days: int, min_days_before: int,
                       min_prior_years: int, min_observations: int) -> tuple[float | None, int, list[int]]:
    """Median of prior-season accepted values near the same day of year.

    Only observations at least ``min_days_before`` days BEFORE ``target`` are
    considered, so no future (or same-season) data can enter the baseline.
    Returns (baseline, n_observations, sorted distinct prior years).
    """
    matched = [(d, v) for d, v in zip(dates, values)
               if (target - d).days >= min_days_before and _doy_distance(d, target) <= window_days]
    years = sorted({d.year for d, _ in matched})
    if len(matched) < min_observations or len(years) < min_prior_years:
        return None, len(matched), years
    return round(statistics.median(v for _, v in matched), 4), len(matched), years


def _anomaly(value: float, baseline: float | None) -> float | None:
    if baseline is None:
        return None
    a, _flag = safe_anomaly_pct(value, baseline)  # None when |baseline| is too small for a percentage
    return None if a is None else round(a, 3)


def add_baselines(usable: pd.DataFrame, bcfg: dict[str, Any]) -> pd.DataFrame:
    parts = []
    for _, g in usable.groupby("location_id", sort=False):
        g = g.sort_values("observation_date").copy()
        ds = [d.date() for d in g["observation_date"]]
        vs = g["ndvi"].astype(float).tolist()
        res = [past_only_baseline(ds, vs, t, window_days=bcfg["window_days"], min_days_before=bcfg["min_days_before"],
                                  min_prior_years=bcfg["min_prior_years"], min_observations=bcfg["min_observations"]) for t in ds]
        g["baseline_ndvi"] = [r[0] for r in res]
        g["baseline_observation_count"] = [r[1] for r in res]
        g["baseline_year_count"] = [len(r[2]) for r in res]
        g["ndvi_anomaly_pct"] = [_anomaly(v, b) for v, b in zip(vs, g["baseline_ndvi"])]
        parts.append(g)
    return pd.concat(parts) if parts else usable


# ----------------------------------------------------------------- weather
def fetch_cell_weather(cell: dict[str, Any], start: date, end: date, refresh: bool) -> tuple[list[DailyWeather], dict[str, Any]]:
    provider = OpenMeteoProvider(cache_dir=raw_dir() / "weather", ttl_seconds=0 if refresh else 10**9,
                                 rate_limit_retries=6, rate_limit_wait_seconds=61.0)
    res = provider.history(cell["lat"], cell["lon"], start, end, include_soil_moisture=False)
    return res.daily, {"source": res.source, "retrieved_at": res.retrieved_at, "cache": res.cache.status.value, **res.metadata}


def weather_feature_rows(daily: list[DailyWeather], dates: list[date]) -> list[dict[str, Any]]:
    rows = []
    for t in dates:
        f = compute_weather_features(daily, t)
        rows.append({new: getattr(f, old) for old, new in WEATHER_COLUMNS.items()})
    return rows


# ------------------------------------------------------------------ build
def build_dataset(cfg: dict[str, Any], comp: pd.DataFrame, cells: list[dict[str, Any]], screening: dict[str, dict[str, Any]],
                  refresh: bool = False) -> tuple[pd.DataFrame, dict[str, Any]]:
    from training.prepare_dataset import prepare  # local import keeps app import-light

    sat = cfg["satellite"]
    min_valid = sat["min_valid_pixel_pct"]
    monitored = [c for c in cells if screening.get(c["cell_id"], {}).get("status") == "monitored"]
    comp = comp.copy()
    comp["observation_date"] = pd.to_datetime(comp["observation_date"])
    total_composites = int(len(comp[comp["location_id"].isin([c["cell_id"] for c in monitored])]))
    usable = comp[comp["location_id"].isin([c["cell_id"] for c in monitored]) & comp["ndvi"].notna() & (comp["valid_pixel_pct"] >= min_valid)].copy()
    usable = add_baselines(usable, cfg["baseline"])

    w_start = date.fromisoformat(cfg["weather"]["start_date"])
    # Must match assess.build_snapshot (latest composite date + 1) so the archive cache key is shared.
    w_end = min(date.today() - timedelta(days=7), comp["observation_date"].max().date() + timedelta(days=1))
    weather_meta: dict[str, Any] = {}
    feat_parts = []
    for c in monitored:
        g = usable[usable["location_id"] == c["cell_id"]].sort_values("observation_date")
        try:
            daily, meta = fetch_cell_weather(c, w_start, w_end, refresh)
        except ProviderError as exc:
            log.warning("Weather unavailable for %s: %s (weather features left missing)", c["cell_id"], exc)
            weather_meta[c["cell_id"]] = {"error": str(exc)}
            continue
        weather_meta[c["cell_id"]] = meta
        rows = weather_feature_rows(daily, [d.date() for d in g["observation_date"]])
        wf = pd.DataFrame(rows, index=g.index)
        feat_parts.append(wf)
    if feat_parts:
        usable = usable.join(pd.concat(feat_parts))

    lab = cfg["label"]
    table, report = prepare(usable, label_mode=lab["mode"], anomaly_drop=lab["anomaly_drop_pct_points"], min_valid_pct=min_valid,
                            max_gap_days=lab["max_gap_days"], keep_unlabelled=True)
    table["satellite_quality"] = table["valid_pixel_pct"]
    table["satellite_source"] = sat["provider"]
    table["satellite_product"] = f"{sat['product']} C{sat['collection']}"
    table["weather_source"] = "open_meteo_archive"
    table["source_type"] = "OBSERVED"
    table["is_demo"] = False
    table = table.sort_values(["location_id", "observation_date"]).reset_index(drop=True)

    labelled = table[table["label"].notna()]
    report.update({
        "monitoring_cells_candidates": len(cells),
        "monitoring_cells_used": len(monitored),
        "excluded_cells": {k: v for k, v in screening.items() if v["status"] == "excluded"},
        "composites_downloaded_for_used_cells": total_composites,
        "valid_satellite_observations": int(len(usable)),
        "quality_filtering": f"composite kept when cell NDVI exists (>=1 accepted pixel, reliability 0/1, not fill) and valid_pixel_pct >= {min_valid}",
        "observations_with_baseline": int(table["baseline_ndvi"].notna().sum()),
        "label_prevalence": round(float(labelled["label"].mean()), 4) if len(labelled) else None,
        "years_covered": sorted({int(d.year) for d in table["observation_date"]}),
        "missing_values": {c: int(v) for c, v in table.isna().sum().items() if v},
        "sources": {
            "satellite": "NASA LP DAAC MOD13Q1 C6.1 via ORNL DAAC TESViS web service (https://modis.ornl.gov/rst/api/v1/)",
            "weather": "Open-Meteo historical weather API (ERA5-based reanalysis), https://archive-api.open-meteo.com/v1/archive",
            "boundary": cfg["boundary"]["dataset"],
        },
        "weather_retrieval": weather_meta,
        "synthetic_rows": 0,
    })
    return table, report


def label_sensitivity(table: pd.DataFrame, test_start: pd.Timestamp, thresholds=(-5.0, -10.0, -15.0, -20.0)) -> dict[str, Any]:
    """Prevalence of candidate thresholds on PRE-TEST data only (train+validation periods)."""
    pre = table[(table["observation_date"] < test_start) & table["label_delta"].notna()]
    return {str(t): {"rows": int(len(pre)), "prevalence": round(float((pre["label_delta"] <= t).mean()), 4) if len(pre) else None}
            for t in thresholds}


def write_table(table: pd.DataFrame, report: dict[str, Any]) -> None:
    out = processed_dir() / "yavatmal_observations.csv"
    cols_first = ["location_id", "lat", "lon", "observation_date", "composite_end_date", "ndvi", "baseline_ndvi", "baseline_observation_count",
                  "baseline_year_count", "ndvi_anomaly_pct", "ndvi_delta_prev", "ndvi_trend", "days_since_prev_obs", "satellite_quality",
                  "good_pixel_pct", *WEATHER_COLUMNS.values(), "month_sin", "month_cos", "next_observation_date", "next_ndvi",
                  "next_ndvi_anomaly_pct", "next_gap_days", "label_delta", "label"]
    rest = [c for c in table.columns if c not in cols_first]
    t = table.reindex(columns=[c for c in cols_first if c in table.columns] + rest)
    t.to_csv(out, index=False, date_format="%Y-%m-%d")
    (processed_dir() / "dataset_report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def load_table() -> pd.DataFrame:
    return pd.read_csv(processed_dir() / "yavatmal_observations.csv", parse_dates=["observation_date", "next_observation_date"])
