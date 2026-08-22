import type { ExecutionService, RunResult, TestCaseInput, Verdict } from './types';

// A STUB executor for building the UI and the submission flow without Judge0.
// It does NOT run Java. It is used only in development (EXECUTION_BACKEND=mock);
// pilots and demos use the real Judge0 backend.
//
// Rule (so both UI states can be exercised): every test passes, UNLESS the
// source contains the sentinel `FAILTEST`, which makes every test fail. That
// lets us build and demo the pass path (XP, celebration) and the fail path
// (per-case red rows) deterministically.
export class MockExecutor implements ExecutionService {
  async run(sourceCode: string, tests: TestCaseInput[], _timeLimitMs: number): Promise<RunResult> {
    const forceFail = sourceCode.includes('FAILTEST');
    const results = tests.map((t) => ({
      passed: !forceFail,
      actualOutput: forceFail ? '(mock: forced failure)' : t.expectedOutput,
    }));
    const allPassed = results.every((r) => r.passed);
    const verdict: Verdict = allPassed ? 'accepted' : 'wrong_answer';
    // Pretend it took a little time, like a real run would.
    const runtimeMs = 40 + Math.floor(Math.random() * 60);
    return { results, verdict, runtimeMs };
  }
}
