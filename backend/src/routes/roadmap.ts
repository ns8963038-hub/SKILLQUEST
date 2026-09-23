import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { levelProgressBySkill } from '../progress/levels';
import { lessonStateBySkill } from '../lessons/progress';
import { testedOutFrom } from '../progress/skills';

export const roadmapRouter = Router();

// GET /api/roadmap — the current user's active roadmap, in the exact shape the
// roadmap screen expects (skill id + title + week/position + status). This is
// where the frontend's mock data gets replaced by the real, persisted plan.
roadmapRouter.get(
  '/roadmap',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    // The one active roadmap, with its items joined to skill titles, already
    // ordered by week then position.
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId, isActive: true },
      include: {
        items: {
          include: { skill: { select: { title: true } } },
          orderBy: [{ weekNumber: 'asc' }, { position: 'asc' }],
        },
      },
    });

    if (!roadmap) {
      // No roadmap yet (onboarding not finished) — return an empty plan.
      res.json({ nodes: [], testedOut: [] });
      return;
    }

    // The adaptive tutor's mastery estimates for this student (M4). Only skills
    // with at least one attempt have a row — others get no number at all.
    const masteryRows = await prisma.skillMastery.findMany({
      where: { userId },
      select: { skillId: true, pMastery: true },
    });
    const mastery = new Map(masteryRows.map((m) => [m.skillId, m.pMastery]));

    // How many levels each skill has, and how many this student has finished.
    // …and where they are with each skill's lesson (Learn mode).
    const skillIds = roadmap.items.map((i) => i.skillId);
    const [progress, lessons] = await Promise.all([
      levelProgressBySkill(userId, skillIds),
      lessonStateBySkill(userId, skillIds),
    ]);

    // Flatten to the RoadmapNode shape the frontend renders.
    const nodes = roadmap.items.map((item) => ({
      skillId: item.skillId,
      title: item.skill.title,
      weekNumber: item.weekNumber,
      position: item.position,
      status: item.status, // 'locked' | 'current' | 'completed'
      mastery: mastery.get(item.skillId), // BKT P(known), omitted when no evidence
      levelsTotal: progress.get(item.skillId)?.total ?? 0,
      levelsCompleted: progress.get(item.skillId)?.completed ?? 0,
      lesson: lessons.get(item.skillId) ?? 'none',
    }));

    await logEvent(userId, 'roadmap_view');
    // Skills the placement quiz showed they know. Stated explicitly: a skill can
    // also be missing from the plan because their goal doesn't need it, and the
    // screens must not call that "tested out".
    res.json({ nodes, testedOut: testedOutFrom(roadmap.params) });
  }),
);
