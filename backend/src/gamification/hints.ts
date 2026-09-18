// The hint economy (PRD F3: "hint costs a small XP amount — gamified help").
// Pure logic, so the rule is unit-tested without a database.

// XP taken for each hint a student reveals.
export const HINT_COST = 5;

/**
 * Apply the cost of one hint to a student's XP. XP never goes below zero — a
 * brand-new student can still ask for help. `deducted` is what was actually
 * taken; it's logged on the hint_used event so weekly XP stays exact.
 */
export function applyHintCost(totalXp: number, cost: number = HINT_COST): { newXp: number; deducted: number } {
  const deducted = Math.min(Math.max(0, totalXp), cost);
  return { newXp: totalXp - deducted, deducted };
}
