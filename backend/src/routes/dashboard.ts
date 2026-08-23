import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';

export const dashboardRouter = Router();

// XP needed per level. A simple linear curve keeps the maths explainable.
const LEVEL_SIZE = 150;

// True if two dates fall on the same UTC calendar day.
function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// GET /api/dashboard — everything the home screen shows: XP/level, streak,
// earned badges, and the current quest to continue.
dashboardRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      select: { totalXp: true, currentStreak: true, bestStreak: true, lastActiveDate: true },
    });
    if (!profile) {
      res.status(404).json({ error: 'profile not found' });
      return;
    }

    // Level/rank derived from total XP.
    const level = Math.floor(profile.totalXp / LEVEL_SIZE) + 1;
    const xpIntoLevel = profile.totalXp % LEVEL_SIZE;

    // Earned badges, newest first, joined with the display catalog.
    const badgeRows = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: { select: { title: true, icon: true, description: true } } },
      orderBy: { earnedAt: 'desc' },
    });
    const badges = badgeRows.map((b) => ({
      id: b.badgeId,
      title: b.badge.title,
      icon: b.badge.icon,
      description: b.badge.description,
      earnedAt: b.earnedAt,
    }));

    // The current quest: the active roadmap's "current" node (or the first
    // not-yet-completed one). Its first level is `<skillId>-01`.
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId, isActive: true },
      include: {
        items: {
          include: { skill: { select: { title: true } } },
          orderBy: [{ weekNumber: 'asc' }, { position: 'asc' }],
        },
      },
    });
    const currentItem =
      roadmap?.items.find((i) => i.status === 'current') ??
      roadmap?.items.find((i) => i.status !== 'completed');
    const currentQuest = currentItem
      ? { skillId: currentItem.skillId, title: currentItem.skill.title, levelId: `${currentItem.skillId}-01` }
      : null;

    const activeToday = !!profile.lastActiveDate && sameUtcDay(profile.lastActiveDate, new Date());

    res.json({
      totalXp: profile.totalXp,
      level,
      xpIntoLevel,
      xpForNextLevel: LEVEL_SIZE,
      currentStreak: profile.currentStreak,
      bestStreak: profile.bestStreak,
      activeToday,
      badges,
      currentQuest,
    });
  }),
);
