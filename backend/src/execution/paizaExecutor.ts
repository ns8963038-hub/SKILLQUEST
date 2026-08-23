import type { ExecutionService, RunResult, TestCaseInput, Verdict } from './types';

// Real Java execution via Paiza.IO's public runner API — FREE, no card, no
// account (uses the built-in `guest` key). It accepts our `public class Main`
// convention as-is. Same ExecutionService interface as the others.
//
// Paiza is asynchronous: you CREATE a run (get an id), then POLL get_details
// until it's completed. We do that once per test case and compare stdout to the
// expected output ourselves (Paiza doesn't grade).
//
// Note: the public guest key is rate-limited and, like any free public runner,
// could change. It's ideal for development and small pilots; self-hosting
// (Judge0/Piston) is the durable choice for heavy use.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PaizaDetails {
  status: string; // 'running' | 'completed'
  build_result?: string; // 'success' | 'failure' | 'error'
  build_stderr?: string;
  result?: string; // 'success' | 'failure' | 'timeout'
  stdout?: string;
  stderr?: string;
  exit_code?: string;
}

export class PaizaExecutor implements ExecutionService {
  constructor(
    private readonly baseUrl: string = 'https://api.paiza.io',
    private readonly apiKey: string = 'guest',
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // Run the program once against one stdin; resolve to stdout + any error.
  private async runOne(
    sourceCode: string,
    stdin: string,
    timeLimitMs: number,
  ): Promise<{ stdout: string; compileErr: string | null; runErr: string | null; timedOut: boolean }> {
    // 1) Create the run.
    const createBody = new URLSearchParams({
      source_code: sourceCode,
      language: 'java',
      input: stdin,
      api_key: this.apiKey,
    });
    const createRes = await fetch(`${this.baseUrl}/runners/create`, {
      method: 'POST',
      body: createBody,
    });
    if (!createRes.ok) throw new Error(`Paiza create failed: ${createRes.status}`);
    const { id } = (await createRes.json()) as { id: string };

    // 2) Poll until it finishes.
    const deadline = Date.now() + Math.max(15000, timeLimitMs + 12000);
    for (;;) {
      await sleep(700);
      const detRes = await fetch(
        `${this.baseUrl}/runners/get_details?id=${id}&api_key=${this.apiKey}`,
      );
      const d = (await detRes.json()) as PaizaDetails;
      if (d.status === 'completed') {
        // Didn't compile.
        if (d.build_result && d.build_result !== 'success') {
          return { stdout: '', compileErr: d.build_stderr || 'compile error', runErr: null, timedOut: false };
        }
        // Exceeded the time limit.
        if (d.result === 'timeout') {
          return { stdout: d.stdout ?? '', compileErr: null, runErr: null, timedOut: true };
        }
        // Non-zero exit => runtime error (stderr as the detail).
        const badExit = d.exit_code !== undefined && d.exit_code !== '' && d.exit_code !== '0';
        const runErr = badExit ? d.stderr || `exit code ${d.exit_code}` : null;
        return { stdout: d.stdout ?? '', compileErr: null, runErr, timedOut: false };
      }
      if (Date.now() > deadline) throw new Error('Paiza timed out while polling');
    }
  }

  async run(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult> {
    const results: { passed: boolean; actualOutput: string }[] = [];
    let sawCompileError = false;
    let sawTimeout = false;
    let sawRuntimeError = false;
    const start = Date.now();

    // Sequential — respects the guest rate limit and keeps it simple.
    for (const t of tests) {
      try {
        const r = await this.runOne(sourceCode, t.stdin, timeLimitMs);
        if (r.compileErr) {
          sawCompileError = true;
          results.push({ passed: false, actualOutput: r.compileErr });
        } else if (r.timedOut) {
          sawTimeout = true;
          results.push({ passed: false, actualOutput: '(time limit exceeded)' });
        } else if (r.runErr) {
          sawRuntimeError = true;
          results.push({ passed: false, actualOutput: r.runErr });
        } else {
          const passed = r.stdout.trim() === t.expectedOutput.trim();
          results.push({ passed, actualOutput: r.stdout });
        }
      } catch {
        sawRuntimeError = true;
        results.push({ passed: false, actualOutput: '(execution error)' });
      }
    }

    let verdict: Verdict;
    if (sawCompileError) verdict = 'compile_error';
    else if (sawTimeout) verdict = 'timeout';
    else if (sawRuntimeError) verdict = 'runtime_error';
    else if (results.length > 0 && results.every((r) => r.passed)) verdict = 'accepted';
    else verdict = 'wrong_answer';

    return { results, verdict, runtimeMs: Date.now() - start };
  }
}
