import { prisma } from '../db';

// What a student KNOWS, by one definition used everywhere — the roadmap's
// "completed", the locks, Placement coverage and the dashboard counts:
//
//   completed  every published level of the skill is completed (a skill with no
//              published levels is never "completed" — there is nothing to show);
//   testedOut  the placement quiz showed they know it (3/3 on its questions),
//              as recorded on their active roadmap when it was built.
//
// A skill is KNOWN when it is either. Before this, Placement counted a skill as
// covered after ANY one of its levels while the roadmap needed ALL of them, and
// ignored tested-out skills entirely (so it told a student to "train" a topic
// the quiz had just shown they know).

// The rule itself, on plain data: which skills have all their levels completed.
export function completedSkillIds(
  levels: { id: string; skillId: string }[],
  completedLevelIds: Set<string>,
): Set<string> {
  const bySkill = new Map<string, string[]>();
  for (const l of levels) bySkill.set(l.skillId, [...(bySkill.get(l.skillId) ?? []), l.id]);
  const done = new Set<string>();
  for (const [skillId, ids] of bySkill) if (ids.every((id) => completedLevelIds.has(id))) done.add(skillId);
  return done;
}

// The tested-out list stored with a roadmap (params.testedOut), read defensively.
export function testedOutFrom(params: unknown): string[] {
  const list = (params as { testedOut?: unknown } | null)?.testedOut;
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
}

export interface SkillProgress {
  testedOut: Set<string>;
  completed: Set<string>;
}

export const isKnown = (p: SkillProgress, skillId: string): boolean =>
  p.testedOut.has(skillId) || p.completed.has(skillId);

// Load a student's progress: three small queries.
export async function skillProgress(userId: string): Promise<SkillProgress> {
  const [roadmap, levels, done] = await Promise.all([
    prisma.roadmap.findFirst({ where: { userId, isActive: true }, select: { params: true } }),
    prisma.level.findMany({ where: { published: true }, select: { id: true, skillId: true } }),
    prisma.userLevel.findMany({ where: { userId, status: 'completed' }, select: { levelId: true } }),
  ]);
  return {
    testedOut: new Set(testedOutFrom(roadmap?.params)),
    completed: completedSkillIds(levels, new Set(done.map((d) => d.levelId))),
  };
}
