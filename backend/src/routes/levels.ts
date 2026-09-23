import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { codeRunLimit, exampleRunLimit } from '../rateLimits';
import { logEvent } from '../events';
import { getExecutor } from '../execution';
import { markActiveToday } from '../gamification/activity';
import { badgesToAward, earnsPlacementReady } from '../gamification/badges';
import { HINT_COST, applyHintCost } from '../gamification/hints';
import { lessonComesFirst, lessonStateBySkill } from '../lessons/progress';
import { advanceRoadmap } from '../roadmap/advance';
import { computePlacementForUser } from '../placement/compute';
import { firstUnfinishedInSkill, nextLevelAfter, nextLevelInSkill } from '../progress/levels';
import { guardSkill, existingSkill, skillOfLevel } from '../progress/access';
import { DEFAULT_BKT, bktUpdate, isMastered } from '../tutor/bkt';

export const levelsRouter = Router();

// Locks, enforced on the server (progress/access.ts): every route below that
// names a level (:id) or a skill (:skillId) first checks that the student has
// unlocked that skill, and answers 403 if not.
levelsRouter.param('id', guardSkill(skillOfLevel));
levelsRouter.param('skillId', guardSkill(existingSkill));

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

      // Take the cost with an atomic decrement, never "read XP, write back a
      // number": a level completion landing in between would be overwritten and
      // its XP lost. The decrement also locks the row until this transaction
      // ends, so flooring at zero afterwards is safe.
      const after = await tx.profile.update({
        where: { id: userId },
        data: { totalXp: { decrement: HINT_COST } },
        select: { totalXp: true },
      });
      const { newXp, deducted } = applyHintCost(after.totalXp + HINT_COST); // the balance before the decrement
      if (newXp !== after.totalXp) await tx.profile.update({ where: { id: userId }, data: { totalXp: newXp } });
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
// the student hasn't done (or skipped) it yet — unless they have already
// finished every level, when the lesson is optional (replay it from the play
// screen) — and otherwise the first level they haven't completed, else the first
// (re-practice). Skills have several levels, so the frontend asks here instead
// of assuming `<skill>-01`.
levelsRouter.get(
  '/skills/:skillId/next-level',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId ?? '';
    const [levelId, unfinished, lessons] = await Promise.all([
      nextLevelInSkill(userId, skillId),
      firstUnfinishedInSkill(userId, skillId),
      lessonStateBySkill(userId, [skillId]),
    ]);
    const lesson = lessons.get(skillId) ?? 'none';
    if (!levelId && lesson === 'none') {
      res.status(404).json({ error: 'this skill has no levels yet' });
      return;
    }
    const finished = levelId !== null && unfinished === null;
    res.json({ levelId, lesson, lessonFirst: lessonComesFirst(lesson) && !finished });
  }),
);

const SubmitBody = z.object({
  // Cap the size to match the 64 KB limit in the TRD.
  sourceCode: z.string().max(64 * 1024),
});

// Same code, same whitespace-insensitive comparison the fill-in check uses.
const normalizeCode = (code: string) => code.replace(/\s+/g, '');

// POST /api/levels/:id/run — "Run examples": the VISIBLE tests only, so a
// student can check their work while writing it. Never an attempt, never a
// submission, never evidence for the mastery estimate — students used to press
// the graded button to test a half-written draft, so their first recorded
// attempt was usually a failure that said nothing about what they knew.
// It IS practice, though: an examples run of code the student has actually
// written keeps their streak and counts as activity for the risk rule (an hour
// of debugging shouldn't look like being away). The untouched starter code
// counts for nothing, so pressing the button alone can't keep a streak alive.
levelsRouter.post(
  '/levels/:id/run',
  exampleRunLimit, // debugging runs: 20 a minute per student
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const levelId = req.params.id;
    const { sourceCode } = SubmitBody.parse(req.body);
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      include: { testCases: { where: { isHidden: false }, orderBy: { ordinal: 'asc' } } },
    });
    if (!level || !level.published) {
      res.status(404).json({ error: 'level not found' });
      return;
    }
    const run = await getExecutor().run(
      sourceCode,
      level.testCases.map((t) => ({ stdin: t.stdin, expectedOutput: t.expectedOutput, isHidden: false })),
      level.timeLimitMs,
    );
    const passed = run.results.filter((r) => r.passed).length;

    // Practice, if they've written something: streak + a `level_run` event (which
    // the risk rule counts as activity). Only after the code actually ran — a
    // runner failure (503) records nothing, as for Submit.
    const countedAsPractice = normalizeCode(sourceCode) !== normalizeCode(level.starterCode);
    if (countedAsPractice) {
      await markActiveToday(userId);
      await logEvent(userId, 'level_run', { levelId, passed, total: level.testCases.length });
    }

    res.json({
      mode: 'examples',
      countedAsPractice, // kept the streak / counted as activity (never as an attempt)
      verdict: run.verdict,
      passed,
      total: level.testCases.length,
      cases: level.testCases.map((t, i) => ({
        hidden: false,
        passed: run.results[i]?.passed ?? false,
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        actualOutput: run.results[i]?.actualOutput ?? '',
      })),
    });
  }),
);

