"""Train and compare next-observation deterioration models.

Compares (1) a heuristic baseline, (2) logistic regression, (3) random forest
and (4) HistGradientBoosting on a temporal split. The model with the best
validation PR-AUC is refit on train+validation and evaluated once on the test
period. The artifact is marked ``validated`` only if it passes the safety gate
in ``app/ml/validation.py``; otherwise no artifact is installed unless
``--allow-unvalidated`` is given (and then inference still refuses to use it).

Usage:
    python training/train.py --data data/processed/train.csv --out model_artifacts
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ml.model_registry import METADATA_FILE, MODEL_FILE, file_sha256  # noqa: E402
from app.ml.validation import GATE, compute_metrics, evaluate_gate  # noqa: E402
from training.build_features import build_xy, feature_columns  # noqa: E402
from training.temporal_split import temporal_split  # noqa: E402

SCOPE_STATEMENT = ("This predicts next-observation vegetation deterioration relative to seasonal conditions. "
                   "It does not diagnose pests, diseases, nutrient deficiencies, or yield loss.")

LIMITATIONS = [
    "Experimental model for next-valid-observation vegetation deterioration; not a disease, pest or yield model.",
    "Label threshold is an experimental choice and has not been agronomically validated.",
    "Performance is only known for the locations, crops and seasons in the training data.",
    "Probabilities may be poorly calibrated outside the training distribution.",
]


def heuristic_scores(X: pd.DataFrame) -> np.ndarray:
    """Transparent baseline: vegetation stress from anomaly, falling back to negative trend."""
    anom = X["ndvi_anomaly_pct"] if "ndvi_anomaly_pct" in X else pd.Series(np.nan, index=X.index)
    trend = X["ndvi_trend"] if "ndvi_trend" in X else pd.Series(np.nan, index=X.index)
    s_anom = (-anom / 30).clip(0, 1)
    s_trend = (-trend / 0.05).clip(0, 1)
    return s_anom.fillna(s_trend).fillna(0.0).to_numpy()


def candidates(seed: int) -> dict:
    return {
        "logistic_regression": make_pipeline(SimpleImputer(strategy="median", add_indicator=True), StandardScaler(), LogisticRegression(max_iter=2000)),
        "random_forest": make_pipeline(SimpleImputer(strategy="median", add_indicator=True),
                                       RandomForestClassifier(n_estimators=300, min_samples_leaf=5, random_state=seed, n_jobs=-1)),
        "hist_gradient_boosting": HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, l2_regularization=1.0, random_state=seed),
    }


def best_threshold(y: np.ndarray, p: np.ndarray) -> float:
    grid = np.linspace(0.05, 0.95, 19)
    scores = [f1_score(y, (p >= t).astype(int), zero_division=0) for t in grid]
    return float(grid[int(np.argmax(scores))])


def prevalence_brier(y_true: pd.Series, p_constant: float) -> float:
    y = y_true.to_numpy(dtype=float)
    return float(np.mean((y - p_constant) ** 2)) if len(y) else float("nan")


def train(data: pd.DataFrame, out_dir: Path, *, val_start=None, test_start=None, holdout_location_frac=0.0,
          holdout_locations: list[str] | None = None, val_frac: float = 0.6, test_frac: float = 0.8,
          allow_unvalidated=False, model_version=None, seed=0, extra_metadata: dict | None = None,
          scope_statement: str | None = None) -> dict:
    data = data[data["label"].notna()].copy()
    data["label"] = data["label"].astype(int)
    split = temporal_split(data, val_start, test_start, holdout_location_frac, seed, holdout_locations=holdout_locations,
                           val_frac=val_frac, test_frac=test_frac)
    for name, part in (("train", split.train), ("val", split.val), ("test", split.test)):
        if part.empty or part["label"].nunique() < 2:
            raise SystemExit(f"{name} split is empty or single-class; more labelled history is required.")

    cols = feature_columns(split.train)
    Xtr, ytr, _ = build_xy(split.train, cols)
    Xva, yva, _ = build_xy(split.val, cols)
    Xte, yte, _ = build_xy(split.test, cols)
    has_spatial = not split.spatial_test.empty and split.spatial_test["label"].nunique() == 2
    if has_spatial:
        Xsp, ysp, _ = build_xy(split.spatial_test, cols)

    train_prev = float(ytr.mean())
    report: dict = {"split": split.describe(), "features": cols, "validation": {}, "test": {}, "spatial_holdout_test": {},
                    "test_all_candidates_informational": {}, "train_prevalence": train_prev}
    report["validation"]["heuristic_baseline"] = compute_metrics(yva, heuristic_scores(Xva))
    fitted = {}
    for name, model in candidates(seed).items():
        model.fit(Xtr, ytr)
        p = model.predict_proba(Xva)[:, 1]
        thr = best_threshold(yva.to_numpy(), p)
        report["validation"][name] = compute_metrics(yva, p, threshold=thr)
        fitted[name] = (model, thr)

    # Model selection uses validation only.
    best = max(fitted, key=lambda n: report["validation"][n]["pr_auc"] or -1)
    thr = fitted[best][1]

    # Global feature importance: permutation importance of the TRAIN-ONLY fitted
    # selected model on the validation set (data that model never saw).
    imp = permutation_importance(fitted[best][0], Xva, yva, scoring="average_precision", n_repeats=10, random_state=seed)
    importance = sorted(
        ({"feature": c, "importance": round(float(m), 5), "std": round(float(sd), 5)} for c, m, sd in zip(cols, imp.importances_mean, imp.importances_std)),
        key=lambda d: -d["importance"],
    )

    final = candidates(seed)[best]
    final.fit(pd.concat([Xtr, Xva]), pd.concat([ytr, yva]))

    def evaluate(X, y) -> dict:
        res = {"heuristic_baseline": compute_metrics(y, heuristic_scores(X), threshold=0.5),
               best: compute_metrics(y, final.predict_proba(X)[:, 1], threshold=thr)}
        res["reference"] = {
            "prevalence": float(y.mean()),
            "brier_prevalence_oracle": float(y.mean() * (1 - y.mean())),
            "brier_train_prevalence_forecast": prevalence_brier(y, train_prev),
        }
        return res

    report["test"] = evaluate(Xte, yte)
    for name, (m, t) in fitted.items():  # train-only fits, for transparency; NOT used for selection
        report["test_all_candidates_informational"][name] = compute_metrics(yte, m.predict_proba(Xte)[:, 1], threshold=t)
    if has_spatial:
        report["spatial_holdout_test"] = evaluate(Xsp, ysp)
    else:
        report["spatial_holdout_test"] = {"note": "Spatial holdout unavailable or single-class; not evaluated."}

    passed, gate_reasons = evaluate_gate(report["test"][best], report["test"]["heuristic_baseline"])
    report["selected_model"] = best
    report["decision_threshold"] = thr
    report["gate"] = {"passed": passed, "criteria": GATE, "reasons": gate_reasons, "evaluated_on": "temporal test"}
    report["global_feature_importance"] = importance
    report["feature_importance_method"] = ("Permutation importance (average precision) of the selected model fitted on the training "
                                           "period only, evaluated on the validation period. Associational, not causal.")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "training_report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    for stale in (out_dir / MODEL_FILE, out_dir / METADATA_FILE):
        if stale.exists():
            stale.unlink()  # never leave a previous artifact next to a new report
    if not passed and not allow_unvalidated:
        print("Model did NOT pass the validation gate; no artifact installed.")
        for r in gate_reasons:
            print(" -", r)
        return report

    joblib.dump(final, out_dir / MODEL_FILE)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    desc = split.describe()
    meta = {
        "model_name": best,
        "model_version": model_version or f"{best}-{now.strftime('%Y%m%d%H%M%S')}",
        "task": "next_observation_deterioration",
        "trained_at": now.isoformat(),
        "features": cols,
        "decision_threshold": thr,
        "training_period": desc["train"],
        "validation_period": desc["val"],
        "test_period": desc["test"],
        "spatial_holdout": {"locations": split.holdout_locations, "period": desc["spatial_test"],
                            "metrics": report["spatial_holdout_test"]},
        "metrics": {"temporal_test": report["test"], "validation": report["validation"]},
        "label_definition": data.attrs.get("label_definition") or "See dataset preparation report (experimental threshold).",
        "limitations": LIMITATIONS,
        "validated": bool(passed),
        "gate": report["gate"],
        "global_feature_importance": importance[:8],
        "feature_importance_method": report["feature_importance_method"],
        "scope_statement": scope_statement or SCOPE_STATEMENT,
        "model_sha256": file_sha256(out_dir / MODEL_FILE),
    }
    meta.update(extra_metadata or {})
    (out_dir / METADATA_FILE).write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")
    print(f"Installed {'VALIDATED' if passed else 'UNVALIDATED'} artifact {meta['model_version']} in {out_dir}")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "model_artifacts"))
    ap.add_argument("--val-start")
    ap.add_argument("--test-start")
    ap.add_argument("--holdout-location-frac", type=float, default=0.0)
    ap.add_argument("--label-definition", help="Override label definition text (defaults to the prepare report if found).")
    ap.add_argument("--allow-unvalidated", action="store_true", help="Write the artifact even if the gate fails (inference will still refuse it).")
    ap.add_argument("--model-version")
    a = ap.parse_args()

    df = pd.read_parquet(a.data) if a.data.endswith(".parquet") else pd.read_csv(a.data)
    rep = Path(a.data + ".report.json")
    if a.label_definition:
        df.attrs["label_definition"] = a.label_definition
    elif rep.exists():
        df.attrs["label_definition"] = json.loads(rep.read_text(encoding="utf-8")).get("label_definition")
    report = train(df, Path(a.out), val_start=a.val_start, test_start=a.test_start, holdout_location_frac=a.holdout_location_frac,
                   allow_unvalidated=a.allow_unvalidated, model_version=a.model_version)
    print(json.dumps({"selected": report["selected_model"], "gate": report["gate"], "test": report["test"]}, indent=2, default=str))


if __name__ == "__main__":
    main()
