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

// ---- Feature set fs-v3: practice only, everything inside the window ----------

import { ACTIVE_EVENT_TYPES, featuresFromPractice, type GradedAttempt } from './features';

const END = new Date('2026-10-29T00:00:00Z');
const daysAgo = (n: number) => new Date(END.getTime() - n * 86_400_000);

describe('what counts as practice', () => {
  it('is graded submissions and lesson answers only', () => {
    expect([...ACTIVE_EVENT_TYPES].sort()).toEqual(['lesson_answer', 'lesson_fill', 'level_submit']);
  });

  it('never includes seeing or clicking a nudge, opening a page or logging in', () => {
    for (const notPractice of ['nudge_shown', 'nudge_clicked', 'nudge_dismissed', 'login', 'level_start', 'roadmap_view', 'lesson_reveal']) {
      expect(ACTIVE_EVENT_TYPES as readonly string[]).not.toContain(notPractice);
    }
  });
});

describe('featuresFromPractice', () => {
  it('measures absence from the last practice', () => {
    expect(featuresFromPractice([], daysAgo(14), [], END, 28).days_since_last_activity).toBe(14);
  });

  it('counts a student who has never practised from when they started, not as 28 days away', () => {
    // Joined 2 days ago, not practised yet: 2 days away (healthy), not "at risk".
    expect(featuresFromPractice([], null, [], END, 28, daysAgo(2)).days_since_last_activity).toBe(2);
    // Joined long ago and never practised: capped at the window.
    expect(featuresFromPractice([], null, [], END, 28, daysAgo(90)).days_since_last_activity).toBe(28);
    // No start date known: the whole window, as before.
    expect(featuresFromPractice([], null, [], END, 28).days_since_last_activity).toBe(28);
  });

  it('scores only the levels worked on inside the window', () => {
    const attempts: GradedAttempt[] = [
      { levelId: 'loops-01', passRatio: 0.5, at: daysAgo(5) },
      { levelId: 'loops-01', passRatio: 1, at: daysAgo(4) }, // best result counts
      { levelId: 'loops-02', passRatio: 0.25, at: daysAgo(3) },
    ];
    const f = featuresFromPractice([daysAgo(5), daysAgo(4), daysAgo(3)], daysAgo(3), attempts, END, 28);
    expect(f.completion_ratio).toBe(0.5); // one of two levels passed
    expect(f.avg_score).toBe(0.625); // (1 + 0.25) / 2
    expect(f.active_days_in_window).toBe(3);
  });

  it('gives a student who has left no credit for old scores', () => {
    // Nothing inside the window: the old good results are simply not in the row.
    const f = featuresFromPractice([], daysAgo(40), [], END, 28);
    expect(f.completion_ratio).toBe(0);
    expect(f.avg_score).toBe(0);
    expect(f.days_since_last_activity).toBe(40);
  });
});
