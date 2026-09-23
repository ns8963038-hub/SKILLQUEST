# Content

The versioned source of truth for what SkillQuest teaches. These JSON files are
reviewed in PRs like code, then loaded into the database by the seed script
(`backend/prisma/seed.ts`). The database is the *runtime* copy; **these files are
the source** — edit here, then re-seed.

## Files

| File | What it holds |
|---|---|
| `skills.json` | The Java + DSA skill graph — nodes and their prerequisite edges (a DAG) |
| `goal_profiles.json` | Per-goal weight vectors over skill tags — makes the roadmap change by goal |
| `levels/*.json` | One file per playable level: problem, starter code, hidden test cases |
| `lessons/*.json` | One Learn-mode lesson per skill (PRIMM steps), played before its levels |
| `questions/java-oop.json` | Java OOP theory question bank (73 items) used by lesson "concept" steps |
| `quiz.json` | The onboarding placement quiz: 12 "what does this print?" questions, 3 per topic. Check with `node content/verify-quiz.mjs` (runs every program) before seeding |
| `verify-levels.mjs` / `build-lessons.mjs` | Checkers — compile and RUN every program; fill in generated fields |
| `tools/Tracer.java` | Records a program's execution (JDI) for the lessons' "Watch it run" step |

## Authoring a new level

1. Copy `levels/arrays-01.json` to `levels/<skill>-<nn>.json`.
2. Set `skillId` to a skill `id` that exists in `skills.json`.
3. Write the problem (`statementMd`), the `starterCode` scaffold (must contain
   `public class Main` with a `main` method — Judge0 runs `Main`), and a correct
   `referenceSolution`.
4. Add `testCases`: each has `stdin` fed to the program and `expectedOutput`
   compared against its stdout (trailing whitespace is trimmed). Mark tough or
   edge cases `isHidden: true` — students see only pass/fail for those.
5. **Never type expected outputs by hand.** Leave them empty and run
   `node content/verify-levels.mjs --fill` (needs a local JDK): it runs the
   `referenceSolution` to fill them in. Then run `node content/verify-levels.mjs`
   before every commit — it checks every level's shape, compiles for Java 11,
   confirms each expected output, and confirms the untouched starter code does
   NOT pass. A wrong expected output is the most demo-breaking bug there is.

## Authoring a lesson

A lesson is a list of steps: `hook` → `predict` → `trace` (`"from": "p1"`) →
`explain` → `predict` → `fill`. See `lessons/loops.json`.

- Lesson code may end a line with `//~ narration` — Nova says it when that line
  runs in the trace. It is stripped before the code is shown or compiled.
- **Never type** `predict.answer`, `trace.trace` or `fill.expectedOutput`. Run
  `node content/build-lessons.mjs --fill` (needs a JDK): it runs each predict
  program and marks the one option that matches (exactly one must), records the
  trace from the real JVM, and runs every accepted fill-in answer (and every
  listed `wrong` answer, which must fail).
- Options can be outputs, `It doesn't compile`, or `Crashes: <ExceptionName>`.
- A **concept** step asks a theory question from the bank: `{"id": "c1", "type": "concept", "ref": "OOP008"}`. The builder inlines the question, options, answer and explanation, and fails if the id is missing or the item isn't an MCQ / true-false. Put concept steps AFTER the `explain` step, so they count as evidence.
- A predict step may also carry `"ref": "<bank id>"` for an Output Prediction item: the builder uses the bank's program, runs it, and fails if the bank's own answer key disagrees with the real output.
- Make the fill-in program test **several inputs**, so a literal answer can't pass.
- Then `node content/build-lessons.mjs` (check mode) and `npm run seed`.

## Rules

- **The skill graph must stay acyclic.** The seed refuses to load if any
  prerequisite forms a cycle, or points at a skill that doesn't exist.
- **`id`s are permanent.** Progress, submissions, and roadmaps reference them —
  renaming an `id` orphans data. Add new ids; don't rename old ones.

## Loading into the database

```bash
cd backend
npm run seed        # validates the graph, then upserts everything (safe to re-run)
```
