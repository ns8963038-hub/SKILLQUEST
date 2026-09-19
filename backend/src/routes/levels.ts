import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { getExecutor } from '../execution';
import { computeStreak } from '../gamification/streak';
import { badgesToAward, earnsPlacementReady } from '../gamification/badges';
import { HINT_COST, applyHintCost } from '../gamification/hints';
import { lessonComesFirst, lessonStateBySkill } from '../lessons/progress';
import { advanceRoadmap } from '../roadmap/advance';
import { computePlacementForUser } from '../placement/compute';
import { nextLevelAfter, nextLevelInSkill } from '../progress/levels';
import { DEFAULT_BKT, bktUpdate, isMastered } from '../tutor/bkt';

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
        skill: { select: { title: true } }, // display name for the play screen
      },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }
    // The adaptive tutor's current mastery estimate for this skill — only present
    // once the student has attempted it (no evidence yet = no number shown).
    const [mastery, progress, lesson] = await Promise.all([
      prisma.skillMastery.findUnique({
        where: { userId_skillId: { userId: req.userId!, skillId: level.skillId } },
        select: { pMastery: true },
      }),
      prisma.userLevel.findUnique({
        where: { userId_levelId: { userId: req.userId!, levelId: level.id } },
        select: { hintsUsed: true, status: true },
      }),
      // Is there a lesson for this topic (so the play screen can offer a replay)?
      prisma.lesson.findFirst({ where: { skillId: level.skillId, published: true }, select: { skillId: true } }),
    ]);
    await logEvent(req.userId!, 'level_start', { levelId: level.id });
    res.json({
      id: level.id,
      skillId: level.skillId,
      title: level.title,
      difficulty: level.difficulty,
      statementMd: level.statementMd,
      starterCode: level.starterCode,
      // Hints are revealed — and paid for — one at a time via POST .../hint; the
      // client only ever receives the hints this student has already unlocked.
      hints: level.hints.slice(0, progress?.hintsUsed ?? 0),
      hintCount: level.hints.length,
      hintCost: HINT_COST,
      completed: progress?.status === 'completed',
      xpReward: level.xpReward,
      sampleTests: level.testCases, // visible examples only
      skillTitle: level.skill.title,
      mastery: mastery?.pMastery, // omitted from the JSON until there is evidence
      lessonAvailable: Boolean(lesson),
    });
  }),
);

// POST /api/levels/:id/hint — reveal this student's next hint for the level.
// Each hint costs HINT_COST XP (never below zero) and is counted, so the "Code
// Master" badge (solve with zero hints) finally means what it says (PRD F3/F4).
levelsRouter.post(
  '/levels/:id/hint',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const levelId = req.params.id;
    if (!levelId) {
      res.status(400).json({ error: 'missing level id' });
      return;
    }
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      select: { published: true, hints: true },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const ul = await tx.userLevel.upsert({
        where: { userId_levelId: { userId, levelId } },
        create: { userId, levelId, status: 'unlocked' },
        update: {},
      });
      if (ul.hintsUsed >= level.hints.length) return null; // nothing left to reveal

      // Claim hint #n atomically: only succeeds if nobody revealed it meanwhile
      // (same pattern as the XP award), so a double-click can't double-charge.
      const claimed = await tx.userLevel.updateMany({
        where: { userId, levelId, hintsUsed: ul.hintsUsed },
        data: { hintsUsed: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;

      const profile = await tx.profile.findUniqueOrThrow({ where: { id: userId }, select: { totalXp: true } });
      const { newXp, deducted } = applyHintCost(profile.totalXp);
      await tx.profile.update({ where: { id: userId }, data: { totalXp: newXp } });
      await tx.event.create({
        data: { userId, type: 'hint_used', payload: { levelId, index: ul.hintsUsed, xpCost: deducted } },
      });
      return { index: ul.hintsUsed, deducted, totalXp: newXp };
    });

    if (!outcome) {
      res.status(409).json({ error: 'no more hints for this level' });
      return;
    }
    res.json({
      hint: level.hints[outcome.index],
      index: outcome.index,
      hintsUsed: outcome.index + 1,
      hintCount: level.hints.length,
      xpCost: outcome.deducted,
      totalXp: outcome.totalXp,
    });
  }),
);

