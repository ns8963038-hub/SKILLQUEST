import { RunnerUnavailableError, type ExecutionService, type RunResult, type TestCaseInput, type Verdict } from './types';

// Real Java execution via Judge0 (TRD 5). Works against ANY Judge0 CE instance —
// hosted (RapidAPI) or self-hosted — by changing env only. The route code never
// changes; getExecutor() returns this instead of the mock when EXECUTION_BACKEND
// is 'judge0'.
//
// Flow: submit one Judge0 submission PER test case in a single batch (each with
// its own stdin + expected_output, so Judge0 grades it for us), poll the batch
// until every submission finishes, then map the statuses to our result shape.

// Judge0 status ids we care about (from the Judge0 docs).
const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  // 7..12 are various runtime errors.
} as const;

// base64 helpers — we send/receive code and I/O base64-encoded so newlines and
// special characters can't corrupt the request.
const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null | undefined): string =>
  s ? Buffer.from(s, 'base64').toString('utf8') : '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Judge0Submission {
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
}

export class Judge0Executor implements ExecutionService {
  private languageId: number | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly rapidApiKey: string | undefined,
    private readonly fallbackLanguageId: number,
  ) {
    // Trim a trailing slash so URL joins are clean.
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // Headers for every call — adds the RapidAPI headers only when a key is set,
  // so the same code works against a self-hosted instance with no key.
  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.rapidApiKey) {
      h['X-RapidAPI-Key'] = this.rapidApiKey;
      // The host is the domain part of the base URL.
      h['X-RapidAPI-Host'] = new URL(this.baseUrl).host;
    }
    return h;
  }

  // Find the Java language id from the running Judge0 (its id varies by build).
  // Cached after the first lookup; falls back to the configured id on any error.
  private async resolveLanguageId(): Promise<number> {
    if (this.languageId !== null) return this.languageId;
    try {
      const res = await fetch(`${this.baseUrl}/languages`, { headers: this.headers() });
      const langs = (await res.json()) as { id: number; name: string }[];
      // Match "Java (...)" but not "JavaScript".
      const java = langs.find((l) => /java\b/i.test(l.name) && !/javascript/i.test(l.name));
      this.languageId = java?.id ?? this.fallbackLanguageId;
    } catch {
      this.languageId = this.fallbackLanguageId;
    }
    return this.languageId;
  }

  // Any failure talking to Judge0 is the runner's, never the student's.
  async run(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult> {
    try {
      return await this.runBatch(sourceCode, tests, timeLimitMs);
    } catch (err) {
      throw err instanceof RunnerUnavailableError
        ? err
        : new RunnerUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }

  private async runBatch(sourceCode: string, tests: TestCaseInput[], timeLimitMs: number): Promise<RunResult> {
    const languageId = await this.resolveLanguageId();

    // 1) Build one submission per test case and create them in a single batch.
    const body = {
      submissions: tests.map((t) => ({
        source_code: b64(sourceCode),
        language_id: languageId,
        stdin: b64(t.stdin),
        expected_output: b64(t.expectedOutput), // Judge0 grades against this
        cpu_time_limit: Math.max(1, Math.round(timeLimitMs / 1000)),
        memory_limit: 256000, // 256 MB — the JVM needs headroom
      })),
    };
    const createRes = await fetch(`${this.baseUrl}/submissions/batch?base64_encoded=true`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!createRes.ok) throw new Error(`Judge0 batch create failed: ${createRes.status}`);
    const tokens = ((await createRes.json()) as { token: string }[]).map((s) => s.token);

    // 2) Poll the batch until every submission has finished (status > processing).
    const query =
      `tokens=${tokens.join(',')}` +
      `&base64_encoded=true&fields=status,stdout,stderr,compile_output,time`;
    let submissions: Judge0Submission[] = [];
    const deadline = Date.now() + 20_000; // give up after 20s
    for (;;) {
      const res = await fetch(`${this.baseUrl}/submissions/batch?${query}`, {
        headers: this.headers(),
      });
      submissions = ((await res.json()) as { submissions: Judge0Submission[] }).submissions;
      const done = submissions.every((s) => s.status.id > STATUS.PROCESSING);
      if (done) break;
      if (Date.now() > deadline) throw new Error('Judge0 timed out while polling');
      await sleep(500);
    }

    // 3) Map to our result shape. A case passed iff Judge0 says Accepted.
    const results = submissions.map((s) => ({
      passed: s.status.id === STATUS.ACCEPTED,
      actualOutput: unb64(s.stdout) || unb64(s.compile_output) || unb64(s.stderr),
    }));

    // Overall verdict, worst-case first (a compile error affects every case).
    const ids = submissions.map((s) => s.status.id);
    let verdict: Verdict;
    if (ids.includes(STATUS.COMPILATION_ERROR)) verdict = 'compile_error';
    else if (ids.includes(STATUS.TIME_LIMIT_EXCEEDED)) verdict = 'timeout';
    else if (ids.some((id) => id >= 7 && id <= 12)) verdict = 'runtime_error';
    else if (ids.every((id) => id === STATUS.ACCEPTED)) verdict = 'accepted';
    else verdict = 'wrong_answer';

    // Longest test time, in ms.
    const runtimeMs = Math.round(
      Math.max(0, ...submissions.map((s) => parseFloat(s.time ?? '0') || 0)) * 1000,
    );

    return { results, verdict, runtimeMs };
  }
}
