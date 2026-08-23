import { describe, it, expect } from 'vitest';
import { scoreRole, type RoleSkill } from './scoring';

const role: RoleSkill[] = [
  { skillId: 'java-basics', weight: 2, jdPhrase: null },
  { skillId: 'arrays', weight: 2, jdPhrase: null },
  { skillId: 'oop-basics', weight: 1, jdPhrase: null }, // total weight = 5
];

describe('scoreRole', () => {
  it('is 100 when all skills are covered', () => {
    const r = scoreRole(new Set(['java-basics', 'arrays', 'oop-basics']), role);
    expect(r.score).toBe(100);
    expect(r.missingTracked).toEqual([]);
  });

  it('is 0 when nothing is covered, and lists gaps by weight', () => {
    const r = scoreRole(new Set(), role);
    expect(r.score).toBe(0);
    // Highest-weight gaps first (java-basics/arrays before oop-basics).
    expect(r.missingTracked[0]?.weight).toBe(2);
    expect(r.missingTracked.at(-1)?.skillId).toBe('oop-basics');
  });

  it('weights coverage correctly (4 of 5 -> 80)', () => {
    const r = scoreRole(new Set(['java-basics', 'arrays']), role);
    expect(r.score).toBe(80); // (2+2)/5 = 80%
    expect(r.covered).toEqual(['java-basics', 'arrays']);
    expect(r.missingTracked).toEqual([{ skillId: 'oop-basics', weight: 1 }]);
  });
});
