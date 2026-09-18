import { describe, it, expect, vi, afterEach } from 'vitest';
import { PaizaExecutor } from './paizaExecutor';

// Mock fetch: /create returns an id, /get_details returns the given result.
function mockPaiza(details: Record<string, unknown>) {
  return vi.fn((url: string | URL) => {
    const u = String(url);
    if (u.includes('/runners/create')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'test-id', status: 'running' }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(details) });
  });
}

const oneTest = [{ stdin: '', expectedOutput: '9', isHidden: false }];

describe('PaizaExecutor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts when stdout matches the expected output', async () => {
    vi.stubGlobal('fetch', mockPaiza({ status: 'completed', build_result: 'success', result: 'success', stdout: '9\n', exit_code: '0' }));
    const r = await new PaizaExecutor().run('code', oneTest, 5000);
    expect(r.verdict).toBe('accepted');
    expect(r.results[0]?.passed).toBe(true);
  });

  it('reports wrong_answer when stdout differs', async () => {
    vi.stubGlobal('fetch', mockPaiza({ status: 'completed', build_result: 'success', result: 'success', stdout: '5\n', exit_code: '0' }));
    const r = await new PaizaExecutor().run('code', oneTest, 5000);
    expect(r.verdict).toBe('wrong_answer');
  });

  it('reports a compile error', async () => {
    vi.stubGlobal('fetch', mockPaiza({ status: 'completed', build_result: 'failure', build_stderr: 'error: reached end of file', exit_code: '' }));
    const r = await new PaizaExecutor().run('code', oneTest, 5000);
    expect(r.verdict).toBe('compile_error');
    expect(r.results[0]?.passed).toBe(false);
  });
});

describe('PaizaExecutor scheduling', () => {
  afterEach(() => vi.unstubAllGlobals());
  const fourTests = [1, 2, 3, 4].map((n) => ({ stdin: String(n), expectedOutput: String(n), isHidden: false }));

  it('compiles once: a compile error on the first test fails the rest without more runs', async () => {
    const fetchMock = mockPaiza({ status: 'completed', build_result: 'failure', build_stderr: 'error: ; expected', exit_code: '' });
    vi.stubGlobal('fetch', fetchMock);
    const r = await new PaizaExecutor().run('code', fourTests, 5000);
    expect(r.verdict).toBe('compile_error');
    expect(r.results).toHaveLength(4);
    expect(r.results.every((x) => !x.passed && x.actualOutput.includes('; expected'))).toBe(true);
    const creates = fetchMock.mock.calls.filter(([u]) => String(u).includes('/runners/create'));
    expect(creates).toHaveLength(1);
  });

  it('keeps results in test order when the rest run in parallel', async () => {
    // Echo the stdin back, so each result must line up with its own test.
    let lastInput = '';
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL, init?: { body?: URLSearchParams }) => {
        const u = String(url);
        if (u.includes('/runners/create')) {
          const input = init?.body?.get('input') ?? '';
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: `id-${input}` }) });
        }
        lastInput = new URL(u).searchParams.get('id')!.slice(3);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'completed', build_result: 'success', result: 'success', stdout: lastInput, exit_code: '0' }),
        });
      }),
    );
    const r = await new PaizaExecutor().run('code', fourTests, 5000);
    expect(r.verdict).toBe('accepted');
    expect(r.results.map((x) => x.actualOutput)).toEqual(['1', '2', '3', '4']);
  });
});
