import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { generateRoadmap, mapGoal } from '../aiClient';

export const onboardingRouter = Router();

// What the onboarding wizard submits when the student finishes.
const OnboardingBody = z.object({
  branch: z.string().optional(),
  year: z.number().int().min(1).max(4).optional(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  hoursPerWeek: z.number().int().min(1).max(40),
  targetCompanies: z.array(z.string()).default([]),
  goalText: z.string().default(''),
  testedOut: z.array(z.string()).default([]), // skill ids passed out of via the quiz
  quizAttempts: z
    .array(
      z.object({
        questionId: z.string(),
        questionVersion: z.number().int(),
        topicSkillId: z.string(),
        chosenOption: z.number().int(),
        isCorrect: z.boolean(),
      }),
    )
    .default([]),
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

    // 1) Free-text goal -> goal category (or the neutral default if left blank).
    const goalCategory = input.goalText.trim()
      ? (await mapGoal(input.goalText)).goalCategory
      : 'general_placement';

    // 2) Generate the personalized week-by-week plan.
    const items = await generateRoadmap({
      goalCategory,
      hoursPerWeek: input.hoursPerWeek,
      testedOut: input.testedOut,
    });

    // Only persist target companies that actually exist (avoids a FK error if the
    // client sends a company we haven't seeded yet).
    const validCompanies = await prisma.company.findMany({
      where: { id: { in: input.targetCompanies } },
      select: { id: true },
    });

    // 3) Persist profile answers, quiz attempts, target companies, and the new
    //    roadmap — all in ONE transaction, so a failure leaves nothing half-done.
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: userId },
        data: {
          branch: input.branch,
          year: input.year,
          skillLevel: input.skillLevel,
          hoursPerWeek: input.hoursPerWeek,
          goalText: input.goalText,
          goalCategory,
          onboardingStep: 5, // 5 = complete
        },
      });

      // Replace the target-company set.
      await tx.userTargetCompany.deleteMany({ where: { userId } });
      if (validCompanies.length) {
        await tx.userTargetCompany.createMany({
          data: validCompanies.map((c) => ({ userId, companyId: c.id })),
          skipDuplicates: true,
        });
      }

      // Store the quiz answers (evidence for the report + reproducible test-out).
      if (input.quizAttempts.length) {
        await tx.quizAttempt.createMany({
          data: input.quizAttempts.map((q) => ({ userId, ...q })),
        });
      }

      // Deactivate any previous roadmap, then insert the new one and its items.
      await tx.roadmap.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
      const roadmap = await tx.roadmap.create({
        data: {
          userId,
          isActive: true,
          params: { goalCategory, hoursPerWeek: input.hoursPerWeek, testedOut: input.testedOut },
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

    await logEvent(userId, 'onboarding_step', { step: 5, goalCategory });

    const totalWeeks = items.length ? Math.max(...items.map((i) => i.weekNumber)) : 0;
    res.json({ ok: true, goalCategory, skills: items.length, weeks: totalWeeks });
  }),
);
