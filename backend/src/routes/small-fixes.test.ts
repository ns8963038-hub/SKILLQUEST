import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Route-level checks for the small review fixes: admins by user id, participant
// codes assigned once at consent, and the hint cost taken atomically.
const db = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(),
    upsert: vi.fn(async (args: { create: { isAdmin: boolean } }) => ({ id: 'x', isAdmin: args.create.isAdmin, consentVersion: null })),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(async () => [{ n: 7n }]),
  event: { create: vi.fn() },
  level: { findUnique: vi.fn() },
  userLevel: { upsert: vi.fn(), updateMany: vi.fn() },
  roadmap: { findFirst: vi.fn(async () => ({ items: [{ skillId: 'loops', status: 'current' }] })) },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));
vi.mock('../db', () => ({ prisma: db }));
vi.mock('../env', () => ({
  env: { ADMIN_USER_IDS: ['11111111-1111-1111-1111-111111111111'], AI_SERVICE_URL: 'http://ai.test' },
}));

import { meRouter } from './me';
import { consentRouter } from './consent';
import { levelsRouter } from './levels';
import { errorHandler } from '../errors';

function app(userId: string, email = 'someone@example.com') {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = userId;
    req.userEmail = email;
    next();
  });
  a.use('/api', meRouter, consentRouter, levelsRouter);
  a.use(errorHandler);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe('admins are granted by user id, never by email', () => {
  it('makes the listed user id an admin', async () => {
    db.profile.findUnique.mockResolvedValueOnce(null);
    await request(app('11111111-1111-1111-1111-111111111111')).get('/api/me');
    expect(db.profile.upsert.mock.calls[0]![0].create.isAdmin).toBe(true);
  });

  it('does not make an admin of someone who signs up with a team member’s email', async () => {
    db.profile.findUnique.mockResolvedValueOnce(null);
    await request(app('22222222-2222-2222-2222-222222222222', 'nandan@team.example')).get('/api/me');
    expect(db.profile.upsert.mock.calls[0]![0].create.isAdmin).toBe(false);
  });
});

describe('participant codes are assigned once, at consent', () => {
  it('gives a consenting student the next code from the sequence', async () => {
    db.profile.findUnique.mockResolvedValueOnce({ participantCode: null, isAdmin: false });
    await request(app('s1')).post('/api/consent').send({ decision: 'agree' });
    expect(db.profile.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', participantCode: null }, // never overwrites a code once given
      data: { participantCode: 'P07' },
    });
  });

  it('keeps an existing code, and gives none to the team or to a student who declines', async () => {
    db.profile.findUnique.mockResolvedValueOnce({ participantCode: 'P03', isAdmin: false });
    await request(app('s1')).post('/api/consent').send({ decision: 'agree' });
    db.profile.findUnique.mockResolvedValueOnce({ participantCode: null, isAdmin: true });
    await request(app('admin')).post('/api/consent').send({ decision: 'agree' });
    await request(app('s2')).post('/api/consent').send({ decision: 'decline' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.profile.updateMany).not.toHaveBeenCalled();
  });
});

describe('the hint cost', () => {
  beforeEach(() => {
    db.level.findUnique.mockResolvedValue({ skillId: 'loops', published: true, hints: ['h1', 'h2'] });
    db.userLevel.upsert.mockResolvedValue({ hintsUsed: 0 });
    db.userLevel.updateMany.mockResolvedValue({ count: 1 });
  });

  it('is taken with an atomic decrement, not by writing back a number read earlier', async () => {
    db.profile.update.mockResolvedValueOnce({ totalXp: 45 }); // 50 before
    const res = await request(app('s1')).post('/api/levels/loops-01/hint');
    expect(res.body).toMatchObject({ xpCost: 5, totalXp: 45 });
    expect(db.profile.update).toHaveBeenCalledTimes(1);
    expect(db.profile.update.mock.calls[0]![0].data).toEqual({ totalXp: { decrement: 5 } });
  });

  it('never leaves XP below zero', async () => {
    db.profile.update.mockResolvedValueOnce({ totalXp: -2 }); // 3 before
    const res = await request(app('s1')).post('/api/levels/loops-01/hint');
    expect(res.body).toMatchObject({ xpCost: 3, totalXp: 0 });
    expect(db.profile.update.mock.calls[1]![0].data).toEqual({ totalXp: 0 });
  });
});
