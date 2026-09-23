# M12 — Fixing what the external review found

**Status:** BUILT (2026-09-23), not yet deployed. A senior developer reviewed the
whole project; we checked every claim against the code, agreed a "before UAT"
list, and fixed it in order. Each fix was checked before moving on (tests, a
deliberate break to prove the test catches it, and where it touches the
database, a throwaway local Postgres).

## What changed, in one line each

| # | Area | Before | Now |
|---|---|---|---|
| 1 | Risk | The logistic regression ran live and flagged new students as at-risk, and students gone 2 weeks as healthy | The **days-since-last-practice rule** runs live (7 days watch, 14 at risk); "practice" = level submits and lesson answers only; students under 28 days aren't scored; each student scored separately |
| 2 | Code runner | A Paiza failure counted as the student's wrong answer; no rate limits | Runner failure → 503, nothing recorded; 10 graded runs/min per student; at most 6 runs at once, queued up to 45 s; load-tested with 30 students |
| 3 | Mastery | Every submit moved BKT, so one level submitted 3 times read "mastered" | **Run examples** (visible tests, recorded nowhere) + **Submit**; only a level's **first** submit updates mastery; untouched starter code is refused |
| 4 | Quiz | Graded in the browser; the browser told the API what to skip; keyword questions | **Graded on the server** from a `quiz_questions` table; 12 "what does this print?" questions, each run on a real JVM in CI |
| 5 | Locks | Only hidden in the UI; Placement's "Train this" opened locked topics | Every level and lesson route answers **403** for a locked topic |
| 6 | Placement | "Covered" after any one level; tested-out topics ignored; "Source" links looked official | One definition of **known** (all levels done, or tested out) used everywhere; lists labelled **team-curated** |
| 7 | Small fixes | Stale streak, shared drafts, shifting participant codes, re-runnable onboarding, 500 on unknown topic, hint XP race, admin by email | All fixed (see below) |
| 8 | Consent | Didn't mention that code goes to Paiza | New point "Where your code runs"; consent version v2, everyone asked again |
| 9 | UI, copy, docs | Various | Code Master = a whole topic without hints; checker reads prose; gibberish goals get the neutral plan; no public AI `/docs`; constant-time key checks; leaderboard name filter; honest copy; readable map; sign-in width; error screen per failure; phone map centred; Back button works; TRD §0 "As built" |

## The ideas worth being able to explain

**First-attempt rule (BKT).** Knowledge tracing treats each *problem* as one
observation. If every submit counts, re-submitting a solved level three times
takes P(known) from 0.20 → 0.60 → 0.89 → 0.98 ("mastered") with no new
evidence, and five debugging runs drag it down. So only the first graded submit
per level counts. Separating "Run examples" from "Submit" is what makes the
first submit a fair reading: students debug on examples, then submit.

**Never trust the client.** The quiz used to ship its answer key in the
JavaScript bundle and send `testedOut` to the API. Now the browser only ever
sends *which option was picked*; the server holds the answers (RLS on, so not
readable through Supabase's REST API) and decides everything.

**One definition, used everywhere.** "Completed" (roadmap), "covered"
(Placement), "done" (locks) and "tested out" (dashboard) had drifted apart.
`progress/skills.ts` defines *known* once; the others call it.

**A lock in the UI is not a lock.** The server checks every level and lesson
request (`router.param` hooks, `progress/access.ts`) before doing anything.

**Stable pseudonyms.** Participant codes are stored once at consent, from a
Postgres sequence, instead of being recomputed from sign-up order at every
export. The migration backfilled exactly the codes the export used to give.

**Gibberish detection with a "null" class.** bge-small gives almost any text
0.4–0.55 similarity to every category, so an absolute floor never fires. The
goal must now beat a description of *unrelated text* by 0.07. On 16 junk and 17
real inputs: all junk → neutral plan; three very short real goals also → neutral
(the safe direction).

## Small fixes (item 7)

- **Streak:** shown and exported "as of today" (0 once a day is missed).
- **Drafts:** stored per student and cleared on sign-out (shared lab PCs).
- **Participant codes:** stored at consent (also when rejoining in Settings).
- **Onboarding:** can't be run twice (409).
- **Unknown topic:** 404 instead of a 500 from a foreign-key error.
- **Hint cost:** an atomic decrement instead of "read XP, write back a number".
- **Admins:** by Supabase user id (`ADMIN_USER_IDS`), not email — email
  confirmation is off, so anyone could sign up with an unregistered team address.

## Found during the final crosscheck (not in the review)

- **Settings re-join gave no participant code** — a student who switched the
  research back on in Settings would have been left out of every export. Fixed.
- **"Next level" skipped the next topic's lesson** — after a topic's last level,
  the reward jumped straight into the next topic's first level. It now says
  "Next topic" and opens that topic's lesson first, as the map does.
- The settings goal box had no length limit (the server allows 500), and two
  lines of copy still overclaimed ("re-plans as you learn", "re-practice keeps
  raising the mastery estimate"). Fixed.

## Verified

Backend 180 tests, frontend 123, AI service 25 (+25 with the real model: all
junk inputs neutral, 9/9 real goals exact). All 57 levels and 20 lessons
compiled and run on a JVM; the 12 quiz programs print exactly their answers;
course order clean (now including prose). All 9 migrations applied to a fresh
Postgres, seeded twice ("Verified."), no schema drift from our changes. Lock
rules, Placement coverage, participant-code backfill and roadmap advancing were
exercised on seeded data. UI changes checked in a real browser at phone and
desktop size.

## Not done (deliberately)

Reveal-then-answer through the raw API; the advisory lock on the weekly job
(a simultaneous manual + scheduled run could send one student two nudges);
least-privilege database roles; statements that give the method away; "Rank"
for the XP level; a full router with real URLs; harder levels. All listed in
TRD §0 or the review.

## Viva questions

**Q: Why doesn't every submit update the mastery estimate?**
Because BKT models one observation per problem. Counting re-submits of a solved
level lets a student reach "mastered" without new evidence. We count the first
graded submit per level, and give students "Run examples" for debugging so that
first submit reflects what they know.

**Q: Your ML model lost to a rule. Isn't that a failure?**
No — it's the finding. The logistic regression's gain was +0.0038 PR-AUC with a
95% interval that includes zero, and it misranked students unlike its training
data. We deployed the rule that won and kept the model as the experiment.

**Q: How do you stop a student skipping topics by editing a request?**
The quiz answers never reach the browser; the server grades the chosen options.
And even a skipped topic can't be forced open: every level and lesson route
checks the roadmap first and answers 403.

**Q: How are participants kept anonymous but consistent across exports?**
Each consenting student gets a code (P01…) once, from a database sequence,
stored on their profile. Exports use the stored code, so deleting an account or
promoting a teammate to admin never renumbers anyone.

**Q: What happens when the code runner is down?**
The API answers 503 and records nothing — no attempt, no failed submission, no
mastery change — and the student is told it didn't count. At most 6 runs go to
Paiza at once; the rest queue for up to 45 s.
