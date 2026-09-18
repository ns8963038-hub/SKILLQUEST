# M4 — Adaptive Tutor (Bayesian Knowledge Tracing)

**Status:** LIVE (2026-09-18) — BKT runs on every real submission, is stored in
`skill_mastery`, and is shown across the app (see §6). This is the feature that moves SkillQuest away from
"LeetCode + Duolingo replica" toward a genuinely differentiated, AI-centric
product. The game layer (XP, streaks, chests) is the *wrapper*; this is the
*engine*.

---

## 1. Why this exists (the differentiation argument)

A code-runner with test cases is LeetCode. XP + streaks + badges is Duolingo.
Both are the most-copied products in ed-tech, and both are the *visible surface*
of SkillQuest today. Adding more game art makes the replica worse, not better,
and earns no AI&DS marks.

The uniqueness — and the actual academic substance — lives in the layer between
the student and the content: **a model of what each student knows, that updates
from their attempts and drives what happens next.** That is an *intelligent
tutoring system* (ITS), and the classic, defensible way to build its core is
**Bayesian Knowledge Tracing (BKT)** — Corbett & Anderson, 1995.

New product thesis:

> SkillQuest is an **adaptive tutor** that models what you know, predicts when
> you'll disengage, and continuously re-plans the shortest path to being
> placement-ready — not a problem bank and not a streak app.

## 2. What BKT is (in plain language)

For each **skill**, BKT tracks a single hidden quantity: `p_mastery` =
P(the student has learned this skill). It is a **2-state Hidden Markov Model** —
the hidden state is *known / not-known*, and each problem attempt is a noisy
observation of that state, because:

- a student who **knows** the skill can still **slip** (careless mistake), and
- a student who **doesn't** know it can still **guess** right.

Four parameters (per skill, or global defaults to start):

| Param | Meaning | Default |
|------|---------|---------|
| `pL0` | P(already knew it before starting) — the prior | 0.20 |
| `pT`  | P(learn it on an attempt) — the "transit" / learning rate | 0.15 |
| `pS`  | P(slip) — knows it but answers wrong | 0.10 |
| `pG`  | P(guess) — doesn't know it but answers right | 0.20 |

### The update (this is the whole algorithm)

