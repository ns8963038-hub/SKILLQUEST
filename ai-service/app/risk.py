"""Disengagement-risk scoring (TRD 6.3).

At runtime this loads the trained Random Forest (`risk_rf.joblib`) if it's
present. Until the team trains it on OULAD (ml/run_experiment.py), a transparent
**baseline** stands in — risk rises with days since last activity — so the whole
pipeline (features -> score -> tier -> stored prediction) is wired and testable
NOW. Swapping in the real model changes nothing downstream.

Framed as an experimental transfer-based risk indicator, never a validated
dropout predictor (TRD 6.3).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

# The feature columns, in the order the trained model expects them.
FEATURE_ORDER = [
    "active_days_in_window",
    "mean_session_gap_days",
    "days_since_last_activity",
    "completion_ratio",
    "avg_score",
    "activity_trend",
    "current_streak",
]

MODEL_PATH = Path(__file__).parent / "risk_rf.joblib"

# Probability thresholds -> tier (TRD 6.3.8).
WATCH_THRESHOLD = 0.35
ATRISK_THRESHOLD = 0.65


def tier_from_probability(p: float) -> str:
    if p >= ATRISK_THRESHOLD:
        return "atrisk"
    if p >= WATCH_THRESHOLD:
        return "watch"
    return "healthy"


@lru_cache(maxsize=1)
def _load_model():
    """Load the trained model once, if it exists. Returns None otherwise."""
    if MODEL_PATH.exists():
        import joblib

        return joblib.load(MODEL_PATH)
    return None


def score(features: dict) -> dict:
    """Score one feature row -> probability + tier + version metadata."""
    model = _load_model()
    if model is not None:
        import numpy as np

        row = np.array([[float(features.get(k, 0.0)) for k in FEATURE_ORDER]])
        probability = float(model.predict_proba(row)[0, 1])
        model_version = "rf-v1"
    else:
        # Baseline: the days-since-activity rule (the one the RF must beat).
        # Normalised over the 21-day horizon and clamped to [0, 1].
        days_since = float(features.get("days_since_last_activity", 0.0))
        probability = max(0.0, min(1.0, days_since / 21.0))
        model_version = "baseline-days-since-activity"

    return {
        "probability": probability,
        "tier": tier_from_probability(probability),
        "modelVersion": model_version,
        "featureSetVersion": "fs-v1",
        "thresholdVersion": "thr-v1",
    }
