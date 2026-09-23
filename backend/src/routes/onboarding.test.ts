import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The real onboarding routes with the database and the AI service mocked, to
// prove the quiz is graded on the server: the browser never sees an answer, and
// a request that claims test-outs it didn't earn gets nothing for it.
const QUESTIONS = ['java-basics', 'java-basics', 'java-basics', 'loops', 'loops', 'loops'].map((topicSkillId, i) => ({
  id: `q${i}`,
  version: 1,
  topicSkillId,
  ordinal: i,
  prompt: 'What does this print?',
  code: `System.out.println(${i});`,
  options: ['0', '1', '2', '3'],
  correctIndex: i % 4,
  published: true,
}));

const db = vi.hoisted(() => ({
  quizQuestion: { findMany: vi.fn() },
  company: { findMany: vi.fn(async () => []) },
  profile: {
    // The claim: this request finishes onboarding.
    updateMany: vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({ count: 1 })),
    findUnique: vi.fn(async () => ({ onboardingStep: 1 })),
  },
  userTargetCompany: { deleteMany: vi.fn(), createMany: vi.fn() },
  quizAttempt: { createMany: vi.fn() },
  roadmap: { updateMany: vi.fn(), create: vi.fn(async () => ({ id: 1 })) },
  roadmapItem: { createMany: vi.fn() },
  event: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
}));
vi.mock('../db', () => ({ prisma: db }));
const ai = vi.hoisted(() => ({
  mapGoal: vi.fn(async () => ({ goalCategory: 'service_placement', confidence: 0.8 })),
  generateRoadmap: vi.fn(async () => [{ skillId: 'operators-expressions', weekNumber: 1, position: 0 }]),
}));
vi.mock('../aiClient', () => ai);

import { onboardingRouter } from './onboarding';
import { errorHandler } from '../errors';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.userId = 'student-1';
    next();
  });
  a.use('/api', onboardingRouter);
  a.use(errorHandler);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.quizQuestion.findMany.mockResolvedValue(QUESTIONS);
});

describe('GET /api/onboarding/quiz', () => {
  it('sends the questions in order, without their answers', async () => {
    const res = await request(app()).get('/api/onboarding/quiz');
    expect(res.status).toBe(200);
    expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(QUESTIONS.map((q) => q.id));
    expect(JSON.stringify(res.body)).not.toMatch(/correct/i);
    expect(db.quizQuestion.findMany).toHaveBeenCalledWith({ where: { published: true }, orderBy: { ordinal: 'asc' } });
  });
});

describe('POST /api/onboarding/complete', () => {
  const base = { hoursPerWeek: 6, goalText: '', targetCompanies: [] };

  it('grades the quiz itself: all 3 java-basics right tests out of java-basics only', async () => {
    // java-basics q0..q2 all right; loops q3 right, q4 wrong, q5 skipped.
    const quizAnswers = { q0: 0, q1: 1, q2: 2, q3: 3, q4: 1 }; // q4's answer is option 0
    const res = await request(app()).post('/api/onboarding/complete').send({ ...base, quizAnswers });
    expect(res.status).toBe(200);
    expect(res.body.testedOut).toEqual(['java-basics']);
    expect(ai.generateRoadmap).toHaveBeenCalledWith(expect.objectContaining({ testedOut: ['java-basics'] }));

    const stored = db.quizAttempt.createMany.mock.calls[0]![0].data;
    expect(stored).toHaveLength(5);
    expect(stored.find((a: { questionId: string }) => a.questionId === 'q4').isCorrect).toBe(false);
    // 4 of 6 right = 0.67 of the quiz -> intermediate.
    expect(db.profile.updateMany.mock.calls[0]![0].data.skillLevel).toBe('intermediate');
  });

  it('ignores a request that claims test-outs and correct answers it did not earn', async () => {
    const forged = {
      ...base,
      testedOut: ['java-basics', 'loops', 'methods', 'oop-basics'],
      skillLevel: 'advanced',
      quizAttempts: [{ questionId: 'q3', questionVersion: 1, topicSkillId: 'loops', chosenOption: 0, isCorrect: true }],
      quizAnswers: { q3: 0 }, // actually wrong: q3's answer is option 3
    };
    const res = await request(app()).post('/api/onboarding/complete').send(forged);
    expect(res.status).toBe(200);
    expect(res.body.testedOut).toEqual([]);
    expect(ai.generateRoadmap).toHaveBeenCalledWith(expect.objectContaining({ testedOut: [] }));
    expect(db.quizAttempt.createMany.mock.calls[0]![0].data).toEqual([
      { userId: 'student-1', questionId: 'q3', questionVersion: 1, topicSkillId: 'loops', chosenOption: 0, isCorrect: false },
    ]);
    expect(db.profile.updateMany.mock.calls[0]![0].data.skillLevel).toBe('beginner');
  });

  it('refuses to run a second time (409) and changes nothing', async () => {
    db.profile.findUnique.mockResolvedValueOnce({ onboardingStep: 5 });
    const res = await request(app()).post('/api/onboarding/complete').send({ ...base, quizAnswers: { q0: 0 } });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_onboarded');
    expect(ai.generateRoadmap).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled(); // no second roadmap, no duplicate quiz answers
  });

  it('a double submit that races past the first check still builds only one roadmap', async () => {
    // Both requests saw onboardingStep 1; this one's claim finds the first already committed.
    db.profile.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await request(app()).post('/api/onboarding/complete').send({ ...base, quizAnswers: { q0: 0 } });
    expect(res.status).toBe(409);
    expect(db.roadmap.create).not.toHaveBeenCalled(); // the transaction stopped at the claim
    expect(db.quizAttempt.createMany).not.toHaveBeenCalled();
    expect(db.profile.updateMany.mock.calls[0]![0].where).toEqual({ id: 'student-1', onboardingStep: { lt: 5 } });
  });

  it('rejects oversized input before doing anything', async () => {
    const res = await request(app())
      .post('/api/onboarding/complete')
      .send({ ...base, goalText: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(ai.mapGoal).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
