import { describe, it, expect, vi, afterEach } from 'vitest';
import { Judge0Executor } from './judge0Executor';
import type { TestCaseInput } from './types';

// base64 helper matching the executor's encoding, for building fake responses.
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const tests: TestCaseInput[] = [
  { stdin: '1', expectedOutput: 'one', isHidden: false },
  { stdin: '2', expectedOutput: 'two', isHidden: true },
];

// Build a fake fetch that answers the three calls the executor makes:
// GET /languages, POST /submissions/batch, GET /submissions/batch (poll).
function fakeJudge0(statusIds: number[]) {
  return vi.fn(async (url: string, init?: { method?: string }) => {
    if (url.includes('/languages')) {
      return { ok: true, json: async () => [{ id: 62, name: 'Java (OpenJDK 13)' }] };
    }
    if (url.includes('/submissions/batch') && init?.method === 'POST') {
      return { ok: true, json: async () => statusIds.map((_, i) => ({ token: `t${i}` })) };
    }
    // Poll response: all finished, with the given statuses.
    return {
      ok: true,
      json: async () => ({
        submissions: statusIds.map((id) => ({
          status: { id, description: 'x' },
          stdout: b64('out'),
          stderr: null,
          compile_output: null,
          time: '0.12',
        })),
      }),
    };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Judge0Executor', () => {
  it('reports all-accepted as passed + "accepted"', async () => {
    vi.stubGlobal('fetch', fakeJudge0([3, 3])); // 3 = Accepted
    const run = await new Judge0Executor('http://judge0.local', undefined, 62).run('code', tests, 5000);
    expect(run.results.every((r) => r.passed)).toBe(true);
    expect(run.verdict).toBe('accepted');
  });

  it('maps a wrong answer to failed + "wrong_answer"', async () => {
    vi.stubGlobal('fetch', fakeJudge0([3, 4])); // 4 = Wrong Answer
    const run = await new Judge0Executor('http://judge0.local', undefined, 62).run('code', tests, 5000);
    expect(run.results[0]?.passed).toBe(true);
    expect(run.results[1]?.passed).toBe(false);
    expect(run.verdict).toBe('wrong_answer');
  });

  it('maps a compilation error to "compile_error"', async () => {
    vi.stubGlobal('fetch', fakeJudge0([6, 6])); // 6 = Compilation Error
    const run = await new Judge0Executor('http://judge0.local', undefined, 62).run('code', tests, 5000);
    expect(run.verdict).toBe('compile_error');
  });
});
