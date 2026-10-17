"""Prepare a retrospective training dataset for next-observation deterioration.

Input: historical tabular observations (CSV or Parquet), one row per location
and valid observation date. Required columns: ``location_id``,
``observation_date``, ``ndvi``. Recommended: ``ndmi``, ``baseline_ndvi``,
``ndvi_anomaly_pct``, ``valid_pixel_pct``, ``rainfall_7d``, ``rainfall_14d``,
``rainfall_30d``, ``et0_7d``, ``et0_14d``, ``water_balance_14d``,
``temperature_max_7d``, ``heat_days_7d``, ``dry_spell_length``, ``crop_type``,
``sowing_date``. Weather columns must be computed as of each observation date
(e.g. with ``app.services.feature_engineering.compute_weather_features``).

Leakage rules:
* features at time t use only rows at or before t (lags via shift(+1), trends
  over current and past rows only);
* the label uses the next valid observation t+1 and is stored with
  ``next_``/``label`` prefixes, which the feature builder refuses to use.

Experimental labels (documented, not validated):
* ``ndvi_delta`` (default): label = 1 if next_ndvi - ndvi <= -0.08
* ``anomaly_delta``: label = 1 if next_anomaly_pct - anomaly_pct <= -10 points
  (stage-adjusted when the baseline is seasonal/crop-aligned; preferred when
  baselines exist).

Usage:
    python training/prepare_dataset.py --input data/raw/obs.csv --output data/processed/train.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ml.features import month_cyclic  # noqa: E402
from app.utils.normalization import MIN_ABS_BASELINE_NDVI  # noqa: E402

REQUIRED = ["location_id", "observation_date", "ndvi"]
TREND_WINDOW_OBS = 3


def _rolling_slope_per_10d(dates: pd.Series, values: pd.Series, window: int) -> pd.Series:
    """Slope over the current and previous ``window-1`` observations (past only)."""
    days = (dates - dates.iloc[0]).dt.days.astype(float).to_numpy()
    vals = values.to_numpy(dtype=float)
    out = np.full(len(vals), np.nan)
    for i in range(len(vals)):
        lo = max(0, i - window + 1)
        x, y = days[lo : i + 1], vals[lo : i + 1]
        m = ~np.isnan(y)
        if m.sum() >= 2 and np.ptp(x[m]) > 0:
            out[i] = np.polyfit(x[m], y[m], 1)[0] * 10
    return pd.Series(out, index=values.index)


def prepare(
    df: pd.DataFrame,
    *,
    label_mode: str = "ndvi_delta",
    ndvi_drop: float = -0.08,
    anomaly_drop: float = -10.0,
    min_valid_pct: float = 40.0,
    max_gap_days: int = 30,
    keep_unlabelled: bool = False,
) -> tuple[pd.DataFrame, dict]:
    """Return the processed table and a report.

    With ``keep_unlabelled=True`` every usable observation is kept and ``label``
    is NaN where no valid next observation (or anomaly) exists; training code
    must drop those rows. Otherwise only labelled rows are returned.
    """
    missing_cols = [c for c in REQUIRED if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required columns: {missing_cols}")
    report: dict = {"input_rows": int(len(df)), "label_mode": label_mode}

    df = df.copy()
    df["observation_date"] = pd.to_datetime(df["observation_date"])
    df = df.sort_values(["location_id", "observation_date"]).drop_duplicates(["location_id", "observation_date"], keep="last")
    report["missing_values"] = {c: int(v) for c, v in df.isna().sum().items() if v}

    if "valid_pixel_pct" in df.columns:
        before = len(df)
        df = df[df["valid_pixel_pct"].isna() | (df["valid_pixel_pct"] >= min_valid_pct)]
        report["dropped_low_quality"] = int(before - len(df))
    df = df[df["ndvi"].notna()]

    if "ndvi_anomaly_pct" not in df.columns:
        df["ndvi_anomaly_pct"] = np.nan
    if "baseline_ndvi" in df.columns:
        ok = df["ndvi_anomaly_pct"].isna() & df["baseline_ndvi"].abs().ge(MIN_ABS_BASELINE_NDVI)
        df.loc[ok, "ndvi_anomaly_pct"] = (df.loc[ok, "ndvi"] - df.loc[ok, "baseline_ndvi"]) / df.loc[ok, "baseline_ndvi"].abs() * 100

    parts = []
    for _, g in df.groupby("location_id", sort=False):
        g = g.sort_values("observation_date").copy()
        g["ndvi_current"] = g["ndvi"]
        g["ndmi_current"] = g["ndmi"] if "ndmi" in g else np.nan
        prev = g["ndvi"].shift(1)
        g["ndvi_delta_prev"] = g["ndvi"] - prev
        g["days_since_prev_obs"] = (g["observation_date"] - g["observation_date"].shift(1)).dt.days
        g["ndvi_trend"] = _rolling_slope_per_10d(g["observation_date"], g["ndvi"], TREND_WINDOW_OBS)
        g["ndmi_trend"] = _rolling_slope_per_10d(g["observation_date"], g["ndmi_current"], TREND_WINDOW_OBS)
        # ---- label side (future); never used as features
        g["next_observation_date"] = g["observation_date"].shift(-1)
        g["next_ndvi"] = g["ndvi"].shift(-1)
        g["next_ndvi_anomaly_pct"] = g["ndvi_anomaly_pct"].shift(-1)
        g["next_gap_days"] = (g["next_observation_date"] - g["observation_date"]).dt.days
        parts.append(g)
    out = pd.concat(parts) if parts else df.iloc[0:0]

    months = out["observation_date"].map(lambda d: month_cyclic(d.date()))
    out["month_sin"] = [m[0] for m in months]
    out["month_cos"] = [m[1] for m in months]
    out["observation_quality"] = out["valid_pixel_pct"] if "valid_pixel_pct" in out else np.nan
    if "sowing_date" in out.columns:
        out["days_since_sowing"] = (out["observation_date"] - pd.to_datetime(out["sowing_date"])).dt.days

    has_next = out["next_ndvi"].notna() & (out["next_gap_days"] <= max_gap_days)
    if label_mode == "ndvi_delta":
        labelable = has_next
        delta = out["next_ndvi"] - out["ndvi_current"]
        threshold = ndvi_drop
        report["label_definition"] = f"next valid NDVI - current NDVI <= {ndvi_drop} (next observation within {max_gap_days} days)"
    elif label_mode == "anomaly_delta":
        labelable = has_next & out["ndvi_anomaly_pct"].notna() & out["next_ndvi_anomaly_pct"].notna()
        delta = out["next_ndvi_anomaly_pct"] - out["ndvi_anomaly_pct"]
        threshold = anomaly_drop
        report["label_definition"] = f"next valid NDVI anomaly - current anomaly <= {anomaly_drop} percentage points (within {max_gap_days} days)"
    else:
        raise ValueError(f"Unknown label_mode {label_mode}")
    out["label_delta"] = delta.where(labelable)
    out["label"] = np.where(labelable, (delta <= threshold).astype(float), np.nan)
    report["dropped_no_next_or_gap"] = int((~has_next).sum())
    report["unlabelled_rows"] = int((~labelable).sum())
    if not keep_unlabelled:
        out = out[labelable].copy()
        out["label"] = out["label"].astype(int)
    report["label_definition"] += " [EXPERIMENTAL THRESHOLD]"

    # Leakage self-check: features at row i must not equal the next row's values by construction.
    assert not out["next_observation_date"].le(out["observation_date"]).any(), "next observation must be strictly later"

    labelled = out["label"].notna()
    report.update(output_rows=int(len(out)), labelled_rows=int(labelled.sum()), positives=int(out.loc[labelled, "label"].sum()), locations=int(out["location_id"].nunique()),
                  period={"start": out["observation_date"].min().date().isoformat() if len(out) else None,
                          "end": out["observation_date"].max().date().isoformat() if len(out) else None})
    return out.reset_index(drop=True), report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True, help=".csv or .parquet")
    ap.add_argument("--label-mode", choices=["ndvi_delta", "anomaly_delta"], default="ndvi_delta")
    ap.add_argument("--ndvi-drop", type=float, default=-0.08)
    ap.add_argument("--anomaly-drop", type=float, default=-10.0)
    ap.add_argument("--min-valid-pct", type=float, default=40.0)
    ap.add_argument("--max-gap-days", type=int, default=30)
    a = ap.parse_args()

    df = pd.read_parquet(a.input) if a.input.endswith(".parquet") else pd.read_csv(a.input)
    out, report = prepare(df, label_mode=a.label_mode, ndvi_drop=a.ndvi_drop, anomaly_drop=a.anomaly_drop,
                          min_valid_pct=a.min_valid_pct, max_gap_days=a.max_gap_days)
    Path(a.output).parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(a.output, index=False) if a.output.endswith(".parquet") else out.to_csv(a.output, index=False)
    Path(a.output + ".report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
