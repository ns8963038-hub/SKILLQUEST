// Seed script: loads the versioned content in /content into the database.
//
// It is IDEMPOTENT — safe to run any number of times. It upserts by primary key,
// and it VALIDATES the content before writing a single row: the JSON shape is
// checked with zod, and the skill graph is proven acyclic. A bad edge or a typo
// therefore fails loudly here, never in a half-loaded database.
//
// It also SURVIVES A DROPPED CONNECTION. Every write is a small unit that is safe
// to repeat — an upsert, or a clear-and-refill inside ONE transaction, so a table
// is never left cleared but not refilled — and each unit is retried while the
// failure is the connection's fault (src/dbRetry.ts). At the end it reads the
// database back and checks nothing is missing, so "Seeded" means it really is.
//
// Run with:  npm run seed   (from the backend/ directory)

import 'dotenv/config'; // load DATABASE_URL from .env before Prisma connects
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { withDbRetry } from '../src/dbRetry';

// The seed is a long admin job, so it uses the SESSION connection (DIRECT_URL,
// the one `prisma migrate deploy` uses) rather than the transaction pooler the
// running API shares. Falls back to DATABASE_URL when no DIRECT_URL is set.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

// One unit of work, retried while the connection is the problem. After a drop
// the dead connection is closed, so the next attempt starts on a fresh one.
function unit<T>(label: string, work: () => Promise<T>): Promise<T> {
  return withDbRetry(label, work, {
    onRetry: async ({ attempt, of, waitMs, error }) => {
      console.warn(`  connection dropped during ${label} (${error.message.split('\n').pop()?.trim()}) — retry ${attempt}/${of} in ${waitMs / 1000}s`);
      await prisma.$disconnect().catch(() => undefined);
    },
  });
}

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

// One lesson file (Learn mode, PRD F8). The step details are checked in depth by
// content/build-lessons.mjs (which also generates the answers and traces); here
// we make sure the generated fields are present, so an unbuilt lesson can never
// reach the database.
const LessonStepSchema = z
  .object({ id: z.string(), type: z.enum(['hook', 'predict', 'trace', 'explain', 'fill', 'concept']) })
  .passthrough()
  .superRefine((step, ctx) => {
    const s = step as Record<string, unknown>;
    const missing =
      (step.type === 'predict' && typeof s.answer !== 'number' && 'answer') ||
      (step.type === 'trace' && !s.trace && 'trace') ||
      (step.type === 'fill' && typeof s.expectedOutput !== 'string' && 'expectedOutput') ||
      // Hidden cases need their generated check program and output.
      (step.type === 'fill' && s.cases !== undefined && (typeof s.checkProgram !== 'string' || typeof s.checkOutput !== 'string') && 'checkProgram/checkOutput') ||
      // A concept step is inlined from content/questions/java-oop.json.
      (step.type === 'concept' && (typeof s.answer !== 'number' || !Array.isArray(s.options) || !s.question) && 'question/options/answer');
    if (missing) ctx.addIssue({ code: 'custom', message: `step "${step.id}" has no ${missing} — run: node content/build-lessons.mjs --fill` });
  });
const LessonSchema = z.object({
  skillId: z.string(),
  title: z.string(),
  minutes: z.number().int().positive().default(5),
  version: z.number().int().positive().default(1),
  steps: z.array(LessonStepSchema).min(1),
});
type Lesson = z.infer<typeof LessonSchema>;

// One badge in the catalog (display data; award rules live in the app).
const BadgeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  criteria: z.string().optional(),
});
type Badge = z.infer<typeof BadgeSchema>;

// One placement-quiz question (quiz.json). The programs themselves are
// compiled and run by content/verify-quiz.mjs; here only the shape is checked.
const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    topicSkillId: z.string(),
    prompt: z.string().min(1),
    code: z.string().min(1),
    options: z.array(z.string()).length(4),
    correctIndex: z.number().int().min(0).max(3),
  })
  .passthrough(); // `wrap` is for the checker only
type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

// Read a JSON file and return its parsed object.
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Load + validate quiz.json.
function loadQuiz(): QuizQuestion[] {
  const raw = readJson(join(CONTENT_DIR, 'quiz.json')) as { questions: unknown[] };
  return raw.questions.map((q) => QuizQuestionSchema.parse(q));
}

// Load + validate badges.json.
function loadBadges(): Badge[] {
  const raw = readJson(join(CONTENT_DIR, 'badges.json')) as { badges: unknown[] };
  return raw.badges.map((b) => BadgeSchema.parse(b));
}

// Company role profiles for placement scoring.
const CompanyRoleSchema = z.object({
  roleTitle: z.string(),
  location: z.string().optional(),
  sourceUrl: z.string(),
  collectedOn: z.string(), // ISO date
  profileVersion: z.number().int().positive(),
  externalRequirements: z.array(z.string()).default([]),
  skills: z.array(
    z.object({
      skillId: z.string(),
      weight: z.number().positive(),
      jdPhrase: z.string().optional(),
    }),
  ),
});
const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  logo: z.string().nullish(),
  roles: z.array(CompanyRoleSchema),
});
type Company = z.infer<typeof CompanySchema>;

