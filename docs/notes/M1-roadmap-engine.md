# M1 Notes — Part 1: The Roadmap Engine

> The algorithmic heart of SkillQuest, and the answer to "how does the goal
> actually personalize the plan?" Built as pure, tested logic. This is Part 1 of
> M1; auth + onboarding + the frontend screens follow.

---

## 1. What was built

```
ai-service/app/
├── roadmap.py     # ★ the pure algorithm (no DB, no framework) — fully unit-tested
├── db.py          # reads the skill graph + goal weights from Postgres (psycopg)
└── main.py        # POST /ai/roadmap endpoint = db.py + roadmap.py, behind the key
ai-service/tests/
└── test_roadmap.py  # 7 tests incl. the "goal changes the plan" acceptance test
```

Separating the **pure algorithm** from **database access** is deliberate: the algorithm can be tested exhaustively on tiny hand-made graphs (no database, instant), while `db.py` just feeds it real data.

## 2. How it works — 5 steps

Input: the skill graph (nodes + prerequisite edges), the goal's tag-weight vector, the skills the student tested out of, and hours/week.

1. **Drop tested-out skills.** If the quiz says the student knows a skill, remove it. Its dependents no longer need it as a prerequisite.
2. **Weight each skill from its tags.** For the chosen goal, each skill takes the **highest weight among its tags** (unlisted tags = neutral 1.0). Max — not a product — so a skill can't be inflated just for having many tags.
3. **Drop optional skills.** A skill weighted 0 is dropped *only if no kept skill depends on it*. We compute the "required closure" — every kept skill plus all its ancestors — so a zero-weight skill that a kept skill needs is still scheduled.
4. **Weighted topological sort.** Kahn's algorithm with a priority queue: repeatedly schedule an "unlocked" skill (all prerequisites already placed), and when several are unlocked at once, take the **highest-weighted** first (ties broken by display order, then id, so it's deterministic). Prerequisites are *never* violated — the goal only reorders *choices among already-unlocked* skills.
5. **Pack into weeks.** Walk the ordered skills, filling a week up to `hours_per_week × 60` minutes; when the next skill won't fit, start a new week. Because we never reorder, a skill's prerequisites always land in an earlier (or same, earlier-position) slot.

## 3. Proof it works (live, on the real seeded graph)

Same 19 skills, same 6 hrs/week, only the goal differs:

| | service_placement | product_placement |
|---|---|---|
| Week 2 | arrays, strings, oop-basics, oop-advanced | arrays, **recursion, time-complexity, searching** |
| Week 4–5 | **trees + interview-patterns last** | interview-patterns by week 4 |

The service goal front-loads fundamentals and pushes DSA-heavy topics (trees, patterns) to the end; the product goal pulls recursion/complexity/searching forward. **Different plans from the same graph — with every prerequisite still respected.** This is PRD acceptance criterion F2, demonstrated end to end.

## 4. Decisions worth knowing (viva)

