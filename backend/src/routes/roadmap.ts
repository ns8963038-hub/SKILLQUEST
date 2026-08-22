import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';

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
      res.json({ nodes: [] });
      return;
    }

    // Flatten to the RoadmapNode shape the frontend renders.
    const nodes = roadmap.items.map((item) => ({
      skillId: item.skillId,
      title: item.skill.title,
      weekNumber: item.weekNumber,
      position: item.position,
      status: item.status, // 'locked' | 'current' | 'completed'
    }));

    await logEvent(userId, 'roadmap_view');
    res.json({ nodes });
  }),
);
