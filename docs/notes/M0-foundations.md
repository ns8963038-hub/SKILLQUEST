# M0 Notes — Part 1: Backend Foundation & Database Schema

> Notes written alongside the code so you can read, understand, and defend it.
> Format per section: **what was built · how it works · why this way · likely viva questions.**
> This is Part 1 of M0 (backend + schema). Frontend, AI service, ML notebook, and CI follow in later parts.

---

## 1. What was built

```
backend/
├── package.json          # Node 22, Express, Prisma, zod, TypeScript, vitest
├── tsconfig.json         # strict TypeScript, run directly via tsx (no build step)
├── eslint.config.js      # linting
├── .prettierrc           # formatting
├── vitest.config.ts      # test runner config
├── .env.example          # the env vars you must fill in (copy to .env)
├── prisma/
│   └── schema.prisma     # ★ the whole database — 21 tables, implements doc 05
└── src/
    ├── env.ts            # validates environment variables at startup (zod)
    ├── db.ts             # the shared Prisma database client
    ├── app.ts            # the Express app + /health endpoint
    ├── index.ts          # starts the server
    └── app.test.ts       # a test proving /health works
```

**Verified working:** `npm install` → `prisma generate` → `tsc --noEmit` (typecheck) → `vitest` (test) all pass. The Prisma client generating cleanly means all 21 tables, their relations, and enums are valid.

---

## 2. How the backend skeleton works

The request path is: **server starts (`index.ts`) → builds the app (`app.ts`) → app talks to the database (`db.ts`)**, with `env.ts` validating configuration before any of that runs.

- **`env.ts`** reads environment variables (port, database URL, secrets) and validates them with **zod**. If something required is missing or malformed, the app fails immediately at startup with a clear message — not with a mysterious crash five minutes later. Right now the fields are optional so the skeleton boots before Supabase exists; they become required as each feature starts using them.
- **`db.ts`** creates one shared **Prisma client** (our typed gateway to Postgres). We cache it on `globalThis` because `tsx watch` reloads files on every save during development, and without the cache each reload would open a brand-new database connection pool until we run out.
- **`app.ts`** builds the Express app: `helmet` (safe HTTP headers), `cors` (only lets our own frontend call the API), `express.json` (parses JSON request bodies), and the `/health` route. It's a separate function from `index.ts` so tests can spin up the app **without** opening a real network port.
- **`/health`** returns `{ status: "ok", db: "up" | "down" }`. It runs a trivial `SELECT 1`. This has a second job: it's the **keep-alive**. Supabase's free tier pauses a project after 7 days idle, so a scheduled ping to `/health` keeps it awake (TRD §8). It never throws — if the DB is unreachable it reports `"down"` instead of erroring, so a monitoring ping always gets an answer.

---

## 3. The database schema — the important part

`prisma/schema.prisma` is the runnable version of [05-BACKEND-SCHEMA.md](../05-BACKEND-SCHEMA.md). 21 tables. A few things to understand:

### 3.1 snake_case ↔ camelCase
Postgres columns are `snake_case` (`total_xp`), but TypeScript reads nicer in `camelCase` (`user.totalXp`). Prisma bridges this: `@map("total_xp")` on a field and `@@map("profiles")` on a model. So the database stays conventional and the code stays idiomatic — you get both.

### 3.2 The shape of the data (how the tables connect)
- **`Profile`** is the centre — one row per student, linked to Supabase's login table by a shared UUID. Almost everything hangs off it.
- **`Skill` + `SkillPrerequisite`** are the DAG (the skill graph). `SkillPrerequisite` is an edge list: each row says "skill X needs prereq Y". A skill has two relations to it — its own prerequisites, and the skills that require it.
- **`Level` + `TestCase`** are the playable content. A level has many hidden/visible test cases.
- **`Roadmap` + `RoadmapItem`** are the generated plan; **`UserLevel`** tracks per-level progress; **`Submission`** logs every code run; **`Event`** is the behavioural log that feeds the ML model.
- **`Company → CompanyRoleProfile → CompanySkill`** is the placement data, with JD provenance on the role profile.
- **`DropoutScore`, `PlacementScore`, `QuizAttempt`, `Nudge`** store AI outputs and the evidence for the claims we make.

### 3.3 Decisions I made while implementing (deviations from the doc — all deliberate)

The schema doc specified some things using raw SQL features. Prisma's schema language can't express all of them, so a few were implemented differently. **These are the things an examiner might ask about, so know them:**

