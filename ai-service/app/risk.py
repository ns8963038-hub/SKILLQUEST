"""Disengagement-risk scoring (TRD 6.3).

WHAT RUNS LIVE: the days-since-activity rule.
    A student who hasn't practised for 7+ days is on "watch"; 14+ days is
    "at risk" (and gets a nudge). The score reported with it is the absence as a
    fraction of the 21-day prediction horizon, clamped to [0, 1].

WHY NOT THE LOGISTIC REGRESSION. It was trained on OULAD with the same seven
features the app computes (feature set fs-v2), exported as `risk_model.json`
(feature means and scales, weights, intercept, tier thresholds), and evaluated
against this very rule (ml/results/risk-model-fs-v2.md). Its PR-AUC edge over
the rule was +0.0038 with a 95% bootstrap interval of [-0.0008, +0.0092]: the
interval includes zero, so it is not a real improvement. It also misranks
students unlike its training data (every OULAD row is taken at day 100 of a
course): a brand-new student looks like a withdrawn one and scores "at risk",
while a student gone for two weeks with good old scores looks "healthy".
Deploying the model that did not win would be the wrong call, so the rule is
live and the regression stays as the report's experiment. It can still be run
with RISK_SCORER=lr for comparison.

Framed as a transparent disengagement indicator, never a validated dropout
predictor (TRD 6.3).
"""

from __future__ import annotations

import json
import math
import os
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

# The live rule, stated in days so it can be explained in one sentence.
WATCH_DAYS = 7
ATRISK_DAYS = 14
HORIZON_DAYS = 21  # the prediction horizon the score is expressed against
RULE_VERSION = "rule-days-since-v1"
RULE_THRESHOLDS = "thr-rule-7d-14d"
# The app's feature row: activity now means level submissions and lesson
# answers only, and scores are computed inside the 28-day window.
FEATURE_SET = "fs-v3"


def tier_from_probability(p: float, watch: float, atrisk: float) -> str:
    """Map a model score to a tier using the model's thresholds."""
    if p >= atrisk:
        return "atrisk"
    if p >= watch:
        return "watch"
    return "healthy"


def tier_from_days(days: float) -> str:
    """The live rule: 14+ days away is at risk, 7+ days is watch."""
    if days >= ATRISK_DAYS:
        return "atrisk"
    if days >= WATCH_DAYS:
        return "watch"
    return "healthy"


@lru_cache(maxsize=1)
def load_model() -> dict | None:
    """Read the exported regression once (for the RISK_SCORER=lr experiment)."""
    if not MODEL_PATH.exists():
        return None
    model = json.loads(MODEL_PATH.read_text())
    # Refuse a model trained on a different feature list — silently scoring the
    # wrong columns would be worse than not scoring with it at all.
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


def score_rule(features: dict) -> dict:
    """The live scorer: how long since the student last practised."""
    days = max(0.0, float(features.get("days_since_last_activity", 0.0)))
    return {
        "probability": min(1.0, days / HORIZON_DAYS),
        "tier": tier_from_days(days),
        "modelVersion": RULE_VERSION,
        "featureSetVersion": FEATURE_SET,
        "thresholdVersion": RULE_THRESHOLDS,
    }


def score_model(features: dict, model: dict) -> dict:
    """The regression (experiment only): score one feature row with the exported model."""
    probability = _logistic(model, features)
    t = model["thresholds"]
    return {
        "probability": probability,
        "tier": tier_from_probability(probability, t["watch"], t["atrisk"]),
        "modelVersion": model["modelVersion"],
        "featureSetVersion": model["featureSetVersion"],
        "thresholdVersion": model["thresholdVersion"],
    }


def score(features: dict, scorer: str | None = None) -> dict:
    """Score one feature row with the live scorer (the rule), or the regression
    when RISK_SCORER=lr is set for an experiment."""
    chosen = (scorer or os.environ.get("RISK_SCORER", "rule")).lower()
    if chosen == "lr":
        model = load_model()
        if model is not None and model.get("type") == "logistic_regression":
            return score_model(features, model)
    return score_rule(features)
