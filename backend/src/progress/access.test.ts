import { beforeEach, describe, expect, it, vi } from 'vitest';

// skillIsOpen against a fake database: a roadmap with one skill of each status,
// and a prerequisite table for skills that are not on the roadmap.
const db = vi.hoisted(() => ({
  roadmap: { findFirst: vi.fn() },
  skillPrerequisite: { findMany: vi.fn() },
}));
vi.mock('../db', () => ({ prisma: db }));

import { openSkillChecker, skillIsOpen } from './access';

const ROADMAP = {
  items: [
    { skillId: 'loops', status: 'completed' },
    { skillId: 'methods', status: 'current' },
    { skillId: 'arrays', status: 'locked' },
  ],
};
const PREREQS: Record<string, string[]> = {
  conditionals: ['operators-expressions'], // tested out, and so is its prerequisite
  recursion: ['methods', 'arrays'], // not on the plan, but builds on unfinished skills
  strings: ['loops'], // not on the plan, builds only on finished skills
};

beforeEach(() => {
  vi.clearAllMocks();
  db.roadmap.findFirst.mockResolvedValue(ROADMAP);
  db.skillPrerequisite.findMany.mockResolvedValue(
    Object.entries(PREREQS).flatMap(([skillId, prereqs]) => prereqs.map((prereqId) => ({ skillId, prereqId }))),
  );
});

describe('skillIsOpen', () => {
  it('opens the current skill and finished ones, and nothing the roadmap has locked', async () => {
    expect(await skillIsOpen('u', 'loops')).toBe(true);
    expect(await skillIsOpen('u', 'methods')).toBe(true);
    expect(await skillIsOpen('u', 'arrays')).toBe(false);
  });

  it('opens a skill that is off the plan only once everything it builds on is done', async () => {
    expect(await skillIsOpen('u', 'conditionals')).toBe(true); // its prerequisite is off the plan too
    expect(await skillIsOpen('u', 'strings')).toBe(true); // loops is completed
    expect(await skillIsOpen('u', 'recursion')).toBe(false); // methods current, arrays locked
  });

  it('opens nothing before onboarding has produced a roadmap', async () => {
    db.roadmap.findFirst.mockResolvedValue(null);
    expect(await skillIsOpen('u', 'loops')).toBe(false);
  });

  it('answers for many skills from one load of the roadmap and the graph', async () => {
    const isOpen = await openSkillChecker('u');
    expect(['loops', 'methods', 'arrays', 'strings', 'recursion'].map(isOpen)).toEqual([true, true, false, true, false]);
    expect(db.roadmap.findFirst).toHaveBeenCalledTimes(1);
    expect(db.skillPrerequisite.findMany).toHaveBeenCalledTimes(1);
  });
});
