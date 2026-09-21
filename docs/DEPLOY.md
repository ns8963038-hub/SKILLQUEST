# Deploying SkillQuest (free tier)

Follow this top to bottom once. It takes about 45 minutes, most of it waiting for
builds. Everything here is free. Written for the team; any of the three of us
can do it.

| Part | Host | Region |
|---|---|---|
| Frontend (React) | **Vercel** | global (CDN) |
| Web API (Node) | **Render** — `skillquest-api` | **Singapore** |
| AI service (Python) | **Render** — `skillquest-ai` | **Singapore** |
| Database + sign-in | **Supabase** | **Singapore** (ap-southeast-1) |
| Weekly risk scoring | **GitHub Actions** | — |

**Why Singapore everywhere:** every API request makes several database round
trips. From India to Singapore each one costs ~100–250 ms, which is why local
latency was ~1.5 s. With the API *next to* the database they take a few ms.

**What "free" costs you:**
- Render free services **sleep after 15 minutes** without traffic; the next
  request waits **about a minute** while they wake. The app shows "Waking your
  tutor… can take up to a minute" meanwhile.
- **A sleeping service is only woken by traffic from the internet — not by a
  request from our other Render service.** So the API cannot wake the AI
  service, however long it waits (measured 2026-09-21: eight requests from the
  API over 90 s, and the AI service never started). The student's browser does
  it instead: `/api/me` returns the AI service's public `/health` URL and the
  frontend pokes it at sign-in and during onboarding (`frontend/src/lib/aiWake.ts`).
  If the AI still isn't up, the API answers **503** and the app says "your
  tutor is waking up" and retries by itself.
- Render gives **750 free hours a month, shared by both services**. If they run
  out, **both are suspended until the next month**. So never keep them awake
  24/7 — use the on-demand "Keep awake" button only for sessions (§7).
- Supabase free projects **pause after 7 days** with no activity.
- Paiza (the Java runner) is a shared public service with unpublished rate
  limits: fine for a 5–10 student pilot working at their own pace. Load-test it
  before a 20–30 student session.

Keep a text file open while you work: you will copy several URLs and keys
between dashboards. **Never commit that file, or any `.env` file.**

## Live deployment (done 2026-09-20)

| | |
|---|---|
| Site | https://skillquest-henna.vercel.app |
| API | https://skillquest-api-ygfd.onrender.com |
| AI service | https://skillquest-ai-mnrd.onrender.com |
| Database | Supabase `skillquest-prod`, Singapore |

Measured on the deployed stack with a brand-new account (end-to-end):
sign-up → consent 360 ms → onboarding + roadmap 7.6 s (goal mapping + planning)
→ lesson 210 ms → **real Java submission 4.3 s** → dashboard 194 ms. Ordinary
API calls land at **130–310 ms** (target < 500 ms) and code execution at 4.3 s
(target < 15 s). From a laptop in India the same calls took ~1.5 s, which is
why the API and the database are both in Singapore.

---

## 1. The database

### Recommended: a new, clean project for real students

The current Supabase project is full of test accounts and test submissions.
Research exports must contain real participants only, so give the UAT its own
project (the free plan allows two).

1. Supabase → **New project** → name `skillquest-prod`, region **Southeast Asia
   (Singapore)**, a strong database password (save it).
2. **Connect** (top bar) → copy two connection strings, putting your password in:
   - **Transaction pooler** (port **6543**) — add `?pgbouncer=true` at the end.
     This is `DATABASE_URL`.
   - **Session pooler** (port **5432**). This is `DIRECT_URL`.
3. **Project Settings → API** → copy the **Project URL** (`SUPABASE_URL`) and the
   **anon public** key (`SUPABASE_ANON_KEY`, only the frontend uses it).
4. From your laptop, create the tables and load the content (56 levels, 20
   lessons, 20 skills, companies). Values in the shell override the local `.env`:

   ```bash
   cd backend
   export DATABASE_URL="<transaction pooler URL>?pgbouncer=true"
   export DIRECT_URL="<session pooler URL>"
   npx prisma migrate deploy   # creates every table, with row-level security on
   npm run seed                # "Seeded: 20 skills, … 56 levels, 20 lessons …"
   unset DATABASE_URL DIRECT_URL
   ```

