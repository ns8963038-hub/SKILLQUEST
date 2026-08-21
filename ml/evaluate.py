"""Metrics for imbalanced disengagement prediction (TRD 6.3.5).

PR-AUC (average precision) is primary because positives are rare — ROC-AUC looks
optimistic under imbalance. We always report the positive-class rate alongside,
so no number can be read out of context.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)


def _pos_scores(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        return model.predict_proba(X)[:, 1]
    if hasattr(model, "score_pos"):
        return model.score_pos(X)
    return model.predict(X).astype(float)


def evaluate_model(name: str, model, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    """Return one row of metrics for a fitted model on the test set."""
    y_pred = model.predict(X_test)
    scores = _pos_scores(model, X_test)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="binary", zero_division=0
    )
    # Ranking metrics need both classes present in y_test; guard for tiny sets.
    try:
        pr_auc = float(average_precision_score(y_test, scores))
    except ValueError:
        pr_auc = float("nan")
    try:
        roc_auc = float(roc_auc_score(y_test, scores))
    except ValueError:
        roc_auc = float("nan")
    return {
        "model": name,
        "pr_auc": pr_auc,
        "roc_auc": roc_auc,
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "confusion": confusion_matrix(y_test, y_pred).tolist(),
    }


def comparison_table(results: list[dict]) -> pd.DataFrame:
    """Tidy side-by-side of every model, most-informative columns first."""
    df = pd.DataFrame(results)
    return df[["model", "pr_auc", "roc_auc", "precision", "recall", "f1"]].round(4)


def positive_rate(y: pd.Series) -> float:
    """The base rate of withdrawal — the context every metric is read against."""
    return float(np.mean(y))
