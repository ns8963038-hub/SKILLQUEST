import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { generateRoadmap, mapGoal } from '../aiClient';
import { gradeQuiz, publicQuestion, skillLevelFromScore } from '../onboarding/quiz';

export const onboardingRouter = Router();

// Thrown inside the transaction when another request finished onboarding first.
class AlreadyOnboarded extends Error {}

// The published quiz questions, in the order the quiz shows them.
const loadQuiz = () =>
  prisma.quizQuestion.findMany({ where: { published: true }, orderBy: { ordinal: 'asc' } });

// GET /api/onboarding/quiz — the placement quiz, WITHOUT the answers: the
// browser only ever learns which option the student picked, never which was right.
onboardingRouter.get(
  '/onboarding/quiz',
  asyncHandler(async (_req, res) => {
    const questions = await loadQuiz();
    res.json({ questions: questions.map(publicQuestion) });
  }),
);

// What the onboarding wizard submits when the student finishes. The quiz is
// sent as the options chosen (question id -> option index); the server grades
// it. Fields older clients sent (testedOut, quizAttempts, skillLevel) are
// ignored: zod drops keys the schema doesn't name.
const OnboardingBody = z.object({
  branch: z.string().max(80).optional(),
  year: z.number().int().min(1).max(4).optional(),
  hoursPerWeek: z.number().int().min(1).max(40),
  targetCompanies: z.array(z.string().max(40)).max(20).default([]),
  goalText: z.string().max(500).default(''),
  quizAnswers: z
    .record(z.string().max(40), z.number().int().min(0).max(9))
    .refine((a) => Object.keys(a).length <= 50, 'too many answers')
    .default({}),
});

// POST /api/onboarding/complete — the heart of onboarding.
// Maps the goal, generates the roadmap (both via the AI service), and persists
// everything, then marks the profile complete. This is the single call the
// frontend makes at the end of the wizard (App Flow: the browser never touches
// /ai/* directly — this route is the gateway).
onboardingRouter.post(
  '/onboarding/complete',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const input = OnboardingBody.parse(req.body);

    // Onboarding happens once. Running it again would build a fresh roadmap with
    // only its first skill open (finished skills showing as locked) and store the
    // quiz answers twice. Weekly hours and the goal are changed in Settings.
    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      select: { onboardingStep: true },
    });
    if (profile && profile.onboardingStep >= 5) {
      res.status(409).json({ error: 'already_onboarded' });
      return;
    }

    // 0) Grade the placement quiz against the answers held here.
    const questions = await loadQuiz();
    const quiz = gradeQuiz(questions, input.quizAnswers);

    // 1) Free-text goal -> goal category (or the neutral default if left blank).
    const goalCategory = input.goalText.trim()
      ? (await mapGoal(input.goalText)).goalCategory
      : 'general_placement';

    // 2) Generate the personalized week-by-week plan.
    const items = await generateRoadmap({
      goalCategory,
      hoursPerWeek: input.hoursPerWeek,
      testedOut: quiz.testedOut,
    });

    // Only persist target companies that actually exist (avoids a FK error if the
    // client sends a company we haven't seeded yet).
    const validCompanies = await prisma.company.findMany({
      where: { id: { in: input.targetCompanies } },
      select: { id: true },
    });

    // 3) Persist profile answers, quiz attempts, target companies, and the new
    //    roadmap — all in ONE transaction, so a failure leaves nothing half-done.
    //    The FIRST write claims onboarding: it only matches a profile that isn't
    //    onboarded yet. If two requests race past the check above (a true double
    //    submit), the second one's claim waits for the first to commit, then
    //    matches nothing — and its whole transaction rolls back (409).
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.profile.updateMany({
          where: { id: userId, onboardingStep: { lt: 5 } },
          data: {
            branch: input.branch,
            year: input.year,
            skillLevel: skillLevelFromScore(quiz.totalCorrect, questions.length),
            hoursPerWeek: input.hoursPerWeek,
            goalText: input.goalText,
            goalCategory,
            onboardingStep: 5, // 5 = complete
          },
        });
        if (claimed.count !== 1) throw new AlreadyOnboarded();

        // Replace the target-company set.
        await tx.userTargetCompany.deleteMany({ where: { userId } });
        if (validCompanies.length) {
          await tx.userTargetCompany.createMany({
            data: validCompanies.map((c) => ({ userId, companyId: c.id })),
            skipDuplicates: true,
          });
        }

        // Store the quiz answers (evidence for the report + reproducible test-out).
        if (quiz.attempts.length) {
          await tx.quizAttempt.createMany({
            data: quiz.attempts.map((q) => ({ userId, ...q })),
          });
        }

        // Deactivate any previous roadmap, then insert the new one and its items.
        await tx.roadmap.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        const roadmap = await tx.roadmap.create({
          data: {
            userId,
            isActive: true,
            params: { goalCategory, hoursPerWeek: input.hoursPerWeek, testedOut: quiz.testedOut },
          },
        });
        // Start the student on the very first skill; everything else is locked
        // until they progress (real unlock logic arrives with the game in M2).
        await tx.roadmapItem.createMany({
          data: items.map((it, idx) => ({
            roadmapId: roadmap.id,
            skillId: it.skillId,
            weekNumber: it.weekNumber,
            position: it.position,
            status: idx === 0 ? ('current' as const) : ('locked' as const),
          })),
        });
      });
    } catch (err) {
      if (err instanceof AlreadyOnboarded) {
        res.status(409).json({ error: 'already_onboarded' });
        return;
      }
      throw err;
    }

    await logEvent(userId, 'onboarding_step', { step: 5, goalCategory });

    const totalWeeks = items.length ? Math.max(...items.map((i) => i.weekNumber)) : 0;
    res.json({
      ok: true,
      goalCategory,
      skills: items.length,
      weeks: totalWeeks,
      testedOut: quiz.testedOut,
    });
  }),
);
