import type { ExecutionService, RunResult, TestCaseInput, Verdict } from './types';

// Real Java execution via Piston (https://github.com/engineer-man/piston). The
// public instance at emkc.org is FREE — no key, no account, no card — and runs
// from any machine. Same ExecutionService interface as the mock/Judge0, so
// switching to it is pure config.
//
// Unlike Judge0, Piston does NOT grade against an expected output — it just runs
// the program and returns its stdout. So we call it once per test case (feeding
// that case's stdin) and compare the program's stdout to the expected output
// ourselves.

interface PistonResponse {
  // Present for compiled languages; a non-zero code means the code didn't compile.
  compile?: { code: number; stdout: string; stderr: string; output: string };
  // The actual program run.
  run: { stdout: string; stderr: string; code: number; signal: string | null; output: string };
}

export class PistonExecutor implements ExecutionService {
  private version: string | null = null;

  constructor(private readonly baseUrl: string) {
    // Trim any trailing slash so URL joins are clean.
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // Piston needs a concrete language version. Look up an installed Java runtime
  // once and cache it; fall back to a wildcard selector on any error.
  private async resolveJavaVersion(): Promise<string> {
    if (this.version) return this.version;
    try {
      const res = await fetch(`${this.baseUrl}/runtimes`);
      const runtimes = (await res.json()) as { language: string; version: string }[];
      const java = runtimes.find((r) => r.language === 'java');
      this.version = java?.version ?? '*';
    } catch {
      this.version = '*';
    }
    return this.version;
  }

  // Run the program once against one stdin. Returns the stdout plus any compile
  // or runtime error message (so the caller can decide pass/fail + verdict).
  private async runOne(
    sourceCode: string,
    version: string,
    stdin: string,
    runTimeoutMs: number,
  ): Promise<{ stdout: string; compileErr: string | null; runErr: string | null }> {
    const res = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        language: 'java',
        version,
        files: [{ name: 'Main.java', content: sourceCode }],
        stdin,
        compile_timeout: 10000,
        run_timeout: runTimeoutMs,
      }),
    });
    if (!res.ok) throw new Error(`Piston execute failed: ${res.status}`);
    const data = (await res.json()) as PistonResponse;

    const compileErr =
      data.compile && data.compile.code !== 0 ? data.compile.stderr || data.compile.output : null;
    // Only treat as a runtime error if it compiled fine but exited badly.
    const runErr =
      !compileErr && (data.run.code !== 0 || data.run.signal)
        ? data.run.stderr || `exited with code ${data.run.code}`
        : null;
    return { stdout: data.run?.stdout ?? '', compileErr, runErr };
  }

  async run(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult> {
    const version = await this.resolveJavaVersion();

    const results: { passed: boolean; actualOutput: string }[] = [];
    let sawCompileError = false;
    let sawRuntimeError = false;
    let sawError = false;
    const start = Date.now();

    // Run test cases sequentially — network latency (~1–3s/compile+run) keeps us
    // comfortably under Piston's public 5 req/sec limit.
    for (const t of tests) {
      try {
        const r = await this.runOne(sourceCode, version, t.stdin, timeLimitMs);
        if (r.compileErr) {
          sawCompileError = true;
          results.push({ passed: false, actualOutput: r.compileErr });
        } else if (r.runErr) {
          sawRuntimeError = true;
          results.push({ passed: false, actualOutput: r.runErr });
        } else {
          // Compare stdout to the expected output, ignoring trailing whitespace.
          const passed = r.stdout.trim() === t.expectedOutput.trim();
          results.push({ passed, actualOutput: r.stdout });
        }
      } catch {
        sawError = true;
        results.push({ passed: false, actualOutput: '(execution error)' });
      }
    }

    // Overall verdict, worst case first.
    let verdict: Verdict;
    if (sawCompileError) verdict = 'compile_error';
    else if (sawError) verdict = 'timeout';
    else if (sawRuntimeError) verdict = 'runtime_error';
    else if (results.length > 0 && results.every((r) => r.passed)) verdict = 'accepted';
    else verdict = 'wrong_answer';

    return { results, verdict, runtimeMs: Date.now() - start };
  }
}
