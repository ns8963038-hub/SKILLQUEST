import { RunnerUnavailableError, type ExecutionService, type RunResult, type TestCaseInput, type Verdict } from './types';
import { outputsMatch } from './compare';
import { RunnerSlots } from './runnerSlots';

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

// How many of ONE submission's test cases run at once (after the first). The
// shared slots below cap the total across all students.
const CONCURRENCY = 3;

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
  // Every run on this runner, from every student, takes one of these slots.
  private readonly slots: RunnerSlots;

  constructor(
    private readonly baseUrl: string = 'https://api.paiza.io',
    private readonly apiKey: string = 'guest',
    maxConcurrent = 6,
    private readonly maxWaitMs = 45_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.slots = new RunnerSlots(maxConcurrent);
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
    let createRes = await fetch(`${this.baseUrl}/runners/create`, { method: 'POST', body: createBody });
    // Rate-limited: back off and retry a couple of times before giving up.
    for (let attempt = 1; createRes.status === 429 && attempt <= 3; attempt++) {
      await sleep(1000 * attempt);
      createRes = await fetch(`${this.baseUrl}/runners/create`, { method: 'POST', body: createBody });
    }
    if (!createRes.ok) throw new RunnerUnavailableError(`Paiza create failed: ${createRes.status}`);
    const { id } = (await createRes.json()) as { id: string };

    // 2) Poll until it finishes.
    const deadline = Date.now() + Math.max(15000, timeLimitMs + 12000);
    for (;;) {
      await sleep(700);
      const detRes = await fetch(
        `${this.baseUrl}/runners/get_details?id=${id}&api_key=${this.apiKey}`,
      );
      if (detRes.status === 429) continue; // rate-limited while polling: just poll again
      if (!detRes.ok) throw new RunnerUnavailableError(`Paiza get_details failed: ${detRes.status}`);
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
      if (Date.now() > deadline) throw new RunnerUnavailableError('Paiza timed out while polling');
    }
  }

  async run(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult> {
    const start = Date.now();
    const results: { passed: boolean; actualOutput: string }[] = new Array(tests.length);
    let sawCompileError = false;
    let sawTimeout = false;
    let sawRuntimeError = false;
    // The first time the RUNNER fails (not the program): stop and report that.
    let runnerFailure: RunnerUnavailableError | null = null;

    // Run test i and record its outcome in results[i].
    const runTest = async (i: number) => {
      if (runnerFailure) return;
      const t = tests[i]!;
      let release: (() => void) | null = null;
      try {
        release = await this.slots.acquire(this.maxWaitMs);
        const r = await this.runOne(sourceCode, t.stdin, timeLimitMs);
        if (r.compileErr) {
          sawCompileError = true;
          results[i] = { passed: false, actualOutput: r.compileErr };
        } else if (r.timedOut) {
          sawTimeout = true;
          results[i] = { passed: false, actualOutput: '(time limit exceeded)' };
        } else if (r.runErr) {
          sawRuntimeError = true;
          results[i] = { passed: false, actualOutput: r.runErr };
        } else {
          results[i] = { passed: outputsMatch(r.stdout, t.expectedOutput), actualOutput: r.stdout };
        }
      } catch (err) {
        // A network error, a refused request or a full queue is the runner's
        // failure, never the student's: don't grade it as a runtime error.
        runnerFailure ??=
          err instanceof RunnerUnavailableError
            ? err
            : new RunnerUnavailableError(err instanceof Error ? err.message : String(err));
      } finally {
        release?.();
      }
    };

    if (tests.length > 0) {
      // 1) The first test alone. If the code doesn't compile, every test would
      //    fail the same way — report that at once instead of compiling N times.
      await runTest(0);
      if (runnerFailure) throw runnerFailure;
      if (sawCompileError) {
        for (let i = 1; i < tests.length; i++) results[i] = { passed: false, actualOutput: results[0]!.actualOutput };
      } else {
        // 2) The rest in parallel, at most CONCURRENCY at a time (each Paiza run
        //    takes ~3-4 s, so sequential runs of 4-5 tests blew the 15 s budget).
        let next = 1;
        const worker = async () => {
          while (next < tests.length && !runnerFailure) await runTest(next++);
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tests.length - 1) }, worker));
        if (runnerFailure) throw runnerFailure;
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
