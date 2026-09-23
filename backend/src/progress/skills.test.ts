import { describe, expect, it } from 'vitest';
import { completedSkillIds, isKnown, testedOutFrom } from './skills';

describe('completedSkillIds', () => {
  const levels = [
    { id: 'loops-01', skillId: 'loops' },
    { id: 'loops-02', skillId: 'loops' },
    { id: 'arrays-01', skillId: 'arrays' },
  ];

  it('needs EVERY published level of a skill, not just one', () => {
    expect(completedSkillIds(levels, new Set(['loops-01']))).toEqual(new Set());
    expect(completedSkillIds(levels, new Set(['loops-01', 'loops-02']))).toEqual(new Set(['loops']));
  });

  it('never completes a skill with no published levels', () => {
    expect(completedSkillIds(levels, new Set(['methods-01']))).toEqual(new Set());
  });
});

describe('testedOutFrom', () => {
  it('reads the list stored with the roadmap, ignoring anything malformed', () => {
    expect(testedOutFrom({ testedOut: ['loops', 3, 'methods'] })).toEqual(['loops', 'methods']);
    expect(testedOutFrom({})).toEqual([]);
    expect(testedOutFrom(null)).toEqual([]);
  });
});

describe('isKnown', () => {
  it('is tested out OR completed', () => {
    const p = { testedOut: new Set(['loops']), completed: new Set(['methods']) };
    expect(['loops', 'methods', 'arrays'].map((s) => isKnown(p, s))).toEqual([true, true, false]);
  });
});
