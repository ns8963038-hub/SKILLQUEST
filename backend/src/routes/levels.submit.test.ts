import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The real run/submit routes, with the database and the code runner mocked. The
// "database" is a small in-memory fake of the rows these routes touch, so the
// tests can check what a request RECORDS, not just what it answers:
//   - a runner failure leaves no trace (503, nothing written);
//   - "Run examples" runs the visible tests only and writes nothing;
//   - the untouched starter code is refused before it runs;
//   - only a level's FIRST graded submit moves the mastery estimate.
const STARTER = 'class Main {\n  // your code here\n}';
const VISIBLE = { stdin: '3', expectedOutput: '6', isHidden: false, ordinal: 1 };
const HIDDEN = { stdin: '4', expectedOutput: '10', isHidden: true, ordinal: 2 };

const store = vi.hoisted(() => ({
  hintsUsed: 0, // hints the student took on this (the skill's only) level
  attempts: 0, // user_levels.attempts for the one level
  completed: false, // user_levels.status === 'completed'
  mastery: null as null | { pMastery: number }, // skill_mastery row
}));

const db = vi.hoisted(() => ({
  level: {
    // The skill's published levels (for the Code Master check): just this one.
    findMany: vi.fn(async () => [{ id: 'loops-01' }]),
    // Honours the one filter the routes use: `where: { isHidden: false }`.
    findUnique: vi.fn(async (args: { include?: { testCases?: { where?: { isHidden?: boolean } } } }) => ({
      id: 'loops-01',
      skillId: 'loops',
      published: true,
      starterCode: STARTER,
      timeLimitMs: 5000,
      xpReward: 50,
      testCases: args.include?.testCases?.where?.isHidden === false ? [VISIBLE] : [VISIBLE, HIDDEN],
      skill: { title: 'Loops' },
    })),
  },
  userLevel: {
    upsert: vi.fn(async () => {
      store.attempts += 1;
      return { attempts: store.attempts, bestPassRatio: 0, hintsUsed: 0 };
    }),
    update: vi.fn(),
    updateMany: vi.fn(async () => {
      if (store.completed) return { count: 0 };
      store.completed = true;
      return { count: 1 };
    }),
    count: vi.fn(async () => 1),
    findMany: vi.fn(async () => [{ status: store.completed ? 'completed' : 'unlocked', hintsUsed: store.hintsUsed }]),
  },
  profile: {
    update: vi.fn(),
    findUnique: vi.fn(async () => ({ currentStreak: 0, bestStreak: 0, lastActiveDate: null })),
  },
  userBadge: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null), createMany: vi.fn() },
  badge: { findMany: vi.fn(async () => []) },
  skillMastery: {
    findUnique: vi.fn(async () => store.mastery),
    upsert: vi.fn(async (args: { update: { pMastery: number } }) => {
      store.mastery = { pMastery: args.update.pMastery };
    }),
  },
  submission: { create: vi.fn() },
  event: { create: vi.fn() },
  // The lock check (progress/access.ts): loops is this student's current skill.
  roadmap: { findFirst: vi.fn(async () => ({ items: [{ skillId: 'loops', status: 'current' }] })) }, // the only skill asked about
  skillPrerequisite: { findMany: vi.fn(async () => []) },
  // The transaction runs its callback against the same fake.
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));
vi.mock('../db', () => ({ prisma: db }));
const runner = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../execution', () => ({ getExecutor: () => runner }));
// Follow-up work after a submit, not under test here.
vi.mock('../roadmap/advance', () => ({ advanceRoadmap: vi.fn() }));
vi.mock('../placement/compute', () => ({ computePlacementForUser: vi.fn(async () => []) }));
vi.mock('../progress/levels', () => ({ nextLevelAfter: vi.fn(async () => null), nextLevelInSkill: vi.fn() }));

import { levelsRouter } from './levels';
import { errorHandler } from '../errors';
import { RunnerUnavailableError } from '../execution/types';
import { DEFAULT_BKT, bktUpdate } from '../tutor/bkt';

// A fresh student per test, so the per-student rate limits never interfere.
let student = 0;
function app() {
  const userId = `student-${++student}`;
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = userId;
    next();
  });
  a.use('/api', levelsRouter);
  a.use(errorHandler);
  return a;
}

// What the runner reports for a given number of test cases, all passing or not.
const runResult = (count: number, passed: boolean) => ({
  verdict: passed ? 'accepted' : 'wrong_answer',
  results: Array.from({ length: count }, () => ({ passed, actualOutput: passed ? 'ok' : 'wrong' })),
});

const SOLUTION = 'class Main { public static void main(String[] a) { /* solved */ } }';

beforeEach(() => {
  vi.clearAllMocks();
  store.attempts = 0;
  store.hintsUsed = 0;
  store.completed = false;
  store.mastery = null;
});

