"""Evaluation metrics and the model safety gate.

The gate decides whether a trained artifact may be marked ``validated``. It is
deliberately conservative: a model that does not clearly beat trivial and
heuristic baselines on a temporally held-out test set is not activated.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

GATE = {
    "min_test_rows": 200,
    "min_test_positives": 30,
    "min_pr_auc_lift_over_prevalence": 1.2,
    "must_beat_heuristic_pr_auc": True,
    "must_beat_prevalence_brier": True,
}


def precision_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float | None:
    if k <= 0 or len(y_true) == 0:
        return None
    k = min(k, len(y_true))
    idx = np.argsort(-y_score, kind="stable")[:k]
    return float(np.mean(y_true[idx]))


def compute_metrics(y_true, y_score, threshold: float = 0.5, k_values: tuple[int, ...] = (10, 25, 50)) -> dict[str, Any]:
    y_true = np.asarray(y_true).astype(int)
    y_score = np.asarray(y_score, dtype=float)
    y_pred = (y_score >= threshold).astype(int)
    both = len(np.unique(y_true)) == 2
    is_prob = bool(np.all((y_score >= 0) & (y_score <= 1)))
    out: dict[str, Any] = {
        "n": int(len(y_true)),
        "positives": int(y_true.sum()),
        "prevalence": float(y_true.mean()) if len(y_true) else None,
        "threshold": threshold,
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "pr_auc": float(average_precision_score(y_true, y_score)) if both else None,
        "roc_auc": float(roc_auc_score(y_true, y_score)) if both else None,
        "brier": float(brier_score_loss(y_true, y_score)) if is_prob and len(y_true) else None,
    }
    for k in k_values:
        out[f"precision_at_{k}"] = precision_at_k(y_true, y_score, k)
    return out


def evaluate_gate(model_test: dict[str, Any], heuristic_test: dict[str, Any] | None) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    ok = True
    n, pos, prev = model_test["n"], model_test["positives"], model_test["prevalence"] or 0.0
    if n < GATE["min_test_rows"]:
        ok = False
        reasons.append(f"Test set has {n} rows (< {GATE['min_test_rows']}).")
    if pos < GATE["min_test_positives"]:
        ok = False
        reasons.append(f"Test set has {pos} positive labels (< {GATE['min_test_positives']}).")
    pr = model_test.get("pr_auc")
    if pr is None:
        ok = False
        reasons.append("PR-AUC undefined on test set (single class).")
    else:
        if pr < prev * GATE["min_pr_auc_lift_over_prevalence"]:
            ok = False
            reasons.append(f"PR-AUC {pr:.3f} does not exceed {GATE['min_pr_auc_lift_over_prevalence']}x prevalence ({prev:.3f}).")
        if GATE["must_beat_heuristic_pr_auc"] and heuristic_test and heuristic_test.get("pr_auc") is not None and pr <= heuristic_test["pr_auc"]:
            ok = False
            reasons.append(f"PR-AUC {pr:.3f} does not beat the heuristic baseline ({heuristic_test['pr_auc']:.3f}).")
    brier = model_test.get("brier")
    if GATE["must_beat_prevalence_brier"] and brier is not None and brier >= prev * (1 - prev):
        ok = False
        reasons.append(f"Brier score {brier:.3f} does not beat the prevalence-only forecast ({prev * (1 - prev):.3f}).")
    if ok:
        reasons.append("All gate criteria met on the temporally held-out test set.")
    return ok, reasons
