from app.risk import score, tier_from_probability


def test_tiers_map_from_probability():
    assert tier_from_probability(0.10) == "healthy"
    assert tier_from_probability(0.50) == "watch"
    assert tier_from_probability(0.90) == "atrisk"


def test_baseline_low_risk_for_recent_activity():
    r = score({"days_since_last_activity": 0})
    assert r["tier"] == "healthy"
    assert r["modelVersion"].startswith("baseline")  # no trained model present


def test_baseline_high_risk_for_long_inactivity():
    r = score({"days_since_last_activity": 21})
    assert r["probability"] == 1.0
    assert r["tier"] == "atrisk"
