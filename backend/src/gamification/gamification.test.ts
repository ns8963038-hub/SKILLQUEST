import { describe, it, expect } from 'vitest';
import { computeStreak } from './streak';
import { badgesToAward } from './badges';

// A fixed UTC day and helpers to build days relative to it.
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('computeStreak', () => {
  it('starts a streak at 1 on first activity', () => {
    const s = computeStreak(null, day('2026-01-10'), 0, 0);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(1);
    expect(s.changed).toBe(true);
  });

  it('does not change when already active today', () => {
    const s = computeStreak(day('2026-01-10'), day('2026-01-10'), 3, 5);
    expect(s.currentStreak).toBe(3);
    expect(s.changed).toBe(false);
  });

  it('increments on a consecutive day', () => {
    const s = computeStreak(day('2026-01-10'), day('2026-01-11'), 3, 5);
    expect(s.currentStreak).toBe(4);
    expect(s.bestStreak).toBe(5); // best unchanged (4 < 5)
    expect(s.changed).toBe(true);
  });

  it('updates best when the streak exceeds it', () => {
    const s = computeStreak(day('2026-01-10'), day('2026-01-11'), 5, 5);
    expect(s.currentStreak).toBe(6);
    expect(s.bestStreak).toBe(6);
  });

  it('resets to 1 after a gap of two or more days', () => {
    const s = computeStreak(day('2026-01-10'), day('2026-01-13'), 8, 8);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(8); // best preserved
  });
});

describe('badgesToAward', () => {
  it('awards First Quest and Code Master on a clean first completion', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 1, hintsUsedThisLevel: 0, currentStreak: 1 },
      new Set(),
    );
    expect(out).toContain('first_quest');
    expect(out).toContain('code_master');
  });

  it('does not award Code Master if a hint was used', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 2, hintsUsedThisLevel: 1, currentStreak: 1 },
      new Set(['first_quest']),
    );
    expect(out).not.toContain('code_master');
    expect(out).not.toContain('first_quest'); // already earned
  });

  it('awards Week Warrior at a 7-day streak', () => {
    const out = badgesToAward(
      { justCompletedLevel: false, totalCompletedLevels: 3, hintsUsedThisLevel: 0, currentStreak: 7 },
      new Set(),
    );
    expect(out).toEqual(['week_warrior']);
  });

  it('never re-awards a badge already earned', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 1, hintsUsedThisLevel: 0, currentStreak: 7 },
      new Set(['first_quest', 'code_master', 'week_warrior']),
    );
    expect(out).toEqual([]);
  });
});
