import json

import pytest

from app.risk import (
    ATRISK_DAYS,
    FEATURE_SET,
    FEATURE_ORDER,
    MODEL_PATH,
    WATCH_DAYS,
    load_model,
    score,
    score_model,
    tier_from_days,
    tier_from_probability,
)


def row(days_since: float, **rest) -> dict:
    """A feature row that differs only where a test says so."""
    base = {
        "active_days_in_window": 0,
        "mean_session_gap_days": 28,
        "days_since_last_activity": days_since,
        "completion_ratio": 0.0,
        "avg_score": 0.0,
        "activity_trend": 0,
        "current_streak": 0,
    }
    return {**base, **rest}


# ---- The live rule ------------------------------------------------------------


def test_the_live_scorer_is_the_rule_by_default(monkeypatch):
    monkeypatch.delenv("RISK_SCORER", raising=False)
    r = score(row(3))
    assert r["modelVersion"] == "rule-days-since-v1"
    assert r["thresholdVersion"] == "thr-rule-7d-14d"


def test_tiers_are_one_week_watch_and_two_weeks_at_risk():
    assert tier_from_days(0) == "healthy"
    assert tier_from_days(WATCH_DAYS - 1) == "healthy"
    assert tier_from_days(WATCH_DAYS) == "watch"
    assert tier_from_days(ATRISK_DAYS - 1) == "watch"
    assert tier_from_days(ATRISK_DAYS) == "atrisk"


def test_longer_absence_always_means_higher_risk():
    # The sanity checks the regression failed: absence must raise risk, and good
    # old scores must not hide a student who has gone quiet.
    active_today = score(row(0, avg_score=0.3, completion_ratio=0.3))
    gone_two_weeks = score(row(14, avg_score=0.95, completion_ratio=1.0))
    gone_sixty_days = score(row(60, avg_score=0.95, completion_ratio=1.0))
    assert gone_two_weeks["probability"] > active_today["probability"]
    assert gone_sixty_days["probability"] >= gone_two_weeks["probability"]
    assert gone_two_weeks["tier"] == "atrisk" and gone_sixty_days["tier"] == "atrisk"
    assert active_today["tier"] == "healthy"


def test_score_is_the_absence_over_the_21_day_horizon_clamped():
    assert score(row(0))["probability"] == 0.0
    assert score(row(10.5))["probability"] == pytest.approx(0.5)
    assert score(row(90))["probability"] == 1.0
    assert score(row(-3))["probability"] == 0.0  # a bad input never goes negative


# ---- The regression, kept as the report's experiment --------------------------


def test_the_regression_runs_only_when_asked_for(monkeypatch):
    monkeypatch.setenv("RISK_SCORER", "lr")
    assert score(row(25))["modelVersion"] == load_model()["modelVersion"]
    # Labelled with the feature set the app computed, not the one the model was trained on.
    assert score(row(25))["featureSetVersion"] == FEATURE_SET
    monkeypatch.setenv("RISK_SCORER", "rule")
    assert score(row(25))["modelVersion"] == "rule-days-since-v1"


def test_the_exported_model_still_matches_the_feature_contract():
    model = load_model()
    assert model is not None, "risk_model.json should stay committed (the report's experiment)"
    assert model["features"] == FEATURE_ORDER
    assert len(model["coef"]) == len(model["mean"]) == len(model["scale"]) == len(FEATURE_ORDER)
    assert model["thresholds"]["watch"] <= model["thresholds"]["atrisk"]


def test_logistic_scoring_is_the_standardised_dot_product():
    # A hand-checkable toy model: one weight on the first feature, the rest zero.
    toy = {
        "type": "logistic_regression",
        "features": FEATURE_ORDER,
        "mean": [10.0] + [0.0] * 6,
        "scale": [2.0] + [1.0] * 6,
        "coef": [1.0] + [0.0] * 6,
        "intercept": 0.0,
        "thresholds": {"watch": 0.4, "atrisk": 0.6},
        "modelVersion": "toy",
        "featureSetVersion": "fs-v2",
        "thresholdVersion": "t",
    }
    # x = 10 -> standardised 0 -> sigmoid(0) = 0.5 -> "watch".
    r = score_model(row(0, active_days_in_window=10), toy)
    assert r["probability"] == pytest.approx(0.5)
    assert r["tier"] == "watch"
    assert tier_from_probability(0.7, watch=0.4, atrisk=0.6) == "atrisk"


def test_falls_back_to_the_rule_if_the_regression_file_is_missing(monkeypatch):
    load_model.cache_clear()
    monkeypatch.setattr("app.risk.MODEL_PATH", MODEL_PATH.with_name("missing.json"))
    monkeypatch.setenv("RISK_SCORER", "lr")
    try:
        assert score(row(21))["modelVersion"] == "rule-days-since-v1"
    finally:
        load_model.cache_clear()


def test_refuses_a_model_trained_on_other_features(tmp_path, monkeypatch):
    bad = tmp_path / "risk_model.json"
    bad.write_text(json.dumps({"type": "logistic_regression", "features": ["total_clicks"]}))
    load_model.cache_clear()
    monkeypatch.setattr("app.risk.MODEL_PATH", bad)
    try:
        with pytest.raises(ValueError):
            load_model()
    finally:
        load_model.cache_clear()
