// Daily-activity streak logic (PRD F4). A day counts as "active" when the
// student submits a level. Kept pure (no DB) so it's easy to test.
//
// Days are measured in UTC so the rule is consistent regardless of where the
// server runs. (Per-user timezones would be nicer but we don't collect them.)

// Whole-day number for a date, in UTC (days since the epoch).
function utcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

export interface StreakState {
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: Date;
  changed: boolean; // false when today was already counted (no DB write needed)
}

/**
 * Compute the new streak given the last active date and "today".
 *   - first ever activity            -> streak 1
 *   - already active today           -> unchanged
 *   - active yesterday (consecutive) -> streak + 1
 *   - a gap of 2+ days               -> streak resets to 1
 */
export function computeStreak(
  lastActiveDate: Date | null,
  today: Date,
  currentStreak: number,
  bestStreak: number,
): StreakState {
  if (!lastActiveDate) {
    return { currentStreak: 1, bestStreak: Math.max(bestStreak, 1), lastActiveDate: today, changed: true };
  }

  const gap = utcDayNumber(today) - utcDayNumber(lastActiveDate);
  if (gap <= 0) {
    // Same day (or clock skew) — already counted today.
    return { currentStreak, bestStreak, lastActiveDate, changed: false };
  }

  const newStreak = gap === 1 ? currentStreak + 1 : 1; // consecutive vs. broken
  return {
    currentStreak: newStreak,
    bestStreak: Math.max(bestStreak, newStreak),
    lastActiveDate: today,
    changed: true,
  };
}
