import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { computeStreak, type StreakState } from './streak';

// Count today as an active day for the student's streak (PRD F4), and return the
// streak. The one place this happens, for every kind of practice: a graded
// submit, and an examples run of code the student has actually written. Works
// inside a transaction (pass `tx`) or on its own.
export async function markActiveToday(
  userId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<StreakState> {
  const p = await db.profile.findUnique({
    where: { id: userId },
    select: { currentStreak: true, bestStreak: true, lastActiveDate: true },
  });
  const streak = computeStreak(p?.lastActiveDate ?? null, new Date(), p?.currentStreak ?? 0, p?.bestStreak ?? 0);
  if (streak.changed) {
    await db.profile.update({
      where: { id: userId },
      data: {
        currentStreak: streak.currentStreak,
        bestStreak: streak.bestStreak,
        lastActiveDate: streak.lastActiveDate,
      },
    });
  }
  return streak;
}
