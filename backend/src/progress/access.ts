import type { RequestParamHandler } from 'express';
import { prisma } from '../db';

// Which skills a student may open — enforced HERE, on the server.
//
// The roadmap unlocks one skill at a time, and the app only offers the open
// ones. But the app is not a lock: the Placement screen's "Train this" button,
// or a hand-typed request, could open any lesson or level. So every level and
// lesson route checks this first (guardSkill, hooked onto the route parameter
// in routes/levels.ts and routes/lessons.ts), and a locked skill gets a 403
// before any content is sent or anything is recorded.
//
// A skill is OPEN when:
//   - it is on the student's active roadmap and is 'current' or 'completed'; or
//   - it is NOT on the roadmap (tested out in the placement quiz, or not needed
//     for their goal) and every one of its prerequisites is done — completed on
//     the roadmap, or itself not on it. (The app counts a skill missing from the
//     plan as known, so this matches what the student is shown.)
// A student without a roadmap (onboarding not finished) has nothing open.

export class SkillLockedError extends Error {
  constructor(readonly skillId: string) {
    super(`skill "${skillId}" is locked for this student`);
    this.name = 'SkillLockedError';
  }
}

// Load what the rule needs once — the roadmap's statuses and the prerequisite
// edges — and return a function that answers for any skill. (The Placement
// screen asks about several skills at once; the routes ask about one.)
export async function openSkillChecker(userId: string): Promise<(skillId: string) => boolean> {
  const [roadmap, edges] = await Promise.all([
    prisma.roadmap.findFirst({
      where: { userId, isActive: true },
      select: { items: { select: { skillId: true, status: true } } },
    }),
    prisma.skillPrerequisite.findMany({ select: { skillId: true, prereqId: true } }),
  ]);
  if (!roadmap) return () => false;
  const status = new Map(roadmap.items.map((i) => [i.skillId, i.status]));
  // Done = completed on the roadmap, or not on it at all (tested out / not needed).
  const done = (skillId: string) => {
    const s = status.get(skillId);
    return s === undefined || s === 'completed';
  };

  return (skillId) => {
    const own = status.get(skillId);
    if (own !== undefined) return own !== 'locked';
    // Not on the roadmap: open once everything it builds on is done.
    return edges.filter((e) => e.skillId === skillId).every((e) => done(e.prereqId));
  };
}

export async function skillIsOpen(userId: string, skillId: string): Promise<boolean> {
  return (await openSkillChecker(userId))(skillId);
}

// A router.param hook: before any route with that parameter runs, find the
// skill it refers to and refuse it with SkillLockedError (-> 403) if locked.
// `skillOf` maps the parameter to a skill id: a level id to its level's skill,
// or a skill id to itself. An unknown id passes through, so the route answers 404.
export function guardSkill(skillOf: (value: string) => Promise<string | null>): RequestParamHandler {
  return async (req, _res, next, value: string) => {
    try {
      const skillId = await skillOf(value);
      if (skillId && !(await skillIsOpen(req.userId!, skillId))) throw new SkillLockedError(skillId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// A skill id is its own skill.
export const skillItself = async (skillId: string) => skillId;

// The skill a level belongs to (null if there is no such level).
export async function skillOfLevel(levelId: string): Promise<string | null> {
  const level = await prisma.level.findUnique({ where: { id: levelId }, select: { skillId: true } });
  return level?.skillId ?? null;
}
