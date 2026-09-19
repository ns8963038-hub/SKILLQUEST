# M6 — UAT readiness: closing the PRD gaps

**Status:** BUILT (2026-09-18). Every PRD feature row (F1–F7) and every
*buildable* success metric is now implemented and verified. What remains is
the part only people can do: deploy, run the UAT with 20–30 students, and
report the numbers it produces (§10).

This note records what was built, the decisions behind it, the honest results,
and the viva questions each part invites.

---

## 1. Scorecard: before → after

| PRD item | Before | Now |
|---|---|---|
| **F1** consent + sign-in | Email sign-in only; no consent step | Versioned consent screen **before onboarding** (agree / decline both continue); withdraw any time in Settings; Google sign-in behind a flag (§8) |
| **F2** re-planning | Roadmap built once at onboarding | Settings screen: changing weekly hours or goal **regenerates the roadmap**, keeping completed / tested-out skills |
| **F3** levels + hints | 7 levels; hints free and untracked; Judge0 in the TRD | **46 levels** over all 19 skills, machine-verified (§3); hints unlocked server-side, **cost 5 XP**, counted per level; Paiza.IO runner, documented deviation (§9) |
| **F4** badges | Code Master meaningless (hints untracked); no Placement Ready | Code Master = solved with **zero** hints (now true); **Placement Ready** at ≥ 75% tracked-skill coverage for any target role |
| **F5** risk + intervention | Model trained on click features the app can't compute; runtime used a baseline; no admin view, no nudge UI | Model **retrained on the app's own 7 features** and deployed (§5); weekly scoring creates a nudge on the move *into* at-risk; in-app nudge card with shown / clicked / dismissed logging; **research console** for the team |
| **F6** placement wording | Headlines close to the banned "You're 62% ready for Infosys" | "Your coverage of company requirements", "tracked-skill coverage", "Highest coverage" — never a hiring probability |
| **F7** leaderboard | Missing | Weekly + all-time XP leaderboard; display name or anonymous "Quester XXXX"; opt out in Settings |
| **§6 metrics** | Not measurable | SUS + engagement + would-recommend survey in-app; API and execution latency p50/p95 measured live; risk results written up (`ml/results/risk-model-fs-v2.md`); pseudonymised CSV exports |

## 2. Research ethics, as built (Backend Schema §5.1)

- **Consent comes first.** `GET /api/me` returns `consentRequired` when the
  student hasn't answered the *current* text (`CONSENT_VERSION = 'v1-2026-09'`).
  Changing the text means bumping the version, so everyone is asked again.
- **Declining is a real choice.** Every feature works either way; declining
  just sets `withdrawn_at`. Data from withdrawn students is excluded from every
  aggregate and every export.
- **Pseudonymised exports only.** The console exports survey / risk / progress
  CSVs keyed by participant code (P01…), never name, email or USN. Emails in
  the console itself are masked (`s1•••@college.edu`).
- **Admins by allow-list.** `ADMIN_EMAILS` in the backend env grants the
  research console; it never *revokes* (so a typo can't lock the team out).
- **RLS gap fixed.** `skill_mastery` had no row-level security; the
  `uat_readiness` migration enables it (and on the new `survey_responses`).

## 3. Levels: 7 → 46, and how we know they're right

39 new levels: 2 more for each of the 7 fundamentals skills, 2 for each of the
11 DSA skills, 3 for interview patterns. Every skill now has 2–3 levels, which
is why "completed" means *all* of a skill's levels (and mastery stays a
separate BKT estimate).

Expected outputs were **never typed by hand**. `content/verify-levels.mjs`:

1. checks the JSON shape (id ↔ file name, known skill, ≥1 visible and ≥1
   hidden test, hints, unique order);
2. compiles the reference solution with `javac --release 11` (so nothing needs a
   newer JDK than the runner has) and, with `--fill`, *runs* it to produce every
   expected output — otherwise it checks them;
3. compiles the starter code and confirms it does **not** already pass.

All 46 pass. Output comparison is now one shared rule
(`backend/src/execution/compare.ts`): CRLF → LF and trailing spaces per line
are ignored; tokens, spacing between them, case and order must match.

Design choices worth defending: the OOP levels give students a working `main`
and ask them to complete the classes (so the exercise is the OOP, not the
parsing); `time-complexity-01` uses n up to 10¹⁸ so only an O(1) formula can
pass; `recursion-02` needs memoisation for n = 45.

## 4. Hints that cost something (F3/F4)

