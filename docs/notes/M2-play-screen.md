# M2 Notes — Part 1: Execution Service + Submit + Atomic XP

> M2 is the **vertical slice** — the make-or-break milestone. This part is the
> backend of the play loop: run a submission, award XP safely. The Monaco play
> screen (frontend) follows.

## What was built
- `execution/types.ts` — the `ExecutionService` interface every code-runner implements.
- `execution/mockExecutor.ts` — a **stub** for building the UI without Judge0.
- `execution/index.ts` — `getExecutor()`, chosen by `EXECUTION_BACKEND` env (mock now, judge0 later).
- `routes/levels.ts` — `GET /api/levels/:id` (play view) and `POST /api/levels/:id/submit`.

## The execution abstraction (why it matters)
All code execution goes through one interface. Today it's the mock; the real Judge0 backend slots into `getExecutor()` with **zero change to the route**. This is what keeps code execution off the critical path — the play screen and the whole submit flow are built and tested against the mock, so nothing waits on Judge0 being self-hosted.

The mock doesn't run Java (it can't). It passes every test unless the source contains the sentinel `FAILTEST`, which forces failure — so both the success path (XP, celebration) and the failure path (red per-case rows) can be built and demoed deterministically. Pilots/demos use the real Judge0 backend.

## Atomic XP — the part an examiner will probe
The danger: two "all tests passed" requests arriving together could each read "not completed yet" and **both award XP**. A plain unique key does not prevent this. The fix is a **conditional state transition**:

```
UPDATE user_levels SET status='completed'
 WHERE user_id=? AND level_id=? AND status <> 'completed'
```
`updateMany` reports how many rows it changed. Exactly one caller can flip the row from not-completed to completed, so **only that caller — count === 1 — awards the XP**, inside the same transaction as the completion, the event, and the submission record. A replay or a concurrent double-submit awards nothing.

## Proof (live, against the real DB)
- Play view returns the level **without** the reference solution and with only the visible sample tests.
- Submit #1 (passes) → `xpAwarded 50`, 4/4.
- Submit #2 (passes again) → `xpAwarded 0` — no double award.
- Submit with `FAILTEST` → `wrong_answer`, no XP, and hidden cases reveal **pass/fail only** (no expected output leaked).
- Final `totalXp = 50` — awarded exactly once.

## Likely viva questions
**Q: How do you stop a student getting XP twice for the same level?**
Completion is a conditional database update: "mark completed only if it isn't already." The database guarantees exactly one request wins that flip, and only the winner adds XP — in the same transaction. Replays and simultaneous submissions can't double-award.

**Q: Where does the code actually run — on your server?**
No. It goes through an execution interface. In development that's a mock; for real runs it's Judge0, a sandbox that executes untrusted code in isolation. Our server never runs student code itself.

**Q: How are hidden test cases kept hidden?**
The play view only ever sends visible sample tests. On submit, hidden cases return pass/fail with no input, expected, or actual output — verified in the test.

---

# M2 Notes — Part 2: The Monaco Play Screen (frontend)

## What was built
- `features/play/ProblemPanel.tsx` — the problem statement (markdown) + visible examples.
- `features/play/ResultsPanel.tsx` — per-test pass/fail rows; failing *visible* cases expand to expected vs actual; hidden cases show pass/fail only. `aria-live` announces the outcome.
- `screens/PlayScreen.tsx` — Monaco editor (Java), a **Run Tests** button, and the results. Desktop = split (problem | editor+results); mobile = a **Problem / Code / Results** tab switcher (a split view is unusable on a phone).
- Wired into the app: clicking a roadmap skill opens its first level (`<skillId>-01`).

## The core loop, complete (against the mock)
```
roadmap skill  →  PlayScreen  →  edit Java in Monaco  →  Run Tests
                                       ↓
             POST /api/levels/:id/submit  →  results + XP shown
```
This is the whole vertical slice end to end — the only piece still simulated is *real Java execution*, which the mock stands in for until Judge0 is self-hosted. Swapping it in changes nothing on the frontend.

## Accessibility (built in)
Every result row uses an icon **and** text (not colour alone); the editor sits behind 44px controls; the results area is a live region; the mobile tabs use `role="tab"`/`aria-selected`.

## Notes / follow-ups
- **Monaco loads from a CDN** via the default `@monaco-editor/react` loader — fine for dev and the deployed app while online. Bundling it locally (so it works offline / under a strict CSP) is a production hardening step.
- The JS bundle is ~520 KB (Monaco + supabase + markdown). Code-splitting Monaco with a dynamic import is an easy later optimization.

---

# M2 Notes — Part 3: The Judge0 Executor (real Java)