function loadCompanies(): Company[] {
  const raw = readJson(join(CONTENT_DIR, 'companies.json')) as { companies: unknown[] };
  return raw.companies.map((c) => CompanySchema.parse(c));
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

// Load + validate every lessons/*.json file (the folder may not exist yet).
function loadLessons(): Lesson[] {
  const dir = join(CONTENT_DIR, 'lessons');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((f) => {
    const parsed = LessonSchema.safeParse(readJson(join(dir, f)));
    if (!parsed.success) throw new Error(`lessons/${f}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    return parsed.data;
  });
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
  const lessons = loadLessons();
  const badges = loadBadges();
  const companies = loadCompanies();
  const quiz = loadQuiz();

  // Validate BEFORE any write — nothing touches the DB unless everything is sound.
  assertValidGraph(skills);
  assertLevelsReferenceSkills(levels, skills);
  // Every company skill (and every quiz topic) must map to a real skill.
  const skillIds = new Set(skills.map((s) => s.id));
  for (const q of quiz) {
    if (!skillIds.has(q.topicSkillId)) throw new Error(`Quiz question "${q.id}" references unknown skill "${q.topicSkillId}"`);
  }
  for (const c of companies) {
    for (const r of c.roles) {
      for (const cs of r.skills) {
        if (!skillIds.has(cs.skillId)) {
          throw new Error(`Company "${c.id}" role "${r.roleTitle}" references unknown skill "${cs.skillId}"`);
        }
      }
    }
  }

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
    await unit(`skill ${s.id}`, () => prisma.skill.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data }));
  }
  console.log(`  skills ${skills.length}/${skills.length}`);

  // Prerequisite edges: clear and rebuild, so removing an edge in JSON removes it
  // from the DB too — in ONE transaction, so the roadmap engine never sees a
  // half-empty graph.
  const edges = skills.flatMap((s) => s.prerequisites.map((prereqId) => ({ skillId: s.id, prereqId })));
  await unit('prerequisites', () =>
    prisma.$transaction([prisma.skillPrerequisite.deleteMany(), prisma.skillPrerequisite.createMany({ data: edges })]),
  );
  console.log(`  prerequisite links ${edges.length}`);

  // Goal weight vectors: clear and rebuild the same way.
  await unit('goal weights', () =>
    prisma.$transaction([prisma.goalProfile.deleteMany(), prisma.goalProfile.createMany({ data: goalProfiles })]),
  );
  console.log(`  goal weights ${goalProfiles.length}`);

  // Levels with their test cases, one transaction per level: a level is never
  // left without its tests (which would let any submission "pass").
  let doneLevels = 0;
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
    await unit(`level ${lv.id}`, () =>
      prisma.$transaction([
        prisma.level.upsert({ where: { id: lv.id }, create: { id: lv.id, ...data }, update: data }),
        // Replace this level's test cases so edits in JSON fully take effect.
        prisma.testCase.deleteMany({ where: { levelId: lv.id } }),
        prisma.testCase.createMany({ data: lv.testCases.map((tc) => ({ levelId: lv.id, ...tc })) }),
      ]),
    );
    doneLevels++;
    if (doneLevels % 10 === 0 || doneLevels === levels.length) console.log(`  levels ${doneLevels}/${levels.length}`);
  }

  // Lessons (Learn mode): one per skill, the steps stored as jsonb.
  const knownSkills = new Set(skills.map((sk) => sk.id));
  for (const ls of lessons) {
    if (!knownSkills.has(ls.skillId)) throw new Error(`Lesson "${ls.skillId}" references an unknown skill`);
    const data = {
      title: ls.title,
      minutes: ls.minutes,
      version: ls.version,
      content: { steps: ls.steps } as Prisma.InputJsonObject,
      published: true,
    };
    await unit(`lesson ${ls.skillId}`, () =>
      prisma.lesson.upsert({ where: { skillId: ls.skillId }, create: { skillId: ls.skillId, ...data }, update: data }),
    );
  }
  console.log(`  lessons ${lessons.length}/${lessons.length}`);

  // Placement quiz: upsert each question; any question no longer in the content
  // is unpublished (not deleted), so the answers already given to it stay
  // traceable to what was asked.
  for (const [ordinal, q] of quiz.entries()) {
    const data = {
      version: q.version,
      topicSkillId: q.topicSkillId,
      ordinal,
      prompt: q.prompt,
      code: q.code,
      options: q.options,
      correctIndex: q.correctIndex,
      published: true,
    };
    await unit(`quiz ${q.id}`, () => prisma.quizQuestion.upsert({ where: { id: q.id }, create: { id: q.id, ...data }, update: data }));
  }
  await unit('quiz (retired questions)', () =>
    prisma.quizQuestion.updateMany({ where: { id: { notIn: quiz.map((q) => q.id) } }, data: { published: false } }),
  );
  console.log(`  quiz questions ${quiz.length}/${quiz.length}`);

  // Badge catalog (display data). Upsert by id.
  for (const b of badges) {
    const data = { title: b.title, description: b.description, icon: b.icon ?? null, criteria: b.criteria ?? null };
    await unit(`badge ${b.id}`, () => prisma.badge.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data }));
  }

  // Companies -> role profiles -> company skills. Re-authoring a role should
  // fully replace its skill set, so each role is upserted and its skills cleared
  // and rebuilt inside one transaction.
  let roleCount = 0;
  for (const c of companies) {
    await unit(`company ${c.id}`, () =>
      prisma.company.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, logo: c.logo ?? null },
        update: { name: c.name, logo: c.logo ?? null },
      }),
    );
    for (const r of c.roles) {
      const profileData = {
        location: r.location ?? null,
        sourceUrl: r.sourceUrl,
        collectedOn: new Date(r.collectedOn),
        isActive: true,
        externalRequirements: r.externalRequirements,
      };
      await unit(`role ${c.id} / ${r.roleTitle}`, () =>
        prisma.$transaction(
          async (tx) => {
            const profile = await tx.companyRoleProfile.upsert({
              where: {
                companyId_roleTitle_profileVersion: {
                  companyId: c.id,
                  roleTitle: r.roleTitle,
                  profileVersion: r.profileVersion,
                },
              },
              create: { companyId: c.id, roleTitle: r.roleTitle, profileVersion: r.profileVersion, ...profileData },
              update: profileData,
            });
            await tx.companySkill.deleteMany({ where: { profileId: profile.id } });
            await tx.companySkill.createMany({
              data: r.skills.map((s) => ({
                profileId: profile.id,
                skillId: s.skillId,
                weight: s.weight,
                jdPhrase: s.jdPhrase ?? null,
                isTracked: true,
              })),
            });
          },
          { timeout: 30_000 }, // three statements over a slow link can exceed the 5 s default
        ),
      );
      roleCount++;
    }
  }
  console.log(`  companies ${companies.length} (${roleCount} roles)`);

  // Read it back: prove nothing that was cleared was left empty.
  await unit('final check', () =>
    verifySeed(edges.length, goalProfiles.length, levels.map((l) => l.id), lessons.length, quiz.length),
  );

  // A short summary so a successful run is obvious.
  console.log(
    `Seeded: ${skills.length} skills, ${goalProfiles.length} goal weights, ${levels.length} levels, ${lessons.length} lessons, ${quiz.length} quiz questions, ${badges.length} badges, ${companies.length} companies (${roleCount} roles). Verified.`,
  );
}

// The database must now hold everything the content describes. Checked after
// every run, because an interrupted older run could have left a level with no
// test cases or a role with no skills.
async function verifySeed(
  edgeCount: number,
  goalCount: number,
  levelIds: string[],
  lessonCount: number,
  quizCount: number,
): Promise<void> {
  const problems: string[] = [];
  const [edgesInDb, goalsInDb, lessonsInDb, quizInDb] = await Promise.all([
    prisma.skillPrerequisite.count(),
    prisma.goalProfile.count(),
    prisma.lesson.count({ where: { published: true } }),
    prisma.quizQuestion.count({ where: { published: true } }),
  ]);
  if (quizInDb !== quizCount) problems.push(`quiz questions: ${quizInDb} published, ${quizCount} in content`);
  if (edgesInDb !== edgeCount) problems.push(`prerequisite links: ${edgesInDb} in the database, ${edgeCount} in content`);
  if (goalsInDb !== goalCount) problems.push(`goal weights: ${goalsInDb} in the database, ${goalCount} in content`);
  if (lessonsInDb < lessonCount) problems.push(`lessons: ${lessonsInDb} published, ${lessonCount} in content`);

  const levelsWithoutTests = await prisma.level.findMany({
    where: { id: { in: levelIds }, testCases: { none: {} } },
    select: { id: true },
  });
  if (levelsWithoutTests.length) problems.push(`levels with no test cases: ${levelsWithoutTests.map((l) => l.id).join(', ')}`);

  const rolesWithoutSkills = await prisma.companyRoleProfile.findMany({
    where: { isActive: true, skills: { none: {} } },
    select: { companyId: true, roleTitle: true },
  });
  if (rolesWithoutSkills.length) {
    problems.push(`roles with no skills: ${rolesWithoutSkills.map((r) => `${r.companyId}/${r.roleTitle}`).join(', ')}`);
  }

  if (problems.length) throw new Error(`the database doesn't match the content —\n  ${problems.join('\n  ')}`);
}

// Run, and always disconnect — a dangling connection would keep the process alive.
seed()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
