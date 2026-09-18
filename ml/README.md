# ML — OULAD Disengagement-Risk Experiment

Trains the flagship risk model (docs/02-TRD.md §6.3). This directory is **not
deployed** — it exports `ai-service/app/risk_model.json` (the chosen model as
plain numbers) and writes the results tables to `results/`.

## What this is (and isn't)

An **experimental transfer-based disengagement risk indicator**, trained on
OULAD (UK distance-learning). It is **not** a validated dropout predictor for
Indian coding students — that framing is required in the report and viva.

**Task:** using a 28-day observation window ending at a cutoff day, predict
whether a learner withdraws within the next 21 days.

## Get the data

1. Download OULAD from the Open University:
   https://analyse.kmi.open.ac.uk/open_dataset (a single `anonymisedData.zip`).
2. Unzip and put the CSVs into `ml/data/` (needs `studentRegistration.csv`,
   `studentVle.csv`, `studentAssessment.csv` and `assessments.csv`). The folder
   is gitignored — never commit the dataset.

## Run it

```bash
cd ml
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

pytest -q            # verifies the leakage-free logic on synthetic data (no OULAD needed)
python run_experiment.py   # runs the full experiment on ml/data/*.csv
```

`run_experiment.py` builds the dataset on the **same seven features the app
computes** (feature set fs-v2), splits it two ways (student-grouped and
temporal), fits the **baselines first**, then logistic regression and the
Random Forest, and prints both comparison tables with a bootstrap interval on
each model's edge over the days-since-activity rule. It then applies the stated
deployment rule, sets the tier thresholds from training scores, and writes:

- `../ai-service/app/risk_model.json` — the deployed model (committed)
- `results/risk-model-fs-v2.md` — the tables for the report (committed)

Latest results and their interpretation: `docs/notes/M6-uat-readiness.md` §5.

## Files

| File | Role |
|---|---|
| `config.py` | Window/horizon/versions — the task, stated once |
| `dataset.py` | Leakage-free cohort, labels, and the seven runtime features |
| `splits.py` | Student-grouped and temporal splits |
| `models.py` | Baselines (majority, days-since-activity) then logistic regression and the RF |
| `evaluate.py` | PR-AUC, confusion matrix, bootstrap CI, tier thresholds and tier report |
| `run_experiment.py` | Orchestrates the whole thing |
| `tests/` | Synthetic-data checks of the leakage/label/split logic |

## Reading the results

- **Lead with the temporal split**, not the grouped one — it's the honest number.
- **PR-AUC is primary** (positives are rare); always read it against the printed
  positive rate.
- **A learned model must beat the `days_since_activity` baseline.** If it
  doesn't (the fs-v2 RF didn't; logistic regression did, within noise), that
  comparison *is* the finding — report it honestly.
