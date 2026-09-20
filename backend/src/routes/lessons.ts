import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { getExecutor } from '../execution';
import { bktUpdate, DEFAULT_BKT } from '../tutor/bkt';
import {
  LESSON_BKT,
  countsAsEvidence,
  fillProgram,
  isAcceptedFill,
  isQuestion,
  sanitizeLesson,
  scoreAnswers,
  type LessonContent,
  type LessonStep,
  type PredictOption,
} from '../lessons/content';
import { nextLevelInSkill } from '../progress/levels';

export const lessonsRouter = Router();

// Learn mode (PRD F8): one interactive lesson per skill, played before its
// levels. Design and rationale: docs/notes/M7-learn-mode.md.
//
// The answers never leave the server before the student answers — the browser
// gets the options, posts its choice, and the server says whether it was right
// (the same principle as hidden test cases).

// Load a published lesson plus this student's progress, or null.
async function loadLesson(skillId: string, userId: string) {
  const [lesson, progress] = await Promise.all([
    prisma.lesson.findFirst({
      where: { skillId, published: true },
      include: { skill: { select: { title: true } } },
    }),
    prisma.userLesson.findUnique({ where: { userId_skillId: { userId, skillId } } }),
  ]);
  if (!lesson) return null;
  const content = lesson.content as unknown as LessonContent;
  return { lesson, content, progress };
}

// Find one step of a lesson by id and type.
function findStep(content: LessonContent, stepId: string, type: LessonStep['type']) {
  return content.steps.find((s) => s.id === stepId && s.type === type);
}

// Find a question step (Predict or Concept) by id.
function findQuestion(content: LessonContent, stepId: string) {
  return content.steps.find((s) => s.id === stepId && isQuestion(s));
}

// What to tell the student about the option they picked, and about the right
// answer. Predict options carry their own explanation; a concept question has
// one explanation for the whole question.
function explain(step: LessonStep, choice: number | undefined): { why?: string; answerWhy?: string } {
  if (step.type === 'concept') return { why: step.explanation, answerWhy: step.explanation };
  const options = (step.options ?? []) as PredictOption[];
  return {
    why: choice === undefined ? undefined : options[choice]?.why,
    answerWhy: options[step.answer ?? 0]?.why,
  };
}

// GET /api/lessons/:skillId — the lesson to play (no answers inside).
lessonsRouter.get(
  '/lessons/:skillId',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    const found = await loadLesson(skillId, userId);
    if (!found) {
      res.status(404).json({ error: 'no lesson for this skill yet' });
      return;
    }
    const { lesson, content, progress } = found;

    // What the lesson leads to, and what the tutor already thinks of this skill.
    const [levelId, mastery] = await Promise.all([
      nextLevelInSkill(userId, skillId),
      prisma.skillMastery.findUnique({ where: { userId_skillId: { userId, skillId } }, select: { pMastery: true } }),
    ]);
    const level = levelId
      ? await prisma.level.findUnique({ where: { id: levelId }, select: { id: true, title: true, xpReward: true } })
      : null;

    res.json({
      skillId,
      skillTitle: lesson.skill.title,
      title: lesson.title,
      minutes: lesson.minutes,
      version: lesson.version,
      steps: sanitizeLesson(content),
      status: progress?.status ?? null,
      answered: (progress?.answered ?? {}) as Record<string, boolean>,
      mastery: mastery?.pMastery ?? null,
      nextLevel: level,
    });
  }),
);

// POST /api/lessons/:skillId/start — the student opened the lesson.
lessonsRouter.post(
  '/lessons/:skillId/start',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    // `create`-only update: re-opening a finished lesson must not reset it.
    const progress = await prisma.userLesson.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId, status: 'started' },
      update: {},
    });
    await logEvent(userId, 'lesson_start', { skillId });
    res.json({ status: progress.status });
  }),
);

const AnswerBody = z.object({
  stepId: z.string().max(60),
  choice: z.number().int().min(0).max(9).optional(), // omitted when revealing
  reveal: z.boolean().optional(),
});

