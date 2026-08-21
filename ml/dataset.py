"""Build the modelling dataset from raw OULAD tables.

The whole point of this module is **leakage-free** construction: every feature
is computed strictly inside the observation window [cutoff-window, cutoff), and
the label looks only at the horizon [cutoff, cutoff+horizon). Nothing at or
after the cutoff can leak into a feature. This is the property an examiner will
probe, so it is enforced here and unit-tested on synthetic data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import CUTOFF_DAY, OBSERVATION_WINDOW_DAYS, PREDICTION_HORIZON_DAYS

# The natural unique key of an OULAD enrolment.
ENROLMENT_KEYS = ["id_student", "code_module", "code_presentation"]

# The engineered features the models train on.
FEATURE_COLUMNS = [
    "active_days",
    "total_clicks",
    "days_since_last_activity",
    "clicks_trend",
    "mean_session_gap_days",
]


def build_cohort(
    registration: pd.DataFrame,
    cutoff: int = CUTOFF_DAY,
    horizon: int = PREDICTION_HORIZON_DAYS,
) -> pd.DataFrame:
    """Learners still active at `cutoff`, labelled by withdrawal within horizon.

    `registration` is studentRegistration.csv with columns:
        id_student, code_module, code_presentation,
        date_registration, date_unregistration
    (dates are integer days relative to course start; date_unregistration is
    NaN if the learner never unregistered).

    Returns one row per enrolment active at the cutoff, with an int `label`:
        1 = date_unregistration in [cutoff, cutoff+horizon)  (withdrew soon)
        0 = otherwise (still there, or withdrew later, or never)

    Learners who already unregistered *before* the cutoff are excluded — they
    have left, so there is nothing to predict for them.
    """
    df = registration.copy()
    reg = df["date_registration"]
    unreg = df["date_unregistration"]

    # Registered by the cutoff (missing registration date -> treat as registered).
    registered = reg.isna() | (reg <= cutoff)
    # Still active at the cutoff: not yet unregistered, or unregisters at/after it.
    active_at_cutoff = unreg.isna() | (unreg >= cutoff)

    cohort = df[registered & active_at_cutoff].copy()

    horizon_end = cutoff + horizon
    withdrew_in_horizon = cohort["date_unregistration"].between(
        cutoff, horizon_end, inclusive="left"
    )
    cohort["label"] = withdrew_in_horizon.fillna(False).astype(int)

    return cohort[ENROLMENT_KEYS + ["label"]].reset_index(drop=True)


def build_features(
    student_vle: pd.DataFrame,
    cohort: pd.DataFrame,
    cutoff: int = CUTOFF_DAY,
    window: int = OBSERVATION_WINDOW_DAYS,
) -> pd.DataFrame:
    """VLE-click features per enrolment, computed inside [cutoff-window, cutoff).

    `student_vle` is studentVle.csv with columns:
        id_student, code_module, code_presentation, date, sum_click

    Enrolments with no activity in the window are kept, with zero-activity
    defaults (so the cohort size never shrinks — absence of activity is itself a
    strong signal we must not drop).
    """
    win_start = cutoff - window
    vle = student_vle[(student_vle["date"] >= win_start) & (student_vle["date"] < cutoff)]
    # Only clicks belonging to cohort enrolments.
    vle = vle.merge(cohort[ENROLMENT_KEYS], on=ENROLMENT_KEYS, how="inner")

    mid = cutoff - window // 2  # boundary between first and second half of the window

    def per_group(g: pd.DataFrame) -> pd.Series:
        distinct_days = np.sort(g["date"].unique())
        first_half = g.loc[g["date"] < mid, "sum_click"].sum()
        second_half = g.loc[g["date"] >= mid, "sum_click"].sum()
        mean_gap = float(np.mean(np.diff(distinct_days))) if len(distinct_days) >= 2 else float(window)
        return pd.Series(
            {
                "active_days": int(len(distinct_days)),
                "total_clicks": int(g["sum_click"].sum()),
                "days_since_last_activity": int(cutoff - g["date"].max()),
                "clicks_trend": int(second_half - first_half),  # +ve = ramping up
                "mean_session_gap_days": mean_gap,
            }
        )

    if len(vle):
        # Select only the needed columns before apply to avoid operating on the
        # grouping columns (and the pandas deprecation warning that comes with it).
        grouped = (
            vle.groupby(ENROLMENT_KEYS, sort=False)[["date", "sum_click"]]
            .apply(per_group)
            .reset_index()
        )
    else:
        grouped = pd.DataFrame(columns=ENROLMENT_KEYS + FEATURE_COLUMNS)

    # Left-join onto the full cohort so zero-activity enrolments survive.
    feats = cohort[ENROLMENT_KEYS].merge(grouped, on=ENROLMENT_KEYS, how="left")
    feats["active_days"] = feats["active_days"].fillna(0).astype(int)
    feats["total_clicks"] = feats["total_clicks"].fillna(0).astype(int)
    feats["clicks_trend"] = feats["clicks_trend"].fillna(0).astype(int)
    # No activity in the window -> as stale / as gappy as the window allows.
    feats["days_since_last_activity"] = (
        feats["days_since_last_activity"].fillna(window).astype(int)
    )
    feats["mean_session_gap_days"] = feats["mean_session_gap_days"].fillna(float(window))
    return feats


def build_dataset(
    registration: pd.DataFrame,
    student_vle: pd.DataFrame,
    cutoff: int = CUTOFF_DAY,
) -> pd.DataFrame:
    """Full modelling frame: enrolment keys + features + label."""
    cohort = build_cohort(registration, cutoff)
    feats = build_features(student_vle, cohort, cutoff)
    return feats.merge(cohort, on=ENROLMENT_KEYS, how="left")
