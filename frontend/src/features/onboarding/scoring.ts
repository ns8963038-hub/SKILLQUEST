// One quiz question and the shape we send back per answered question.

export interface QuizQuestion {
  id: string;
  version: number;
  topicSkillId: string; // the skill this question tests (e.g. 'loops')
  prompt: string;
  options: string[];
  correctIndex: number;
}

// What the backend persists per answer (evidence + reproducible test-out).
export interface QuizAttemptOut {
  questionId: string;
  questionVersion: number;
  topicSkillId: string;
  chosenOption: number;
  isCorrect: boolean;
}

/**
 * Score the quiz. Produces the attempts to persist and the set of skills the
 * student "tested out" of. Rule (from the PRD): a student tests out of a topic
 * ONLY by answering every one of its questions correctly — one question is far
 * too weak to skip a fundamental.
 */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Record<string, number>,
): { attempts: QuizAttemptOut[]; testedOut: string[]; totalCorrect: number } {
  const attempts: QuizAttemptOut[] = [];
  const perTopic = new Map<string, { asked: number; answered: number; correct: number }>();

  // Count how many questions each topic has in total.
  for (const q of questions) {
    const t = perTopic.get(q.topicSkillId) ?? { asked: 0, answered: 0, correct: 0 };
    t.asked += 1;
    perTopic.set(q.topicSkillId, t);
  }

  let totalCorrect = 0;
  for (const q of questions) {
    const chosen = answers[q.id];
    if (chosen === undefined) continue; // skipped
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) totalCorrect += 1;
    attempts.push({
      questionId: q.id,
      questionVersion: q.version,
      topicSkillId: q.topicSkillId,
      chosenOption: chosen,
      isCorrect,
    });
    const t = perTopic.get(q.topicSkillId)!;
    t.answered += 1;
    if (isCorrect) t.correct += 1;
  }

  // Test out of a topic only when ALL of its questions were answered correctly.
  const testedOut: string[] = [];
  for (const [topic, { asked, answered, correct }] of perTopic) {
    if (answered === asked && correct === asked) testedOut.push(topic);
  }

  return { attempts, testedOut, totalCorrect };
}

// Map the total number of correct answers to a self-assessed skill level.
export function skillLevelFromScore(totalCorrect: number): 'beginner' | 'intermediate' | 'advanced' {
  if (totalCorrect >= 10) return 'advanced';
  if (totalCorrect >= 5) return 'intermediate';
  return 'beginner';
}
