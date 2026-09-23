// The onboarding placement quiz (PRD F1), graded here on the server.
//
// The browser gets the questions WITHOUT their answers (publicQuestion) and
// sends back only which option the student picked for each. Everything that
// matters — which answers were right, which topics the student tested out of,
// the skill level — is worked out here. (It used to be worked out in the
// browser and sent to the API, so editing one request could skip any topic.)

// A question as the server holds it (answer included).
export interface GradableQuestion {
  id: string;
  version: number;
  topicSkillId: string;
  prompt: string;
  code: string;
  options: string[];
  correctIndex: number;
}

// One stored answer: evidence for the report, and what makes a test-out
// decision reproducible.
export interface QuizAttemptRow {
  questionId: string;
  questionVersion: number;
  topicSkillId: string;
  chosenOption: number;
  isCorrect: boolean;
}

// What the browser may see of a question: everything except the answer.
export function publicQuestion(q: GradableQuestion) {
  return { id: q.id, topicSkillId: q.topicSkillId, prompt: q.prompt, code: q.code, options: q.options };
}

/**
 * Grade the quiz. `answers` maps a question id to the option the student chose;
 * a question they skipped is simply absent. Answers to unknown questions, or
 * naming an option that doesn't exist, are ignored — they can't be graded.
 *
 * Test-out rule (PRD F1): a student skips a topic ONLY by answering every one of
 * its questions correctly. One right answer is far too weak a reason to skip a
 * fundamental.
 */
export function gradeQuiz(
  questions: GradableQuestion[],
  answers: Record<string, number>,
): { attempts: QuizAttemptRow[]; testedOut: string[]; totalCorrect: number } {
  const attempts: QuizAttemptRow[] = [];
  const perTopic = new Map<string, { asked: number; correct: number }>();
  let totalCorrect = 0;

  for (const q of questions) {
    const topic = perTopic.get(q.topicSkillId) ?? { asked: 0, correct: 0 };
    topic.asked += 1;
    perTopic.set(q.topicSkillId, topic);

    const chosen = Object.hasOwn(answers, q.id) ? answers[q.id] : undefined;
    if (chosen === undefined || !Number.isInteger(chosen) || chosen < 0 || chosen >= q.options.length) continue;
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) {
      totalCorrect += 1;
      topic.correct += 1;
    }
    attempts.push({
      questionId: q.id,
      questionVersion: q.version,
      topicSkillId: q.topicSkillId,
      chosenOption: chosen,
      isCorrect,
    });
  }

  // A skipped question is not a correct one, so "all correct" also means "all answered".
  const testedOut = [...perTopic].filter(([, t]) => t.asked > 0 && t.correct === t.asked).map(([id]) => id);
  return { attempts, testedOut, totalCorrect };
}

// The skill level recorded on the profile, from the share of questions right:
// 10+ of 12 is advanced, 5+ intermediate.
export function skillLevelFromScore(totalCorrect: number, totalQuestions: number): 'beginner' | 'intermediate' | 'advanced' {
  if (totalQuestions === 0) return 'beginner';
  const share = totalCorrect / totalQuestions;
  if (share >= 10 / 12) return 'advanced';
  if (share >= 5 / 12) return 'intermediate';
  return 'beginner';
}