### Quicker: reuse the dev project

Skip the steps above and use the existing project's values. Before real students
join, delete the test accounts (Authentication → Users) so they don't appear in
exports.

---

## 2. Render: the API and the AI service

1. Sign in to <https://render.com> with GitHub.
2. **New → Blueprint** → choose the `SKILLQUEST` repo. Render reads
   `render.yaml` and proposes two services, `skillquest-api` and `skillquest-ai`,
   both Free, both Singapore.
3. It asks for the secret values. Fill in:

   | Service | Key | Value |
   |---|---|---|
   | skillquest-api | `DATABASE_URL` | transaction pooler URL (`…:6543/postgres?pgbouncer=true`) |
   | skillquest-api | `DIRECT_URL` | session pooler URL (`…:5432/postgres`) |
   | skillquest-api | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | skillquest-api | `CORS_ORIGINS` | put `http://localhost:5173` for now; replaced in §3 |
   | skillquest-api | `AI_SERVICE_URL` | `https://skillquest-ai.onrender.com` (check the real name in §2.5) |
   | skillquest-api | `ADMIN_EMAILS` | the team's emails, comma-separated |
   | skillquest-ai | `DATABASE_URL` | same transaction pooler URL |

   `INTERNAL_API_KEY` is generated by Render on the AI service and copied to the
   API automatically — you don't type it.
4. **Apply.** The first builds take ~5 minutes. The AI build also downloads the
   64 MB language model, so it never has to download it again when waking.
5. Open each service and copy its URL (top of the page), e.g.
   `https://skillquest-api.onrender.com`. If Render added a suffix to a name
   (`skillquest-ai-x1y2`), fix `AI_SERVICE_URL` on the API: **Environment → Edit
   → Save** (it redeploys).
6. Check both are alive:
   - `https://<api>/health` → `{"status":"ok","db":"up",…}` (`db: down` means a
     wrong `DATABASE_URL`)
   - `https://<ai>/health` → `{"status":"ok",…}`

---

## 3. Vercel: the website

1. Sign in to <https://vercel.com> with GitHub → **Add New → Project** → import
   `SKILLQUEST`.
2. **Root Directory:** `frontend`. Framework: Vite (detected). Build command and
   output (`npm run build`, `dist`) are detected too. Leave **"Include files
   outside the root directory in the Build Step"** on (the default); demo mode
   bundles the lessons from `content/`.
3. **Environment Variables:**

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | the API URL from §2.5 (no trailing slash) |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key |
   | `VITE_GOOGLE_AUTH` | `0` (see §4.3) |

4. **Deploy.** You get a URL like `https://skillquest-xyz.vercel.app`. (You can
   rename it under **Settings → Domains**, e.g. `skillquest-sea.vercel.app`.)
5. Back on Render → `skillquest-api` → **Environment**: set `CORS_ORIGINS` to the
   exact Vercel URL (no trailing slash) → Save. Without this the browser blocks
   every API call.

---

## 4. Supabase: sign-in settings

### 4.1 Where users come back to

**Authentication → URL Configuration:**
- **Site URL:** the Vercel URL.
- **Redirect URLs:** add the Vercel URL (and `http://localhost:5173` for development).

### 4.2 Email confirmation — read this before switching it on

Supabase's built-in email sender **only delivers to your own team's addresses,
at 2 emails an hour**. If you turn on "Confirm email" with it, students never get
the email and cannot sign in.

- **For the 5–10 student pilot:** leave **Confirm email OFF**
  (Authentication → Sign In / Providers → Email). Students sign up and go
  straight in. Ask them to use their real college email.
- **To turn confirmation on** (e.g. for the full UAT), connect a real email sender
  first. Free option, no domain needed — a Gmail account with an app password:
  1. Use a project Gmail account; turn on 2-Step Verification.
  2. Google Account → Security → **App passwords** → create one ("SkillQuest").
  3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
     host `smtp.gmail.com`, port `465`, username = the Gmail address, password =
     the app password, sender = the same address, sender name `SkillQuest`.
  4. Send yourself a test sign-up, then turn **Confirm email** on.

  Gmail allows roughly 500 emails a day, far more than 30 students need.

