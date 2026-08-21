// Seed script: loads the versioned content in /content into the database.
//
// It is IDEMPOTENT — safe to run any number of times. It upserts by primary key,
// and it VALIDATES the content before writing a single row: the JSON shape is
// checked with zod, and the skill graph is proven acyclic. A bad edge or a typo
// therefore fails loudly here, never in a half-loaded database.
//
// Run with:  npm run seed   (from the backend/ directory)

import 'dotenv/config'; // load DATABASE_URL from .env before Prisma connects
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Resolve the repo's /content directory relative to THIS file (backend/prisma/).
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

// ---------------------------------------------------------------------------
// 1) Shape validation. zod turns a malformed JSON file into a clear error
//    (which field, which file) instead of a confusing database failure later.
// ---------------------------------------------------------------------------

// One skill node in skills.json.
const SkillSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  conceptType: z.enum(['conceptual', 'practical']),
  tags: z.array(z.string()).default([]),
  estimatedMinutes: z.number().int().positive(),
  displayOrder: z.number().int(),
  prerequisites: z.array(z.string()).default([]), // ids this skill depends on
});
type Skill = z.infer<typeof SkillSchema>;

// One row of goal_profiles.json — a weight for a (goal, tag) pair.
const GoalProfileSchema = z.object({
  goalCategory: z.string(),
  skillTag: z.string(),
  weight: z.number(),
});

// One hidden/visible test case inside a level file.
const TestCaseSchema = z.object({
  stdin: z.string().default(''),
  expectedOutput: z.string(),
  isHidden: z.boolean().default(false),
  weight: z.number().int().positive().default(1),
  ordinal: z.number().int(),
});

// One playable level file.
const LevelSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  title: z.string(),
  difficulty: z.number().int().min(1).max(5),
  statementMd: z.string(),
  starterCode: z.string(),
  referenceSolution: z.string().optional(),
  hints: z.array(z.string()).default([]),
  xpReward: z.number().int().nonnegative(),
  timeLimitMs: z.number().int().positive(),
  published: z.boolean(),
  orderInSkill: z.number().int(),
  testCases: z.array(TestCaseSchema),
});
type Level = z.infer<typeof LevelSchema>;

// Read a JSON file and return its parsed object.
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Load + validate skills.json (the `skills` array; sibling "//" notes are ignored).
function loadSkills(): Skill[] {
  const raw = readJson(join(CONTENT_DIR, 'skills.json')) as { skills: unknown[] };
  return raw.skills.map((s) => SkillSchema.parse(s));
}

// Load + validate goal_profiles.json.
function loadGoalProfiles() {
  const raw = readJson(join(CONTENT_DIR, 'goal_profiles.json')) as { goalProfiles: unknown[] };
  return raw.goalProfiles.map((g) => GoalProfileSchema.parse(g));
}

// Load + validate every levels/*.json file.
function loadLevels(): Level[] {
  const dir = join(CONTENT_DIR, 'levels');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => LevelSchema.parse(readJson(join(dir, f))));
}

// ---------------------------------------------------------------------------
// 2) Graph validation. The prerequisites must form a DAG (no cycles) and only
//    reference skills that exist. This is Kahn's algorithm — the very same
//    topological sort the roadmap engine will use to order a student's plan.
// ---------------------------------------------------------------------------
function assertValidGraph(skills: Skill[]): void {
  const ids = new Set(skills.map((s) => s.id));
  const indegree = new Map<string, number>(skills.map((s) => [s.id, 0]));
  const children = new Map<string, string[]>(skills.map((s) => [s.id, []]));

  // Build edges prereq -> skill, and count each skill's incoming edges.
  for (const s of skills) {
    for (const p of s.prerequisites) {
      if (!ids.has(p)) throw new Error(`Skill "${s.id}" needs unknown prerequisite "${p}"`);
      children.get(p)!.push(s.id);
      indegree.set(s.id, indegree.get(s.id)! + 1);
    }
  }

  // Repeatedly remove nodes with no remaining prerequisites. If some can never
  // be removed, they are tangled in a cycle.
  const ready = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  let removed = 0;
  while (ready.length) {
    const id = ready.shift()!;
    removed++;
    for (const child of children.get(id)!) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) ready.push(child);
    }
  }
  if (removed !== skills.length) {
    throw new Error('Skill graph has a cycle — prerequisites must form a DAG.');
  }
}

// Every level must attach to a real skill.
function assertLevelsReferenceSkills(levels: Level[], skills: Skill[]): void {
  const ids = new Set(skills.map((s) => s.id));
  for (const lv of levels) {
    if (!ids.has(lv.skillId)) {
      throw new Error(`Level "${lv.id}" references unknown skill "${lv.skillId}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Write to the database, in an order that respects foreign keys.
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  const skills = loadSkills();
  const goalProfiles = loadGoalProfiles();
  const levels = loadLevels();

  // Validate BEFORE any write — nothing touches the DB unless everything is sound.
  assertValidGraph(skills);
  assertLevelsReferenceSkills(levels, skills);

  // Skills first (everything else points at them). Upsert = insert-or-update by id.
  for (const s of skills) {
    const data = {
      title: s.title,
      description: s.description ?? null,
      conceptType: s.conceptType,
      tags: s.tags,
      estimatedMinutes: s.estimatedMinutes,
      displayOrder: s.displayOrder,
    };
    await prisma.skill.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  // Prerequisite edges: clear and rebuild, so removing an edge in JSON removes it
  // from the DB too. (These rows are tiny and have no dependents, so this is safe.)
  await prisma.skillPrerequisite.deleteMany();
  for (const s of skills) {
    for (const prereqId of s.prerequisites) {
      await prisma.skillPrerequisite.create({ data: { skillId: s.id, prereqId } });
    }
  }

  // Goal weight vectors: clear and rebuild the same way.
  await prisma.goalProfile.deleteMany();
  await prisma.goalProfile.createMany({ data: goalProfiles });

  // Levels, then their test cases (test cases point at a level).
  for (const lv of levels) {
    const data = {
      skillId: lv.skillId,
      title: lv.title,
      difficulty: lv.difficulty,
      statementMd: lv.statementMd,
      starterCode: lv.starterCode,
      referenceSolution: lv.referenceSolution ?? null,
      hints: lv.hints,
      xpReward: lv.xpReward,
      timeLimitMs: lv.timeLimitMs,
      published: lv.published,
      orderInSkill: lv.orderInSkill,
    };
    await prisma.level.upsert({ where: { id: lv.id }, create: { id: lv.id, ...data }, update: data });

    // Replace this level's test cases so edits in JSON fully take effect.
    await prisma.testCase.deleteMany({ where: { levelId: lv.id } });
    await prisma.testCase.createMany({
      data: lv.testCases.map((tc) => ({ levelId: lv.id, ...tc })),
    });
  }

  // A short summary so a successful run is obvious.
  console.log(
    `Seeded: ${skills.length} skills, ${goalProfiles.length} goal weights, ${levels.length} levels.`,
  );
}

// Run, and always disconnect — a dangling connection would keep the process alive.
seed()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
