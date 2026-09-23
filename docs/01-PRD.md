# SkillQuest — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | SkillQuest — AI-Powered Gamified Skill Learning Platform |
| **Version** | 1.4 — course order: every lesson and level uses only topics already taught (checked in CI); 57 levels. (1.3 added the `exceptions` skill and concept checks from the team's Java OOP question bank.) |
| **Team** | Nandan S (1SP23AD016), Anjith K.J (1SP23AD032), Bhanushree C.V (1SP23AD005) |
| **Institution** | S.E.A College of Engineering & Technology, Bangalore — Dept. of AI & DS, VTU |
| **Timeline** | Single semester (~14 working weeks) |
| **Status** | Approved scope — locked. Changes require team agreement + update to this doc. |

---

## 1. Problem Statement

Engineering students in tier 2–3 Indian colleges face three compounding problems:

1. **Generic content** — platforms like Coursera, NPTEL, and YouTube deliver the same material to every learner regardless of their goal, current level, or available time.
2. **Passive learning → dropout** — self-paced video courses have very high abandonment rates; watching is not doing.
3. **No placement visibility** — students discover their skill gaps only during placement season, when it is too late to fix them.

SkillQuest addresses all three: it learns the student's goal at onboarding, teaches through interactive coding challenges instead of videos, flags disengagement early so it can intervene, and continuously shows how much of a company's published role requirements the student currently covers.

## 2. Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | Teach one complete placement-oriented skill track (Java + DSA) through hands-on coding games | ≥ 40 playable levels live at launch |
| G2 | Personalize the learning path per student | Roadmap differs based on goal, self-assessed level, and hours/week |
| G3 | Detect disengaging learners early | Risk model trained on OULAD, evaluated with PR-AUC against three baselines under student-grouped and temporal splits; same feature pipeline running live on our platform |
| G4 | Make role skill coverage visible at all times | Tracked-skill coverage (0–100%) per company role profile, updated after every completed level; gaps classified available-now vs external |
| G5 | Keep students coming back | XP, streaks, and badges implemented; engagement events logged |

## 3. Non-Goals (Out of Scope — Do Not Build This Semester)

These are deliberately excluded to keep the project deliverable in one semester. Listing them here is what protects the timeline.

- ❌ **Visual drag-and-drop puzzle game engine** (second game type) — code-to-solve only.
- ❌ **Multiple skill tracks** (web dev, ML, etc.) — Java + DSA only. The data model must *support* more tracks; we just don't author their content.
- ❌ **Free-form conversational AI chatbot for onboarding** — structured form + one free-text goal field instead.
- ❌ **Resume bullet generator** — stretch goal only if everything else ships.
- ❌ **LSTM sequence model for dropout** — Random Forest is the deliverable; LSTM is a stretch/comparison experiment for the report.
- ❌ **Mobile app** — responsive web only.
- ❌ **Peer features** (chat, forums, team quests).

## 4. Target Users

**Primary persona — "Placement-anxious 3rd/4th-year student"**
- BE student in a tier 2–3 college, CS/AI/IT branch, targeting service-company placements (Infosys, TCS, Wipro, Accenture, Cognizant).
- Knows basic C/Python syntax from coursework but cannot solve interview-style problems.
- Has 5–10 hrs/week; loses motivation with long video courses.

**Secondary persona — "Early starter"**
- 2nd-year student who wants a structured path early; same product, longer roadmap.

## 5. Core Features & Priorities

Priority key: **P0** = must ship (project fails without it) · **P1** = should ship · **P2** = stretch.

### F1 — Onboarding & Goal Capture (P0)
- Supabase Auth email/Google sign-in.
- Research consent screen (Backend Schema §5.1) before any data collection.
- Onboarding wizard: branch, year, placement quiz (**12 questions — 3 per topic**; a topic is skipped only on 3/3, since one question is far too weak to skip a fundamental), hours available per week, target companies (multi-select), and **one free-text field**: "Describe your career goal in your own words."
- The free-text goal is mapped to a goal category using sentence embeddings (NLP module #1), which then drives the roadmap's skill weights (F2).
- Every quiz answer is persisted with its question version, so test-out decisions are reproducible and the quiz can be evaluated in the report.
- **The quiz is graded on the server.** Each question shows a short program and asks what it prints (reading code, not recalling keywords); the wrong options are the usual mistakes. The browser receives the questions without their answers and sends back only the options picked; the API decides what is correct, which topics are tested out and the skill level. Every question's program is compiled and run in CI (`content/verify-quiz.mjs`), and must print exactly its marked answer.
- **Acceptance:** two students with different quiz results and hours/week receive visibly different roadmaps.

### F2 — Personalized Roadmap (P0)
- Skills are stored as a **prerequisite DAG** (directed acyclic graph): e.g., `variables → loops → functions → recursion → …`. The track holds **20 skills**: 10 Java fundamentals (including exception handling) and 10 DSA topics.
- The roadmap engine applies **goal-specific skill weights**, then does a weighted topological sort (prerequisites always respected; the goal only orders choices among currently-unblocked nodes), drops zero-weight optional nodes, and packs the rest into weeks by hours/week. Full algorithm in TRD §6.2.
- The goal must **demonstrably** change the plan — otherwise the personalization claim is dropped from this document.
- Rendered as an interactive node tree on the dashboard: completed / current / locked states.
- **Acceptance:** (a) roadmap regenerates correctly when hours/week changes; (b) two students with identical quiz results and hours, differing only in goal category, receive measurably different node orderings — evidenced in the report.

### F3 — Code-to-Solve Game Engine (P0)
- Monaco editor in the browser; each level = problem statement + starter code + hidden test cases.
- Code execution via **Judge0** (hosted API or self-hosted) — never executed on our own backend.
- Per-level: pass/fail per test case, XP award on full pass, hint system (hint costs a small XP amount — gamified help).
- **Two ways to run code.** *Run examples* runs the visible tests only and records nothing (no attempt, no XP, no mastery change, no streak), so students can debug freely. *Submit* runs every test, hidden ones included, and is what counts; submitting the untouched starter code is refused. **Only a level's first Submit updates the BKT mastery estimate** (the first-attempt rule of knowledge tracing): later submits still complete the level, earn XP and keep the streak, but cannot move mastery. Before this, one solved level submitted three times read as "mastered" (0.20 → 0.60 → 0.89 → 0.98).
- **Content commitment: 40–50 levels** across the Java + DSA track (this is a team-wide authoring task, not just engineering). **Delivered: 57 levels across 20 skills**, every expected output machine-verified (`content/verify-levels.mjs`), and no level asks for a topic the student hasn't been taught yet (`content/check-order.mjs`, see F8).
- **Acceptance:** a student can complete a level end-to-end — read problem, write code, run tests, earn XP. Timing requirement: **UI acknowledges the run in < 200 ms**; **p95 end-to-end test execution < 15 s** (JVM startup per test case makes anything faster infeasible — see TRD §5). Actual p95 is measured during UAT and reported.

### F4 — Gamification Layer (P0)
- **XP** for level completion and daily activity; **levels/ranks** derived from XP.
- **Streaks** — consecutive active days, with a warning state on the dashboard before a streak breaks.
- **Badges** — First Quest, Week Warrior (7-day streak), Code Master (complete a skill node with no hints), Placement Ready (score ≥ 75).
- **Acceptance:** every XP/streak/badge event is written to an events log (this log doubles as the dropout model's live feature source).

### F5 — Disengagement Risk Indicator (P0 — the flagship AI module)
- Experiment: models **trained on OULAD** (Open University Learning Analytics Dataset) — Random Forest and logistic regression. Task: given a 28-day observation window, predict disengagement in the following 21 days. Full protocol — labels, splits, baselines, metrics — in TRD §6.3; results in `ml/results/risk-model-fs-v2.md`.
- **Framed as an experimental transfer-based risk indicator, not a locally validated dropout predictor.** OULAD is UK distance-learning; our users are Indian undergraduates. This qualifier appears in the report, on charts, and in the viva.
- Must beat three baselines (majority class, days-since-last-activity threshold, logistic regression) or the honest comparison is itself the reported finding. **Outcome:** neither trained model beat the days-since-activity rule — the Random Forest lost to it, and the logistic regression's edge (+0.0038 PR-AUC, 95% CI [−0.0008, +0.0092]) includes zero. So **the rule is what runs live** (7+ days without practice = Watch, 14+ = At Risk), and the trained models are reported as the experiment.
- On SkillQuest, the feature row is computed weekly from the events log; each student is flagged **At Risk / Watch / Healthy**, with scorer version and window dates stored per prediction for reproducibility. **Practice** means graded level submissions and lesson answers only (logins, page views and seeing a nudge don't count), every feature is computed inside the 28-day window, and students are scored only once they finished onboarding at least 28 days ago.
- Intervention: at-risk students get an in-app nudge (encouragement + an easier "confidence booster" level). Nudge shown/clicked/dismissed are logged. Email nudges = P1.
- **Acceptance:** risk tier visible on an internal admin view; nudge fires when tier changes to At Risk; every prediction is reproducible from its stored metadata.
- **Not claimed:** that the intervention reduces dropout. 20–30 students with no control group cannot support that, and the report says so explicitly.

### F6 — Placement Readiness Tracker (P0)
- Company role profiles (Infosys, TCS, Wipro, Accenture, Cognizant) curated from **public job descriptions, each recorded with source URL, role title, location, collection date and profile version** — so every number in the report is traceable to a citable source and a date.
- Score = **weighted coverage** of a role's required skills by the student's completed skills (deterministic arithmetic; embeddings assist the JD-phrase → skill mapping at ingestion, not at scoring time — TRD §6.4).
- **Displayed as:** `Placement Readiness — 62% tracked-skill coverage`, with the standing subtitle *"Based on published requirements currently represented in SkillQuest. Not a hiring prediction."* The phrasing "You're 62% ready for Infosys" is **banned** from UI, report and viva — it implies a hiring probability we cannot support.
- **Gaps are shown in full, and classified:**
  - `Available now` — SkillQuest teaches it; renders a **"Train this →"** action deep-linking to the roadmap node.
  - `External / future track` — a genuine role requirement (e.g. SQL, OS fundamentals) that SkillQuest does not teach yet; shown as **information only, with no action button**.
- Showing external gaps is deliberate: knowing a requirement exists is useful even when we can't close it. A button that leads nowhere is not. The scoring model is track-agnostic — additional tracks are future work, which is also the honest answer to "why only Java?" in the viva.
- **Acceptance:** completing a level visibly moves the score; the gap list updates; no `external_track` gap ever renders a "Train this" button.

### F7 — Leaderboard (P1)
- Weekly XP leaderboard among users. Ship only after F1–F6 are stable.

### F8 — Learn mode (P1)
- Every topic (skill) opens with a ~5-minute interactive lesson before its levels, following PRIMM (Predict → Run → Investigate → Modify → Make): predict a program's output, step through it line by line (traces recorded from the real JVM), key ideas, a second prediction, fill in a missing line, then the topic's first level.
- **No passive content** — no videos or long notes (see Problem §2); every step asks the student to act.
- Adaptive: tested-out topics are skipped by the roadmap; high-mastery students are offered a recap or skip; first answers update BKT mastery with multiple-choice parameters.
- Answers are checked server-side; fill-in answers not in the accepted list are actually executed.
- Lessons may also ask a **concept question** (theory: MCQ or true/false) after the teaching, taken from the team's Java OOP question bank (`content/questions/java-oop.json`) — the kind of thing service-company MCQ rounds test and code-only levels cannot.
- **Watch it run is shown, not written.** The recorded execution is animated rather than listed: a green/red chip marks the result of the condition just tested, an arrow in the gutter shows a loop going round again or a block being skipped, changed numbers count to their new value, output types out, call frames slide on and off the stack with the returned value landing in the caller, and searching/sorting lessons draw the array itself with its pointers. Every mark is derived from the recording and stays hidden whenever the trace cannot prove it (`frontend/src/features/learn/traceAnalysis.ts`), so the picture can never contradict the JVM. Students who prefer stillness can switch the movement off in **Settings → Animations**, which also respects the device's own reduce-motion setting.
- **Taught before tested.** No lesson or level may use a topic the student hasn't been taught: the code they read or must write uses only what the topic itself and its prerequisites teach. A student meeting `for` loops and arrays in lesson 1 is lost before the idea lands. Enforced in CI by `content/check-order.mjs`. To stop a typed-in answer passing a fill-in without resorting to loops, a fill step may carry **hidden cases** — other values the checker also tries (see docs/notes/M10-course-order.md).
- **Acceptance:** all 20 topics have a lesson whose every expected output is machine-verified; a new student can go lesson → first level in one flow; lesson start / answer / complete / skip are logged. Design: docs/notes/M7-learn-mode.md, alignment: docs/notes/M8-syllabus-alignment.md, animation layer: docs/notes/M9-watch-it-run.md.

### F9 — Stretch (P2)
- LSTM dropout model comparison (report material), resume bullet generator, email nudges, faculty/TPO dashboard.

## 6. Success Metrics (measured in final testing, weeks 12–14)

- 40+ levels playable; full user journey (signup → roadmap → 5 levels → score update) demo-able without errors.
- Risk model: PR-AUC, confusion matrix and per-class precision/recall on both the student-grouped and temporal OULAD splits, reported against all three baselines (no invented numbers — whatever we measure is what we report).
- User acceptance test with **20–30 real students** from college: SUS score, engagement rating, would-recommend %, plus nudge interaction counts. Adequate for preliminary usability findings; **explicitly not** sufficient to demonstrate dropout reduction.
- API latency: p95 < 500 ms for platform APIs; code execution reported separately (p95 < 15 s, measured).

## 7. Constraints & Assumptions

- **Budget ≈ ₹0**: free tiers only — Vercel, Render, Supabase (Postgres + Auth), Judge0 free tier (rate-limited; self-host if limits bite).
- **Team of 3**, ~14 working weeks, alongside regular coursework.
- Content authoring (problems + test cases) is on the critical path and is scheduled like an engineering task.
- OULAD is publicly available for academic use. **Its transfer to our population is an assumption, not a finding** — UK adult distance-learning vs Indian undergraduate coding practice. Documented as a limitation in the report, never asserted as validation.

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Content authoring falls behind | No game = no product | Start authoring in week 1 in parallel with dev; 3 levels/person/week quota; reuse classic DSA problems |
| Judge0 free-tier rate limits during demo | Demo failure | Self-host Judge0 fallback; cache results for identical submissions |
| Scope creep (adding cut features back) | Nothing finishes | Any scope change requires editing §3 of this doc + all 3 members agreeing |
| Free-tier cold starts (Render) slow demos | Bad first impression | Ping/warm-up script before demos; document as infra limitation |
| Risk model looks "disconnected" from platform to examiners | Viva risk | Live demo shows the events log → weekly features → model score pipeline on a real user |
| Overclaiming results (accuracy, hiring readiness, intervention effect) | Fails the viva | Stated protocol (TRD §6.3), baselines reported alongside, explicit limitations section, banned phrasings listed in this doc |
| Judge0 free tier cannot support even one pilot | No user testing | Self-host and load-test by week 6, not week 10 |
| Single-owner bottleneck on backend + ML | Project stalls if one person is unavailable | Placement module owned end-to-end by a second member; shared AI-service knowledge |

## 9. Release Plan (single semester)

- **Weeks 1–2** — Repo setup, OULAD baselines + first RF under the §6.3 protocol, skill graph, content authoring begins, ethics-approval question answered.
- **Weeks 3–4** — Consent + auth + onboarding + roadmap; **pilot #1 (5 students)**.
- **Weeks 5–6** — Game engine on **self-hosted, load-tested Judge0**; atomic XP; **pilot #2**; 18 levels.
- **Weeks 7–9** — Gamification + events log; risk scoring live; placement coverage; **pilot #3**.
- **Weeks 10–11** — Leaderboard (P1), polish, accessibility pass, 40+ levels, bug bash.
- **Weeks 12–13** — UAT with 20–30 students; fix findings; collect metrics; write results + limitations.
- **Week 14** — Freeze, final report/demo prep.

Full detail in [06-IMPLEMENTATION-PLAN.md](06-IMPLEMENTATION-PLAN.md).
