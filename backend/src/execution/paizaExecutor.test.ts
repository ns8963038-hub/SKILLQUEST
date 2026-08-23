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
