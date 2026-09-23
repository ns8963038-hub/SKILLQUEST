import { describe, expect, it, vi } from 'vitest';

// computePlacementForUser on a fake database: one TCS role needing loops,
// methods and arrays (equal weight). The student tested out of loops in the
// quiz, and has done ONE of the two methods levels.
const db = vi.hoisted(() => ({
  roadmap: { findFirst: vi.fn(async () => ({ params: { testedOut: ['loops'] } })) },
  level: {
    findMany: vi.fn(async () => [
      { id: 'loops-01', skillId: 'loops' },
      { id: 'methods-01', skillId: 'methods' },
      { id: 'methods-02', skillId: 'methods' },
      { id: 'arrays-01', skillId: 'arrays' },
    ]),
  },
  userLevel: { findMany: vi.fn(async () => [{ levelId: 'methods-01' }]) },
  userTargetCompany: { findMany: vi.fn(async () => [{ companyId: 'tcs' }]) },
  companyRoleProfile: {
    findMany: vi.fn(async () => [
      {
        companyId: 'tcs',
        company: { name: 'TCS' },
        roleTitle: 'Ninja',
        sourceUrl: 'https://example.com',
        collectedOn: new Date('2026-08-01'),
        externalRequirements: ['SQL'],
        skills: ['loops', 'methods', 'arrays'].map((skillId) => ({
          skillId,
          weight: 1,
          jdPhrase: null,
          skill: { title: skillId },
        })),
      },
    ]),
  },
}));
vi.mock('../db', () => ({ prisma: db }));

import { computePlacementForUser } from './compute';

describe('computePlacementForUser', () => {
  it('counts a tested-out skill as covered, and half a skill as not', async () => {
    const [role] = await computePlacementForUser('student-1');
    // loops (tested out) covered; methods (1 of 2 levels) and arrays not: 1/3.
    expect(role!.score).toBe(33);
    expect(role!.missingAvailableNow.map((m) => m.skillId).sort()).toEqual(['arrays', 'methods']);
  });
});
