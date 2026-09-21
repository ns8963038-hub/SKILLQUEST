# M9 — Watch it run: showing the program instead of describing it

**Status:** BUILT (2026-09-21). §6 records what shipped, §7 the project-wide
review done straight afterwards.

## 1. Why

Learn mode (M7) already replays a real JVM recording line by line: the memory
panel lists every variable, the output panel shows what has been printed, and
Nova narrates. In use, two problems showed up — both raised by the team from
their own experience:

1. **It is still reading.** A student who is tired, or whose English is not
   strong, faces a wall of words and a table of numbers. Many of our users are
   in exactly that position; a tool that demands careful reading loses them
   before the idea lands.
2. **The interesting moment is invisible.** The one thing a beginner must see in
   a loop is *the jump back to the top*, and in an `if` *which way it went*. Both
   were happening between two frames with nothing on screen to mark them.

So this milestone spends its effort on the same recording, shown differently.

## 2. The rule that keeps it honest

Everything drawn is derived from the recording, and **anything the recording
cannot prove is not drawn**. This is the whole design constraint: a wrong "true"
chip teaches the opposite of the lesson.

`frontend/src/features/learn/traceAnalysis.ts` holds that logic as pure
functions, and it stays silent when:

- the next step is in a different method or at a different stack depth (so a
  call inside a condition, `if (isPrime(n))`, is never guessed at);
- the body shares the header's line (`if (x) go();`), where line numbers cannot
  distinguish taken from not-taken;
- the statement has no condition of its own (`else`, `do`, `switch`);
- the same line runs again (a `for` header runs in parts);
- the program has finished.

The block ranges it needs come from a brace scanner that counts brace by brace
from the header's own `{`, with string and character literals and comments
masked out first — so `} else {` closes the previous block at its first brace,
and a `"}"` inside a string never ends anything. 20 unit tests cover it.

## 3. What a student now sees

| | What it shows | Where it comes from |
|---|---|---|
| **true / false chip** | the result of the condition that led here, beside that line | the next frame's line number against the block's body range |
| **Gutter arrow** | gold and upward when a loop repeats, grey when lines are skipped | a backward jump, or a forward jump over at least one line |
| **Counting numbers** | a changed value counting to its new one (≈300 ms) | the same value in the previous frame |
| **Typing output** | new output arriving character by character (≤420 ms) | the difference between this frame's output and the last |
| **Call stack** | frames sliding on and off, the returned value dropping into the frame that asked for it | the stack depth and the recorded method return |
| **Array strip** | the array drawn as cells (or bars), with `lo`/`mid`/`hi` sliding under it and ruled-out cells dimmed | the array variable and its pointers, in the frame that holds them |

The arrow is measured from the rendered lines (`offsetTop`, re-measured by a
`ResizeObserver`), never from an assumed line height, so it stays correct at
every breakpoint and after the web font loads.

## 4. The array strip is content, not a hard-coded special case

A lesson opts in from its trace step:

```json
"visual": { "array": "a", "pointers": ["lo", "mid", "hi"],
            "range": ["lo", "hi"], "mode": "cells" }
```

`content/build-lessons.mjs` checks every name in that block **against the
recording it has just made**: the array must really be an array in the trace,
each pointer must really be a whole number, `range` must name two of those
pointers, `mode` must be `cells` or `bars`, and unknown keys are rejected. A
picture that disagrees with the program therefore fails the build rather than
misleading a student. Five lessons use it: arrays, searching, sorting (bars),
interview-patterns and hashing.

If the named array is not in scope at a given step, the strip disappears instead
of showing a stale picture, and a pointer that has run off the end is not drawn.

## 5. Turning it off

Some students find movement distracting, and some phones are slow. **Settings →
Animations** adds the app's own switch (`frontend/src/lib/motionPref.ts`):

- unset → follow the device's `prefers-reduced-motion` (the default);
- on/off → the student's choice, remembered on that device.

With animations off nothing moves: values change instantly, output appears whole,
and a changed value keeps a static gold ring so the information is still there.
The switch drives Motion's `MotionConfig` for library animations and is read
directly by the hand-written ones, so both obey it.

## 6. As built

