import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { rankLeaderboard, xpFromEvents } from '../gamification/leaderboard';

export const leaderboardRouter = Router();

const DAY_MS = 86_400_000;

// GET /api/leaderboard?period=week|all — the XP leaderboard (PRD F7).
//   week: XP earned in the last 7 days, rebuilt from the events log (completions
//         minus hint costs) — so a new student can top it in their first week
//   all : lifetime XP
// Shows display names or anonymous "Quester XXXX" handles; opted-out students
// are hidden from everyone else.
leaderboardRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const period = req.query.period === 'all' ? 'all' : 'week';

    const players = await prisma.profile.findMany({
      where: { OR: [{ onboardingStep: { gte: 5 } }, { id: userId }] },
      select: { id: true, fullName: true, totalXp: true, leaderboardOptOut: true },
    });

    let xp: Map<string, number>;
    if (period === 'all') {
      xp = new Map(players.map((p) => [p.id, p.totalXp]));
    } else {
      const since = new Date(Date.now() - 7 * DAY_MS);
      const [events, levels] = await Promise.all([
        prisma.event.findMany({
          where: { ts: { gte: since }, type: { in: ['level_complete', 'hint_used'] } },
          select: { userId: true, type: true, payload: true },
        }),
        prisma.level.findMany({ select: { id: true, xpReward: true } }),
      ]);
      xp = xpFromEvents(events, new Map(levels.map((l) => [l.id, l.xpReward])));
    }

    const entries = players.map((p) => ({
      userId: p.id,
      name: p.fullName,
      xp: xp.get(p.id) ?? 0,
      optOut: p.leaderboardOptOut,
    }));
    const { top, you } = rankLeaderboard(entries, userId, 20);

    res.json({
      period,
      top,
      you,
      players: entries.filter((e) => !e.optOut && e.xp > 0).length,
    });
  }),
);