// Nothing about the student was written.
function expectNothingRecorded() {
  expect(db.$transaction).not.toHaveBeenCalled(); // no attempt, no mastery update
  expect(db.submission.create).not.toHaveBeenCalled(); // no submission stored
  expect(db.userLevel.upsert).not.toHaveBeenCalled();
  expect(db.skillMastery.upsert).not.toHaveBeenCalled();
  expect(db.event.create).not.toHaveBeenCalled(); // not even activity for the streak
}

describe('POST /api/levels/:id/submit when the runner fails', () => {
  it('answers 503 and records nothing about the student', async () => {
    runner.run.mockRejectedValueOnce(new RunnerUnavailableError('Paiza create failed: 429'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app()).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    warn.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('runner_unavailable');
    expectNothingRecorded();
  });
});

describe('POST /api/levels/:id/run ("Run examples")', () => {
  it('runs the visible tests only and records nothing', async () => {
    runner.run.mockResolvedValueOnce(runResult(1, true));
    const res = await request(app()).post('/api/levels/loops-01/run').send({ sourceCode: SOLUTION });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'examples', passed: 1, total: 1 });
    // The runner was given the visible case only — hidden tests are for Submit.
    const [, tests] = runner.run.mock.calls[0]!;
    expect(tests).toEqual([{ stdin: '3', expectedOutput: '6', isHidden: false }]);
    expect(res.body.cases[0]).toMatchObject({ stdin: '3', expectedOutput: '6', passed: true });
    expectNothingRecorded();
  });
});

describe('POST /api/levels/:id/submit with the untouched starter code', () => {
  it('is refused with 422 before anything runs, even re-indented', async () => {
    const reindented = '  class Main {\n\n      // your code here\n  }\n';
    const res = await request(app()).post('/api/levels/loops-01/submit').send({ sourceCode: reindented });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('unchanged_starter');
    expect(runner.run).not.toHaveBeenCalled();
    expectNothingRecorded();
  });
});

describe('POST /api/levels/:id/submit: only the first graded submit is evidence', () => {
  it('a solve followed by two more submits of the same level does not reach "mastered"', async () => {
    // The reviewer's case: before this, 0.20 -> 0.60 -> 0.89 -> 0.98 = mastered
    // from ONE solved level submitted three times.
    const a = app();
    const submit = async () => {
      runner.run.mockResolvedValueOnce(runResult(2, true));
      return request(a).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    };

    const first = await submit();
    const once = bktUpdate(DEFAULT_BKT.pL0, true);
    expect(first.body.mastery).toMatchObject({ counted: true, before: DEFAULT_BKT.pL0, mastered: false });
    expect(first.body.mastery.after).toBeCloseTo(once);
    expect(first.body.xpAwarded).toBe(50);

    const second = await submit();
    const third = await submit();
    for (const later of [second, third]) {
      expect(later.status).toBe(200);
      expect(later.body.mastery).toMatchObject({ counted: false, mastered: false });
      expect(later.body.mastery.before).toBeCloseTo(once);
      expect(later.body.mastery.after).toBeCloseTo(once); // unchanged
      expect(later.body.xpAwarded).toBe(0); // XP was already awarded once
    }
    expect(db.skillMastery.upsert).toHaveBeenCalledTimes(1);
    expect(store.mastery?.pMastery).toBeCloseTo(once);
    // Every graded submit is still stored (the research log keeps all attempts).
    expect(db.submission.create).toHaveBeenCalledTimes(3);
  });

  it('a first submit that fails is the evidence; the later pass still completes the level', async () => {
    const a = app();
    runner.run.mockResolvedValueOnce(runResult(2, false));
    const fail = await request(a).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    const afterFail = bktUpdate(DEFAULT_BKT.pL0, false);
    expect(fail.body.mastery).toMatchObject({ counted: true });
    expect(fail.body.mastery.after).toBeCloseTo(afterFail);

    runner.run.mockResolvedValueOnce(runResult(2, true));
    const pass = await request(a).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    expect(pass.body.passed).toBe(2);
    expect(pass.body.xpAwarded).toBe(50); // completion and XP don't depend on the first try
    expect(pass.body.mastery).toMatchObject({ counted: false });
    expect(pass.body.mastery.after).toBeCloseTo(afterFail);
    expect(db.skillMastery.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('Code Master: a whole skill finished without hints', () => {
  const awarded = () => db.userBadge.createMany.mock.calls.flatMap(([args]) => args.data.map((d: { badgeId: string }) => d.badgeId));

  it('is awarded when the completion finishes the skill and no hint was used', async () => {
    runner.run.mockResolvedValueOnce(runResult(2, true));
    await request(app()).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    expect(awarded()).toContain('code_master');
  });

  it('is not awarded if a hint was used on the skill', async () => {
    store.hintsUsed = 1;
    runner.run.mockResolvedValueOnce(runResult(2, true));
    await request(app()).post('/api/levels/loops-01/submit').send({ sourceCode: SOLUTION });
    expect(awarded()).not.toContain('code_master');
  });
});
