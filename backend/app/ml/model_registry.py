"""Model artifact registry.

An artifact is usable only when:

1. ``model_artifacts/model.joblib`` and ``model_artifacts/model_metadata.json`` exist,
2. the metadata contains all required fields and ``validated: true``,
3. the model file's SHA-256 matches the metadata, and
4. ``MODEL_ENABLED=true``.

Otherwise the API reports why and never returns a probability.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from app.config import get_settings

MODEL_FILE = "model.joblib"
METADATA_FILE = "model_metadata.json"
REQUIRED_METADATA = [
    "model_name",
    "model_version",
    "task",
    "trained_at",
    "features",
    "training_period",
    "test_period",
    "metrics",
    "label_definition",
    "limitations",
    "validated",
    "model_sha256",
]


def artifact_dir() -> Path:
    return get_settings().model_artifact_dir


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_metadata(directory: Path | None = None) -> dict[str, Any] | None:
    p = (directory or artifact_dir()) / METADATA_FILE
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return None


def model_status(directory: Path | None = None, enabled: bool | None = None) -> dict[str, Any]:
    """Artifact status. ``enabled`` overrides MODEL_ENABLED (used for pilot-local activation)."""
    d = directory or artifact_dir()
    enabled = get_settings().model_enabled if enabled is None else enabled
    meta = read_metadata(d)
    model_path = d / MODEL_FILE
    base = {"available": False, "enabled": enabled, "validated": False, "model_version": None, "task": "next_observation_deterioration"}

    if meta is None or not model_path.exists():
        return base | {"reason": "No validated model artifact has been installed."}
    missing = [k for k in REQUIRED_METADATA if k not in meta]
    if missing:
        return base | {"reason": f"Model metadata is incomplete (missing: {', '.join(missing)})."}
    if file_sha256(model_path) != meta["model_sha256"]:
        return base | {"reason": "Model file checksum does not match metadata; artifact rejected."}

    info = base | {
        "available": True,
        "validated": bool(meta["validated"]),
        "model_version": meta["model_version"],
        "model_name": meta["model_name"],
        "trained_at": meta["trained_at"],
        "training_period": meta["training_period"],
        "test_period": meta["test_period"],
        "features": meta["features"],
        "metrics": meta["metrics"],
        "label_definition": meta["label_definition"],
        "limitations": meta["limitations"],
        "gate": meta.get("gate"),
    }
    for key in ("validation_period", "spatial_holdout", "monitoring_cells", "pilot_region", "data_sources", "scope_statement",
                "feature_importance_method", "global_feature_importance", "decision_threshold"):
        if key in meta:
            info[key] = meta[key]
    if not meta["validated"]:
        info["reason"] = "Model artifact exists but did not pass the validation gate."
    elif not enabled:
        info["reason"] = "Validated model installed but disabled (MODEL_ENABLED=false)."
    else:
        info["reason"] = "Validated model installed and enabled."
    return info


@lru_cache(maxsize=4)
def _load(path: str, sha: str) -> Any:
    return joblib.load(path)


def load_model(directory: Path | None = None, enabled: bool | None = None) -> tuple[Any, dict[str, Any]] | None:
    """Return (model, metadata) only when the artifact is available, validated and enabled."""
    status = model_status(directory, enabled)
    if not (status["available"] and status["validated"] and status["enabled"]):
        return None
    d = directory or artifact_dir()
    meta = read_metadata(d)
    assert meta is not None
    return _load(str(d / MODEL_FILE), meta["model_sha256"]), meta
