// The execution abstraction (TRD 5.1). Everything that runs student code goes
// through this interface, so the mock and the real Judge0 backend are swappable
// without changing any route.

// A test case to run the submission against.
export interface TestCaseInput {
  stdin: string;
  expectedOutput: string;
  isHidden: boolean;
}

// The outcome for one test case (same order as the inputs).
export interface CaseResult {
  passed: boolean;
  actualOutput: string; // what the program printed (a placeholder for the mock)
}

// The verdict values mirror the Submission.verdict enum in the schema.
export type Verdict = 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout';

// The whole result of running one submission against all its test cases.
export interface RunResult {
  results: CaseResult[];
  verdict: Verdict;
  runtimeMs: number;
}

// Every execution backend implements this.
export interface ExecutionService {
  run(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult>;
}
