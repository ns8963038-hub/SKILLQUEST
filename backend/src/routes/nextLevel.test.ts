import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// GET /api/skills/:skillId/next-level: the lesson comes first only while the
// skill still has levels to finish. (The lock check is tested in locks.test.ts.)
vi.mock('../db', () => ({ prisma: {} }));
vi.mock('../progress/access', () => ({
  guardSkill: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  skillOfLevel: vi.fn(),
  existingSkill: vi.fn(),
}));
const progress = vi.hoisted(() => ({
  nextLevelInSkill: vi.fn(async () => 'loops-01'),
  firstUnfinishedInSkill: vi.fn(),
  nextLevelAfter: vi.fn(),
}));
vi.mock('../progress/levels', () => progress);
vi.mock('../lessons/progress', () => ({
  lessonStateBySkill: vi.fn(async () => new Map([['loops', 'new']])),
  lessonComesFirst: (s: string) => s === 'new' || s === 'started',
}));

import { levelsRouter } from './levels';

const app = express();
app.use((req, _res, next) => {
  req.userId = 'student-1';
  next();
});
app.use('/api', levelsRouter);

describe('GET /api/skills/:skillId/next-level', () => {
  it('sends a student with levels still to do to the lesson first', async () => {
    progress.firstUnfinishedInSkill.mockResolvedValueOnce('loops-02');
    const res = await request(app).get('/api/skills/loops/next-level');
    expect(res.body).toMatchObject({ lessonFirst: true });
  });

  it('opens the level (lesson optional) once every level is finished', async () => {
    progress.firstUnfinishedInSkill.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/skills/loops/next-level');
    expect(res.body).toMatchObject({ levelId: 'loops-01', lessonFirst: false });
  });
});
