"""ML pipeline tests.

Uses a SYNTHETIC dataset generated inside the test purely to exercise the code
paths (leakage guards, split purging, gate, registry). Nothing here is shipped
as a model and no metric from it is reported anywhere.
"""

import json

import numpy as np
import pandas as pd
import pytest

from app.config import get_settings
from app.ml.features import assert_no_leakage
from app.ml.inference import predict
from app.ml.model_registry import METADATA_FILE, model_status
from app.ml.validation import compute_metrics, precision_at_k
from training.prepare_dataset import prepare
from training.temporal_split import temporal_split
from training.train import train


def synthetic_raw(n_loc=40, n_obs=70, seed=1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for loc in range(n_loc):
        ndvi = 0.6
        start = pd.Timestamp("2023-01-01") + pd.Timedelta(days=int(rng.integers(0, 5)))
        for i in range(n_obs):
            wb = rng.normal(-20, 30)
            rows.append({"location_id": f"SYN_{loc:03d}", "observation_date": start + pd.Timedelta(days=12 * i), "ndvi": round(ndvi, 4),
                         "ndmi": round(ndvi / 2, 4), "baseline_ndvi": 0.6, "valid_pixel_pct": 90.0, "water_balance_14d": wb,
                         "rainfall_14d": max(0, wb + 60), "temperature_max_7d": rng.normal(34, 3)})
            # Next value depends on current water balance -> learnable signal.
            ndvi = float(np.clip(ndvi + (-0.12 if wb < -45 else rng.normal(0.01, 0.03)), 0.15, 0.9))
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def processed():
    out, report = prepare(synthetic_raw())
    out.attrs["label_definition"] = report["label_definition"]
    return out, report


def test_prepare_creates_future_label_without_leaking_into_features(processed):
    out, report = processed
    assert "EXPERIMENTAL" in report["label_definition"]
    assert (pd.to_datetime(out["next_observation_date"]) > pd.to_datetime(out["observation_date"])).all()
    with pytest.raises(ValueError):
        assert_no_leakage(["ndvi_current", "next_ndvi"])


def test_features_unchanged_when_future_changes():
    raw = synthetic_raw(n_loc=2, n_obs=10)
    a, _ = prepare(raw)
    raw2 = raw.copy()
    last = raw2.groupby("location_id")["observation_date"].transform("max") == raw2["observation_date"]
    raw2.loc[last, "ndvi"] = 0.01  # change only the future
    b, _ = prepare(raw2)
    cols = ["ndvi_current", "ndvi_trend", "ndvi_delta_prev", "days_since_prev_obs"]
    common = a.merge(b, on=["location_id", "observation_date"], suffixes=("_a", "_b"))
    # Every row except the one whose label looks at the changed observation keeps identical features.
    for c in cols:
        pd.testing.assert_series_equal(common[f"{c}_a"], common[f"{c}_b"], check_names=False)


def test_temporal_split_purges_cross_boundary_labels(processed):
    out, _ = processed
    s = temporal_split(out)
    assert (s.train["next_observation_date"] < s.val_start).all()
    assert (s.val["next_observation_date"] < s.test_start).all()
    assert s.train["observation_date"].max() < s.val["observation_date"].min()


def test_metrics_and_precision_at_k():
    y = np.array([1, 0, 1, 0, 0])
    p = np.array([0.9, 0.8, 0.7, 0.2, 0.1])
    assert precision_at_k(y, p, 2) == 0.5
    m = compute_metrics(y, p)
    for k in ("precision", "recall", "f1", "pr_auc", "roc_auc", "brier", "precision_at_10"):
        assert k in m


def test_training_registry_and_gate(processed, tmp_path, monkeypatch):
    out, _ = processed
    report = train(out, tmp_path, allow_unvalidated=True, model_version="synthetic-test")
    assert set(report["validation"]) == {"heuristic_baseline", "logistic_regression", "random_forest", "hist_gradient_boosting"}
    meta = json.loads((tmp_path / METADATA_FILE).read_text())
    for key in ("model_name", "trained_at", "features", "training_period", "test_period", "metrics", "label_definition", "limitations", "model_version"):
        assert key in meta
    status = model_status(tmp_path)
    assert status["available"] is True and status["enabled"] is False

    feats = {c: 0.5 for c in meta["features"]}
    blocked = predict(feats, tmp_path)
    assert blocked.probability is None
    assert blocked.status == ("MODEL_DISABLED" if meta["validated"] else "MODEL_NOT_VALIDATED")

    if meta["validated"]:
        monkeypatch.setattr(get_settings(), "model_enabled", True)
        ok = predict(feats, tmp_path)
        assert ok.status == "AVAILABLE" and 0.0 <= ok.probability <= 1.0
        assert "deterioration probability" in ok.reason


def test_unvalidated_artifact_never_predicts(processed, tmp_path, monkeypatch):
    out, _ = processed
    train(out, tmp_path, allow_unvalidated=True)
    meta_path = tmp_path / METADATA_FILE
    meta = json.loads(meta_path.read_text())
    meta["validated"] = False
    meta_path.write_text(json.dumps(meta))
    monkeypatch.setattr(get_settings(), "model_enabled", True)
    r = predict({c: 0.5 for c in meta["features"]}, tmp_path)
    assert r.status == "MODEL_NOT_VALIDATED" and r.probability is None


def test_tampered_artifact_rejected(processed, tmp_path):
    out, _ = processed
    train(out, tmp_path, allow_unvalidated=True)
    meta_path = tmp_path / METADATA_FILE
    meta = json.loads(meta_path.read_text())
    meta["model_sha256"] = "0" * 64
    meta_path.write_text(json.dumps(meta))
    assert model_status(tmp_path)["available"] is False
    assert predict({"ndvi_current": 0.5}, tmp_path).status == "MODEL_NOT_AVAILABLE"
