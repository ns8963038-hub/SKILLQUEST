import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../http';
import { env } from '../env';
import { runWeeklyScoring } from '../risk/scoring';
import { sameSecret } from '../secrets';

export const jobsRouter = Router();

// These endpoints are called by the scheduler (GitHub Actions), not a logged-in
// user, so they authenticate with the shared internal key instead of a JWT
// (compared in constant time — see secrets.ts).
function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (!sameSecret(req.header('x-internal-key'), env.INTERNAL_API_KEY)) {
    res.status(401).json({ error: 'invalid internal key' });
    return;
  }
  next();
}

// POST /internal/jobs/weekly-scoring — score every student's disengagement risk
// and store the predictions (logic in risk/scoring.ts, shared with the admin view).
jobsRouter.post(
  '/jobs/weekly-scoring',
  requireInternalKey,
  asyncHandler(async (_req, res) => {
    res.json(await runWeeklyScoring());
  }),
);
