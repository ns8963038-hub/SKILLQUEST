"""Verify the split protocols keep the metrics honest."""

import pandas as pd

from splits import grouped_split, temporal_split


def _data():
    # Each student contributes 2 enrolments -> a plain row split would leak.
    return pd.DataFrame(
        {
            "id_student": [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8],
            "code_presentation": ["2013J", "2014J"] * 8,
            "label": [0, 1] * 8,
        }
    )


def test_grouped_split_has_no_student_overlap():
    train, test = grouped_split(_data(), test_size=0.25, seed=42)
    overlap = set(train["id_student"]) & set(test["id_student"])
    assert overlap == set(), f"student(s) leaked across split: {overlap}"
    # Nothing lost or duplicated.
    assert len(train) + len(test) == 16


def test_temporal_split_partitions_by_presentation():
    train, test = temporal_split(
        _data(), train_presentations=["2013J"], test_presentations=["2014J"]
    )
    assert set(train["code_presentation"]) == {"2013J"}
    assert set(test["code_presentation"]) == {"2014J"}
