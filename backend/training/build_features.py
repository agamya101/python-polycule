"""Select the model feature matrix from a processed dataset (shared contract with inference).

Usage (inspect feature availability):
    python training/build_features.py --data data/processed/train.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ml.features import CORE_FEATURES, OPTIONAL_FEATURES, assert_no_leakage  # noqa: E402

MIN_NON_NULL_FRACTION = 0.05


def feature_columns(df: pd.DataFrame) -> list[str]:
    """Contract features present with at least some data. Fully empty columns are dropped."""
    cols = [c for c in CORE_FEATURES + OPTIONAL_FEATURES if c in df.columns and df[c].notna().mean() >= MIN_NON_NULL_FRACTION]
    assert_no_leakage(cols)
    if "ndvi_current" not in cols:
        raise ValueError("ndvi_current is required as a feature.")
    return cols


def build_xy(df: pd.DataFrame, cols: list[str] | None = None) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    cols = cols or feature_columns(df)
    assert_no_leakage(cols)
    X = df.reindex(columns=cols).astype(float)
    y = df["label"].astype(int)
    return X, y, cols


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    df = pd.read_parquet(a.data) if a.data.endswith(".parquet") else pd.read_csv(a.data)
    cols = feature_columns(df)
    for c in CORE_FEATURES + OPTIONAL_FEATURES:
        frac = df[c].notna().mean() if c in df.columns else 0.0
        print(f"{c:22s} {'USED' if c in cols else 'unused':7s} non-null={frac:.0%}")


if __name__ == "__main__":
    main()
