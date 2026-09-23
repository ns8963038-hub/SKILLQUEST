import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Locks on the real level and lesson routes. The student's roadmap has loops
// current and arrays locked; every route that serves or records anything about
// arrays must answer 403 — and must not run code, charge a hint or write a row.
const db = vi.hoisted(() => ({
  // Honours the per-skill filter the lock check uses.
  roadmap: {
    findFirst: vi.fn(async (args: { select: { items?: { where?: { skillId: string } } } }) => {
      const items = [
        { skillId: 'loops', status: 'current' },
        { skillId: 'arrays', status: 'locked' },
      ];
      const only = args.select.items?.where?.skillId;
      return { items: only ? items.filter((i) => i.skillId === only) : items };
    }),
  },
  skillPrerequisite: { findMany: vi.fn(async () => []) },
  skill: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      ['loops', 'arrays'].includes(where.id) ? { id: where.id } : null,
    ),
  },
  level: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id.startsWith('arrays-') ? { id: where.id, skillId: 'arrays', published: true } : null,
    ),
  },
  userLevel: { upsert: vi.fn(), update: vi.fn() },
  userLesson: { upsert: vi.fn() },
  submission: { create: vi.fn() },
  event: { create: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock('../db', () => ({ prisma: db }));
const runner = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../execution', () => ({ getExecutor: () => runner }));

import { levelsRouter } from './levels';
import { lessonsRouter } from './lessons';
import { errorHandler } from '../errors';

let student = 0;
function app() {
  const userId = `student-${++student}`; // fresh per test: rate limits never interfere
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = userId;
    next();
  });
  a.use('/api', levelsRouter, lessonsRouter);
  a.use(errorHandler);
  return a;
}

beforeEach(() => vi.clearAllMocks());

const code = { sourceCode: 'class Main { public static void main(String[] a) { System.out.println(1); } }' };
const LOCKED: [string, string, object?][] = [
  ['get', '/api/levels/arrays-01'],
  ['post', '/api/levels/arrays-01/run', code],
  ['post', '/api/levels/arrays-01/submit', code],
  ['post', '/api/levels/arrays-01/hint'],
  ['get', '/api/skills/arrays/next-level'],
  ['get', '/api/lessons/arrays'],
  ['post', '/api/lessons/arrays/start'],
  ['post', '/api/lessons/arrays/answer', { stepId: 'predict-1', choice: 0 }],
  ['post', '/api/lessons/arrays/fill', { stepId: 'fill-1', answer: 'i < n' }],
  ['post', '/api/lessons/arrays/reveal', { stepId: 'fill-1' }],
  ['post', '/api/lessons/arrays/complete'],
  ['post', '/api/lessons/arrays/skip'],
];

describe('a skill the roadmap has not unlocked', () => {
  it.each(LOCKED)('%s %s answers 403 skill_locked and records nothing', async (method, path, body) => {
    const req = method === 'get' ? request(app()).get(path) : request(app()).post(path).send(body ?? {});
    const res = await req;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('skill_locked');
    expect(runner.run).not.toHaveBeenCalled();
    for (const write of [db.userLevel.upsert, db.userLevel.update, db.userLesson.upsert, db.submission.create, db.event.create, db.$transaction, db.$executeRaw]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('an unknown level still answers 404, not 403', async () => {
    const res = await request(app()).get('/api/levels/nope-01');
    expect(res.status).toBe(404);
  });
});

describe('a topic that does not exist', () => {
  it.each([
    ['get', '/api/lessons/nope'],
    ['post', '/api/lessons/nope/start'],
    ['post', '/api/lessons/nope/skip'],
    ['get', '/api/skills/nope/next-level'],
  ])('%s %s answers 404 (not a 500 from writing a row for it)', async (method, path) => {
    const res = await (method === 'get' ? request(app()).get(path) : request(app()).post(path).send({}));
    expect(res.status).toBe(404);
    expect(db.userLesson.upsert).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
  });
});
