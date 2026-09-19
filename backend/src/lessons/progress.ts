import { prisma } from '../db';

// Where a student stands on each skill's lesson (Learn mode, PRD F8):
//   'none'      the skill has no lesson yet
//   'new'       there is a lesson and they haven't opened it
//   'started' | 'completed' | 'skipped'   from user_lessons
export type LessonState = 'none' | 'new' | 'started' | 'completed' | 'skipped';

// Lesson state for several skills in two queries (for the roadmap).
export async function lessonStateBySkill(userId: string, skillIds: string[]): Promise<Map<string, LessonState>> {
  const [lessons, mine] = await Promise.all([
    prisma.lesson.findMany({ where: { skillId: { in: skillIds }, published: true }, select: { skillId: true } }),
    prisma.userLesson.findMany({ where: { userId, skillId: { in: skillIds } }, select: { skillId: true, status: true } }),
  ]);
  const hasLesson = new Set(lessons.map((l) => l.skillId));
  const status = new Map(mine.map((m) => [m.skillId, m.status]));
  return new Map(
    skillIds.map((id) => [id, hasLesson.has(id) ? (status.get(id) ?? 'new') : 'none'] as [string, LessonState]),
  );
}

// Should opening this skill show its lesson first? Yes until it is completed or
// skipped — "started" means they left part-way, so they resume it.
export function lessonComesFirst(state: LessonState): boolean {
  return state === 'new' || state === 'started';
}
