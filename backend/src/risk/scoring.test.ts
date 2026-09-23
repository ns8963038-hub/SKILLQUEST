import { afterEach, describe, expect, it, vi } from 'vitest';

// The weekly job against a mocked database and AI service: which students it
// picks, and that one failure doesn't stop the rest.
const db = vi.hoisted(() => ({
  profile: { findMany: vi.fn(), update: vi.fn() },
  dropoutScore: { upsert: vi.fn() },
  nudge: { create: vi.fn() },
}));
vi.mock('../db', () => ({ prisma: db }));
vi.mock('./features', () => ({ computeRiskFeatures: vi.fn(async () => ({ days_since_last_activity: 3 })) }));
vi.mock('./booster', () => ({ pickConfidenceBooster: vi.fn(async () => null) }));
const ai = vi.hoisted(() => ({ riskScore: vi.fn() }));
vi.mock('../aiClient', () => ai);

import { runWeeklyScoring } from './scoring';

const RESULT = { probability: 0.1, tier: 'healthy', modelVersion: 'rule-days-since-v1', featureSetVersion: 'fs-v4', thresholdVersion: 't' };

describe('runWeeklyScoring', () => {
  afterEach(() => vi.clearAllMocks());

  it('scores every onboarded student — no waiting period', async () => {
    db.profile.findMany.mockResolvedValue([]);
    await runWeeklyScoring(new Date('2026-10-29T12:00:00Z'));
    expect(db.profile.findMany.mock.calls[0]![0].where).toEqual({ onboardingStep: { gte: 5 } });
  });

  it('keeps going when one student fails, and reports it', async () => {
    db.profile.findMany.mockResolvedValue([
      { id: 'a', riskTier: null },
      { id: 'b', riskTier: null },
      { id: 'c', riskTier: null },
    ]);
    ai.riskScore.mockRejectedValueOnce(new Error('AI service asleep')).mockResolvedValue(RESULT);
    db.dropoutScore.upsert.mockResolvedValue({ id: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await runWeeklyScoring(new Date('2026-10-29T12:00:00Z'));
    expect(out).toMatchObject({ scored: 2, failed: 1, nudged: 0 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('nudges only on a move into at risk', async () => {
    db.profile.findMany.mockResolvedValue([
      { id: 'new-risk', riskTier: 'watch' },
      { id: 'still-risk', riskTier: 'atrisk' },
    ]);
    ai.riskScore.mockResolvedValue({ ...RESULT, tier: 'atrisk' });
    db.dropoutScore.upsert.mockResolvedValue({ id: 1 });
    const out = await runWeeklyScoring(new Date('2026-10-29T12:00:00Z'));
    expect(out).toMatchObject({ scored: 2, nudged: 1, failed: 0 });
    expect(db.nudge.create).toHaveBeenCalledOnce();
  });
});
