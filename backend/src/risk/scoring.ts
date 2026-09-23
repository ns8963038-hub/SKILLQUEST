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
  failed: number;
  windowEnd: Date;
}> {
  const windowEndDate = utcDateOnly(now);
  const windowStartDate = utcDateOnly(new Date(now.getTime() - WINDOW_DAYS * DAY_MS));

  // Only students who finished onboarding at least one full window ago. A newer
  // student hasn't had 28 days to practise in, so any score would describe the
  // calendar, not them (their first plan's date; a re-plan never resets it).
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const users = await prisma.profile.findMany({
    where: { onboardingStep: { gte: 5 }, roadmaps: { some: { generatedAt: { lte: cutoff } } } },
    select: { id: true, riskTier: true },
  });
  let scored = 0;
  let nudged = 0;
  let failed = 0;

  for (const user of users) {
    // One student's failure (the AI service not answering, say) must not stop
    // everyone after them from being scored. Each is tried on its own.
    try {
      if (await scoreOne(user, now, windowStartDate, windowEndDate)) nudged++;
      scored++;
    } catch (err) {
      failed++;
      console.warn(`weekly scoring: student ${user.id} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return { scored, nudged, failed, windowEnd: windowEndDate };
}

// Score, store and (on a move into "at risk") nudge one student. Returns true if
// a nudge was created.
async function scoreOne(
  user: { id: string; riskTier: string | null },
  now: Date,
  windowStartDate: Date,
  windowEndDate: Date,
): Promise<boolean> {
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
    return true;
  }
  return false;
}
