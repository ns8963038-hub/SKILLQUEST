import { describe, expect, it } from 'vitest';
import { gradeQuiz, publicQuestion, skillLevelFromScore, type GradableQuestion } from './quiz';

// Two questions each for two topics.
const q = (id: string, topicSkillId: string, correctIndex: number): GradableQuestion => ({
  id,
  version: 1,
  topicSkillId,
  prompt: 'What does this print?',
  code: 'System.out.println(1);',
  options: ['a', 'b', 'c', 'd'],
  correctIndex,
});
const QS = [q('a1', 'loops', 0), q('a2', 'loops', 1), q('b1', 'methods', 0), q('b2', 'methods', 1)];

describe('gradeQuiz', () => {
  it('tests out of a topic only when ALL its questions are correct', () => {
    // loops: both right. methods: one wrong.
    const { testedOut, totalCorrect } = gradeQuiz(QS, { a1: 0, a2: 1, b1: 0, b2: 0 });
    expect(testedOut).toEqual(['loops']);
    expect(totalCorrect).toBe(3);
  });

  it('does not test out of a topic with an unanswered question', () => {
    expect(gradeQuiz(QS, { a1: 0 }).testedOut).toEqual([]);
  });

  it('records one attempt per answered question, graded here', () => {
    const { attempts } = gradeQuiz(QS, { a1: 0, b1: 1 });
    expect(attempts).toEqual([
      { questionId: 'a1', questionVersion: 1, topicSkillId: 'loops', chosenOption: 0, isCorrect: true },
      { questionId: 'b1', questionVersion: 1, topicSkillId: 'methods', chosenOption: 1, isCorrect: false },
    ]);
  });

  it('ignores answers it cannot grade: unknown questions and options that do not exist', () => {
    const { attempts, testedOut } = gradeQuiz(QS, { zz: 0, a1: 7, a2: -1, __proto__: 0 } as Record<string, number>);
    expect(attempts).toEqual([]);
    expect(testedOut).toEqual([]);
  });
});

describe('publicQuestion', () => {
  it('never includes the answer', () => {
    const shown = publicQuestion(QS[0]!);
    expect(shown).not.toHaveProperty('correctIndex');
    expect(JSON.stringify(shown)).not.toMatch(/correct/i);
    expect(shown).toMatchObject({ id: 'a1', options: ['a', 'b', 'c', 'd'] });
  });
});

describe('skillLevelFromScore', () => {
  it('maps the share correct to a level (10+ of 12 advanced, 5+ intermediate)', () => {
    expect(skillLevelFromScore(2, 12)).toBe('beginner');
    expect(skillLevelFromScore(5, 12)).toBe('intermediate');
    expect(skillLevelFromScore(9, 12)).toBe('intermediate');
    expect(skillLevelFromScore(10, 12)).toBe('advanced');
    expect(skillLevelFromScore(0, 0)).toBe('beginner');
  });
});
