import { describe, it, expect } from 'vitest';
import { computeStreak, streakAsOf } from './streak';
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
  it('awards First Quest on a first completion — but not Code Master for one level', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 1, completedSkillWithoutHints: false, currentStreak: 1 },
      new Set(),
    );
    expect(out).toContain('first_quest');
    expect(out).not.toContain('code_master');
  });

  it('awards Code Master for finishing a whole skill with no hints', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 3, completedSkillWithoutHints: true, currentStreak: 1 },
      new Set(['first_quest']),
    );
    expect(out).toEqual(['code_master']); // First Quest already earned
  });

  it('awards Week Warrior at a 7-day streak', () => {
    const out = badgesToAward(
      { justCompletedLevel: false, totalCompletedLevels: 3, completedSkillWithoutHints: false, currentStreak: 7 },
      new Set(),
    );
    expect(out).toEqual(['week_warrior']);
  });

  it('never re-awards a badge already earned', () => {
    const out = badgesToAward(
      { justCompletedLevel: true, totalCompletedLevels: 1, completedSkillWithoutHints: true, currentStreak: 7 },
      new Set(['first_quest', 'code_master', 'week_warrior']),
    );
    expect(out).toEqual([]);
  });
});

describe('streakAsOf (what the dashboard and exports show)', () => {
  const today = new Date('2026-09-23T10:00:00Z');
  it('keeps a run that was active today or yesterday', () => {
    expect(streakAsOf(6, new Date('2026-09-23T01:00:00Z'), today)).toBe(6);
    expect(streakAsOf(6, new Date('2026-09-22T23:00:00Z'), today)).toBe(6); // today's solve would extend it
  });
  it('reads 0 once a day has been missed, instead of the stale stored number', () => {
    expect(streakAsOf(6, new Date('2026-09-18T12:00:00Z'), today)).toBe(0); // gone 5 days
    expect(streakAsOf(6, new Date('2026-09-21T12:00:00Z'), today)).toBe(0); // missed yesterday
  });
  it('is 0 for a student who has never been active', () => {
    expect(streakAsOf(0, null, today)).toBe(0);
  });
});
