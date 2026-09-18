"""Run the OULAD disengagement-risk experiment end to end — and export the model
the app actually deploys.

Usage:
    python run_experiment.py            # uses ./data/*.csv, CUTOFF_DAY from config

Order matters and mirrors the protocol (TRD 6.3): build the leakage-free dataset
on the SAME seven features the app computes, split two ways, fit the BASELINES
first, then logistic regression and the Random Forest, and print both comparison
tables. Whatever the numbers are, they are the numbers we report.

Deployment rule (stated here so anyone can check it against the printed tables):
deploy the model with the best temporal-split PR-AUC, provided it beats the
days-since-activity rule; otherwise deploy the rule itself. Tier
thresholds come from the TRAINING scores only (evaluate.lift_thresholds): "at
risk" = the score deciles that withdraw at >= 2x the base rate, "watch" = those
at >= 1x. (A first version used fixed top-10% / next-15% cuts; on held-out data
its "at risk" tier withdrew LESS often than "watch", so it was replaced.)

Outputs:
    ../ai-service/app/risk_model.json   the deployed model (weights + thresholds + metadata)
    results/risk-model-<fs>.md          the write-up tables for the report
"""

from __future__ import annotations

import json
import sys
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from config import (
    CUTOFF_DAY,
    FEATURE_SET_VERSION,
    OBSERVATION_WINDOW_DAYS,
    PREDICTION_HORIZON_DAYS,
    RANDOM_SEED,
    TEST_PRESENTATIONS,
    THRESHOLD_VERSION,
    TRAIN_PRESENTATIONS,
)
from dataset import FEATURE_COLUMNS, build_dataset
from evaluate import (
    _pos_scores,
    bootstrap_pr_auc_diff,
    comparison_table,
    evaluate_model,
    lift_thresholds,
    positive_rate,
    tier_report,
)
from models import (
    DaysSinceActivityBaseline,
    MajorityBaseline,
    make_logistic_regression,
    make_random_forest,
)
from splits import grouped_split, temporal_split

# numpy 2.x on Apple's Accelerate BLAS emits spurious "divide by zero / overflow
# in matmul" warnings during LogisticRegression fitting; the fitted weights are
# finite (checked below before export). Silence only that noise.
warnings.filterwarnings("ignore", message=".*encountered in matmul", category=RuntimeWarning)

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
MODEL_OUT = HERE.parent / "ai-service" / "app" / "risk_model.json"
RESULTS_DIR = HERE / "results"


def _md(df: pd.DataFrame, index: bool = False) -> str:
    """A DataFrame as a GitHub-markdown table (no extra dependency needed)."""
    frame = df.reset_index() if index else df
    head = "| " + " | ".join(str(c) for c in frame.columns) + " |"
    rule = "|" + "---|" * len(frame.columns)
    rows = ["| " + " | ".join(str(v) for v in row) + " |" for row in frame.itertuples(index=False)]
    return "\n".join([head, rule, *rows])


def _load_oulad() -> dict[str, pd.DataFrame]:
    names = ["studentRegistration", "studentVle", "studentAssessment", "assessments"]
    missing = [n for n in names if not (DATA_DIR / f"{n}.csv").exists()]
    if missing:
        sys.exit(
            f"OULAD CSVs missing in {DATA_DIR}: {', '.join(missing)}.\n"
            "Download OULAD (see ml/README.md) and unzip the CSVs into ml/data/."
        )
    return {n: pd.read_csv(DATA_DIR / f"{n}.csv") for n in names}


def _models():
    # BASELINES FIRST — anything learned must beat these to matter.
    return [
        ("majority", MajorityBaseline()),
        ("days_since_activity", DaysSinceActivityBaseline()),
        ("logistic_regression", make_logistic_regression()),
        ("random_forest", make_random_forest()),
    ]


