import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The real submit route, with the database and the code runner mocked, to prove
// that a runner failure leaves NO trace: no attempt, no failed submission, no
// mastery change — just a 503 telling the student to try again.
const db = vi.hoisted(() => ({
  level: {
    findUnique: vi.fn(async () => ({
      id: 'loops-01',
      skillId: 'loops',
      published: true,
      timeLimitMs: 5000,
      xpReward: 50,
      testCases: [{ stdin: '3', expectedOutput: '6', isHidden: false, ordinal: 1 }],
      skill: { title: 'Loops' },
    })),
  },
  $transaction: vi.fn(),
  submission: { create: vi.fn() },
  userLevel: { upsert: vi.fn() },
  event: { create: vi.fn() },
}));
vi.mock('../db', () => ({ prisma: db }));
const runner = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../execution', () => ({ getExecutor: () => runner }));

import { levelsRouter } from './levels';
import { errorHandler } from '../errors';
import { RunnerUnavailableError } from '../execution/types';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = 'student-1';
    next();
  });
  a.use('/api', levelsRouter);
  a.use(errorHandler);
  return a;
}

describe('POST /api/levels/:id/submit when the runner fails', () => {
  it('answers 503 and records nothing about the student', async () => {
    runner.run.mockRejectedValueOnce(new RunnerUnavailableError('Paiza create failed: 429'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app()).post('/api/levels/loops-01/submit').send({ sourceCode: 'class Main {}' });
    warn.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('runner_unavailable');
    expect(db.$transaction).not.toHaveBeenCalled(); // no attempt, no mastery update
    expect(db.submission.create).not.toHaveBeenCalled(); // no failed submission stored
    expect(db.userLevel.upsert).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
  });
});
