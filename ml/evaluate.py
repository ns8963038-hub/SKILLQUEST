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


def bootstrap_pr_auc_diff(
    y: np.ndarray, scores_a: np.ndarray, scores_b: np.ndarray, n_boot: int = 1000, seed: int = 42
) -> tuple[float, float, float]:
    """PR-AUC(a) - PR-AUC(b) on the same test rows, with a 95% bootstrap interval.

    Resamples test rows with replacement (keeping both models' scores paired),
    so the interval answers: "is a's edge over b bigger than test-set noise?"
    If the interval contains 0, the honest reading is "no clear difference".
    """
    rng = np.random.default_rng(seed)
    y = np.asarray(y)
    diffs = []
    for _ in range(n_boot):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].sum() == 0:  # a resample with no positives has no PR curve
            continue
        diffs.append(
            average_precision_score(y[idx], scores_a[idx]) - average_precision_score(y[idx], scores_b[idx])
        )
    point = float(average_precision_score(y, scores_a) - average_precision_score(y, scores_b))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return point, float(lo), float(hi)


def tier_report(y: np.ndarray, scores: np.ndarray, watch: float, atrisk: float) -> pd.DataFrame:
    """How the deployed tiers behave on held-out data: size, withdrawal rate in
    each tier, and the lift of that rate over the overall base rate."""
    y = np.asarray(y)
    base = float(np.mean(y))
    tiers = np.where(scores >= atrisk, "atrisk", np.where(scores >= watch, "watch", "healthy"))
    rows = []
    for t in ["healthy", "watch", "atrisk"]:
        mask = tiers == t
        n = int(mask.sum())
        rate = float(y[mask].mean()) if n else float("nan")
        rows.append({"tier": t, "n": n, "share": n / len(y), "withdrawal_rate": rate, "lift": rate / base if base else float("nan")})
    # Recall of each alert level: what share of all withdrawals it catches.
    flagged_atrisk = tiers == "atrisk"
    flagged_any = tiers != "healthy"
    df = pd.DataFrame(rows).round(4)
    df.attrs["recall_atrisk"] = float(y[flagged_atrisk].sum() / max(1, y.sum()))
    df.attrs["recall_watch_or_worse"] = float(y[flagged_any].sum() / max(1, y.sum()))
    return df


def lift_thresholds(scores: np.ndarray, y: np.ndarray, atrisk_lift: float = 2.0, watch_lift: float = 1.0) -> dict:
    """Tier thresholds chosen on TRAINING data only, from what the scores mean.

    Splits the scores into deciles and measures each decile's withdrawal rate.
    "At risk" starts at the lowest decile from which EVERY higher decile withdraws
    at >= atrisk_lift x the base rate; "watch" likewise at >= watch_lift x. So a
    tier boundary always marks a real jump in observed risk, not an arbitrary cut.
    """
    y = np.asarray(y)
    base = float(np.mean(y))
    edges = np.percentile(scores, np.arange(0, 101, 10))
    decile = np.clip(np.searchsorted(edges[1:-1], scores, side="right"), 0, 9)
    rates = np.array([y[decile == d].mean() if np.any(decile == d) else 0.0 for d in range(10)])

    def lowest_decile_all_above(lift: float) -> int:
        k = 10
        while k > 0 and rates[k - 1] >= lift * base:
            k -= 1
        return k  # 10 means "no decile qualifies"

    k_atrisk = min(lowest_decile_all_above(atrisk_lift), 9)  # always flag at least the top decile
    k_watch = min(lowest_decile_all_above(watch_lift), k_atrisk)
    return {
        "watch": float(edges[k_watch]),
        "atrisk": float(edges[k_atrisk]),
        "decileRates": [round(float(r), 4) for r in rates],
        "baseRate": round(base, 4),
        "rule": f"deciles of temporal-train scores: atrisk from decile {k_atrisk} (all higher deciles >= "
        f"{atrisk_lift:g}x base rate), watch from decile {k_watch} (>= {watch_lift:g}x)",
    }