### 4.3 Google sign-in (optional)

Steps in `docs/notes/M6-uat-readiness.md` §8. When done, set `VITE_GOOGLE_AUTH=1`
on Vercel and redeploy.

---

## 5. GitHub: the weekly risk scoring

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SKILLQUEST_API_URL` | the API URL |
| `SKILLQUEST_AI_URL` | the AI service URL |
| `SKILLQUEST_INTERNAL_KEY` | Render → `skillquest-ai` → Environment → `INTERNAL_API_KEY` (reveal and copy) |

Then **Actions → Weekly risk scoring → Run workflow** once to test it (it wakes
both services first, then scores). From now on it runs every Monday at 02:00 IST.
You can also run scoring any time from the research console.

---

## 6. Smoke test (10 minutes)

On the Vercel URL, in a private window:

1. The first load may show "Waking your tutor…" for up to a minute. That's the
   free tier, not a bug.
2. **Sign up** with a fresh email → the **consent** screen appears → agree.
3. **Onboarding** → finish the quiz → a roadmap appears. (If the AI service was
   asleep this step can take ~1 minute the first time.)
4. Open the current topic → its **lesson** plays → "Start the challenge".
5. Solve the level → the vault opens, XP goes up (real Java via Paiza, ~10 s).
6. **Leaderboard** shows you; **Settings** saves.
7. Sign in with an `ADMIN_EMAILS` account → the shield icon → **research
   console** loads → **Run scoring now** works.

If all seven pass, you're live.

---

## 7. During pilot and UAT weeks

- **Keep it awake only when you need it.** Before a pilot session, a class demo
  or the viva: GitHub → **Actions → Keep awake (on demand) → Run workflow**, pick
  the hours (1–5) and whether to include the AI service. Start it ~2 minutes
  early (the first ping wakes everything); it stops by itself when the time is
  up, or press **Cancel workflow** to stop early. From a terminal:
  `gh workflow run keep-warm.yml -f hours=3`. Only the hours it runs count
  (3 hours with the AI service ≈ 6 of the 750 free hours). Without it, the app
  still works — the first visitor after 15 quiet minutes just waits about a minute.
- **Before a big session** (20–30 students submitting together), load-test Paiza.
- **The database won't pause** while students use the app or keep-warm is on.
  Outside test weeks, the weekly scoring job keeps it alive.

---

## 8. Updating the live app

- **Code:** push to `main`. Vercel and Render redeploy automatically (Render's
  free build takes a few minutes).
- **Content** (levels, lessons, companies): run the checkers
  (`node content/verify-levels.mjs`, `node content/build-lessons.mjs`), then
  re-seed the production database from your laptop, as in §1.4.
- **Database changes** (a new migration): run `npx prisma migrate deploy`
  against production (§1.4) **before** pushing code that needs the new tables.

---

## 9. When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser console: "blocked by CORS policy" | `CORS_ORIGINS` doesn't exactly match the site URL | Set it to the Vercel URL, no trailing slash, then Save |
| Everything says "Could not load…", API returns 500 "auth not configured" | `SUPABASE_URL` missing on the API | Add it on Render |
| Signed in but every request is 401 | Frontend and API use different Supabase projects | Make `VITE_SUPABASE_URL` and the API's `SUPABASE_URL` the same project |
| `/health` shows `"db":"down"` | Wrong `DATABASE_URL`, or the Supabase project is paused | Check the URL and password; restore the project in Supabase |
| Onboarding says the tutor didn't wake up in time | AI service asleep and the browser's wake-up poke didn't reach it, or a wrong `AI_SERVICE_URL` / key | Open `<ai>/health` in a browser tab (that wakes it), wait until it answers, press Build my quest again; check `AI_SERVICE_URL` on the API. Render logs: the API shows `AI service … is not responding`, and the AI service shows **no lines at all** if it never started |
| Students never receive the confirmation email | Default Supabase sender (team-only) | §4.2: turn confirmation off, or set up Gmail SMTP |
| Everything suddenly down near month end | 750 free Render hours used up | Cancel any running "Keep awake" job; services return on the 1st of the month |
| Code runs time out for everyone | Paiza busy or rate-limiting | Wait and retry; for large sessions plan a self-hosted runner |
