import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { getExecutor } from '../execution';
import { computeStreak } from '../gamification/streak';
import { badgesToAward } from '../gamification/badges';

export const levelsRouter = Router();

// GET /api/levels/:id — the play view of a level.
// Deliberately strips the reference solution and all HIDDEN test-case data; only
// the visible test cases are exposed, as worked examples. Hidden cases never
// reach the client (TRD 5: hidden tests stay hidden).
levelsRouter.get(
  '/levels/:id',
  asyncHandler(async (req, res) => {
    const levelId = req.params.id;
    if (!levelId) {
      res.status(400).json({ error: 'missing level id' });
      return;
    }
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      include: {
        testCases: {
          where: { isHidden: false }, // only the visible examples
          orderBy: { ordinal: 'asc' },
          select: { stdin: true, expectedOutput: true },
        },
      },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }
    await logEvent(req.userId!, 'level_start', { levelId: level.id });
    res.json({
      id: level.id,
      skillId: level.skillId,
      title: level.title,
      difficulty: level.difficulty,
      statementMd: level.statementMd,
      starterCode: level.starterCode,
      hints: level.hints,
      xpReward: level.xpReward,
      sampleTests: level.testCases, // visible examples only
    });
  }),
);

const SubmitBody = z.object({
  // Cap the size to match the 64 KB limit in the TRD.
  sourceCode: z.string().max(64 * 1024),
});

// POST /api/levels/:id/submit — run the submission and, on a full pass, award XP.
levelsRouter.post(
  '/levels/:id/submit',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const levelId = req.params.id;
    if (!levelId) {
      res.status(400).json({ error: 'missing level id' });
      return;
    }
    const { sourceCode } = SubmitBody.parse(req.body);

    // Load the level with ALL its test cases (hidden included) to run against.
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      include: { testCases: { orderBy: { ordinal: 'asc' } } },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }

    // Run the code through the configured executor (mock for now).
    const run = await getExecutor().run(
      sourceCode,
      level.testCases.map((t) => ({
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        isHidden: t.isHidden,
      })),
      level.timeLimitMs,
    );

    const total = level.testCases.length;
    const passed = run.results.filter((r) => r.passed).length;
    const passRatio = total === 0 ? 0 : passed / total;
    const allPass = total > 0 && passed === total;

    // Persist progress + (atomically) award XP + streak + badges, in one txn.
    let xpAwarded = 0;
    let justCompleted = false;
    let newBadgeIds: string[] = [];
    let currentStreak = 0;
    await prisma.$transaction(async (tx) => {
      // Ensure the user_level row exists and count this attempt.
      const ul = await tx.userLevel.upsert({
        where: { userId_levelId: { userId, levelId } },
        create: { userId, levelId, status: 'unlocked', attempts: 1, bestPassRatio: passRatio },
        update: { attempts: { increment: 1 } },
      });
      // Keep the best pass ratio seen so far.
      if (passRatio > ul.bestPassRatio) {
        await tx.userLevel.update({
          where: { userId_levelId: { userId, levelId } },
          data: { bestPassRatio: passRatio },
        });
      }

      // ATOMIC XP AWARD (schema 3.7): flip to 'completed' only if it wasn't
      // already. updateMany returns how many rows matched — exactly one caller
      // can win, so two concurrent all-pass submits can never double-award.
      if (allPass) {
        const claimed = await tx.userLevel.updateMany({
          where: { userId, levelId, status: { not: 'completed' } },
          data: { status: 'completed', completedAt: new Date() },
        });
        if (claimed.count === 1) {
          justCompleted = true;
          await tx.profile.update({
            where: { id: userId },
            data: { totalXp: { increment: level.xpReward } },
          });
          await tx.event.create({
            data: { userId, type: 'level_complete', payload: { levelId } },
          });
          xpAwarded = level.xpReward;
        }
      }

      // --- Streak: every submit counts as activity today (PRD F4).
      const p = await tx.profile.findUnique({
        where: { id: userId },
        select: { currentStreak: true, bestStreak: true, lastActiveDate: true },
      });
      const streak = computeStreak(
        p?.lastActiveDate ?? null,
        new Date(),
        p?.currentStreak ?? 0,
        p?.bestStreak ?? 0,
      );
      if (streak.changed) {
        await tx.profile.update({
          where: { id: userId },
          data: {
            currentStreak: streak.currentStreak,
            bestStreak: streak.bestStreak,
            lastActiveDate: streak.lastActiveDate,
          },
        });
      }
      currentStreak = streak.currentStreak;

      // --- Badges: award any newly-earned ones (idempotent).
      const earnedRows = await tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
      const earned = new Set(earnedRows.map((e) => e.badgeId));
      const totalCompleted = justCompleted
        ? await tx.userLevel.count({ where: { userId, status: 'completed' } })
        : 0;
      newBadgeIds = badgesToAward(
        {
          justCompletedLevel: justCompleted,
          totalCompletedLevels: totalCompleted,
          hintsUsedThisLevel: ul.hintsUsed,
          currentStreak: streak.currentStreak,
        },
        earned,
      );
      if (newBadgeIds.length) {
        await tx.userBadge.createMany({
          data: newBadgeIds.map((badgeId) => ({ userId, badgeId })),
          skipDuplicates: true,
        });
        for (const badgeId of newBadgeIds) {
          await tx.event.create({ data: { userId, type: 'badge_earned', payload: { badgeId } } });
        }
      }

      // Record the submission itself.
      await tx.submission.create({
        data: { userId, levelId, sourceCode, passRatio, verdict: run.verdict },
      });
    });

    await logEvent(userId, 'level_submit', { levelId, passRatio, verdict: run.verdict });

    // Look up display info for any badges just earned (for the celebration).
    const newBadges = newBadgeIds.length
      ? await prisma.badge.findMany({
          where: { id: { in: newBadgeIds } },
          select: { id: true, title: true, icon: true },
        })
      : [];

    // Build the client response — HIDDEN cases reveal pass/fail ONLY.
    const cases = level.testCases.map((t, i) => {
      const result = run.results[i];
      const base = { hidden: t.isHidden, passed: result?.passed ?? false };
      if (t.isHidden) return base; // no input/expected/actual for hidden cases
      return {
        ...base,
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        actualOutput: result?.actualOutput ?? '',
      };
    });

    res.json({
      verdict: run.verdict,
      passed,
      total,
      passRatio,
      xpAwarded, // >0 only the first time the level is fully solved
      currentStreak, // updated daily streak
      newBadges, // badges earned by this submission (for the celebration)
      cases,
    });
  }),
);
