"""Temporal train/validation/test splitting with an optional spatial holdout.

Rows are never shuffled across time. Each label looks ahead to the next valid
observation, so rows whose *next* observation falls in a later split are purged
from the earlier split: no label crosses a split boundary.

Two separate test sets are produced:

* ``test`` (TEMPORAL TEST): later dates from locations that were used for
  training/model selection.
* ``spatial_test`` (SPATIAL HOLDOUT TEST): later dates from holdout locations
  that never appear in training or validation.

They are reported separately and never mixed. The activation gate uses the
temporal test; the spatial holdout indicates generalisation to unseen cells.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class Split:
    train: pd.DataFrame
    val: pd.DataFrame
    test: pd.DataFrame
    val_start: pd.Timestamp
    test_start: pd.Timestamp
    holdout_locations: list[str]
    spatial_test: pd.DataFrame = field(default_factory=pd.DataFrame)

    def describe(self) -> dict:
        def period(df: pd.DataFrame) -> dict:
            if df.empty:
                return {"rows": 0}
            return {
                "rows": int(len(df)),
                "start": df["observation_date"].min().date().isoformat(),
                "end": df["observation_date"].max().date().isoformat(),
                "positives": int(df["label"].sum()) if "label" in df else None,
                "locations": int(df["location_id"].nunique()),
            }

        return {
            "train": period(self.train),
            "val": period(self.val),
            "test": period(self.test),
            "spatial_test": period(self.spatial_test),
            "val_start": self.val_start.date().isoformat(),
            "test_start": self.test_start.date().isoformat(),
            "holdout_locations": self.holdout_locations,
        }


def default_boundaries(df: pd.DataFrame, val_frac: float = 0.6, test_frac: float = 0.8) -> tuple[pd.Timestamp, pd.Timestamp]:
    dates = np.sort(df["observation_date"].unique())
    return pd.Timestamp(dates[int(len(dates) * val_frac)]), pd.Timestamp(dates[int(len(dates) * test_frac)])


def choose_holdout(locations: list[str], n: int | None = None, frac: float = 0.0, seed: int = 0) -> list[str]:
    locs = sorted(set(map(str, locations)))
    k = n if n is not None else int(round(len(locs) * frac))
    if k <= 0:
        return []
    rng = np.random.default_rng(seed)
    return sorted(rng.choice(locs, size=min(k, len(locs) - 1), replace=False).tolist())


def temporal_split(
    df: pd.DataFrame,
    val_start: str | pd.Timestamp | None = None,
    test_start: str | pd.Timestamp | None = None,
    holdout_location_frac: float = 0.0,
    seed: int = 0,
    holdout_locations: list[str] | None = None,
    val_frac: float = 0.6,
    test_frac: float = 0.8,
) -> Split:
    df = df.copy()
    df["observation_date"] = pd.to_datetime(df["observation_date"])
    df["next_observation_date"] = pd.to_datetime(df["next_observation_date"])
    if val_start is None or test_start is None:
        dv, dt = default_boundaries(df, val_frac, test_frac)
        val_start = val_start or dv
        test_start = test_start or dt
    vs, ts = pd.Timestamp(val_start), pd.Timestamp(test_start)
    if not vs < ts:
        raise ValueError("val_start must be before test_start")

    holdout = sorted(map(str, holdout_locations)) if holdout_locations else choose_holdout(df["location_id"].tolist(), frac=holdout_location_frac, seed=seed)
    in_holdout = df["location_id"].astype(str).isin(holdout)
    train = df[(df["observation_date"] < vs) & (df["next_observation_date"] < vs) & ~in_holdout]
    val = df[(df["observation_date"] >= vs) & (df["observation_date"] < ts) & (df["next_observation_date"] < ts) & ~in_holdout]
    test = df[(df["observation_date"] >= ts) & ~in_holdout]
    spatial = df[(df["observation_date"] >= ts) & in_holdout]
    return Split(train=train, val=val, test=test, val_start=vs, test_start=ts, holdout_locations=holdout, spatial_test=spatial)


def main() -> None:
    ap = argparse.ArgumentParser(description="Show a temporal split summary for a processed dataset.")
    ap.add_argument("--data", required=True)
    ap.add_argument("--val-start")
    ap.add_argument("--test-start")
    ap.add_argument("--holdout-location-frac", type=float, default=0.0)
    a = ap.parse_args()
    df = pd.read_parquet(a.data) if a.data.endswith(".parquet") else pd.read_csv(a.data)
    df = df[df["label"].notna()]
    import json

    print(json.dumps(temporal_split(df, a.val_start, a.test_start, a.holdout_location_frac).describe(), indent=2))


if __name__ == "__main__":
    main()
