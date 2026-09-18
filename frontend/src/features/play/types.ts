// The play view of a level (GET /api/levels/:id). No reference solution and no
// hidden test data — the backend strips those.
export interface LevelView {
  id: string;
  skillId: string;
  title: string;
  difficulty: number;
  statementMd: string;
  starterCode: string;
  hints: string[];
  xpReward: number;
  sampleTests: { stdin: string; expectedOutput: string }[];
  skillTitle?: string; // display name of the skill, when the API provides it
  mastery?: number; // the tutor's current BKT estimate for this skill (0..1), when provided
}

// One test-case result in a submission response. For hidden cases only `hidden`
// and `passed` are present; visible cases also carry the input/expected/actual.
export interface SubmitCase {
  hidden: boolean;
  passed: boolean;
  stdin?: string;
  expectedOutput?: string;
  actualOutput?: string;
}

// A badge earned by a submission (for the celebration).
export interface EarnedBadge {
  id: string;
  title: string;
  icon: string | null;
}

// How this attempt moved the tutor's mastery estimate for the skill (M4).
export interface MasteryUpdate {
  skillId: string;
  title: string;
  before: number; // 0..1
  after: number; // 0..1
  mastered: boolean; // crossed the mastery threshold
}

// The response from POST /api/levels/:id/submit.
export interface SubmitResult {
  verdict: string;
  passed: number;
  total: number;
  passRatio: number;
  xpAwarded: number; // > 0 only the first time the level is fully solved
  currentStreak: number;
  newBadges: EarnedBadge[];
  cases: SubmitCase[];
  mastery?: MasteryUpdate; // present once the backend returns the BKT update
}
