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

## Authoring a new level

1. Copy `levels/arrays-01.json` to `levels/<skill>-<nn>.json`.
2. Set `skillId` to a skill `id` that exists in `skills.json`.
3. Write the problem (`statementMd`), the `starterCode` scaffold (must contain
   `public class Main` with a `main` method — Judge0 runs `Main`), and a correct
   `referenceSolution`.
4. Add `testCases`: each has `stdin` fed to the program and `expectedOutput`
   compared against its stdout (trailing whitespace is trimmed). Mark tough or
   edge cases `isHidden: true` — students see only pass/fail for those.
5. **Verify every test case against your `referenceSolution`** before committing.
   A wrong expected-output is the most common (and most demo-breaking) bug.

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