def _fit_and_score(train: pd.DataFrame, test: pd.DataFrame, protocol: str):
    X_train, y_train = train[FEATURE_COLUMNS], train["label"]
    X_test, y_test = test[FEATURE_COLUMNS], test["label"]
    print(f"\n=== {protocol} split ===")
    print(f"train n={len(train)} (pos rate {positive_rate(y_train):.4f}) | "
          f"test n={len(test)} (pos rate {positive_rate(y_test):.4f})")
    results, fitted = [], {}
    for name, model in _models():
        model.fit(X_train, y_train)
        fitted[name] = model
        results.append(evaluate_model(name, model, X_test, y_test))
    table = comparison_table(results)
    print(table.to_string(index=False))
    return table, results, fitted


def _export_logistic(pipeline, thresholds: dict, metadata: dict) -> dict:
    """LogisticRegression inside a StandardScaler pipeline -> plain numbers, so
    the AI service scores with a dot product (no scikit-learn at runtime)."""
    scaler = pipeline.named_steps["standardscaler"]
    lr = pipeline.named_steps["logisticregression"]
    weights = lr.coef_[0]
    assert np.all(np.isfinite(weights)) and np.isfinite(lr.intercept_[0]), "non-finite weights"
    return {
        "type": "logistic_regression",
        "features": FEATURE_COLUMNS,
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "coef": weights.tolist(),
        "intercept": float(lr.intercept_[0]),
        "thresholds": thresholds,
        **metadata,
    }


