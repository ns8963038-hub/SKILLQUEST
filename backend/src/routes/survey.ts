import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { SURVEY_MIN_LEVELS, susScore } from '../research/sus';

export const surveyRouter = Router();

// GET /api/survey — has this student given feedback, and are they eligible yet?
surveyRouter.get(
  '/survey',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const [submitted, completedLevels] = await Promise.all([
      prisma.surveyResponse.count({ where: { userId } }),
      prisma.userLevel.count({ where: { userId, status: 'completed' } }),
    ]);
    res.json({
      submitted: submitted > 0,
      eligible: completedLevels >= SURVEY_MIN_LEVELS,
      completedLevels,
      minLevels: SURVEY_MIN_LEVELS,
    });
  }),
);

const SurveyBody = z.object({
  answers: z.array(z.number().int().min(1).max(5)).length(10), // the 10 SUS items
  engagement: z.number().int().min(1).max(5),
  wouldRecommend: z.boolean(),
  comments: z.string().max(1000).optional(),
});

// POST /api/survey — one usability response per student (UAT, PRD §6).
surveyRouter.post(
  '/survey',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const input = SurveyBody.parse(req.body);

    if (await prisma.surveyResponse.count({ where: { userId } })) {
      res.status(409).json({ error: 'feedback already submitted — thank you!' });
      return;
    }

    const score = susScore(input.answers);
    await prisma.surveyResponse.create({
      data: {
        userId,
        answers: input.answers,
        susScore: score,
        engagement: input.engagement,
        wouldRecommend: input.wouldRecommend,
        comments: input.comments?.trim() || null,
      },
    });
    await logEvent(userId, 'survey_submitted', { instrument: 'sus-v1' });

    res.json({ ok: true, susScore: score });
  }),
);