## What was built
`execution/judge0Executor.ts` (+ 3 tests) — the real code runner, implementing the same `ExecutionService` interface as the mock. `getExecutor()` returns it when `EXECUTION_BACKEND=judge0`.

## How it works
For each test case it creates one Judge0 submission (base64-encoded source + stdin + expected output) in a single **batch**, then polls the batch until every submission finishes, and maps the results:
- A case **passed** iff Judge0 reports **Accepted** (Judge0 grades stdout against the expected output for us).
- Overall verdict is worst-case first: compile error → timeout → runtime error → else accepted/wrong-answer.
- Java's language id is **resolved at runtime** from Judge0's `/languages` (it varies by build), falling back to the configured id.

## Works against hosted OR self-hosted — no code change
The same class talks to **RapidAPI's hosted Judge0** or **your own instance**; only env changes:
```
EXECUTION_BACKEND=judge0
JUDGE0_URL=https://judge0-ce.p.rapidapi.com     # or  http://<your-vm-ip>:2358
JUDGE0_RAPIDAPI_KEY=<key>                         # only for RapidAPI; empty when self-hosted
```
RapidAPI headers are added only when a key is present. Tested against a mocked Judge0 for the accepted / wrong-answer / compile-error paths.

## To go live (team)
1. **Quickest:** free RapidAPI account → subscribe to "Judge0 CE" → put the key + URL in `backend/.env`, set `EXECUTION_BACKEND=judge0`. Real Java from any machine (incl. the Mac). ~50 runs/day.
2. **For pilots:** self-host on an x86 Linux box or a GCP `e2-small`/`e2-medium` VM ($300 free credit) → point `JUDGE0_URL` at it, drop the RapidAPI key.

## Real Java is live — via Paiza (free, no card)
RapidAPI's free Judge0 tier turned out to demand a working card, and the free public Piston went whitelist-only (Feb 2026). So the real executor we actually run is **Paiza.IO's free public runner** — no account, no card, accepts our `public class Main`, works from the Mac.

- `PaizaExecutor` implements the same `ExecutionService`; switching is pure config: `EXECUTION_BACKEND=paiza` (now set in `backend/.env`).
- **Verified with real OpenJDK, live:** the reference solution → `accepted` (`9`, `-5`); a wrong solution (prints the count) → `wrong_answer` (`5`, `1`). Real compile + run + grade.
- 3 unit tests (mocked) cover accepted / wrong-answer / compile-error.

We now have **four** interchangeable backends (env-selected): `mock` (offline dev), `paiza` (free real Java, default), `piston` (self-hosted), `judge0` (RapidAPI/self-hosted). All the same interface — the routes never change.

**Caveat:** free public runners are rate-limited and can change (Piston just did). Paiza's guest key is fine for dev + small pilots; for heavy/pilot load, self-host Judge0 or Piston on an x86 Linux box / cheap cloud VM.

## What's left in M2
- [x] Monaco play screen, mobile tabs, wired to the roadmap
- [x] Real Java execution — **Paiza, verified live**; Judge0/Piston ready for self-host
- [x] **Browser-verified the whole click-through** (Playwright) — see Part 3
- [ ] Pilot #2: 5 students on the play screen

---

# M2 Notes — Part 3: Full Browser Verification (Playwright)

Drove the real app in a real browser, end to end:
**sign up → 12-question quiz → roadmap → open a level → Monaco → Run Tests → real Java → +50 XP.**

Two things this proved that unit/integration tests could not:
1. **The quiz test-out is real:** answering all 3 loops questions correctly made **Loops disappear from the generated roadmap** — visible in the browser.
2. **The play loop is real:** typing a Java solution and clicking Run Tests ran it on Paiza and showed **4/4 passed (2 visible + 2 hidden) · +50 XP**, with hidden cases showing pass/fail only.

## The bug browser-testing caught (viva gold)
`/api/me` returned **401** with a genuine logged-in user, even though every auth unit test passed. Cause: **new Supabase projects sign user tokens with `ES256`** (asymmetric keys, a `kid` in the header), not the legacy `HS256` shared secret. Our middleware verified with the HS256 secret, so real tokens were rejected. The tests missed it because they *also* used HS256.

Fix: verify against Supabase's public **JWKS** (`/auth/v1/.well-known/jwks.json`) with `jose` — it fetches and caches the public keys and checks the ES256 signature, issuer, and audience. Tests rewritten to generate a real ES256 key + a local JWKS.

**Q an examiner might ask — "how does your API trust the token without calling Supabase every time?"** Supabase publishes its public keys once at a well-known URL; we cache them and verify each token's signature locally. No per-request round-trip, and we never hold a shared secret.

## M2 is complete
Every layer verified — backend (supertest + live), real Java (Paiza), and the whole UI (Playwright). The vertical slice — the make-or-break milestone — is done.