**New:** `lib/motionPref.ts`, `features/learn/traceAnalysis.ts`,
`features/learn/ArrayStrip.tsx`, `features/learn/values.tsx` (the value
renderers, shared by the memory panel and the strip), plus tests for each.
**Changed:** `CodeView` (decision chip, gutter arrow, reserved arrow lane),
`TracePlayer` (annotations, counting numbers, typed output, animated stack,
return chip inside the caller's frame), `SettingsScreen`, `main.tsx`, the
backend's lesson sanitiser and the offline demo loader (both now pass `visual`
through), `content/build-lessons.mjs`, and the five annotated lessons.

**Verified:** frontend 64 tests / backend 76 / AI service 19, `tsc` and ESLint
clean in both TypeScript packages, production build clean, `verify-levels`
56/56 and `build-lessons` 20/20 (every program recompiled and re-run). The
builder's new validation was itself tested by feeding it a deliberately wrong
`visual` block — it reported all five faults and refused the lesson.

Test noise was cleaned up too: the suites now run with animations off by default
(`src/test/setup.ts`), the two tests that are *about* movement drive a fake clock
themselves, and the whole run is free of React `act()` warnings — including one
that pre-dated this work in `PlayScreen.test.tsx`.

## 7. Project-wide review done after the build

A deliberate sweep for loose ends, not just for this feature.

**Fixed**

- **`_prisma_migrations` was readable by the public anon key.** Every
  application table has row-level security enabled with no policies, but
  Prisma's own bookkeeping table is created by the migration engine and never
  had RLS turned on, leaving migration names, timestamps and checksums readable
  through `/rest/v1/`. No student data was exposed. Migration
  `20260921060000_rls_on_migrations_table` closes it; the table owner (the role
  the API and `prisma migrate deploy` both use) bypasses RLS, so nothing else
  changes. **Applies on the next deploy.**
- **The TRD described authentication that we no longer use.** §4 said tokens are
  verified with an HS256 `SUPABASE_JWT_SECRET`; the code verifies them against
  Supabase's published JWKS (ES256, issuer and audience checked). §4 also said
  the admin flag is set by hand in the Supabase dashboard; it is set on sign-in
  from `ADMIN_EMAILS`. Both corrected — either would have been an awkward answer
  in the viva.
- **The API's dependency advisories cleared:** `qs`, a denial of service
  reachable through Express's body parser in the live API. The backend's
  production tree now reports zero vulnerabilities. (The frontend's two
  remaining ones are explained under "Known and accepted" below.)
- **`DEPLOY.md` still said 46 levels / 19 lessons** — it is a runbook someone
  follows today, so it now says 56 / 20 (the dated milestone notes keep their
  original numbers, because they are a record of that milestone).
- **Content checks now run in CI.** A fourth job compiles and runs every level
  and lesson program on a pinned JDK, so a hand-edited lesson or a stale
  recording fails the build instead of reaching a student (~100 s).
- **Dead code removed:** `QuestMap.tsx` (replaced by the Constellation in M5)
  and `mockRoadmap.ts` (replaced by the real API in M1).
- **The demo loader dropped `visual`**, so the array strip would have been
  missing in the offline demo — the most likely way the project is shown without
  internet. Fixed and matched to the server's sanitiser.

**Checked and sound**

- Content cross-references: 20 skills / 56 levels / 20 lessons, no orphan skill,
  no missing lesson or level, no unknown prerequisite, no cycle in the DAG, no
  unknown skill in the company, goal or badge files.
- Every `/api/...` call in the frontend matches a route the backend serves.
- No secrets tracked in git (`.env.*` ignored; only `.env.example` files are
  committed), no debug code, no `TODO` outside deliberate student starter code.
- Auth fails closed: no `SUPABASE_URL` → 500, no token → 401, bad token → 401.
- All three live services answer `/health` (the two Render services cold-start
  in 20–35 s, as documented).

**Known and accepted**

- **Monaco is loaded from a CDN at runtime** (jsdelivr, 0.55.1). If the
  network blocks jsdelivr, the Play screen's editor will not load — worth
  knowing before a demo on college wifi. Self-hosting it is a small change if we
  want the demo to be network-proof.
- **`npm audit` still reports two frontend advisories** (one moderate, one low):
  DOMPurify 3.4.8 inside `monaco-editor`, fixable only by a breaking Monaco
  upgrade. They need attacker-controlled HTML to reach Monaco's renderer, and in
  our app the editor only ever shows the student's own code; the copy of Monaco
  that actually runs comes from the CDN, not from this package. We did not force
  an override, because that would silence the audit without changing anything
  the browser runs.
