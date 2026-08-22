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

## What's left in M2
- [x] Monaco play screen, mobile tabs, wired to the roadmap
- [x] **Judge0 executor** — written + tested; just needs a live Judge0 URL in env to switch on
- [ ] Point it at a real Judge0 (RapidAPI now / self-hosted before pilots) and run one real Java submission
- [ ] Browser-verify the whole click-through (Playwright MCP + restart)
- [ ] Pilot #2: 5 students on the play screen