On each attempt we observe `correct ∈ {true, false}` (for us: did *all* the
level's tests pass?). Two steps:

**Step 1 — condition on the evidence (Bayes' rule):**

```
correct:    p_obs = p·(1−pS) / [ p·(1−pS) + (1−p)·pG ]
incorrect:  p_obs = p·pS     / [ p·pS     + (1−p)·(1−pG) ]
```

**Step 2 — account for learning during the attempt:**

```
p_next = p_obs + (1 − p_obs)·pT
```

`p_next` is the new stored `p_mastery`. A skill is **mastered** when
`p_mastery ≥ 0.95`. It is closed-form, O(1), fully interpretable — you can walk
an examiner through every number.

## 3. How it plugs into SkillQuest

- **Data in:** every submission already runs the tests. `correct = allPass`
  becomes one BKT observation for `(userId, level.skillId)`.
- **State:** a new table `skill_mastery(userId, skillId, pMastery, attempts,
  correct, lastResult, updatedAt)`. Initialised to `pL0`.
- **Where it runs:** inside the existing submit transaction, next to the XP /
  streak / badge updates — same pure-function pattern as `streak.ts` /
  `badges.ts`, so it is unit-tested with no DB.
- **What it drives (in order of build):**
  1. **Mastery display** — a real "% mastered" per skill on the quest map /
     dashboard (surfaces the AI so the panel sees it). *(surface-the-AI)*
  2. **Skill completion** — a skill advances when `p_mastery ≥ 0.95`, not only
     when every level is ticked. `advanceRoadmap` reads mastery.
  3. **Adaptive difficulty** — pick the next level whose `difficulty` best
     matches current mastery (levels already store `difficulty`).
  4. **Feeds the other models** — mastery + mastery-velocity become features for
     the dropout model and inputs to roadmap re-planning.

## 4. Decisions & alternatives rejected

- **BKT, not Deep Knowledge Tracing (LSTM).** DKT needs large interaction
  datasets we don't have, is a black box (bad for a viva), and LSTM is already
  locked out of scope in the PRD. BKT is interpretable and honest for our data
  scale.
- **BKT, not plain "X of Y levels done."** Counting completions can't tell a
  lucky guess from real mastery, can't express confidence, and can't drive
  adaptive difficulty. BKT gives a *calibrated probability*.
- **Observation = `allPass` (binary).** BKT is a binary-evidence model. Using
  full-pass as "correct" is the cleanest signal; partial `passRatio` is recorded
  separately and can refine the model later.
- **Global default parameters first, per-skill fitting later.** We start with
  literature-standard defaults; parameters can be fit from real attempt logs
  (EM / grid search) in `ml/` exactly like the OULAD experiment — an honest
  upgrade path, not a fake number.

## 5. Likely viva questions

- *What is the hidden state in your HMM?* Whether the student has learned the
  skill (known / not-known); attempts are noisy observations of it.
- *Why can a correct answer still leave mastery below 1?* Because of the guess
  parameter — a right answer might be a lucky guess, so Bayes only raises the
  estimate, never to certainty.
- *Why BKT over an LSTM?* Interpretability, tiny-data honesty, and scope — we
  can explain and defend every parameter; DKT/LSTM we could not, and it's out of
  scope.
- *How does this make the product different from LeetCode?* LeetCode serves a
  static list; SkillQuest estimates per-skill mastery and adapts what it serves
  and re-plans the roadmap from it.
- *How would you validate it?* Held-out prediction of next-attempt correctness
  (AUC), and calibration of `p_mastery` against observed pass rates — the same
  protocol-first discipline as the dropout model.
- *Why isn't a skill "mastered" the moment you finish it?* Because finishing is
  about **content**, mastery is about **evidence**. One clean solve moves the
  estimate 20% → 60%; the tutor needs more evidence before it's 95% sure — and the
  UI says so ("practise more to raise the tutor's confidence").

## 6. As built (2026-09-18)

**Backend**
- `skill_mastery` table (migration `20260913120000_skill_mastery`, applied with
  `prisma migrate deploy`).
- `POST /api/levels/:id/submit` — inside the same transaction as XP/streak/badges:
  read the prior (`pL0` = 0.2 if no row), `bktUpdate(prior, allPass)`, upsert the
  row (`attempts`, `correct`, `lastResult`). Response now includes
  `mastery: { skillId, title, before, after, mastered }`.
- `GET /api/levels/:id` adds `skillTitle` and `mastery` (only once there is
  evidence). `GET /api/roadmap` adds `mastery` per node (same rule).

**Completion vs. mastery (a deliberate decision).** Each skill currently has one
level, so gating progress on 95% mastery would force students to re-solve the same
level three times. So: a skill is **completed** when all its levels pass (this
unlocks the next skill); **mastery** is the tutor's separate probability estimate.
The UI labels them honestly ("Completed — every level passed" + "Tutor's mastery
estimate 60%" + a nudge to practise). When more levels per skill exist, switching
the unlock rule to `isMastered()` is a one-line change in `roadmap/advance.ts`.

**Verified live** (real account, real DB, real Java on Paiza): before — no mastery
rows and no percentage shown; submit `conditionals-01` → accepted 3/3, +50 XP,
mastery **0.20 → 0.60** (exactly the hand-worked value), row persisted, roadmap
returns it, the constellation reads "Conditionals — Completed — every level passed,
60% mastery". Then `methods-01` solved through the UI: the reward shows "Tutor
update · Methods 20% → 60%". Backend 33/33 tests, frontend 22/22.