// POST /api/lessons/:skillId/answer — check one question (Predict or Concept).
//
// Only the FIRST answer to a step counts as evidence: it is recorded with an
// atomic "insert if absent" on the answered map, so a retry (or a double click)
// can never change the mastery estimate twice.
lessonsRouter.post(
  '/lessons/:skillId/answer',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    const { stepId, choice, reveal } = AnswerBody.parse(req.body);

    const found = await loadLesson(skillId, userId);
    const step = found && findQuestion(found.content, stepId);
    if (!found || !step) {
      res.status(404).json({ error: 'no such question' });
      return;
    }
    const answer = step.answer ?? 0;
    const correct = choice === answer;
    const { why, answerWhy } = explain(step, choice);

    // Record the first answer (and only the first) for this step. The row is
    // created first in case the lesson was opened without /start.
    await prisma.userLesson.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId },
      update: {},
    });
    const firstTry =
      choice !== undefined &&
      (await prisma.$executeRaw`
        UPDATE user_lessons
        SET answered = answered || jsonb_build_object(${stepId}::text, ${correct}::boolean)
        WHERE user_id = ${userId}::uuid AND skill_id = ${skillId} AND NOT (answered ? ${stepId}::text)
      `) === 1;

    // A first answer AFTER the teaching is evidence about this skill — weak
    // evidence (see LESSON_BKT). Pre-teaching predictions are logged only.
    let mastery: { before: number; after: number } | undefined;
    if (firstTry) await logEvent(userId, 'lesson_answer', { skillId, stepId, correct });
    if (firstTry && countsAsEvidence(found.content.steps, stepId)) {
      const prior = await prisma.skillMastery.findUnique({ where: { userId_skillId: { userId, skillId } } });
      const before = prior?.pMastery ?? DEFAULT_BKT.pL0;
      const after = bktUpdate(before, correct, LESSON_BKT);
      await prisma.skillMastery.upsert({
        where: { userId_skillId: { userId, skillId } },
        create: { userId, skillId, pMastery: after }, // attempts/lastResult stay level-only
        update: { pMastery: after },
      });
      mastery = { before, after };
    }

    res.json({
      correct,
      // Why the option they picked is right or wrong; on a reveal, the answer too.
      why,
      answer: correct || reveal ? answer : undefined,
      answerWhy: correct || reveal ? answerWhy : undefined,
      firstTry,
      mastery,
    });
  }),
);

const FillBody = z.object({
  stepId: z.string().max(60),
  answer: z.string().max(200).refine((a) => !a.includes('\n'), 'one line only'),
});

// POST /api/lessons/:skillId/fill — check a "Try it" answer.
//
// Fast path: it matches an answer the author listed (and the build script
// proved correct). Otherwise the program is actually RUN with their line in it,
// so a correct answer we simply didn't think of is still accepted.
lessonsRouter.post(
  '/lessons/:skillId/fill',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    const { stepId, answer } = FillBody.parse(req.body);

    const found = await loadLesson(skillId, userId);
    const step = found && findStep(found.content, stepId, 'fill');
    if (!found || !step) {
      res.status(404).json({ error: 'no such exercise' });
      return;
    }
    const expected = step.expectedOutput ?? '';

    let correct = isAcceptedFill(answer, step.accepted ?? []);
    let via: 'match' | 'run' = 'match';
    let output: string | undefined;
    if (!correct) {
      // Run it for real — same sandbox as a level submission.
      via = 'run';
      const run = await getExecutor().run(
        fillProgram(step.code ?? '', answer),
        [{ stdin: '', expectedOutput: expected, isHidden: false }],
        5000,
      );
      correct = run.results[0]?.passed ?? false;
      output = run.results[0]?.actualOutput;
    }

    await prisma.userLesson.updateMany({ where: { userId, skillId }, data: { fillAttempts: { increment: 1 } } });
    await logEvent(userId, 'lesson_fill', { skillId, stepId, correct, via });

    res.json({
      correct,
      via,
      output,
      // The teaching point, and a worked answer, once they've got it (or asked).
      explain: correct ? step.explain : undefined,
      expectedOutput: expected,
    });
  }),
);

// POST /api/lessons/:skillId/reveal — show a worked answer for the "Try it" step.
lessonsRouter.post(
  '/lessons/:skillId/reveal',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    const { stepId } = z.object({ stepId: z.string().max(60) }).parse(req.body);
    const found = await loadLesson(skillId, userId);
    const step = found && findStep(found.content, stepId, 'fill');
    if (!found || !step) {
      res.status(404).json({ error: 'no such exercise' });
      return;
    }
    await logEvent(userId, 'lesson_reveal', { skillId, stepId });
    res.json({ answer: (step.accepted ?? [])[0] ?? '', explain: step.explain });
  }),
);

// POST /api/lessons/:skillId/complete — they reached the end.
lessonsRouter.post(
  '/lessons/:skillId/complete',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    const found = await loadLesson(skillId, userId);
    if (!found) {
      res.status(404).json({ error: 'no lesson for this skill' });
      return;
    }
    const progress = await prisma.userLesson.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId, status: 'completed', completedAt: new Date() },
      update: { status: 'completed', completedAt: new Date() },
    });
    const score = scoreAnswers((progress.answered ?? {}) as Record<string, boolean>, found.content.steps);
    await logEvent(userId, 'lesson_complete', { skillId, ...score, fillAttempts: progress.fillAttempts });
    res.json({ status: 'completed', ...score, levelId: await nextLevelInSkill(userId, skillId) });
  }),
);

// POST /api/lessons/:skillId/skip — straight to the challenge (logged, not judged).
lessonsRouter.post(
  '/lessons/:skillId/skip',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const skillId = req.params.skillId!;
    // Never downgrade a lesson that was already completed.
    const existing = await prisma.userLesson.findUnique({ where: { userId_skillId: { userId, skillId } } });
    if (!existing) await prisma.userLesson.create({ data: { userId, skillId, status: 'skipped' } });
    else if (existing.status !== 'completed')
      await prisma.userLesson.update({ where: { userId_skillId: { userId, skillId } }, data: { status: 'skipped' } });
    await logEvent(userId, 'lesson_skip', { skillId });
    res.json({ levelId: await nextLevelInSkill(userId, skillId) });
  }),
);
