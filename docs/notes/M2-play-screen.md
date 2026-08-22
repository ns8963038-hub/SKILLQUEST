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

## What's next in M2
- [ ] Monaco editor play screen (problem panel + editor + Run Tests + results)
- [ ] Mobile tab layout for the play screen (Problem / Code / Results)
- [ ] Wire "Start" on a roadmap skill → open one of its levels
- [ ] (Team, parallel) self-host Judge0 on an x86 box → the real executor
