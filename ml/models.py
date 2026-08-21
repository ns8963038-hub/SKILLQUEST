"""The models, in the order the protocol demands: baselines FIRST, then the RF.

The Random Forest has to *beat* these baselines to justify its existence. If it
doesn't beat the days-since-activity rule, that comparison is the finding we
report (TRD 6.3.4) — an honest "+N points over a one-line rule" is stronger than
an unexplained high accuracy.

All models expose `.fit(X, y)` and `.predict(X)`. The two custom baselines also
expose `.score_pos(X)` (a positive-class score for ranking metrics); the sklearn
models provide `.predict_proba`. evaluate.py handles both.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import RANDOM_SEED


class MajorityBaseline:
    """Always predicts the training-majority class. The floor: shows why
    accuracy alone is meaningless on imbalanced data."""

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "MajorityBaseline":
        self.pos_rate_ = float(np.mean(y))
        self.majority_ = int(round(self.pos_rate_))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.full(len(X), self.majority_, dtype=int)

    def score_pos(self, X: pd.DataFrame) -> np.ndarray:
        return np.full(len(X), self.pos_rate_, dtype=float)


class DaysSinceActivityBaseline:
    """Predicts withdrawal when days_since_last_activity >= threshold.

    The threshold is chosen on the TRAIN set to maximise F1. This is the
    baseline that matters — a single-rule disengagement detector that any
    sensible system should be measured against.
    """

    def __init__(self, feature: str = "days_since_last_activity") -> None:
        self.feature = feature

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "DaysSinceActivityBaseline":
        best_t, best_f1 = float(X[self.feature].min()), -1.0
        for t in np.sort(X[self.feature].unique()):
            pred = (X[self.feature] >= t).astype(int)
            f1 = f1_score(y, pred, zero_division=0)
            if f1 > best_f1:
                best_f1, best_t = f1, float(t)
        self.threshold_ = best_t
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return (X[self.feature] >= self.threshold_).astype(int).to_numpy()

    def score_pos(self, X: pd.DataFrame) -> np.ndarray:
        # Raw staleness works as a ranking score for PR/ROC curves.
        return X[self.feature].to_numpy(dtype=float)


def make_logistic_regression():
    # Scale features first; balance classes because positives are rare.
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000, class_weight="balanced"),
    )


def make_random_forest():
    return RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
