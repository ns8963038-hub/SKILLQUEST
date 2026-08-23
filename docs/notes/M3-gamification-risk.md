# M3 Notes — Gamification + Disengagement Risk

> M3 turns the working loop into a *game* (dashboard, XP/level, streaks, badges)
> and wires up the flagship AI module (disengagement-risk scoring). This is the
> milestone that answers "is it just LeetCode?" — no: it now has a game surface
> and an AI watching for at-risk learners.

## 1. What was built
- **Dashboard** (`GET /api/dashboard` + `DashboardScreen`) — level + XP bar, streak flame, "Continue your quest", badge shelf. The app's home.
- **Streaks** (`gamification/streak.ts`) — a day is "active" when you submit a level; consecutive days build the streak, a gap resets it.
- **Badges** (`gamification/badges.ts`) — First Quest, Code Master (no hints), Week Warrior (7-day streak), awarded on submit.
- **Risk scoring** (`risk/features.ts`, `ai/risk-score`, `/internal/jobs/weekly-scoring`) — features from the events log → AI score → stored prediction → cached tier → nudge.

## 2. Streaks & badges — how, and why it's safe
Both are **pure functions** (no DB) so they're easy to test, and both run **inside the same transaction as the atomic XP award**. So a submission either updates XP, streak, and badges together or not at all — no half-states. Badge awards are idempotent (a `user_badges` primary key + an "already earned?" check), so re-submitting never double-awards. Days are counted in UTC for consistency.

## 3. The dashboard is what makes it a game
Same problems, but wrapped in progress: your **level** rises with XP, a **streak** rewards coming back daily, **badges** mark milestones, and the **quest card** always points at the next thing to do. That loop — *do a thing → see a number go up → keep a streak → earn a badge* — is the Duolingo model, and it's the difference between "gamified learning" and a problem list.

## 4. Disengagement risk — the flagship AI module, wired end to end

```
events log ──> features.ts (28-day window) ──> POST /ai/risk-score ──> tier
                                                      │
        weekly-scoring job persists dropout_scores + caches profile.risk_tier
                                                      │
                          tier -> at-risk (transition) => a nudge is created
```

- **Features** are computed strictly inside the 28-day observation window — the *same schema* the OULAD model trains on, so a number means the same thing in both places (TRD 6.3).
- **Scoring** loads the trained `risk_rf.joblib` if present; until the team trains it, a transparent **baseline** (risk rises with days-since-activity) stands in — so the whole pipeline is live and testable *now*. Dropping the trained model in changes nothing else.
- **Every prediction is stored with its reproducibility metadata** (model/feature/threshold versions, window dates, horizon, the feature snapshot), so any number in the report traces back to exactly how it was produced.
- The job is **internal-key protected** (the scheduler calls it, not a user) and **idempotent** per (user, window end, model).

Verified live: the job scored the demo user → tier `healthy`, baseline model, 21-day horizon, full feature row persisted; a request with no key → 401.

## 5. Likely viva questions
**Q: How is this "gamified" and not just an online judge?**
The judging is the core, but everything around it is game mechanics: XP and levels, daily streaks, badges, a quest map, and celebrations. The student is pulled back by progression and streaks, not by content they have to force themselves through. It's the Duolingo model applied to placement coding.

**Q: How does the risk model get its data, given you launched with no users?**
Two parts. The **model** is trained offline on OULAD (a public dataset of the same problem). The **live features** are computed from our own events log using the *same schema*, so the trained model scores our students. Until it's trained we run a documented baseline, so the pipeline is already working.

**Q: Isn't a shared, always-recomputed risk number a reproducibility problem for the report?**
No — every prediction row stores the model version, feature-set version, threshold version, window dates, horizon, and the exact feature values it scored. Any figure in the report can be traced to precisely how it was made.

**Q: What stops the weekly job from double-scoring or spamming nudges?**
The stored prediction is unique per (user, window end, model), so a retry upserts rather than duplicates. A nudge is created only when a student *transitions into* at-risk, not on every run.

## ✅ M3 complete
Dashboard, streaks, badges, and the risk-scoring pipeline are built, tested, and verified live. The product now *feels* like a game and the flagship AI module is wired end to end (awaiting only the trained model, which the team produces from `ml/`).

## What's next
- Team: download OULAD, run `ml/run_experiment.py`, drop `risk_rf.joblib` into `ai-service/` — the real model goes live with no code change.
- Placement scoring (F6) + the nudge card on the dashboard (P1).
- The adventure-game layer (Version B "quest scenes"), if the team commits to it.
