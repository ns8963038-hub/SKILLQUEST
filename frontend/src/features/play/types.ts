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

// The response from POST /api/levels/:id/submit.
export interface SubmitResult {
  verdict: string;
  passed: number;
  total: number;
  passRatio: number;
  xpAwarded: number; // > 0 only the first time the level is fully solved
  cases: SubmitCase[];
}