// POST /api/levels/:id/submit — run the submission and, on a full pass, award XP.
levelsRouter.post(
  '/levels/:id/submit',
  codeRunLimit, // runs Java on the shared runner: 10 a minute per student
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

    // Submitting the untouched starter program is not an attempt at the level:
    // refuse it before anything runs, so it can't count as evidence or keep a
    // streak alive.
    if (normalizeCode(sourceCode) === normalizeCode(level.starterCode)) {
      res.status(422).json({
        error: 'unchanged_starter',
        message: 'That is still the starter code — write your solution first, then submit.',
      });
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
    let masteryCounted = false; // was this the level's first graded submit?
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
      const streak = await markActiveToday(userId, tx);
      currentStreak = streak.currentStreak;

      // --- Badges: award any newly-earned ones (idempotent).
      const earnedRows = await tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
      const earned = new Set(earnedRows.map((e) => e.badgeId));
      const totalCompleted = justCompleted
        ? await tx.userLevel.count({ where: { userId, status: 'completed' } })
        : 0;
      // Code Master: did this completion finish the whole skill with no hint on
      // any of its levels? Only worth asking on a new completion, badge not held.
      let completedSkillWithoutHints = false;
      if (justCompleted && !earned.has('code_master')) {
        const skillLevelIds = (
          await tx.level.findMany({ where: { skillId: level.skillId, published: true }, select: { id: true } })
        ).map((l) => l.id);
        const mine = await tx.userLevel.findMany({
          where: { userId, levelId: { in: skillLevelIds } },
          select: { status: true, hintsUsed: true },
        });
        completedSkillWithoutHints =
          mine.length === skillLevelIds.length && mine.every((u) => u.status === 'completed' && u.hintsUsed === 0);
      }
      newBadgeIds = badgesToAward(
        {
          justCompletedLevel: justCompleted,
          totalCompletedLevels: totalCompleted,
          completedSkillWithoutHints,
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

      // --- Adaptive tutor (M4): one Bayesian Knowledge Tracing update per LEVEL,
      // from the student's FIRST graded submit on it. The observation is binary:
      // did every test pass? Later submits of the same level are not new
      // evidence — counting them let a student solve once and press Submit twice
      // more to reach "mastered" (0.20 -> 0.60 -> 0.89 -> 0.98), or drag their
      // estimate down by debugging on the graded button. ("Run examples" never
      // counts.) This is the usual first-attempt rule in knowledge tracing.
      // (Submits are sequential per student — the button is disabled while
      // running — so a read-then-write is safe.)
      const prior = await tx.skillMastery.findUnique({
        where: { userId_skillId: { userId, skillId: level.skillId } },
        select: { pMastery: true },
      });
      masteryBefore = prior?.pMastery ?? DEFAULT_BKT.pL0;
      masteryCounted = ul.attempts === 1; // this upsert just recorded the first graded submit
      masteryAfter = masteryCounted ? bktUpdate(masteryBefore, allPass) : masteryBefore;
      if (masteryCounted) {
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
      }

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

    // If "Next level" moves on to a NEW topic whose lesson the student hasn't done
    // (or skipped), the reward opens that lesson first — exactly as opening the
    // topic from the map does. Before, "Next level" jumped straight into the next
    // topic's first level, so a student met it without being taught it.
    let nextLessonSkillId: string | null = null;
    if (nextLevelId) {
      const nextSkill = await skillOfLevel(nextLevelId);
      if (nextSkill && nextSkill !== level.skillId) {
        const state = (await lessonStateBySkill(userId, [nextSkill])).get(nextSkill) ?? 'none';
        if (lessonComesFirst(state)) nextLessonSkillId = nextSkill;
      }
    }

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
      nextLessonSkillId, // set when that level starts a new topic whose lesson comes first
      cases,
      // How this attempt moved the tutor's estimate (shown in the reward).
      mastery: {
        skillId: level.skillId,
        title: level.skill.title,
        before: masteryBefore,
        after: masteryAfter,
        mastered: isMastered(masteryAfter),
        counted: masteryCounted, // false: the tutor already judged this level on the first submit
      },
    });
  }),
);