- **Why max (not product) of tag weights?** A product would reward a skill just for carrying several tags and would drift wildly in scale. Max gives a clean "this skill's best reason to be prioritized," bounded by the weights themselves.
- **Why is it deterministic?** No randomness, no ML here. Given the same inputs it always yields the same plan — which is exactly what you want to *explain* in a viva ("the goal changes priorities; prerequisites are inviolable"). It's a weighted topological sort, a classic algorithm.
- **How are prerequisites guaranteed?** A skill is only ever placed after all its prerequisites (that's what topological sort means); the weighting only affects the order among skills that are *already* free to schedule.
- **What if the graph had a cycle?** The sort can't place every node and the engine raises — but the seed script already refuses to load a cyclic graph, so it can't happen at runtime.

## 5. Likely viva questions

**Q: "How is the roadmap personalized — isn't it the same for everyone?"**
No. Three inputs change it: the quiz (skills you test out of are dropped), your hours/week (how many skills fit per week), and your goal. The goal carries a weight per skill-tag; a weighted topological sort schedules higher-weighted skills earlier when there's a choice. We can show two students with identical quiz results and hours but different goals getting different plans.

**Q: "Is there a neural network deciding the order?"**
No — and that's on purpose. It's a deterministic weighted topological sort, so it's fully explainable and reproducible. ML is used elsewhere (disengagement risk), where it's actually warranted.

**Q: "What stops it from putting recursion before loops?"**
The prerequisite edges. Recursion depends (transitively) on loops, and a topological sort never places a skill before something it depends on. The goal weights can reorder *independent* skills, never dependent ones.

---

# M1 Notes — Part 2: Goal Mapping (NLP module #1)

## What was built
`ai-service/app/goal_map.py` (+ `embeddings.py`, `POST /ai/goal-map`, 3 tests). Turns the student's free-text goal into a goal category, which feeds the roadmap engine.

## How it works
1. We keep a one-sentence **description of each goal category** (service placement, product placement, higher studies).
2. We **embed** the student's text and each description into vectors with a small ONNX model (`fastembed`, `bge-small-en-v1.5`, 384 dims).
3. We take the category whose description is **most similar** (cosine similarity) to the student's text.
4. If the best similarity is **below 0.35**, we don't trust it and fall back to the neutral `general_placement` — a balanced plan beats a confidently wrong one.

The matching logic is pure and tested with injected vectors; the model lives in `embeddings.py` and loads lazily (nothing downloads until the first real call), so importing the app and running tests stays light.

## Proof it works (real model)
| Student text | → category (confidence) |
|---|---|
| "crack the Infosys and TCS campus placement" | service_placement (0.69) |
| "top product company like Google, strong in DSA" | product_placement (0.67) |
| "preparing for GATE and a master's" | higher_studies (0.82) |

## Why fastembed, not sentence-transformers? (viva)
Same model, a fraction of the memory — fastembed runs it through ONNX with no PyTorch, so it fits the free hosting tier's ~512 MB. This was a deliberate stack choice in the TRD.

## The onboarding AI flow now exists end to end
`free-text goal → /ai/goal-map → goalCategory → /ai/roadmap → personalized plan`. Both halves are built and tested; onboarding (next) just collects the inputs and calls them through the Web API.

---

# M1 Notes — Part 3: Roadmap Screen (frontend)

## What was built
`frontend/src/features/roadmap/` — the roadmap screen (S5), against mock data for now:
- `types.ts` — the `RoadmapNode` shape the Web API will return (skill + week + status).
- `SkillNodeCard.tsx` — one skill tile, with four visual states (completed / current / available / locked). Meaning is carried by an **icon + text label**, never colour alone (colour-blind safe). Min 44px target, visible focus ring, and the "current" tile pulses but stops under `prefers-reduced-motion` — all from the UI/UX doc's accessibility rules.
- `RoadmapView.tsx` — groups the plan into weeks and renders them top-to-bottom (works on phone and desktop).
- 3 component tests + the App test (4 total) verify weeks render, locked skills are disabled, and clicking a skill reports its id.

## Not throwaway
Only the **data source** changes later: today `App.tsx` feeds it `MOCK_ROADMAP`; once auth + the Web API are wired, the same components render `/ai/roadmap` output joined with the student's real progress. The layout, states, and accessibility are done.

---

# M1 Notes — Part 4: Backend Auth + Onboarding API

## What was built
- `auth.ts` — verifies the Supabase access token and attaches the user id to the request.
- `aiClient.ts` — calls the AI service (`/ai/goal-map`, `/ai/roadmap`) with the internal key.
- `routes/` — `GET /api/me`, `POST /api/onboarding/complete`, `GET /api/roadmap`.
- `events.ts`, `http.ts` (async error wrapper), a central error handler.

## How auth works (the important part)
Supabase signs each logged-in user's access token with **HS256 using the project's JWT secret**. Our backend has that secret, so it verifies the token **locally** — no call back to Supabase per request. From the verified token we read `sub` (the `auth.users` UUID); that UUID *is* `profiles.id`, which is why creating a profile satisfies the `auth.users` foreign key. The anon/public key is also a signed JWT but has **no `sub`**, so we reject it — only real users get in.

## The onboarding call, end to end
`POST /api/onboarding/complete` is the one call the wizard makes at the end:
1. free-text goal → `/ai/goal-map` → `goalCategory`
2. `goalCategory` + hours + tested-out → `/ai/roadmap` → the plan
3. profile answers + quiz attempts + target companies + the new roadmap are all saved in **one transaction** (so a mid-way failure leaves nothing half-written), and `onboarding_step` is set to 5.

The browser never calls `/ai/*` — it only calls this Web API route, which is the single gateway.

## Proof (live, against the real DB + AI service)
Using a minted token for a real auth user:
- `GET /api/me` → profile created, `onboardingStep = 0`; a **garbage token → 401**.
- `POST /api/onboarding/complete` with goal "crack the Infosys and TCS placement" → `goalCategory: service_placement`, **19 skills across 5 weeks** persisted.
- `GET /api/roadmap` → 19 nodes with real titles, first one `current`, rest `locked`.

## Likely viva questions
**Q: How does your backend know who the user is?**
Every request carries the Supabase access token. We verify its HS256 signature with our project's JWT secret and read the user id from it — locally, so there's no per-request round-trip to Supabase. Unauthenticated or tampered tokens get a 401.

**Q: Why is onboarding one endpoint and one transaction?**
The plan, the profile, the quiz answers, and the target companies must all succeed together — a roadmap saved without the profile marked complete (or vice-versa) would be a broken state. Wrapping them in a transaction makes it all-or-nothing.

---

# M1 Notes — Part 5: Frontend Auth + Onboarding (M1 complete)

## What was built
- `lib/supabase.ts` — the Supabase client (auth only).
- `lib/api.ts` — one wrapper that attaches the user's access token to every Web API call.
- `auth/AuthProvider.tsx` — React context holding the session, kept in sync with sign-in/out/refresh.
- `screens/AuthScreen.tsx` — email/password sign-in + sign-up.
- `screens/OnboardingWizard.tsx` — 5-step wizard: about you → 12-question quiz → hours → companies → goal → submit.
- `features/onboarding/scoring.ts` (+ quiz bank) — pure quiz scoring (4 tests): a topic is tested out of **only** when all its questions are right.
- `screens/RoadmapScreen.tsx` — fetches the real plan from `GET /api/roadmap`.

## How the whole flow hangs together
`App.tsx` picks the screen from two facts — is there a session, and is `onboarding_step` 5?
```
not signed in            -> AuthScreen
signed in, not onboarded -> OnboardingWizard  (submits -> re-fetch profile)
signed in and onboarded  -> RoadmapScreen (live data)
```
No router yet — three states are cleaner as a conditional. Routing comes when dashboard/play/placement screens arrive.

## Auth in one place
Every data request goes through `api()`, which reads the current Supabase token and adds `Authorization: Bearer`. The backend verifies it. The browser only ever holds the anon key (which RLS makes powerless) and the user's own token.

## To try the full click-through (team)
Run **both** servers and the frontend:
```
backend:    npm run dev         (needs .env)
ai-service: uvicorn app.main:app --port 8000   (needs .env)
frontend:   npm run dev
```
**One Supabase setting for testing:** email confirmation is ON by default, so a new sign-up can't sign in until confirmed. For development, either confirm via the email link, or turn off Supabase → Authentication → Providers → Email → "Confirm email". (The backend flow itself is already verified end-to-end.)

## ✅ M1 is complete
Auth, onboarding (goal-map + quiz + roadmap generation + persistence), and the roadmap screen on live data are all built and green in CI. Backend verified end-to-end against the live DB + AI service; frontend typechecks, tests, and builds.

## What's next — M2 (the vertical slice)
The play screen: Monaco editor + the `ExecutionService` (mock first, then Judge0) + XP on pass. This is the make-or-break milestone.

---

## Update (2026-09-20): goal-mapping descriptions rewritten

Live testing on the deployed app showed the mapper sending ordinary placement
goals to **higher_studies** — e.g. "Improve my Java basics for placements" and
"I want to join a good software company after my degree". Two causes, both in
the category *descriptions* the student's text is compared against:

1. The higher-studies description ended with "rather than placement
   preparation". Embeddings have no notion of *not*: that sentence simply made
   the category look similar to anything mentioning placements.
2. The product description opened with "Cracking coding interviews", so
   "Crack the Infosys and TCS coding rounds" matched it instead of the service
   category that names those very companies.

The three descriptions were rewritten to be positively phrased and clearly
distinct (company names and exam names where they help, no negations).
Measured on 10 realistic student goals: **6/10 → 9/10** correct. The remaining
one maps an "AI & Data Science career" sentence to product rather than service
placement; both are placement plans, so the roadmap stays sensible.

The cases are kept as an opt-in test (they need the real model):
`SQ_EMBED_TESTS=1 pytest tests/test_goal_map_quality.py -q`.

**Viva point:** this is a good example of how embedding similarity differs from
reading comprehension — the fix was in the wording being matched against, not in
the algorithm.
