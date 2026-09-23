// One placement-quiz question as the API sends it (GET /api/onboarding/quiz):
// a short program and what it might print. The answer is NOT included — the
// server grades the quiz, so the browser only ever sends the options chosen.
export interface QuizQuestionView {
  id: string;
  topicSkillId: string; // the skill this question tests (e.g. 'loops')
  prompt: string;
  code: string; // the program shown
  options: string[];
}
