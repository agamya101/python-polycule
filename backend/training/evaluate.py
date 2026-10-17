"""Evaluate an installed artifact on a processed dataset (optionally a date window).

Usage:
    python training/evaluate.py --data data/processed/train.csv --artifact-dir model_artifacts --start 2025-01-01
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ml.model_registry import METADATA_FILE, MODEL_FILE, file_sha256  # noqa: E402
from app.ml.validation import compute_metrics  # noqa: E402
from training.build_features import build_xy  # noqa: E402
from training.train import heuristic_scores  # noqa: E402


def evaluate(df: pd.DataFrame, artifact_dir: Path, start: str | None = None, end: str | None = None) -> dict:
    meta = json.loads((artifact_dir / METADATA_FILE).read_text(encoding="utf-8"))
    model_path = artifact_dir / MODEL_FILE
    if file_sha256(model_path) != meta["model_sha256"]:
        raise SystemExit("Model checksum mismatch; refusing to evaluate.")
    df = df.copy()
    df["observation_date"] = pd.to_datetime(df["observation_date"])
    if start:
        df = df[df["observation_date"] >= pd.Timestamp(start)]
    if end:
        df = df[df["observation_date"] <= pd.Timestamp(end)]
    X, y, _ = build_xy(df, meta["features"])
    model = joblib.load(model_path)
    p = model.predict_proba(X)[:, 1]
    return {
        "model_version": meta["model_version"],
        "validated": meta["validated"],
        "rows": int(len(df)),
        "model": compute_metrics(y, p, threshold=meta.get("decision_threshold", 0.5)),
        "heuristic_baseline": compute_metrics(y, heuristic_scores(X)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--artifact-dir", default=str(Path(__file__).resolve().parent.parent / "model_artifacts"))
    ap.add_argument("--start")
    ap.add_argument("--end")
    a = ap.parse_args()
    df = pd.read_parquet(a.data) if a.data.endswith(".parquet") else pd.read_csv(a.data)
    print(json.dumps(evaluate(df, Path(a.artifact_dir), a.start, a.end), indent=2, default=str))


if __name__ == "__main__":
    main()
