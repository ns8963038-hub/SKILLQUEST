import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { computeRiskFeatures } from './features';
import { pickConfidenceBooster } from './booster';
import { riskScore } from '../aiClient';

// The weekly disengagement-risk run (PRD F5, TRD 6.3), shared by the scheduler
// endpoint (/internal/jobs/weekly-scoring) and the admin "Run scoring now" button.

// The prediction task's window/horizon (TRD 6.3.1).
export const WINDOW_DAYS = 28;
export const HORIZON_DAYS = 21;
const DAY_MS = 86_400_000;

// A Date at UTC midnight (for the DATE columns and the idempotency key).
function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Compute each student's feature row from the events log, score it with the AI
 * service, and store the prediction with everything needed to reproduce it.
 * Idempotent per (student, window end, model) — a retry can't create duplicates.
 * A student who newly moves INTO "at risk" gets an in-app nudge pointing at an
 * easy confidence-booster level.
 */
export async function runWeeklyScoring(now: Date = new Date()): Promise<{
  scored: number;
  nudged: number;
  windowEnd: Date;
}> {
  const windowEndDate = utcDateOnly(now);
  const windowStartDate = utcDateOnly(new Date(now.getTime() - WINDOW_DAYS * DAY_MS));

  // Only onboarded students have a plan to disengage from.
  const users = await prisma.profile.findMany({
    where: { onboardingStep: { gte: 5 } },
    select: { id: true, riskTier: true },
  });
  let scored = 0;
  let nudged = 0;

  for (const user of users) {
    const features = await computeRiskFeatures(user.id, now, WINDOW_DAYS);
    const result = await riskScore(features as unknown as Record<string, number>);

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

    // Cache the latest tier for fast reads.
    await prisma.profile.update({ where: { id: user.id }, data: { riskTier: result.tier } });

    // Nudge only on a transition INTO at-risk (never re-nudge every run).
    if (result.tier === 'atrisk' && user.riskTier !== 'atrisk') {
      await prisma.nudge.create({
        data: {
          userId: user.id,
          dropoutScoreId: saved.id,
          variant: 'confidence_booster',
          suggestedLevelId: await pickConfidenceBooster(user.id),
        },
      });
      nudged++;
    }
    scored++;
  }

  return { scored, nudged, windowEnd: windowEndDate };
}
