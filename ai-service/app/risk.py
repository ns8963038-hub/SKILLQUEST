"""Disengagement-risk scoring (TRD 6.3).

The deployed model is `risk_model.json`, exported by ml/run_experiment.py: a
logistic regression trained on OULAD with the SAME seven features the app
computes (feature set fs-v2). It is stored as plain numbers — feature means and
scales, weights, intercept, and tier thresholds — so scoring is a dot product
and a sigmoid, with no scikit-learn in this service and nothing opaque to load.

If the file is missing, a transparent **baseline** stands in (risk rises with
days since last activity), so the pipeline always works and says which one ran.

Framed as an experimental transfer-based risk indicator, never a validated
dropout predictor (TRD 6.3). The score ranks students; it is not a calibrated
probability (the model was trained with balanced class weights).
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

# The feature columns, in the order the model expects them (the contract shared
# with backend/src/risk/features.ts and ml/dataset.py FEATURE_COLUMNS).
FEATURE_ORDER = [
    "active_days_in_window",
    "mean_session_gap_days",
    "days_since_last_activity",
    "completion_ratio",
    "avg_score",
    "activity_trend",
    "current_streak",
]

MODEL_PATH = Path(__file__).parent / "risk_model.json"

# Baseline tiers, used only when no trained model is present.
WATCH_THRESHOLD = 0.35
ATRISK_THRESHOLD = 0.65


def tier_from_probability(p: float, watch: float = WATCH_THRESHOLD, atrisk: float = ATRISK_THRESHOLD) -> str:
    """Map a risk score to a tier using the given thresholds."""
    if p >= atrisk:
        return "atrisk"
    if p >= watch:
        return "watch"
    return "healthy"


@lru_cache(maxsize=1)
def load_model() -> dict | None:
    """Read the exported model once. None if it isn't there (-> baseline)."""
    if not MODEL_PATH.exists():
        return None
    model = json.loads(MODEL_PATH.read_text())
    # Refuse a model trained on a different feature list — silently scoring the
    # wrong columns would be worse than falling back to the baseline.
    if model.get("features") != FEATURE_ORDER:
        raise ValueError(f"{MODEL_PATH.name} was trained on {model.get('features')}, expected {FEATURE_ORDER}")
    return model


def _logistic(model: dict, features: dict) -> float:
    """Standardise each feature with the TRAINING mean/scale, then sigmoid(w·x + b)."""
    z = model["intercept"]
    for name, mean, scale, weight in zip(FEATURE_ORDER, model["mean"], model["scale"], model["coef"]):
        x = float(features.get(name, 0.0))
        z += weight * (x - mean) / (scale or 1.0)
    return 1.0 / (1.0 + math.exp(-z))


def score(features: dict, model: dict | None = None) -> dict:
    """Score one feature row -> risk score + tier + version metadata."""
    model = model if model is not None else load_model()
    if model is not None and model.get("type") == "logistic_regression":
        probability = _logistic(model, features)
        t = model["thresholds"]
        return {
            "probability": probability,
            "tier": tier_from_probability(probability, t["watch"], t["atrisk"]),
            "modelVersion": model["modelVersion"],
            "featureSetVersion": model["featureSetVersion"],
            "thresholdVersion": model["thresholdVersion"],
        }

    # Baseline: the days-since-activity rule (the one the model must beat).
    # Normalised over the 21-day horizon and clamped to [0, 1].
    days_since = float(features.get("days_since_last_activity", 0.0))
    probability = max(0.0, min(1.0, days_since / 21.0))
    return {
        "probability": probability,
        "tier": tier_from_probability(probability),
        "modelVersion": "baseline-days-since-activity",
        "featureSetVersion": "fs-v2",
        "thresholdVersion": "thr-baseline",
    }
