# ML — OULAD Disengagement-Risk Experiment

Trains the flagship risk model (docs/02-TRD.md §6.3). This directory is **not
deployed** — it produces a `.joblib` model artifact that the AI service loads.

## What this is (and isn't)

An **experimental transfer-based disengagement risk indicator**, trained on
OULAD (UK distance-learning). It is **not** a validated dropout predictor for
Indian coding students — that framing is required in the report and viva.

**Task:** using a 28-day observation window ending at a cutoff day, predict
whether a learner withdraws within the next 21 days.

## Get the data

1. Download OULAD from the Open University:
   https://analyse.kmi.open.ac.uk/open_dataset (a single `anonymisedData.zip`).
2. Unzip and put the CSVs into `ml/data/` (at least `studentRegistration.csv`
   and `studentVle.csv`). The folder is gitignored — never commit the dataset.

## Run it

```bash
cd ml
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

pytest -q            # verifies the leakage-free logic on synthetic data (no OULAD needed)
python run_experiment.py   # runs the full experiment on ml/data/*.csv
```

`run_experiment.py` builds the dataset, splits it two ways (student-grouped and
temporal), fits the **baselines first**, then the Random Forest, and prints both
comparison tables. It saves `risk_rf-v1.joblib` from the temporal split.

## Files

| File | Role |
|---|---|
| `config.py` | Window/horizon/versions — the task, stated once |
| `dataset.py` | Leakage-free cohort, labels, and windowed features |
| `splits.py` | Student-grouped and temporal splits |
| `models.py` | Baselines (majority, days-since-activity, logistic) then the RF |
| `evaluate.py` | PR-AUC, confusion matrix, comparison table |
| `run_experiment.py` | Orchestrates the whole thing |
| `tests/` | Synthetic-data checks of the leakage/label/split logic |

## Reading the results

- **Lead with the temporal split**, not the grouped one — it's the honest number.
- **PR-AUC is primary** (positives are rare); always read it against the printed
  positive rate.
- **The Random Forest must beat the `days_since_activity` baseline.** If it
  doesn't, that comparison *is* the finding — report it honestly.
