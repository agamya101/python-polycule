"""Inference for the experimental next-observation deterioration model.

Returns a model-estimated deterioration probability only when a validated,
enabled artifact exists. Never fabricates a probability.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml.features import REQUIRED_AT_INFERENCE
from app.ml.model_registry import load_model, model_status
from app.schemas.risk import PredictionBlock


def predict(features: dict[str, Any], directory: Path | None = None, enabled: bool | None = None) -> PredictionBlock:
    status = model_status(directory, enabled)
    if not status["available"]:
        return PredictionBlock(status="MODEL_NOT_AVAILABLE", reason=status["reason"])
    if not status["validated"]:
        return PredictionBlock(status="MODEL_NOT_VALIDATED", model_version=status["model_version"], reason=status["reason"])
    if not status["enabled"]:
        return PredictionBlock(status="MODEL_DISABLED", model_version=status["model_version"], reason=status["reason"])

    missing = [f for f in REQUIRED_AT_INFERENCE if features.get(f) is None]
    if missing:
        return PredictionBlock(status="INSUFFICIENT_FEATURES", model_version=status["model_version"], reason=f"Missing required features: {', '.join(missing)}.")

    loaded = load_model(directory, enabled)
    if loaded is None:  # pragma: no cover - guarded by status above
        return PredictionBlock(status="MODEL_NOT_AVAILABLE", reason="Model could not be loaded.")
    model, meta = loaded
    cols = meta["features"]
    row = pd.DataFrame([[features.get(c, np.nan) if features.get(c) is not None else np.nan for c in cols]], columns=cols, dtype=float)
    prob = float(model.predict_proba(row)[0, 1])
    importances = meta.get("global_feature_importance", [])[:5]
    return PredictionBlock(
        status="AVAILABLE",
        probability=round(prob, 4),
        model_version=meta["model_version"],
        important_features=importances,
        reason="Model-estimated deterioration probability for the next valid observation. "
        "important_features are global importances from training, not a per-case explanation.",
    )
