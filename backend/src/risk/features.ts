import { prisma } from '../db';

// Compute the disengagement-risk feature row for one student (TRD 6.3.7).
// Feature set fs-v4: "activity" is practice only (graded submissions, examples
// runs of code the student wrote, and lesson answers), and every feature — scores included — is computed strictly inside
// the observation window; a student who has never practised counts as away
// since they started, not for the whole window (fs-v3 lacked that last part). The live scorer uses days_since_last_activity (the
// rule, ai-service/app/risk.py); the full row is stored for the report.

const DAY_MS = 86_400_000;

// UTC day number (days since epoch) for grouping activity into distinct days.
function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/**
 * Consecutive active days ending on `endDay` — or the day before, since "today"
 * may simply not have happened yet. Computed from the events log (not the cached
 * profile streak, which only updates on activity and so goes stale), and mirrored
 * exactly in ml/dataset.py so the feature means the same thing on OULAD.
 */
export function streakEndingAt(activeDays: number[], endDay: number): number {
  const active = new Set(activeDays);
  let day = active.has(endDay) ? endDay : endDay - 1;
  let streak = 0;
  while (active.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

export interface RiskFeatures {
  active_days_in_window: number;
  mean_session_gap_days: number;
  days_since_last_activity: number;
  completion_ratio: number;
  avg_score: number;
  activity_trend: number;
  current_streak: number;
}

// What counts as "the student practised": graded level submissions, examples
// runs of code they have written (`level_run`; the untouched starter code is
// not logged), and lesson answers (multiple choice and fill-in). Logins, page
// views, reveals, settings
// changes and — importantly — seeing or clicking a nudge do NOT count. If they
// did, merely opening the app would look like coming back, and any "students
// returned after the nudge" figure would be produced by the measurement itself.
export const ACTIVE_EVENT_TYPES = ['level_submit', 'level_run', 'lesson_answer', 'lesson_fill'] as const;

// One graded attempt at a level, for the in-window score features.
export interface GradedAttempt {
  levelId: string;
  passRatio: number; // share of the level's tests that passed, 0..1
  at: Date;
}

/**
 * The feature row, as a pure function of the student's practice (so it can be
 * tested without a database).
 *
 *   activity       timestamps of practice events INSIDE the window
 *   lastPractice   the latest practice event before the window end, or null
 *   attempts       graded level attempts INSIDE the window
 *   startedAt      when the student's first plan was made (onboarding), or null
 *
 * Every feature is computed inside the observation window — including the
 * scores, so a student who leaves does not keep their old good scores forever.
 */
export function featuresFromPractice(
  activity: Date[],
  lastPractice: Date | null,
  attempts: GradedAttempt[],
  windowEnd: Date,
  windowDays: number,
  startedAt: Date | null = null,
): RiskFeatures {
  // Distinct practice days.
  const days = [...new Set(activity.map(utcDay))].sort((a, b) => a - b);

  // Mean gap between consecutive practice days (window length if too few days).
  let mean_session_gap_days = windowDays;
  if (days.length >= 2) {
    let sum = 0;
    for (let i = 1; i < days.length; i++) sum += days[i]! - days[i - 1]!;
    mean_session_gap_days = sum / (days.length - 1);
  }

  // Trend: practice in the second half of the window minus the first half.
  const midMs = windowEnd.getTime() - (windowDays / 2) * DAY_MS;
  const firstHalf = activity.filter((t) => t.getTime() < midMs).length;
  const activity_trend = activity.length - firstHalf - firstHalf;

  // Days since the last practice before the window end (never anything after it
  // — the same no-leakage rule as training). Never practised: days since they
  // started (onboarding), at most the window — a student who joined yesterday
  // has been away one day, not 28. (Without a start date: the whole window.)
  const daysSince = (from: Date) => Math.max(0, Math.floor((windowEnd.getTime() - from.getTime()) / DAY_MS));
  const days_since_last_activity = lastPractice
    ? daysSince(lastPractice)
    : startedAt
      ? Math.min(windowDays, daysSince(startedAt))
      : windowDays;

  // Scores from the levels worked on inside the window: the share passed, and
  // the average of each level's best result.
  const best = new Map<string, number>();
  for (const a of attempts) best.set(a.levelId, Math.max(best.get(a.levelId) ?? 0, a.passRatio));
  const attempted = best.size;
  const completed = [...best.values()].filter((r) => r >= 1).length;
  const completion_ratio = attempted ? completed / attempted : 0;
  const avg_score = attempted ? [...best.values()].reduce((sum, r) => sum + r, 0) / attempted : 0;

  return {
    active_days_in_window: days.length,
    mean_session_gap_days,
    days_since_last_activity,
    completion_ratio,
    avg_score,
    activity_trend,
    current_streak: streakEndingAt(days, utcDay(windowEnd)),
  };
}

// Load one student's practice from the database and compute their feature row.
export async function computeRiskFeatures(
  userId: string,
  windowEnd: Date = new Date(),
  windowDays = 28,
): Promise<RiskFeatures> {
  const windowStart = new Date(windowEnd.getTime() - windowDays * DAY_MS);
  const practice = { userId, type: { in: [...ACTIVE_EVENT_TYPES] } };

  const [inWindow, last, attempts, firstPlan] = await Promise.all([
    prisma.event.findMany({
      where: { ...practice, ts: { gte: windowStart, lt: windowEnd } },
      select: { ts: true },
      orderBy: { ts: 'asc' },
    }),
    prisma.event.findFirst({
      where: { ...practice, ts: { lt: windowEnd } },
      orderBy: { ts: 'desc' },
      select: { ts: true },
    }),
    prisma.submission.findMany({
      where: { userId, createdAt: { gte: windowStart, lt: windowEnd } },
      select: { levelId: true, passRatio: true, createdAt: true },
    }),
    // When they started: their first plan (a re-plan in Settings never resets it).
    prisma.roadmap.findFirst({ where: { userId }, orderBy: { generatedAt: 'asc' }, select: { generatedAt: true } }),
  ]);

  return featuresFromPractice(
    inWindow.map((e) => e.ts),
    last?.ts ?? null,
    attempts.map((a) => ({ levelId: a.levelId, passRatio: a.passRatio, at: a.createdAt })),
    windowEnd,
    windowDays,
    firstPlan?.generatedAt ?? null,
  );
}
