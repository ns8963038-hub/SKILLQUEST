import json

import pytest

from app.risk import FEATURE_ORDER, MODEL_PATH, load_model, score, tier_from_probability

# A disengaged student and an engaged one, as the app would compute them.
IDLE = {
    "active_days_in_window": 0,
    "mean_session_gap_days": 28,
    "days_since_last_activity": 25,
    "completion_ratio": 0.0,
    "avg_score": 0.0,
    "activity_trend": 0,
    "current_streak": 0,
}
ENGAGED = {
    "active_days_in_window": 20,
    "mean_session_gap_days": 1.2,
    "days_since_last_activity": 0,
    "completion_ratio": 0.9,
    "avg_score": 0.85,
    "activity_trend": 4,
    "current_streak": 6,
}


def test_tiers_map_from_probability():
    assert tier_from_probability(0.10) == "healthy"
    assert tier_from_probability(0.50) == "watch"
    assert tier_from_probability(0.90) == "atrisk"
    # Custom thresholds (as the trained model supplies).
    assert tier_from_probability(0.5, watch=0.4, atrisk=0.6) == "watch"


def test_deployed_model_matches_the_feature_contract():
    model = load_model()
    assert model is not None, "risk_model.json should be committed (run ml/run_experiment.py)"
    assert model["features"] == FEATURE_ORDER
    assert len(model["coef"]) == len(model["mean"]) == len(model["scale"]) == len(FEATURE_ORDER)
    assert model["thresholds"]["watch"] <= model["thresholds"]["atrisk"]


def test_trained_model_ranks_an_idle_student_above_an_engaged_one():
    idle, engaged = score(IDLE), score(ENGAGED)
    assert idle["probability"] > engaged["probability"]
    assert engaged["tier"] == "healthy"
    assert idle["modelVersion"] == load_model()["modelVersion"]


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
    r = score({**IDLE, "active_days_in_window": 10}, model=toy)
    assert r["probability"] == pytest.approx(0.5)
    assert r["tier"] == "watch"


def test_baseline_used_when_no_model(monkeypatch):
    load_model.cache_clear()
    monkeypatch.setattr("app.risk.MODEL_PATH", MODEL_PATH.with_name("missing.json"))
    try:
        r = score({"days_since_last_activity": 21})
        assert r["probability"] == 1.0 and r["tier"] == "atrisk"
        assert r["modelVersion"].startswith("baseline")
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