`POST /api/levels/:id/hint` reveals the next hint only. In one transaction it
claims hint *n* with a compare-and-set (`updateMany … where hintsUsed = n`, so
two clicks can't double-charge), deducts 5 XP (never below zero) and logs
`hint_used`. The level endpoint returns only the hints already paid for.
Because use is now counted, **Code Master** (solve with zero hints) means what
it says, and the weekly leaderboard subtracts hint costs.

## 5. The risk model, fixed — and what it really shows (F5)

**The bug.** v1 trained on OULAD click features (`total_clicks`,
`clicks_trend`, …) that SkillQuest cannot compute, while the service scored the
app's seven features. Also, the AI service has no scikit-learn, so the `.joblib`
file could never have loaded: live scoring was the days-since-activity rule all
along.

**The fix (feature set fs-v2).** `ml/dataset.py` now builds *exactly* the
seven runtime features, in the same order, from OULAD:

| App feature | OULAD equivalent |
|---|---|
| active_days_in_window | distinct VLE days in the 28-day window |
| mean_session_gap_days | mean gap between those days (28 if < 2 days) |
| days_since_last_activity | cutoff − last VLE day before the cutoff (any age) |
| completion_ratio | assessments passed (score ≥ 40) / submitted |
| avg_score | mean assessment score / 100 |
| activity_trend | VLE rows in 2nd half of window − 1st half |
| current_streak | same `streakEndingAt` rule, ending at the cutoff day |

The streak rule is identical in TypeScript and Python, with the same unit
tests on both sides; a test also pins the feature list to the service's order.

**Results** (temporal split — train 2013B/2013J/2014B, test 2014J, withdrawal
rate 2.5%; full tables in `ml/results/risk-model-fs-v2.md`):

| model | PR-AUC | ROC-AUC |
|---|---|---|
| majority | 0.025 | 0.500 |
| days-since-activity rule | 0.039 | 0.680 |
| **logistic regression** | **0.042** | **0.708** |
| random forest | 0.032 | 0.570 |

- Logistic regression is best on both splits, but its edge over the one-line
  rule is **within noise**: +0.004 PR-AUC, 95% bootstrap CI [−0.001, +0.009].
- The random forest overfits and loses to the rule.
- **Deployed: `lr-v2`**, exported as plain numbers (`ai-service/app/risk_model.json`:
  means, scales, weights, intercept, thresholds) and scored with a dot product
  and a sigmoid — no ML library in production, fully inspectable.

**Tiers (thr-v2).** Thresholds are set on *training* scores only: "at risk" =
score deciles that withdraw at ≥ 2× the base rate, "watch" = ≥ 1×. On the
held-out year: healthy 0.8% withdraw, watch 3.6%, at risk 4.7% (1.9× base);
the at-risk tier catches 41% of withdrawals, watch-or-worse 85%. A first
version used fixed top-10% / next-15% cuts and its "at risk" tier withdrew
*less* than "watch" on held-out data, so it was replaced. That failure is
reported, not hidden.

**What to say about it.** The signal in activity data 21 days ahead is weak;
that is the finding. Two honest reasons: (1) OULAD's label is *formal*
unregistration — learners inactive 60+ days withdraw formally *less* often
(they drift away silently), so the label misses the dropouts we most care
about; (2) this is a transfer from UK distance learners to Indian engineering
students, and some feature scales differ (a VLE row is not a code submission).
The model is an **experimental transfer-based risk indicator**, never a
validated dropout predictor.

**Coefficients.** Signs of individual coefficients (e.g. `completion_ratio`
positive) are not interpretable one by one — the features are strongly
correlated. Read the model as a whole, via its ranking metrics.

## 6. The intervention loop

Weekly scoring (`runWeeklyScoring`, also runnable from the console) scores
onboarded students idempotently, caches each tier and — **only on a move into
at-risk** — creates a nudge carrying a "confidence booster": the easiest level
the student hasn't completed. The dashboard card never says "at risk"; it
says "Missed you! Fancy a quick win?". Shown / clicked / dismissed are
timestamped once each and logged. With 20–30 students, these counts describe
the pilot; they **cannot** show that nudges reduce dropout (PRD §6).

## 7. Measuring the success metrics

- **Latency.** Middleware times every API request by route pattern; the console
  shows platform p50/p95 (excluding submits) and execution p50/p95 (from
  `submissions.runtime_ms`) against the targets (< 500 ms, < 15 s).
- **Execution speed-up.** Paiza runs took ~3.7 s each, run one after another:
  a 4-test submit took 15.0 s, right at the limit. Now the first test runs
  alone (a compile error stops there: 2.8 s instead of ~15 s) and the rest run
  3 at a time. Measured on real submissions: execution p50 6.5 s, p95 9.0 s.
- **Honest caveat.** From a laptop in India to the Supabase database, each
  query is a ~100–250 ms round trip, so locally platform p95 is ~1.5 s and a
  whole submit takes ~11 s. **Measure the targets on the deployed stack**
  (API in the same region as the database), not on a laptop.
- **SUS.** The ten standard items (Brooke 1996) with "SkillQuest" substituted —
  wording and order unchanged, so the score is comparable to the 68 benchmark.
  Scored server-side (odd items a−1, even items 5−a, sum × 2.5). Offered after
  3 completed levels; one response per student.

## 8. Google sign-in — setup (F1)

The button appears only when `VITE_GOOGLE_AUTH=1`, so it can't be clicked into
an error.

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client
   ID* (Web application). Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: enable, paste the client ID
   and secret.
3. Supabase → Authentication → URL Configuration: add the site URL(s)
   (`http://localhost:5173` and the deployed URL) to Redirect URLs.
4. Frontend env: `VITE_GOOGLE_AUTH=1`, restart Vite.

## 9. Deviation from the TRD: Paiza.IO instead of Judge0

The TRD specifies self-hosted Judge0. On our development machines (Apple
Silicon) Judge0's sandbox (isolate / cgroups v1) does not run reliably, and a
cloud VM costs money. The `ExecutionService` interface was built for exactly
this: Paiza.IO's public runner, the mock, Piston and Judge0 are
interchangeable behind it (`EXECUTION_BACKEND`). Paiza is free and needs no
account, and it has handled every real submission so far. Its limits: a shared
guest key that is rate-limited (we back off and retry on 429) and a third-party
dependency. **For a larger deployment, self-host Judge0 or Piston on a Linux
VM** — a config change, not a code change.

## 10. What's left (needs people, not code)

1. **Deploy** the three services (web, API, AI) with the API co-located with the
   database; set `ADMIN_EMAILS` to the team's emails. Step by step: `docs/DEPLOY.md`.
2. **Email confirmation:** do NOT simply switch it on. Supabase's built-in
   sender only delivers to the project team (2 emails/hour), so students would be
   locked out. Keep it off for the pilot, or connect Gmail SMTP first
   (`docs/DEPLOY.md` §4.2).
3. **Run the UAT:** 20–30 students, ~2 weeks, at least 3 levels each, then the
   in-app survey. Run weekly scoring each week. Export the CSVs.
4. **Report** SUS mean ± SD, engagement, would-recommend %, nudge counts,
   latency p95s — whatever they are.

## 11. Likely viva questions

**Q: Why ask for consent before onboarding, and what happens if they decline?**
The onboarding quiz is itself research data (abandonment is a dropout signal),
so consent must come first. Declining sets `withdrawn_at`; the app works fully,
and their data is excluded from every analysis and export.

**Q: How do you know all 46 levels' expected outputs are correct?**
They were generated by running the reference solutions, not typed. The checker
also compiles for Java 11 and proves the starter code doesn't already pass.

**Q: Why did you deploy logistic regression and not the Random Forest?**
By a rule stated in `run_experiment.py`: best temporal PR-AUC wins, if it beats
the baseline rule. The RF overfit (PR-AUC 0.032, below the rule's 0.039).
Logistic regression also exports to a handful of numbers, so production needs
no ML library.

**Q: Your model barely beats a one-line rule. Isn't that a failure?**
It is the finding, and it's reported with its confidence interval. Predicting
formal withdrawal three weeks out from activity alone is hard, and the label
misses silent dropout. Claiming more would fail the PRD's own honesty rule.

**Q: What stops training/serving skew from happening again?**
One feature list shared by three codebases, a test that pins the order, the
same streak algorithm tested on both sides, and the service refusing to load a
model trained on different features.

**Q: Isn't a leaderboard bad for struggling students?**
The weekly board resets so newcomers can win, the viewer always sees their own
rank, names are optional (anonymous handles), and anyone can hide in Settings.

**Q: Why charge XP for hints?**
So hint use is a visible, counted choice: it makes Code Master meaningful, keeps
the leaderboard fair, and gives the model an honest signal — while 5 XP is small
enough that nobody stays stuck to protect their score.

**Q: Can the SUS result be compared with other systems?**
Yes, that's why the ten items are used verbatim and scored the standard way.
With 20–30 students it is a preliminary usability measure, not a
generalisable one.