def main() -> None:
    raw = _load_oulad()
    data = build_dataset(
        raw["studentRegistration"],
        raw["studentVle"],
        cutoff=CUTOFF_DAY,
        student_assessment=raw["studentAssessment"],
        assessments=raw["assessments"],
    )
    print(f"Built dataset ({FEATURE_SET_VERSION}): {len(data)} enrolments, "
          f"withdrawal rate {positive_rate(data['label']):.4f}")
    describe = data[FEATURE_COLUMNS].describe().T[["mean", "std", "min", "50%", "max"]].round(2)
    print(describe.to_string())

    # Grouped split flatters; temporal is honest. Report both, lead with temporal.
    g_table, _, _ = _fit_and_score(*grouped_split(data), "grouped")
    tr_t, te_t = temporal_split(data)
    t_table, t_results, fitted = _fit_and_score(tr_t, te_t, "temporal")
    y_test = te_t["label"].to_numpy()

    # Is each learned model's edge over the rule bigger than test-set noise?
    rule_scores = _pos_scores(fitted["days_since_activity"], te_t[FEATURE_COLUMNS])
    cis = {}
    for name in ["logistic_regression", "random_forest"]:
        s = _pos_scores(fitted[name], te_t[FEATURE_COLUMNS])
        cis[name] = bootstrap_pr_auc_diff(y_test, s, rule_scores)
        point, lo, hi = cis[name]
        print(f"PR-AUC({name}) - PR-AUC(rule) = {point:+.4f}  95% CI [{lo:+.4f}, {hi:+.4f}]")

    # ---- Choose what to deploy (the rule in the module docstring) ----
    pr = {r["model"]: r["pr_auc"] for r in t_results}
    learned = max(["logistic_regression", "random_forest"], key=lambda n: pr[n])
    chosen = learned if pr[learned] > pr["days_since_activity"] else "days_since_activity"
    if chosen == "random_forest":
        sys.exit("The Random Forest won: export it with joblib and add scikit-learn to the AI "
                 "service before deploying (not needed for fs-v2, where it lost).")
    print(f"\nDeploying: {chosen}")

    model = fitted[chosen]
    train_scores = _pos_scores(model, tr_t[FEATURE_COLUMNS])
    test_scores = _pos_scores(model, te_t[FEATURE_COLUMNS])
    thresholds = lift_thresholds(train_scores, tr_t["label"].to_numpy())
    print(f"train withdrawal rate by score decile: {thresholds['decileRates']} (base {thresholds['baseRate']})")
    tiers = tier_report(y_test, test_scores, thresholds["watch"], thresholds["atrisk"])
    print(tiers.to_string(index=False))
    print(f"recall: atrisk {tiers.attrs['recall_atrisk']:.3f}, watch-or-worse {tiers.attrs['recall_watch_or_worse']:.3f}")

    model_version = {"logistic_regression": "lr", "days_since_activity": "rule"}[chosen] + "-" + FEATURE_SET_VERSION.split("-")[1]
    metadata = {
        "modelVersion": model_version,
        "featureSetVersion": FEATURE_SET_VERSION,
        "thresholdVersion": THRESHOLD_VERSION,
        "trainedOn": f"OULAD {'+'.join(TRAIN_PRESENTATIONS)} (temporal train), tested on {'+'.join(TEST_PRESENTATIONS)}",
        "task": {"cutoffDay": CUTOFF_DAY, "windowDays": OBSERVATION_WINDOW_DAYS, "horizonDays": PREDICTION_HORIZON_DAYS},
        "testMetrics": {k: v for k, v in next(r for r in t_results if r["model"] == chosen).items() if k != "model"},
        "trainedAt": date.today().isoformat(),
        "seed": RANDOM_SEED,
    }
    if chosen == "logistic_regression":
        artifact = _export_logistic(model, thresholds, metadata)
    else:
        artifact = {"type": "days_since_activity", "features": FEATURE_COLUMNS,
                    "threshold": model.threshold_, "thresholds": thresholds, **metadata}
    MODEL_OUT.write_text(json.dumps(artifact, indent=2) + "\n")
    print(f"Wrote {MODEL_OUT.relative_to(HERE.parent)}")

    # ---- The write-up tables ----
    RESULTS_DIR.mkdir(exist_ok=True)
    lines = [
        f"# Risk model results — {FEATURE_SET_VERSION} (generated by ml/run_experiment.py on {date.today().isoformat()})",
        "",
        f"Task: at day {CUTOFF_DAY} of an OULAD presentation, using the previous {OBSERVATION_WINDOW_DAYS} days, "
        f"predict withdrawal within the next {PREDICTION_HORIZON_DAYS} days. Features: the seven the app computes.",
        f"Dataset: {len(data)} enrolments active at the cutoff; withdrawal rate {positive_rate(data['label']):.4f}.",
        "",
        "## Feature summary (OULAD)",
        "", _md(describe, index=True), "",
        "## Temporal split (primary)",
        f"Train {', '.join(TRAIN_PRESENTATIONS)} (n={len(tr_t)}), test {', '.join(TEST_PRESENTATIONS)} (n={len(te_t)}, "
        f"positive rate {positive_rate(te_t['label']):.4f}).", "",
        _md(t_table), "",
        "Confusion matrices on the test set ([[TN, FP], [FN, TP]]):", "",
        *[f"- {r['model']}: {r['confusion']}" for r in t_results], "",
        "Edge over the days-since-activity rule (PR-AUC difference, 95% bootstrap CI, 1000 resamples):", "",
        *[f"- {n}: {p:+.4f} [{lo:+.4f}, {hi:+.4f}]" for n, (p, lo, hi) in cis.items()], "",
        "## Student-grouped split (secondary — flatters)", "",
        _md(g_table), "",
        f"## Deployed: `{model_version}` ({chosen})", "",
        f"Tier thresholds: watch ≥ {thresholds['watch']:.4f}, at risk ≥ {thresholds['atrisk']:.4f} ({thresholds['rule']}).",
        "Behaviour on the held-out temporal test set:", "",
        _md(tiers), "",
        f"Share of all withdrawals caught: at-risk tier {tiers.attrs['recall_atrisk']:.3f}, "
        f"watch-or-worse {tiers.attrs['recall_watch_or_worse']:.3f}.",
    ]
    if chosen == "logistic_regression":
        coef = pd.DataFrame({"feature": FEATURE_COLUMNS, "coef (standardised)": np.round(artifact["coef"], 4)})
        lines += ["", "Standardised coefficients (sign = direction of risk):", "", _md(coef)]
    out = RESULTS_DIR / f"risk-model-{FEATURE_SET_VERSION}.md"
    out.write_text("\n".join(lines) + "\n")
    print(f"Wrote {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
