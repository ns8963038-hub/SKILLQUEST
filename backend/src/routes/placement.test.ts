import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// GET /api/placement marks each gap SkillQuest teaches as open or not, by the
// same rule the level and lesson routes enforce.
vi.mock('../placement/compute', () => ({
  computePlacementForUser: vi.fn(async () => [
    {
      companyId: 'tcs',
      companyName: 'TCS',
      roleTitle: 'Ninja',
      score: 40,
      missingAvailableNow: [
        { skillId: 'methods', title: 'Methods' },
        { skillId: 'arrays', title: 'Arrays' },
      ],
      missingExternal: [],
    },
  ]),
}));
vi.mock('../progress/access', () => ({
  openSkillChecker: vi.fn(async () => (skillId: string) => skillId === 'methods'),
}));

import { placementRouter } from './placement';

describe('GET /api/placement', () => {
  it('says which gaps the student can train now', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.userId = 'student-1';
      next();
    });
    app.use('/api', placementRouter);
    const res = await request(app).get('/api/placement');
    expect(res.body.roles[0].missingAvailableNow).toEqual([
      { skillId: 'methods', title: 'Methods', open: true },
      { skillId: 'arrays', title: 'Arrays', open: false },
    ]);
  });
});
