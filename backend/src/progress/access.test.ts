import { beforeEach, describe, expect, it, vi } from 'vitest';

// The lock rule against a fake database: a roadmap with one skill of each
// status, the quiz's tested-out list stored with it, a prerequisite table, and
// the levels the student has completed.
const db = vi.hoisted(() => ({
  roadmap: { findFirst: vi.fn() },
  skillPrerequisite: { findMany: vi.fn() },
  level: { findMany: vi.fn() },
  userLevel: { findMany: vi.fn() },
}));
vi.mock('../db', () => ({ prisma: db }));

import { openSkillChecker, skillIsOpen } from './access';

const ITEMS = [
  { skillId: 'loops', status: 'completed' },
  { skillId: 'methods', status: 'current' },
  { skillId: 'arrays', status: 'locked' },
];
const PREREQS: Record<string, string[]> = {
  conditionals: ['operators-expressions'], // off the plan; its prerequisite was tested out
  recursion: ['methods', 'arrays'], // off the plan; builds on unfinished skills
  strings: ['loops'], // off the plan; builds only on a finished skill
  hashing: ['collections'], // off the plan; collections was dropped for this goal, not learned
  'trees-basics': ['sorting'], // sorting was dropped too — but its levels are all done
};

beforeEach(() => {
  vi.clearAllMocks();
  // The roadmap query either filters items by skill (skillIsOpen) or takes all.
  db.roadmap.findFirst.mockImplementation(
    async (args: { select: { items?: { where?: { skillId: string } } } }) => {
      const only = args.select.items?.where?.skillId;
      return {
        items: only ? ITEMS.filter((i) => i.skillId === only) : ITEMS,
        params: { testedOut: ['java-basics', 'operators-expressions'] },
      };
    },
  );
  db.skillPrerequisite.findMany.mockResolvedValue(
    Object.entries(PREREQS).flatMap(([skillId, prereqs]) => prereqs.map((prereqId) => ({ skillId, prereqId }))),
  );
  db.level.findMany.mockResolvedValue([
    { id: 'sorting-01', skillId: 'sorting' },
    { id: 'sorting-02', skillId: 'sorting' },
    { id: 'collections-01', skillId: 'collections' },
  ]);
  db.userLevel.findMany.mockResolvedValue([{ levelId: 'sorting-01' }, { levelId: 'sorting-02' }]);
});

describe('skillIsOpen', () => {
  it('opens the current skill and finished ones, and nothing the roadmap has locked', async () => {
    expect(await skillIsOpen('u', 'loops')).toBe(true);
    expect(await skillIsOpen('u', 'methods')).toBe(true);
    expect(await skillIsOpen('u', 'arrays')).toBe(false);
  });

  it('answers a skill on the roadmap with one query', async () => {
    await skillIsOpen('u', 'methods');
    expect(db.roadmap.findFirst).toHaveBeenCalledTimes(1);
    expect(db.skillPrerequisite.findMany).not.toHaveBeenCalled();
  });

  it('opens a skill off the plan only once everything it builds on is KNOWN', async () => {
    expect(await skillIsOpen('u', 'conditionals')).toBe(true); // prerequisite tested out
    expect(await skillIsOpen('u', 'strings')).toBe(true); // loops completed
    expect(await skillIsOpen('u', 'trees-basics')).toBe(true); // sorting: every level done
    expect(await skillIsOpen('u', 'recursion')).toBe(false); // methods current, arrays locked
    expect(await skillIsOpen('u', 'hashing')).toBe(false); // collections merely dropped, not learned
  });

  it('opens nothing before onboarding has produced a roadmap', async () => {
    db.roadmap.findFirst.mockResolvedValue(null);
    expect(await skillIsOpen('u', 'loops')).toBe(false);
    expect(await skillIsOpen('u', 'conditionals')).toBe(false);
  });

  it('answers for many skills from one load', async () => {
    const isOpen = await openSkillChecker('u');
    expect(['loops', 'methods', 'arrays', 'strings', 'recursion', 'hashing'].map(isOpen)).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(db.skillPrerequisite.findMany).toHaveBeenCalledTimes(1);
  });
});
