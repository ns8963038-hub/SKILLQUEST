import { prisma } from '../db';

// Compute the disengagement-risk feature row for one student from the events log
// (TRD 6.3.7). Every feature is computed strictly inside the observation window,
// mirroring the schema the model was trained on so the same numbers mean the
// same thing on OULAD and here.

const DAY_MS = 86_400_000;

// UTC day number (days since epoch) for grouping activity into distinct days.
function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
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

export async function computeRiskFeatures(
  userId: string,
  windowEnd: Date = new Date(),
  windowDays = 28,
): Promise<RiskFeatures> {
  const windowStart = new Date(windowEnd.getTime() - windowDays * DAY_MS);

  // Submit events inside the window (activity signal).
  const submits = await prisma.event.findMany({
    where: { userId, type: 'level_submit', ts: { gte: windowStart, lt: windowEnd } },
    select: { ts: true },
    orderBy: { ts: 'asc' },
  });

  // Distinct active days.
  const days = [...new Set(submits.map((e) => utcDay(e.ts)))].sort((a, b) => a - b);
  const active_days_in_window = days.length;

  // Mean gap between consecutive active days (window length if too few days).
  let mean_session_gap_days = windowDays;
  if (days.length >= 2) {
    let sum = 0;
    for (let i = 1; i < days.length; i++) sum += days[i]! - days[i - 1]!;
    mean_session_gap_days = sum / (days.length - 1);
  }

  // Trend: activity in the second half of the window minus the first half.
  const midMs = windowEnd.getTime() - (windowDays / 2) * DAY_MS;
  const firstHalf = submits.filter((e) => e.ts.getTime() < midMs).length;
  const activity_trend = submits.length - firstHalf - firstHalf;

  // Days since the student's last activity of ANY kind.
  const last = await prisma.event.findFirst({
    where: { userId },
    orderBy: { ts: 'desc' },
    select: { ts: true },
  });
  const days_since_last_activity = last
    ? Math.floor((windowEnd.getTime() - last.ts.getTime()) / DAY_MS)
    : windowDays;

  // Completion + average score from per-level progress.
  const userLevels = await prisma.userLevel.findMany({
    where: { userId },
    select: { status: true, bestPassRatio: true },
  });
  const attempted = userLevels.length;
  const completed = userLevels.filter((u) => u.status === 'completed').length;
  const completion_ratio = attempted ? completed / attempted : 0;
  const avg_score = attempted
    ? userLevels.reduce((s, u) => s + u.bestPassRatio, 0) / attempted
    : 0;

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { currentStreak: true },
  });

  return {
    active_days_in_window,
    mean_session_gap_days,
    days_since_last_activity,
    completion_ratio,
    avg_score,
    activity_trend,
    current_streak: profile?.currentStreak ?? 0,
  };
}
