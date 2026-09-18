import { prisma } from '../db';

// Level navigation within a skill. Skills now have several levels (played in
// `orderInSkill` order), so "open this skill" and "next level" need real logic
// rather than the old `<skillId>-01` convention.

// A skill's published levels, in play order.
async function skillLevels(skillId: string): Promise<{ id: string }[]> {
  return prisma.level.findMany({
    where: { skillId, published: true },
    orderBy: [{ orderInSkill: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
}

// Which of these levels the student has completed.
async function completedSet(userId: string, levelIds: string[]): Promise<Set<string>> {
  if (levelIds.length === 0) return new Set();
  const rows = await prisma.userLevel.findMany({
    where: { userId, status: 'completed', levelId: { in: levelIds } },
    select: { levelId: true },
  });
  return new Set(rows.map((r) => r.levelId));
}

// The first level in a skill the student hasn't completed — null if all are done.
export async function firstUnfinishedInSkill(userId: string, skillId: string): Promise<string | null> {
  const levels = await skillLevels(skillId);
  const done = await completedSet(userId, levels.map((l) => l.id));
  return levels.find((l) => !done.has(l.id))?.id ?? null;
}

// The level to open for a skill: the first unfinished one, or — once the skill is
// finished — its first level again (re-practice keeps raising the mastery
// estimate). Null only when the skill has no published levels at all.
export async function nextLevelInSkill(userId: string, skillId: string): Promise<string | null> {
  const levels = await skillLevels(skillId);
  if (levels.length === 0) return null;
  const done = await completedSet(userId, levels.map((l) => l.id));
  return (levels.find((l) => !done.has(l.id)) ?? levels[0]!).id;
}

// The skill the student is currently on (their active roadmap's "current" node).
export async function currentRoadmapSkill(userId: string): Promise<string | null> {
  const item = await prisma.roadmapItem.findFirst({
    where: { roadmap: { userId, isActive: true }, status: 'current' },
    select: { skillId: true },
  });
  return item?.skillId ?? null;
}

// Where "Next level" goes after a solve: the next unfinished level in the same
// skill, or — when that skill is finished — the next level on the roadmap.
export async function nextLevelAfter(userId: string, skillId: string): Promise<string | null> {
  const sameSkill = await firstUnfinishedInSkill(userId, skillId);
  if (sameSkill) return sameSkill;
  const current = await currentRoadmapSkill(userId);
  return current ? nextLevelInSkill(userId, current) : null;
}

// Per-skill level counts for the roadmap: how many levels exist, how many done.
export async function levelProgressBySkill(
  userId: string,
  skillIds: string[],
): Promise<Map<string, { total: number; completed: number }>> {
  const levels = await prisma.level.findMany({
    where: { skillId: { in: skillIds }, published: true },
    select: { id: true, skillId: true },
  });
  const done = await completedSet(userId, levels.map((l) => l.id));
  const progress = new Map<string, { total: number; completed: number }>();
  for (const l of levels) {
    const entry = progress.get(l.skillId) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (done.has(l.id)) entry.completed += 1;
    progress.set(l.skillId, entry);
  }
  return progress;
}
