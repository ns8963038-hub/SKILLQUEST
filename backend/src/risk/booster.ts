import { prisma } from '../db';

// The "confidence booster" an at-risk student is nudged toward (PRD F5): an EASY
// level from a skill they've already reached, so coming back starts with a quick
// win rather than the hardest thing on their plan.

export interface BoosterCandidate {
  id: string;
  difficulty: number;
  orderInSkill: number;
}

// Pure choice: the easiest level they haven't completed yet; if they've done them
// all, the easiest one overall (a confident re-play still counts as a win).
export function chooseBooster(candidates: BoosterCandidate[], completed: Set<string>): string | null {
  if (candidates.length === 0) return null;
  const easiestFirst = [...candidates].sort(
    (a, b) => a.difficulty - b.difficulty || a.orderInSkill - b.orderInSkill || a.id.localeCompare(b.id),
  );
  return (easiestFirst.find((c) => !completed.has(c.id)) ?? easiestFirst[0]!).id;
}

export async function pickConfidenceBooster(userId: string): Promise<string | null> {
  // Skills the student has already reached on their roadmap.
  const reached = await prisma.roadmapItem.findMany({
    where: { roadmap: { userId, isActive: true }, status: { in: ['completed', 'current'] } },
    select: { skillId: true },
  });
  const skillIds = reached.map((r) => r.skillId);

  const candidates = await prisma.level.findMany({
    where: { published: true, ...(skillIds.length ? { skillId: { in: skillIds } } : {}) },
    select: { id: true, difficulty: true, orderInSkill: true },
  });
  const done = await prisma.userLevel.findMany({
    where: { userId, status: 'completed', levelId: { in: candidates.map((c) => c.id) } },
    select: { levelId: true },
  });
  return chooseBooster(candidates, new Set(done.map((d) => d.levelId)));
}