// GET /api/skills/:skillId/next-level — what to open for a skill: its lesson if
// the student hasn't done (or skipped) it yet, and otherwise the first level they
// haven't completed, else the first (re-practice). Skills have several levels,
// so the frontend asks here instead of assuming `<skill>-01`.
levelsRouter.get(
  '/skills/:skillId/next-level',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId ?? '';
    const [levelId, lessons] = await Promise.all([
      nextLevelInSkill(userId, skillId),
      lessonStateBySkill(userId, [skillId]),
    ]);
    const lesson = lessons.get(skillId) ?? 'none';
    if (!levelId && lesson === 'none') {
      res.status(404).json({ error: 'this skill has no levels yet' });
      return;
    }
    res.json({ levelId, lesson, lessonFirst: lessonComesFirst(lesson) });
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
      include: { testCases: { orderBy: { ordinal: 'asc' } }, skill: { select: { title: true } } },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }

    // Run the code through the configured executor, timed end to end — the PRD
    // reports code-execution p95 separately from platform-API latency.
    const execStart = Date.now();
    const run = await getExecutor().run(
      sourceCode,
      level.testCases.map((t) => ({
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        isHidden: t.isHidden,
      })),
      level.timeLimitMs,
    );
    const execMs = Date.now() - execStart;

    const total = level.testCases.length;
    const passed = run.results.filter((r) => r.passed).length;
    const passRatio = total === 0 ? 0 : passed / total;
    const allPass = total > 0 && passed === total;

    // Persist progress + (atomically) award XP + streak + badges, in one txn.
    let xpAwarded = 0;
    let justCompleted = false;
    let newBadgeIds: string[] = [];
    let currentStreak = 0;
    let masteryBefore = DEFAULT_BKT.pL0;
    let masteryAfter = DEFAULT_BKT.pL0;
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

      // --- Adaptive tutor (M4): one Bayesian Knowledge Tracing update for this
      // skill. The observation is binary: did EVERY test pass? A student with no
      // row yet starts from the BKT prior pL0. (Submits are sequential per student —
      // the Run button is disabled while running — so a read-then-write is safe.)
      const prior = await tx.skillMastery.findUnique({
        where: { userId_skillId: { userId, skillId: level.skillId } },
        select: { pMastery: true },
      });
      masteryBefore = prior?.pMastery ?? DEFAULT_BKT.pL0;
      masteryAfter = bktUpdate(masteryBefore, allPass);
      await tx.skillMastery.upsert({
        where: { userId_skillId: { userId, skillId: level.skillId } },
        create: {
          userId,
          skillId: level.skillId,
          pMastery: masteryAfter,
          attempts: 1,
          correct: allPass ? 1 : 0,
          lastResult: allPass,
        },
        update: {
          pMastery: masteryAfter,
          attempts: { increment: 1 },
          correct: { increment: allPass ? 1 : 0 },
          lastResult: allPass,
        },
      });

      // Record the submission itself.
      await tx.submission.create({
        data: { userId, levelId, sourceCode, passRatio, verdict: run.verdict, runtimeMs: execMs },
      });
    });

    // Follow-up work, overlapped where it's safe — each step is a database round
    // trip, and doing all of them one after another added seconds to every submit.
    // Order that matters: the roadmap must advance BEFORE we pick "Next level"
    // (a finished skill hands over to the next one) and before the Placement
    // Ready check (coverage depends on completed skills).
    const placementReadyCheck = async () => {
      // Placement Ready badge (PRD F4): the first time a completion lifts any
      // target role's tracked-skill coverage to 75%+. Only a completion can move
      // coverage, so it's only checked then.
      if (!justCompleted || newBadgeIds.includes('placement_ready')) return;
      const held = await prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId: 'placement_ready' } },
      });
      if (held) return;
      const roles = await computePlacementForUser(userId);
      if (earnsPlacementReady(roles.map((r) => r.score))) {
        await prisma.userBadge.createMany({
          data: [{ userId, badgeId: 'placement_ready' }],
          skipDuplicates: true,
        });
        await logEvent(userId, 'badge_earned', { badgeId: 'placement_ready' });
        newBadgeIds.push('placement_ready');
      }
    };
    const afterProgress = async (): Promise<string | null> => {
      // If this finished the level, advance the roadmap (unlock the next chest).
      if (justCompleted) await advanceRoadmap(userId);
      const [, next] = await Promise.all([
        placementReadyCheck(),
        // Where "Next level" goes: the next unfinished level in this skill, or —
        // once the skill is finished — the next level on the roadmap.
        allPass ? nextLevelAfter(userId, level.skillId) : Promise.resolve(null),
      ]);
      return next;
    };
    const [, nextLevelId] = await Promise.all([
      logEvent(userId, 'level_submit', { levelId, passRatio, verdict: run.verdict }),
      afterProgress(),
    ]);

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
      nextLevelId, // where the reward's "Next level" button goes (null after a fail)
      cases,
      // How this attempt moved the tutor's estimate (shown in the reward).
      mastery: {
        skillId: level.skillId,
        title: level.skill.title,
        before: masteryBefore,
        after: masteryAfter,
        mastered: isMastered(masteryAfter),
      },
    });
  }),
);
