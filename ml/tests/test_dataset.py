"""Verify the leakage-free dataset logic on tiny synthetic data.

These run without OULAD — they check that the cohort/label/feature rules behave
exactly as specified, which is the part a viva will probe.
"""

import pandas as pd

from dataset import FEATURE_COLUMNS, build_cohort, build_features, streak_ending_at

# cutoff=100, horizon=21, window=28 (the config defaults)


def _registration():
    # Four learners, all in the same module/presentation.
    return pd.DataFrame(
        {
            "id_student": [1, 2, 3, 4],
            "code_module": ["AAA"] * 4,
            "code_presentation": ["2013J"] * 4,
            "date_registration": [-20, -20, -20, -20],
            "date_unregistration": [
                110.0,  # withdraws day 110 -> inside [100,121) -> label 1
                130.0,  # withdraws day 130 -> outside horizon    -> label 0
                None,   # never withdraws                          -> label 0
                90.0,   # already left before cutoff 100 -> EXCLUDED from cohort
            ],
        }
    )


def test_cohort_labels_and_exclusion():
    cohort = build_cohort(_registration(), cutoff=100, horizon=21)
    # Learner 4 left before the cutoff -> not in the cohort.
    assert set(cohort["id_student"]) == {1, 2, 3}
    labels = dict(zip(cohort["id_student"], cohort["label"]))
    assert labels == {1: 1, 2: 0, 3: 0}


def test_features_window_and_leakage():
    cohort = build_cohort(_registration(), cutoff=100, horizon=21)
    vle = pd.DataFrame(
        {
            "id_student": [1, 1, 1, 2, 3],
            "code_module": ["AAA"] * 5,
            "code_presentation": ["2013J"] * 5,
            # Learner 1: days 80, 95 (in window [72,100)); day 105 is AFTER the
            # cutoff and MUST be ignored (leakage guard). Learner 2: day 60 is
            # before the window -> no window activity, but it IS their last
            # activity. Learner 3: one row on day 98.
            "date": [80, 95, 105, 60, 98],
            "sum_click": [5, 10, 999, 7, 3],
        }
    )
    feats = build_features(vle, cohort, cutoff=100, window=28).set_index("id_student")

    # Learner 1: only days 80 and 95 count (day 105 is after the cutoff).
    assert feats.loc[1, "active_days_in_window"] == 2
    assert feats.loc[1, "mean_session_gap_days"] == 15.0
    assert feats.loc[1, "days_since_last_activity"] == 5  # 100 - 95, not 100 - 105
    # Midpoint is day 86: one row before it (80), one after (95) -> trend 0.
    assert feats.loc[1, "activity_trend"] == 0
    assert feats.loc[1, "current_streak"] == 0  # last active day 95 is days ago

    # Learner 2: no activity in the window, last seen on day 60 (40 days ago).
    assert feats.loc[2, "active_days_in_window"] == 0
    assert feats.loc[2, "mean_session_gap_days"] == 28.0  # "as gappy as the window"
    assert feats.loc[2, "days_since_last_activity"] == 40

    # Learner 3: active on day 98 only.
    assert feats.loc[3, "active_days_in_window"] == 1
    assert feats.loc[3, "days_since_last_activity"] == 2
    assert feats.loc[3, "activity_trend"] == 1  # one row in the second half


def test_feature_columns_match_the_runtime_contract():
    # Same names, same order as ai-service/app/risk.py FEATURE_ORDER and
    # backend/src/risk/features.ts — the model is useless if these drift.
    assert FEATURE_COLUMNS == [
        "active_days_in_window",
        "mean_session_gap_days",
        "days_since_last_activity",
        "completion_ratio",
        "avg_score",
        "activity_trend",
        "current_streak",
    ]


def test_streak_matches_the_backend_rule():
    # The same cases as backend/src/risk/risk.test.ts.
    assert streak_ending_at([10, 11, 12], 12) == 3  # ends on the end day
    assert streak_ending_at([9, 10, 11], 12) == 3  # ended "yesterday" still counts
    assert streak_ending_at([5, 6, 7], 12) == 0  # two idle days break it
    assert streak_ending_at([], 12) == 0
    assert streak_ending_at([3, 4, 6, 7, 8], 8) == 3  # stops at the first gap


def test_streak_feature_ends_at_the_cutoff():
    cohort = build_cohort(_registration(), cutoff=100, horizon=21)
    vle = pd.DataFrame(
        {
            "id_student": [1, 1, 1, 1],
            "code_module": ["AAA"] * 4,
            "code_presentation": ["2013J"] * 4,
            "date": [96, 97, 98, 99],  # four days running, up to the day before the cutoff
            "sum_click": [1, 1, 1, 1],
        }
    )
    feats = build_features(vle, cohort, cutoff=100, window=28).set_index("id_student")
    assert feats.loc[1, "current_streak"] == 4


def test_assessment_features_use_only_pre_cutoff_unbanked_scores():
    cohort = build_cohort(_registration(), cutoff=100, horizon=21)
    vle = pd.DataFrame(columns=["id_student", "code_module", "code_presentation", "date", "sum_click"])
    assessments = pd.DataFrame(
        {"id_assessment": [1, 2, 3, 4], "code_module": ["AAA"] * 4, "code_presentation": ["2013J"] * 4}
    )
    student_assessment = pd.DataFrame(
        {
            "id_assessment": [1, 2, 3, 4],
            "id_student": [1, 1, 1, 1],
            # #3 is submitted AFTER the cutoff (leakage guard); #4 is banked from
            # an earlier presentation. Both must be ignored.
            "date_submitted": [20, 50, 120, 30],
            "is_banked": [0, 0, 0, 1],
            "score": [80.0, 30.0, 100.0, 90.0],
        }
    )
    feats = build_features(
        vle, cohort, cutoff=100, window=28, student_assessment=student_assessment, assessments=assessments
    ).set_index("id_student")
    assert feats.loc[1, "completion_ratio"] == 0.5  # passed 1 of 2 (80 >= 40, 30 < 40)
    assert feats.loc[1, "avg_score"] == 0.55  # (80 + 30) / 2 / 100
    # No submissions -> 0, the same default the app uses.
    assert feats.loc[2, "completion_ratio"] == 0.0
    assert feats.loc[2, "avg_score"] == 0.0