| Doc said | Implemented as | Why |
|---|---|---|
| `text` columns with `CHECK (... in (...))` for status/tier/verdict | **Postgres enums** (`SkillLevel`, `RiskTier`, `Verdict`, …) | An enum enforces the same closed set at the DB level **and** gives TypeScript autocomplete + compile-time checking. Strictly stronger than a text+CHECK column. |
| `bigint` IDs on high-volume tables (`events`, `submissions`) | **`Int`** (max ~2.1 billion) | At our scale (tens of users) Int is far more than enough, and it avoids JavaScript's awkward `BigInt` type (which doesn't serialize to JSON without extra handling). Migrating to BigInt later, if ever needed, is a one-line change. |
| `numeric` for ratios/weights/probability | **`Float`** (plain `number` in TS) | Prisma's `Decimal` type is a special object, not a number — more friction for exact values we don't need. Ratios and probabilities don't need decimal-exactness. `score` stays `Int` (0–100). |

**Four things Prisma genuinely can't express**, so they go into a **follow-up raw-SQL migration** (not yet written — it's the next backend task):
1. **Numeric CHECK constraints** — `probability BETWEEN 0 AND 1`, `score BETWEEN 0 AND 100`, `hours_per_week BETWEEN 1 AND 40`, etc.
2. **The partial unique index** — "one active roadmap per user" (`UNIQUE(user_id) WHERE is_active`).
3. **The FK to `auth.users`** — `profiles.id REFERENCES auth.users(id)`. Prisma doesn't manage Supabase's `auth` schema, so this link is added in SQL.
4. **The self-loop guard** — `CHECK (skill_id <> prereq_id)` on prerequisites.

These are all in the schema doc; they're just enforced one layer down. The atomic XP award (doc §3.7) is application logic, written when we build level completion — not a schema feature.

### 3.4 What is NOT enforced by the database, and must be enforced in code
- **Authorization** (owner checks, `is_admin`): the API connects as a privileged DB role, so Row Level Security doesn't apply to it — the app must check "is this the user's own data?" on every request. (Backend Schema §5.)
- **Atomic XP**: the conditional-update-in-a-transaction pattern (Schema §3.7) is code, added at level-completion time.

---

## 4. How to run it (for the team)

```bash
cd backend
npm install                 # once
cp .env.example .env        # then fill in DATABASE_URL etc. once Supabase exists
npx prisma generate         # regenerate the typed client after any schema change
npm run typecheck           # tsc, catches type errors
npm test                    # runs the health test
npm run dev                 # starts the API on http://localhost:4000
```

`npm run dev` works **before** Supabase is set up — `/health` will just report `db: "down"`. Once `DATABASE_URL` points at a real Supabase project and we've run the first migration, it flips to `"up"`.

Note: we run TypeScript **directly with `tsx`** in both dev and production — no compile/build step. Simpler for a project this size; one less thing to explain and one less thing to break.

---

## 5. Likely viva questions (with answers)

**Q: Why Prisma instead of writing SQL yourself?**
Prisma generates a fully-typed client from the schema, so the database structure and the code can't drift apart — a wrong column name or a missing field is a compile error, not a runtime crash. It also handles migrations (versioned schema changes) for us. We still drop to raw SQL for the few things Prisma can't express (CHECK constraints, the atomic XP transition).

**Q: Why enums instead of plain text columns?**
A Postgres enum guarantees the column can only hold one of the allowed values — the database rejects anything else. On top of that, Prisma turns it into a TypeScript type, so the editor autocompletes the valid values and flags typos before the code even runs. It's the same guarantee a CHECK constraint gives, plus type safety.

**Q: How do you stop one user reading another user's data?**
Two layers. Row Level Security is enabled on every table so the browser's public key can read nothing directly. All data goes through our API, which connects with a privileged role and checks ownership in code on every request (is this row's `user_id` the logged-in user?). Admin-only routes additionally check the `is_admin` flag.

**Q: The events table — what's it for?**
It's an append-only log of everything a student does (logins, submissions, hints, completions). It's the single source that the weekly dropout-risk features are computed from — one `GROUP BY user_id` gives us activity counts, gaps, and completion ratios. That's the main reason we chose Postgres over a document database: these aggregations are trivial in SQL.

**Q: How is the health check also a keep-alive?**
Supabase's free tier pauses a project after 7 days of inactivity. `/health` runs a `SELECT 1`, so a scheduled ping (every few minutes during demo weeks) keeps both the Render service warm and the Supabase project awake, with one mechanism.

