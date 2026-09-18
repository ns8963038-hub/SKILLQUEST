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

# The features the models train on — EXACTLY the seven the live app computes
# (backend/src/risk/features.ts) and the AI service scores
# (ai-service/app/risk.py FEATURE_ORDER), in the same order. Training on one set
# of features and scoring on another is meaningless, so this list is the
# contract between the three. How each maps onto OULAD is documented in
# build_features and in docs/notes/M6-uat-readiness.md.
FEATURE_COLUMNS = [
    "active_days_in_window",
    "mean_session_gap_days",
    "days_since_last_activity",
    "completion_ratio",
    "avg_score",
    "activity_trend",
    "current_streak",
]

# OULAD's pass mark for an assessment (scores are 0-100).
PASS_MARK = 40


def streak_ending_at(active_days, end_day: int) -> int:
    """Consecutive active days ending on `end_day` — or the day before, since the
    end day itself may not have happened yet. Mirrors streakEndingAt() in
    backend/src/risk/features.ts line for line (same unit tests on both sides)."""
    active = set(int(d) for d in active_days)
    day = end_day if end_day in active else end_day - 1
    streak = 0
    while day in active:
        streak += 1
        day -= 1
    return streak


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
    student_assessment: pd.DataFrame | None = None,
    assessments: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """The seven runtime features per enrolment, using ONLY data before `cutoff`.

    `student_vle` is studentVle.csv (id_student, code_module, code_presentation,
    date, sum_click). One VLE row = one learner touching one resource on one day,
    the closest OULAD analogue of one SkillQuest activity event.
    `student_assessment` + `assessments` (optional) are studentAssessment.csv and
    assessments.csv; without them the two assessment features are 0.

    How each app feature maps onto OULAD (app definition -> OULAD definition):
      active_days_in_window    distinct days with a submit in the 28-day window
                               -> distinct days with VLE activity in the window
      mean_session_gap_days    mean gap between those days (window if < 2 days)
                               -> the same, on VLE days
      days_since_last_activity days from the last event (any time) to the window end
                               -> cutoff - last VLE day before the cutoff (window if none)
      completion_ratio         completed levels / attempted levels
                               -> assessments passed (score >= 40) / submitted
      avg_score                mean best pass ratio over attempted levels (0-1)
                               -> mean assessment score / 100 over submitted
      activity_trend           submits in 2nd half of window - submits in 1st half
                               -> VLE rows in 2nd half - VLE rows in 1st half
      current_streak           consecutive active days ending today/yesterday
                               -> the same rule, ending at the cutoff day

    Enrolments with no activity are kept, with the same defaults the app uses
    when a student has no events — absence of activity is itself a strong signal.
    """
    win_start = cutoff - window
    mid = cutoff - window // 2  # boundary between first and second half of the window

    # Everything strictly before the cutoff, for cohort enrolments only.
    past = student_vle[student_vle["date"] < cutoff].merge(
        cohort[ENROLMENT_KEYS], on=ENROLMENT_KEYS, how="inner"
    )
    in_window = past[past["date"] >= win_start]

    def per_group(g: pd.DataFrame) -> pd.Series:
        days = np.sort(g["date"].unique())
        first_half = int((g["date"] < mid).sum())
        second_half = int(len(g) - first_half)
        gap = float(np.mean(np.diff(days))) if len(days) >= 2 else float(window)
        return pd.Series(
            {
                "active_days_in_window": int(len(days)),
                "mean_session_gap_days": gap,
                "activity_trend": second_half - first_half,  # +ve = ramping up
                "current_streak": streak_ending_at(days, cutoff),
            }
        )

    if len(in_window):
        windowed = (
            in_window.groupby(ENROLMENT_KEYS, sort=False)[["date"]].apply(per_group).reset_index()
        )
    else:
        # No window activity at all: an empty frame with numeric columns, so the
        # fill-ins below operate on numbers (not object dtype).
        windowed = cohort[ENROLMENT_KEYS].head(0).assign(
            active_days_in_window=pd.Series(dtype=float),
            mean_session_gap_days=pd.Series(dtype=float),
            activity_trend=pd.Series(dtype=float),
            current_streak=pd.Series(dtype=float),
        )

    # Last activity at ANY time before the cutoff (not just in the window) — the
    # app looks at the student's most recent event of any age too.
    last_seen = past.groupby(ENROLMENT_KEYS, sort=False)["date"].max().rename("last_day").reset_index()

    feats = cohort[ENROLMENT_KEYS].merge(windowed, on=ENROLMENT_KEYS, how="left")
    feats = feats.merge(last_seen, on=ENROLMENT_KEYS, how="left")
    feats["active_days_in_window"] = feats["active_days_in_window"].fillna(0).astype(int)
    feats["mean_session_gap_days"] = feats["mean_session_gap_days"].fillna(float(window)).astype(float)
    feats["activity_trend"] = feats["activity_trend"].fillna(0).astype(int)
    feats["current_streak"] = feats["current_streak"].fillna(0).astype(int)
    feats["days_since_last_activity"] = (
        (cutoff - pd.to_numeric(feats["last_day"])).fillna(window).astype(int)
    )
    feats = feats.drop(columns=["last_day"])

    # Assessment features: submitted before the cutoff, not carried over ("banked")
    # from an earlier presentation, and actually scored.
    feats["completion_ratio"] = 0.0
    feats["avg_score"] = 0.0
    if student_assessment is not None and assessments is not None:
        sa = student_assessment.merge(
            assessments[["id_assessment", "code_module", "code_presentation"]], on="id_assessment"
        )
        sa = sa[(sa["date_submitted"] < cutoff) & (sa["is_banked"] == 0) & sa["score"].notna()]
        sa = sa.merge(cohort[ENROLMENT_KEYS], on=ENROLMENT_KEYS, how="inner")
        if len(sa):
            agg = (
                sa.assign(passed=(sa["score"] >= PASS_MARK).astype(int))
                .groupby(ENROLMENT_KEYS, sort=False)
                .agg(submitted=("score", "size"), passed=("passed", "sum"), mean_score=("score", "mean"))
                .reset_index()
            )
            feats = feats.drop(columns=["completion_ratio", "avg_score"]).merge(agg, on=ENROLMENT_KEYS, how="left")
            feats["completion_ratio"] = (feats["passed"] / feats["submitted"]).fillna(0.0)
            feats["avg_score"] = (feats["mean_score"] / 100.0).fillna(0.0)
            feats = feats.drop(columns=["submitted", "passed", "mean_score"])

    return feats[ENROLMENT_KEYS + FEATURE_COLUMNS]


def build_dataset(
    registration: pd.DataFrame,
    student_vle: pd.DataFrame,
    cutoff: int = CUTOFF_DAY,
    student_assessment: pd.DataFrame | None = None,
    assessments: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Full modelling frame: enrolment keys + features + label."""
    cohort = build_cohort(registration, cutoff)
    feats = build_features(
        student_vle, cohort, cutoff, student_assessment=student_assessment, assessments=assessments
    )
    return feats.merge(cohort, on=ENROLMENT_KEYS, how="left")