- Dev-only advisories remain in `vitest`/`vite` (they need a major upgrade, and
  they affect a locally running dev server, not anything deployed). Left pinned
  until after submission.
- The live database still holds the pre-M9 lesson content: **re-seed is needed**
  for the array strips to appear in production.

## 8. Viva questions

**Q: How do you know the true/false chip is right?**
It is not a judgement about the code — it is read from the recording. The chip
appears only when the next recorded step is in the same method at the same stack
depth: inside the statement's body means the condition held, outside means it
did not. When that test cannot be made — a call inside the condition, a
single-line body, `else`, the end of the program — nothing is shown at all. The
logic is 20 unit tests, and it was also run over all 20 real lesson recordings:
70 decisions and 66 jumps, every one checked by hand against the program.

**Q: Why not just animate everything with a library?**
Two reasons. The library's animations are gated by the viewer's device setting,
but our own switch has to override that, so the hand-written animations read the
app's setting directly. And the flash that marks a changed value used to be
replayed by remounting the element — which would have thrown away the number
inside it and made it jump instead of count. It now replays on the same element.

**Q: What stops a lesson from drawing a misleading picture?**
The build script records the trace first, then checks the picture against it. A
wrong array name, a pointer that is not a number, a range that names something
that is not a pointer, an unknown mode or an unknown key all fail the build. We
tested that by writing a deliberately wrong block: it reported all five faults.

**Q: A student says the movement distracts them. What do you do?**
Nothing — they turn it off in Settings → Animations, on their own device. It also
follows the phone's accessibility setting by default, so students who have
already asked their phone for reduced motion never see the animation at all.

**Q: Does this slow the lesson down?**
No. Every animation finishes inside ~300 ms (output ≤420 ms) while autoplay
advances a line every 1100 ms, so stepping quickly never queues animations up.

## 9. Incident: a new student couldn't finish onboarding (2026-09-21)

A friend of the team tried the live site and got `Request to
/api/onboarding/complete failed (500)` on the goal step, twice.

**What the logs showed** (Render, both services, 05:30–06:30 UTC):

| Time (UTC) | Service | What happened |
|---|---|---|
| 05:41 | API | Woken by the student's browser ("Running npm start") |
| 05:52:29 | API | `AI service /ai/goal-map is not responding (status 502)` after four tries |
| 05:53:11 | API | The same, on the student's second attempt |
| 05:30 → 06:23 | AI | **No log lines at all** — it never started |
| 06:23:30 | AI | Started by one request from outside; ready 10 s later |

**Root cause.** On Render's free tier a sleeping service is woken by traffic
from the internet, but **not by a request from another Render service**. The
API retried for ~26 s, but no amount of waiting could have helped: its requests
never started the AI service. The same fact meant the "warm the AI on sign-in"
poke we had added earlier (sent by the API) had never worked either. Earlier
live tests passed only because something external — our own checks, or the
keep-awake workflow — had woken it first.

**Fix, in three layers:**

1. **The browser wakes it.** `/api/me` now returns the AI service's public
   `/health` URL, and the frontend pokes it (no-cors, fire-and-forget) at sign-in
   and at most once a minute during onboarding, so it is awake by the goal step
   and a slow student doesn't find it asleep again.
2. **The API says what happened.** When the AI service doesn't answer after
   ~45 s, the API returns **503 `ai_unavailable`** instead of a 500. The AI is
   always called before anything is written, so a retry is always safe.
3. **The screen explains and retries.** On a 503 the building overlay says "Your
   AI tutor is waking up … about half a minute, and your answers are safe", pokes
   the tutor again from the browser and retries (three attempts). Only if all of
   that fails does the student see a message — one that tells them what to do.
   Settings re-plans get the same treatment.

The server-side warm-up, proven useless, was removed rather than left in place
looking like it did something.

**Viva question: why does the browser call the AI service at all, when the TRD
says it never calls `/ai/*`?** It still never calls `/ai/*`. It only sends a
request with no data and no key to `/health` and never reads the answer — the
one thing that wakes a sleeping free-tier service. Every AI computation still
goes through the API with the internal key. This is a hosting workaround, and a
paid instance (or one that never sleeps) would not need it.
