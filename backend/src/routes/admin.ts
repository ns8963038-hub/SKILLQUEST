import { Router, type RequestHandler } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { latencySummary, percentile } from '../metrics/timing';
import { summarizeSurveys } from '../research/sus';
import { maskEmail, toCsv } from '../research/pseudonym';
import { runWeeklyScoring } from '../risk/scoring';
import { streakAsOf } from '../gamification/streak';

export const adminRouter = Router();

// The internal admin view (PRD F5 acceptance: "risk tier visible on an internal
// admin view"). Only profiles flagged is_admin — granted via ADMIN_USER_IDS — pass.
const requireAdmin: RequestHandler = (req, res, next) => {
  prisma.profile
    .findUnique({ where: { id: req.userId! }, select: { isAdmin: true } })
    .then((p) => {
      if (!p?.isAdmin) {
        res.status(403).json({ error: 'admins only' });
        return;
      }
      next();
    })
    .catch(next);
};
adminRouter.use('/admin', requireAdmin);

// Non-admin students in sign-up order, with their stored participant codes.
async function participants() {
  return prisma.profile.findMany({
    where: { isAdmin: false },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      onboardingStep: true,
      totalXp: true,
      currentStreak: true,
      bestStreak: true,
      lastActiveDate: true,
      participantCode: true,
      riskTier: true,
      consentGivenAt: true,
      withdrawnAt: true,
      createdAt: true,
    },
  });
}

// GET /api/admin/overview — every student's risk tier and the prediction behind
// it (model version, window, feature row), plus progress and the nudge funnel.
adminRouter.get(
  '/admin/overview',
  asyncHandler(async (_req, res) => {
    const students = await participants();
    const [scores, completed, lastEvents, nudges] = await Promise.all([
      prisma.dropoutScore.findMany({
        orderBy: { scoredAt: 'desc' },
        select: {
          userId: true,
          probability: true,
          tier: true,
          modelVersion: true,
          featureSetVersion: true,
          thresholdVersion: true,
          observationWindowStart: true,
          observationWindowEnd: true,
          scoredAt: true,
          features: true,
        },
      }),
      prisma.userLevel.groupBy({ by: ['userId'], where: { status: 'completed' }, _count: { _all: true } }),
      prisma.event.groupBy({ by: ['userId'], _max: { ts: true } }),
      prisma.nudge.findMany({ select: { userId: true, shownAt: true, clickedAt: true, dismissedAt: true } }),
    ]);

    // Latest prediction per student (rows arrive newest first).
    const latestScore = new Map<string, (typeof scores)[number]>();
    for (const s of scores) if (!latestScore.has(s.userId)) latestScore.set(s.userId, s);
    const completedBy = new Map(completed.map((c) => [c.userId, c._count._all]));
    const lastActiveBy = new Map(lastEvents.map((e) => [e.userId, e._max.ts]));

    res.json({
      generatedAt: new Date(),
      students: students.map((p) => {
        const mine = nudges.filter((n) => n.userId === p.id);
        return {
          participant: p.participantCode ?? '—', // none until they agree to take part
          email: maskEmail(p.email),
          onboarded: p.onboardingStep >= 5,
          research: p.withdrawnAt ? 'withdrawn' : p.consentGivenAt ? 'consented' : 'not asked',
          totalXp: p.totalXp,
          levelsCompleted: completedBy.get(p.id) ?? 0,
          currentStreak: streakAsOf(p.currentStreak, p.lastActiveDate, new Date()),
          lastActive: lastActiveBy.get(p.id) ?? null,
          riskTier: p.riskTier,
          prediction: latestScore.get(p.id) ?? null,
          nudges: {
            total: mine.length,
            shown: mine.filter((n) => n.shownAt).length,
            clicked: mine.filter((n) => n.clickedAt).length,
            dismissed: mine.filter((n) => n.dismissedAt).length,
          },
        };
      }),
    });
  }),
);

// POST /api/admin/run-scoring — run the weekly risk scoring now (demo / UAT).
adminRouter.post(
  '/admin/run-scoring',
  asyncHandler(async (_req, res) => {
    res.json(await runWeeklyScoring());
  }),
);

