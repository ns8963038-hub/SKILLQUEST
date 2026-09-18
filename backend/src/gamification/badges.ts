// Badge rules (PRD F4). Pure logic: given what just happened and what the
// student already has, decide which new badges to award. The actual award
// (writing user_badges) is done by the caller inside a transaction.
//
// Badge ids must exist in the badges table (seeded from content/badges.json).

export interface BadgeContext {
  justCompletedLevel: boolean; // did they complete a level for the first time just now?
  totalCompletedLevels: number; // their total completed levels (after this one)
  hintsUsedThisLevel: number; // hints used on the level they just completed
  currentStreak: number; // their current daily streak
}

/**
 * Return the badge ids to award now — those whose condition is met and that the
 * student doesn't already hold. (`placement_ready` is awarded by the placement
 * module, not here.)
 */
export function badgesToAward(ctx: BadgeContext, alreadyEarned: Set<string>): string[] {
  const toAward: string[] = [];
  const consider = (id: string, condition: boolean) => {
    if (condition && !alreadyEarned.has(id)) toAward.push(id);
  };

  // First Quest — completing your very first level.
  consider('first_quest', ctx.justCompletedLevel && ctx.totalCompletedLevels >= 1);
  // Code Master — completing a level without using any hints.
  consider('code_master', ctx.justCompletedLevel && ctx.hintsUsedThisLevel === 0);
  // Week Warrior — reaching a 7-day activity streak.
  consider('week_warrior', ctx.currentStreak >= 7);

  return toAward;
}

// Placement Ready — reaching 75% tracked-skill coverage for at least one target
// role (content/badges.json). Evaluated after a completion, because only a
// completion can move placement coverage.
export const PLACEMENT_READY_THRESHOLD = 75;

export function earnsPlacementReady(roleScores: number[]): boolean {
  return roleScores.some((score) => score >= PLACEMENT_READY_THRESHOLD);
}