---

## 6. M0 status

- [x] Backend foundation + full Prisma schema (this doc, Part 1)
- [x] Follow-up SQL migration — CHECK constraints, partial unique index, `auth.users` FK, RLS (Part 2 below)
- [x] AI service skeleton (FastAPI `/health` + internal-key gateway)
- [x] Frontend skeleton (Vite + React + Tailwind, UI-doc palette)
- [x] CI workflow (lint + typecheck + test on all three services) — green
- [x] Schema applied to the live `skillquest-dev` database; `/health` returns `db: up`
- [x] OULAD ML pipeline (baselines → Random Forest, protocol order) — see [ml/README.md](../../ml/README.md)
- [ ] Run the OULAD experiment on the real dataset *(team: download OULAD, `python run_experiment.py`)*
- [ ] Content: `skills.json` (skill graph) + 6 seed levels *(team task; format set up next)*
- [ ] Ethics-approval question to the guide *(team)*

---

# M0 Notes — Part 2: Live Database & the Rest of M0

## 7. The two migrations

Prisma migrations are versioned SQL in `backend/prisma/migrations/`, committed to the repo and applied in order.

- **`..._init`** — generated by Prisma from `schema.prisma`: creates all 21 tables, enums, indexes, and foreign keys.
- **`..._integrity_rls_constraints`** — hand-written SQL for the things Prisma's schema language can't express (this is the file to read if asked "how did you enforce X?"):
  - **Row Level Security** enabled on all 21 tables, **with no policies**. Our API connects as the table owner, which bypasses RLS, so it keeps working. The browser's anon key gets no policy → it can read *nothing* directly. This is the actual protection behind "all data goes through the API."
  - **20 CHECK constraints** — ratios in [0,1], score in [0,100], hours in [1,40], non-negative XP, etc. The database itself now rejects impossible values.
  - **Partial unique index** — "one active roadmap per user" (`WHERE is_active`), so history is kept but only one roadmap is current.
  - **Self-prerequisite guard** — a skill can't require itself.
  - **`auth.users` foreign key** — links a profile to its Supabase login, cascading on delete.

### The one clever bit (worth understanding for the viva)
Prisma validates every migration on a throwaway **shadow database** before touching the real one. That shadow DB is a bare Postgres with **no Supabase `auth` schema**, so an unconditional `REFERENCES auth.users` fails there. The fix: wrap that one statement in a check —

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='auth') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
```

It's skipped on the shadow DB (no auth schema) and runs on the real Supabase DB. Verified present on the live database.

## 8. One deliberate deviation: least-privilege DB roles (deferred)

The TRD (§4.2) and Backend Schema (§5) describe two least-privilege Postgres roles (`skillquest_api`, `skillquest_ai`). **We deferred these**, on purpose:

- On Supabase, custom Postgres roles must also be registered with the connection pooler (Supavisor); getting that wrong breaks connections — a bad failure mode right before a demo.
- The marginal security benefit at ~30 users is small, and the **main** protection (RLS-with-no-policy, so a leaked anon key reads nothing) is already in place.

So both services currently connect as the project's `postgres` role. Adding the split roles later is a self-contained hardening step. This is called out here so it's a documented decision, not a silent gap — and it's a fair, honest answer if an examiner asks.

## 9. The other three services (quick reference)

- **AI service** (`ai-service/`, FastAPI, Python 3.11): public `/health`; every real endpoint will depend on `require_internal_key`, which rejects any request missing the shared `X-Internal-Key`. That's the gateway rule enforced in code — the browser can never reach the AI service directly.
- **Frontend** (`frontend/`, Vite + React + Tailwind): the UI-doc palette lives in `tailwind.config.js`, including the **two violet tokens** (`primary-fg` for text on dark, `primary-bg` for buttons) — the fix for the WCAG contrast problem. The landing page pings the backend `/health` to prove the wiring.
- **ML** (`ml/`): fully documented in [ml/README.md](../../ml/README.md). The headline for the viva: baselines run **before** the Random Forest, splits are student-grouped and temporal, and a click after the cutoff day is provably excluded from features (tested).

**Likely viva question — "How do you keep the browser from reaching the AI service or the database directly?"**
Three layers: (1) the browser only knows the Web API's URL; (2) the AI service rejects any call without the internal shared key; (3) RLS with no policies means the database's public (anon) key can read nothing. All data flows through the one Web API gateway, which checks ownership per request.