// GET /api/admin/metrics — the PRD §6 success metrics, live: API latency p95,
// code-execution p95, SUS / engagement / would-recommend, nudge funnel, tiers.
// Survey aggregates include consenting, non-withdrawn students only.
adminRouter.get(
  '/admin/metrics',
  asyncHandler(async (_req, res) => {
    const [executions, surveys, nudges, tiers] = await Promise.all([
      prisma.submission.findMany({
        where: { runtimeMs: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { runtimeMs: true },
      }),
      prisma.surveyResponse.findMany({
        where: { user: { isAdmin: false, withdrawnAt: null, consentGivenAt: { not: null } } },
        select: { susScore: true, engagement: true, wouldRecommend: true },
      }),
      prisma.nudge.findMany({ select: { shownAt: true, clickedAt: true, dismissedAt: true } }),
      prisma.profile.groupBy({
        by: ['riskTier'],
        where: { isAdmin: false, onboardingStep: { gte: 5 } },
        _count: { _all: true },
      }),
    ]);

    const execMs = executions.map((e) => e.runtimeMs ?? 0);
    res.json({
      api: latencySummary(),
      execution: { n: execMs.length, p50: percentile(execMs, 50), p95: percentile(execMs, 95) },
      survey: summarizeSurveys(surveys),
      nudges: {
        created: nudges.length,
        shown: nudges.filter((n) => n.shownAt).length,
        clicked: nudges.filter((n) => n.clickedAt).length,
        dismissed: nudges.filter((n) => n.dismissedAt).length,
      },
      riskTiers: Object.fromEntries(tiers.map((t) => [t.riskTier, t._count._all])),
    });
  }),
);

// GET /api/admin/export/:kind — pseudonymised CSV for the report (survey | risk |
// progress). ONLY consenting, non-withdrawn participants are exported (§5.1).
adminRouter.get(
  '/admin/export/:kind',
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    const people = await participants();
    // Stored codes (assigned at consent), so the same student has the same code
    // in every export, whatever happens to other accounts.
    const codeOf = new Map(people.map((p) => [p.id, p.participantCode ?? '']));
    const included = people.filter((p) => p.consentGivenAt && !p.withdrawnAt && p.participantCode);
    const ids = included.map((p) => p.id);

    let header: string[];
    let rows: (string | number | boolean | null)[][];

    if (kind === 'survey') {
      const responses = await prisma.surveyResponse.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'asc' } });
      header = ['participant', 'instrument', 'sus_score', 'engagement', 'would_recommend', ...Array.from({ length: 10 }, (_, i) => `q${i + 1}`), 'submitted_at'];
      rows = responses.map((r) => [
        codeOf.get(r.userId) ?? '',
        r.instrument,
        r.susScore,
        r.engagement,
        r.wouldRecommend,
        ...((Array.isArray(r.answers) ? r.answers : []) as number[]),
        r.createdAt.toISOString(),
      ]);
    } else if (kind === 'risk') {
      const featureNames = [
        'active_days_in_window',
        'mean_session_gap_days',
        'days_since_last_activity',
        'completion_ratio',
        'avg_score',
        'activity_trend',
        'current_streak',
      ];
      const scores = await prisma.dropoutScore.findMany({ where: { userId: { in: ids } }, orderBy: { scoredAt: 'asc' } });
      header = ['participant', 'scored_at', 'window_start', 'window_end', 'model_version', 'feature_set_version', 'probability', 'tier', ...featureNames];
      rows = scores.map((s) => {
        const f = (s.features ?? {}) as Record<string, number>;
        return [
          codeOf.get(s.userId) ?? '',
          s.scoredAt.toISOString(),
          s.observationWindowStart.toISOString().slice(0, 10),
          s.observationWindowEnd.toISOString().slice(0, 10),
          s.modelVersion,
          s.featureSetVersion,
          s.probability,
          s.tier,
          ...featureNames.map((n) => f[n] ?? null),
        ];
      });
    } else if (kind === 'progress') {
      const completed = await prisma.userLevel.groupBy({
        by: ['userId'],
        where: { status: 'completed', userId: { in: ids } },
        _count: { _all: true },
      });
      const completedBy = new Map(completed.map((c) => [c.userId, c._count._all]));
      header = ['participant', 'total_xp', 'levels_completed', 'current_streak', 'best_streak', 'risk_tier'];
      // The streak as of the export, not the stored value (which only changes on a submit).
      const now = new Date();
      rows = included.map((p) => [
        codeOf.get(p.id) ?? '',
        p.totalXp,
        completedBy.get(p.id) ?? 0,
        streakAsOf(p.currentStreak, p.lastActiveDate, now),
        p.bestStreak,
        p.riskTier,
      ]);
    } else {
      res.status(404).json({ error: 'export must be survey, risk or progress' });
      return;
    }

    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="skillquest-${kind}.csv"`);
    res.send(toCsv(header, rows));
  }),
);
