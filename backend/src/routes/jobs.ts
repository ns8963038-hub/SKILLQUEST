import { Router, type Request, type Response, type NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { env } from '../env';
import { computeRiskFeatures } from '../risk/features';
import { riskScore } from '../aiClient';

export const jobsRouter = Router();

// The prediction task's window/horizon (TRD 6.3.1).
const WINDOW_DAYS = 28;
const HORIZON_DAYS = 21;
const DAY_MS = 86_400_000;

// A Date at UTC midnight (for the DATE columns and the idempotency key).
function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// These endpoints are called by the scheduler (GitHub Actions), not a logged-in
// user, so they authenticate with the shared internal key instead of a JWT.
function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (!env.INTERNAL_API_KEY || req.header('x-internal-key') !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'invalid internal key' });
    return;
  }
  next();
}

// POST /internal/jobs/weekly-scoring — compute each student's disengagement-risk
// feature row, score it (AI service), and store the prediction. Idempotent per
// (user, window end, model) so a retry or double-fire can't create duplicates.
jobsRouter.post(
  '/jobs/weekly-scoring',
  requireInternalKey,
  asyncHandler(async (_req, res) => {
    const windowEnd = new Date();
    const windowEndDate = utcDateOnly(windowEnd);
    const windowStartDate = utcDateOnly(new Date(windowEnd.getTime() - WINDOW_DAYS * DAY_MS));

    const users = await prisma.profile.findMany({ select: { id: true, riskTier: true } });
    let scored = 0;
    let nudged = 0;

    for (const user of users) {
      const features = await computeRiskFeatures(user.id, windowEnd, WINDOW_DAYS);
      const result = await riskScore(features as unknown as Record<string, number>);

      // Store the prediction with everything needed to reproduce it (TRD 6.3.8).
      const saved = await prisma.dropoutScore.upsert({
        where: {
          userId_observationWindowEnd_modelVersion: {
            userId: user.id,
            observationWindowEnd: windowEndDate,
            modelVersion: result.modelVersion,
          },
        },
        create: {
          userId: user.id,
          probability: result.probability,
          tier: result.tier,
          features: features as unknown as Prisma.InputJsonObject,
          modelVersion: result.modelVersion,
          featureSetVersion: result.featureSetVersion,
          thresholdVersion: result.thresholdVersion,
          observationWindowStart: windowStartDate,
          observationWindowEnd: windowEndDate,
          predictionHorizonDays: HORIZON_DAYS,
        },
        update: {
          probability: result.probability,
          tier: result.tier,
          features: features as unknown as Prisma.InputJsonObject,
        },
      });

      // Cache the latest tier for fast dashboard reads.
      await prisma.profile.update({ where: { id: user.id }, data: { riskTier: result.tier } });

      // Nudge only on a transition INTO at-risk (don't re-nudge every run).
      if (result.tier === 'atrisk' && user.riskTier !== 'atrisk') {
        await prisma.nudge.create({
          data: { userId: user.id, dropoutScoreId: saved.id, variant: 'encourage' },
        });
        nudged++;
      }
      scored++;
    }

    res.json({ scored, nudged, windowEnd: windowEndDate });
  }),
);
