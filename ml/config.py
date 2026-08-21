"""Constants for the OULAD disengagement-risk experiment.

These encode the prediction task exactly as stated in docs/02-TRD.md sec 6.3:
given a fixed observation window of past activity, predict whether the learner
withdraws within the following horizon. Keeping them here (versioned) is what
makes a number in the report reproducible.
"""

# Prediction task (TRD 6.3.1)
OBSERVATION_WINDOW_DAYS = 28  # how much past activity we look at
PREDICTION_HORIZON_DAYS = 21  # how far ahead we predict withdrawal
# The day (relative to course start, OULAD's day-0 convention) at which we stand
# and make the prediction. A single cutoff per enrolment avoids within-student
# window overlap; multiple cutoffs are a documented future extension.
CUTOFF_DAY = 100

# Versions stamped onto every prediction for reproducibility (TRD 6.3.8)
FEATURE_SET_VERSION = "fs-v1"
MODEL_VERSION = "rf-v1"
THRESHOLD_VERSION = "thr-v1"

# Temporal split (TRD 6.3.3): train on earlier presentations, test on a later
# one, to mimic deploying on learners/periods never seen in training.
# OULAD presentation codes: <year><B|J> (B = Feb start, J = Oct start).
TRAIN_PRESENTATIONS = ["2013B", "2013J", "2014B"]
TEST_PRESENTATIONS = ["2014J"]

RANDOM_SEED = 42
