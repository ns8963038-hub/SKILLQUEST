"""Train/test splitting — the part that decides whether the metrics are honest.

Two protocols (TRD 6.3.3):
  - grouped: no student appears in both train and test (a student contributes
    several enrolments, so a plain row split would leak).
  - temporal: train on earlier course presentations, test on a later one — this
    is what deployment actually looks like.
Report both; lead with the temporal (harder, more honest) number.
"""

from __future__ import annotations

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from config import RANDOM_SEED, TEST_PRESENTATIONS, TRAIN_PRESENTATIONS


def grouped_split(
    data: pd.DataFrame,
    group_col: str = "id_student",
    test_size: float = 0.25,
    seed: int = RANDOM_SEED,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split so no value of `group_col` (a student) lands in both halves."""
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    train_idx, test_idx = next(gss.split(data, groups=data[group_col]))
    return (
        data.iloc[train_idx].reset_index(drop=True),
        data.iloc[test_idx].reset_index(drop=True),
    )


def temporal_split(
    data: pd.DataFrame,
    train_presentations: list[str] = TRAIN_PRESENTATIONS,
    test_presentations: list[str] = TEST_PRESENTATIONS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Train on earlier presentations, test on a later one."""
    train = data[data["code_presentation"].isin(train_presentations)].reset_index(drop=True)
    test = data[data["code_presentation"].isin(test_presentations)].reset_index(drop=True)
    return train, test
