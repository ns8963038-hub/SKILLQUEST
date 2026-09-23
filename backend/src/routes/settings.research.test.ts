import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Rejoining the research from Settings must give the student a participant code
// (as the consent screen does), before consent is recorded.
const order: string[] = [];
const db = vi.hoisted(() => ({
  profile: {
    findUniqueOrThrow: vi.fn(async () => ({ hoursPerWeek: 5, goalText: '', goalCategory: 'general_placement' })),
    update: vi.fn(),
  },
  roadmap: { findFirst: vi.fn(async () => ({ params: {} })) },
  userTargetCompany: { findMany: vi.fn(async () => []) },
  company: { findMany: vi.fn(async () => []) },
  event: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));
vi.mock('../db', () => ({ prisma: db }));
const participants = vi.hoisted(() => ({ assignParticipantCode: vi.fn() }));
vi.mock('../research/participants', () => participants);

import { settingsRouter } from './settings';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = 's1';
    next();
  });
  a.use('/api', settingsRouter);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  participants.assignParticipantCode.mockImplementation(async () => void order.push('code'));
  db.profile.update.mockImplementation(async () => void order.push('consent'));
});

describe('PUT /api/settings research participation', () => {
  it('rejoining assigns a participant code first, then records consent', async () => {
    await request(app()).put('/api/settings').send({ researchParticipation: true });
    expect(participants.assignParticipantCode).toHaveBeenCalledWith('s1');
    expect(order).toEqual(['code', 'consent']);
  });

  it('withdrawing assigns nothing', async () => {
    await request(app()).put('/api/settings').send({ researchParticipation: false });
    expect(participants.assignParticipantCode).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings display name', () => {
  it('refuses a name the whole batch shouldn’t see, and saves nothing', async () => {
    const res = await request(app()).put('/api/settings').send({ displayName: 'Big Sh1t' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('display_name');
    expect(db.profile.update).not.toHaveBeenCalled();
  });

  it('saves an ordinary name, tidied', async () => {
    await request(app()).put('/api/settings').send({ displayName: '  Asha   R ' });
    expect(db.profile.update.mock.calls[0]![0].data.fullName).toBe('Asha R');
  });
});
