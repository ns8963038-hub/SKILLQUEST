"""Verify the leakage-free dataset logic on tiny synthetic data.

These run without OULAD — they check that the cohort/label/feature rules behave
exactly as specified, which is the part a viva will probe.
"""

import pandas as pd

from dataset import build_cohort, build_features

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
            # before the window and must be ignored -> zero activity.
            "date": [80, 95, 105, 60, 98],
            "sum_click": [5, 10, 999, 7, 3],
        }
    )
    feats = build_features(vle, cohort, cutoff=100, window=28).set_index("id_student")

    # Learner 1: only days 80 and 95 count -> 2 active days, 15 clicks (not 1014).
    assert feats.loc[1, "active_days"] == 2
    assert feats.loc[1, "total_clicks"] == 15  # the day-105 click is excluded
    assert feats.loc[1, "days_since_last_activity"] == 5  # 100 - 95

    # Learner 2: day-60 click is outside the window -> treated as zero activity.
    assert feats.loc[2, "total_clicks"] == 0
    assert feats.loc[2, "active_days"] == 0
    assert feats.loc[2, "days_since_last_activity"] == 28  # stale = full window

    # Learner 3: one click on day 98.
    assert feats.loc[3, "active_days"] == 1
    assert feats.loc[3, "days_since_last_activity"] == 2
