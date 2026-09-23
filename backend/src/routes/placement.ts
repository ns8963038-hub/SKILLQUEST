import { Router } from 'express';
import { asyncHandler } from '../http';
import { computePlacementForUser } from '../placement/compute';
import { openSkillChecker } from '../progress/access';

export const placementRouter = Router();

// GET /api/placement — the student's role skill coverage across their target
// companies. Recomputed fresh, so completing a level moves the numbers. Each gap
// SkillQuest teaches says whether the student can open it yet (`open`), by the
// same rule the level and lesson routes enforce — so "Train this" is only
// offered where it will work.
placementRouter.get(
  '/placement',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const [roles, isOpen] = await Promise.all([computePlacementForUser(userId), openSkillChecker(userId)]);
    res.json({
      roles: roles.map((r) => ({
        ...r,
        missingAvailableNow: r.missingAvailableNow.map((m) => ({ ...m, open: isOpen(m.skillId) })),
      })),
    });
  }),
);
