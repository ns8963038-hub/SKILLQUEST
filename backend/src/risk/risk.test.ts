import { describe, it, expect } from 'vitest';
import { streakEndingAt } from './features';
import { chooseBooster } from './booster';

describe('streak feature (mirrors ml/dataset.py)', () => {
  it('counts consecutive active days ending today', () => {
    expect(streakEndingAt([10, 11, 12], 12)).toBe(3);
  });
  it('still counts a streak that ended yesterday (today not over yet)', () => {
    expect(streakEndingAt([9, 10, 11], 12)).toBe(3);
  });
  it('is zero once two days have passed with no activity', () => {
    expect(streakEndingAt([5, 6, 7], 12)).toBe(0);
    expect(streakEndingAt([], 12)).toBe(0);
  });
  it('stops at the first gap', () => {
    expect(streakEndingAt([3, 4, 6, 7, 8], 8)).toBe(3);
  });
});

describe('confidence-booster choice', () => {
  const lv = (id: string, difficulty: number, orderInSkill = 1) => ({ id, difficulty, orderInSkill });

  it('picks the easiest level not yet completed', () => {
    const pick = chooseBooster([lv('hard', 3), lv('easy-done', 1), lv('easy-new', 1, 2)], new Set(['easy-done']));
    expect(pick).toBe('easy-new');
  });
  it('falls back to the easiest level if everything is done', () => {
    expect(chooseBooster([lv('b', 2), lv('a', 1)], new Set(['a', 'b']))).toBe('a');
  });
  it('returns null when there are no levels', () => {
    expect(chooseBooster([], new Set())).toBeNull();
  });
});
