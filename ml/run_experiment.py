"""Run the OULAD disengagement-risk experiment end to end.

Usage:
    python run_experiment.py            # uses ./data/*.csv, CUTOFF_DAY from config

Order matters and mirrors the protocol (TRD 6.3): build the leakage-free
dataset, split two ways, fit the BASELINES first, then the Random Forest, and
print both comparison tables. Whatever the numbers are, they are the numbers we
report.
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import pandas as pd

from config import CUTOFF_DAY, MODEL_VERSION
from dataset import FEATURE_COLUMNS, build_dataset
from evaluate import comparison_table, evaluate_model, positive_rate
from models import (
    DaysSinceActivityBaseline,
    MajorityBaseline,
    make_logistic_regression,
    make_random_forest,
)
from splits import grouped_split, temporal_split

DATA_DIR = Path(__file__).parent / "data"


def _load_oulad() -> tuple[pd.DataFrame, pd.DataFrame]:
    reg_path = DATA_DIR / "studentRegistration.csv"
    vle_path = DATA_DIR / "studentVle.csv"
    if not reg_path.exists() or not vle_path.exists():
        sys.exit(
            f"OULAD CSVs not found in {DATA_DIR}.\n"
            "Download OULAD (see ml/README.md) and unzip the CSVs into ml/data/."
        )
    return pd.read_csv(reg_path), pd.read_csv(vle_path)


def _fit_and_score(train: pd.DataFrame, test: pd.DataFrame, protocol: str) -> pd.DataFrame:
    X_train, y_train = train[FEATURE_COLUMNS], train["label"]
    X_test, y_test = test[FEATURE_COLUMNS], test["label"]

    print(f"\n=== {protocol} split ===")
    print(f"train n={len(train)} (pos rate {positive_rate(y_train):.3f}) | "
          f"test n={len(test)} (pos rate {positive_rate(y_test):.3f})")

    results = []
    # BASELINES FIRST — the RF must beat these to matter.
    for name, model in [
        ("majority", MajorityBaseline()),
        ("days_since_activity", DaysSinceActivityBaseline()),
        ("logistic_regression", make_logistic_regression()),
        ("random_forest", make_random_forest()),
    ]:
        model.fit(X_train, y_train)
        results.append(evaluate_model(name, model, X_test, y_test))
        if name == "random_forest" and protocol == "temporal":
            joblib.dump(model, Path(__file__).parent / f"risk_{MODEL_VERSION}.joblib")

    table = comparison_table(results)
    print(table.to_string(index=False))
    return table


def main() -> None:
    registration, student_vle = _load_oulad()
    data = build_dataset(registration, student_vle, cutoff=CUTOFF_DAY)
    print(f"Built dataset: {len(data)} enrolments, "
          f"overall withdrawal rate {positive_rate(data['label']):.3f}")

    # Grouped split flatters; temporal is honest. Report both, lead with temporal.
    tr_g, te_g = grouped_split(data)
    _fit_and_score(tr_g, te_g, "grouped")

    tr_t, te_t = temporal_split(data)
    if len(tr_t) and len(te_t):
        _fit_and_score(tr_t, te_t, "temporal")
    else:
        print("\n(temporal split skipped: no rows for the configured presentations)")


if __name__ == "__main__":
    main()
