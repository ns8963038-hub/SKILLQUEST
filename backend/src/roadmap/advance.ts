import { prisma } from '../db';

// Advance a student's roadmap after they finish something: recompute each node's
// status so completed skills show 'completed', the first unfinished one is
// 'current' (the hero's spot / the next unlocked chest), and the rest stay
// 'locked'. Idempotent — safe to call after every completion.
//
// A skill counts as completed when the student has completed ALL of its
// published levels (most skills have one, `<skillId>-01`).
export async function advanceRoadmap(userId: string): Promise<void> {
  const roadmap = await prisma.roadmap.findFirst({
    where: { userId, isActive: true },
    include: { items: { orderBy: [{ weekNumber: 'asc' }, { position: 'asc' }] } },
  });
  if (!roadmap || roadmap.items.length === 0) return;

  // Published levels for the roadmap's skills, grouped by skill.
  const skillIds = roadmap.items.map((i) => i.skillId);
  const levels = await prisma.level.findMany({
    where: { skillId: { in: skillIds }, published: true },
    select: { id: true, skillId: true },
  });
  const levelsBySkill = new Map<string, string[]>();
  for (const l of levels) {
    const arr = levelsBySkill.get(l.skillId) ?? [];
    arr.push(l.id);
    levelsBySkill.set(l.skillId, arr);
  }

  // Which of those levels the student has completed.
  const completedRows = await prisma.userLevel.findMany({
    where: { userId, status: 'completed', levelId: { in: levels.map((l) => l.id) } },
    select: { levelId: true },
  });
  const completedLevels = new Set(completedRows.map((u) => u.levelId));

  // A skill is complete only if it has published levels and all are done.
  const skillComplete = (skillId: string): boolean => {
    const ids = levelsBySkill.get(skillId) ?? [];
    return ids.length > 0 && ids.every((id) => completedLevels.has(id));
  };

  // Recompute statuses in order; the first not-complete node becomes 'current'.
  let currentAssigned = false;
  for (const item of roadmap.items) {
    let status: 'completed' | 'current' | 'locked';
    if (skillComplete(item.skillId)) {
      status = 'completed';
    } else if (!currentAssigned) {
      status = 'current';
      currentAssigned = true;
    } else {
      status = 'locked';
    }
    // Only write when it actually changes.
    if (status !== item.status) {
      await prisma.roadmapItem.update({ where: { id: item.id }, data: { status } });
    }
  }
}
