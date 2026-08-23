import { Router } from 'express';
import { asyncHandler } from '../http';
import { computePlacementForUser } from '../placement/compute';

export const placementRouter = Router();

// GET /api/placement — the student's role skill coverage across their target
// companies. Recomputed fresh, so completing a level moves the numbers.
placementRouter.get(
  '/placement',
  asyncHandler(async (req, res) => {
    const roles = await computePlacementForUser(req.userId!);
    res.json({ roles });
  }),
);
