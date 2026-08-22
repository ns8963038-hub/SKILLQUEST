import { describe, expect, it } from 'vitest';
import { scoreQuiz, skillLevelFromScore, type QuizQuestion } from './scoring';

// Two questions each for two topics.
const QS: QuizQuestion[] = [
  { id: 'a1', version: 1, topicSkillId: 'loops', prompt: '', options: ['x', 'y'], correctIndex: 0 },
  { id: 'a2', version: 1, topicSkillId: 'loops', prompt: '', options: ['x', 'y'], correctIndex: 1 },
  { id: 'b1', version: 1, topicSkillId: 'methods', prompt: '', options: ['x', 'y'], correctIndex: 0 },
  { id: 'b2', version: 1, topicSkillId: 'methods', prompt: '', options: ['x', 'y'], correctIndex: 1 },
];

describe('scoreQuiz', () => {
  it('tests out of a topic only when ALL its questions are correct', () => {
    // loops: both right. methods: one wrong.
    const answers = { a1: 0, a2: 1, b1: 0, b2: 0 };
    const { testedOut, totalCorrect } = scoreQuiz(QS, answers);
    expect(testedOut).toEqual(['loops']); // methods not included (2/2 needed)
    expect(totalCorrect).toBe(3);
  });

  it('does not test out of a topic with an unanswered question', () => {
    // loops: a1 right, a2 skipped -> not all answered -> no test-out.
    const { testedOut } = scoreQuiz(QS, { a1: 0 });
    expect(testedOut).toEqual([]);
  });

  it('records one attempt per answered question with correctness', () => {
    const { attempts } = scoreQuiz(QS, { a1: 0, b1: 1 });
    expect(attempts).toHaveLength(2);
    expect(attempts.find((a) => a.questionId === 'a1')?.isCorrect).toBe(true);
    expect(attempts.find((a) => a.questionId === 'b1')?.isCorrect).toBe(false);
  });
});

describe('skillLevelFromScore', () => {
  it('maps the total correct to a level', () => {
    expect(skillLevelFromScore(2)).toBe('beginner');
    expect(skillLevelFromScore(6)).toBe('intermediate');
    expect(skillLevelFromScore(11)).toBe('advanced');
  });
});
