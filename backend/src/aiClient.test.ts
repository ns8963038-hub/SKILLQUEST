import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapGoal, warmAiService } from './aiClient';

describe('warmAiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pokes the AI service at most once every 5 minutes, and never throws', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('asleep')));
    vi.stubGlobal('fetch', fetchMock);
    const t0 = 10_000_000_000;
    warmAiService(t0);
    warmAiService(t0 + 60_000); // 1 minute later: throttled
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/health$/);
    warmAiService(t0 + 6 * 60_000); // 6 minutes later: pokes again
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('callAi retries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries while the AI service is waking up (502), then succeeds', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        calls < 3
          ? { ok: false, status: 502, json: () => Promise.resolve({}) }
          : { ok: true, status: 200, json: () => Promise.resolve({ goalCategory: 'service_placement', confidence: 0.8 }) },
      );
    }));
    const promise = mapGoal('get placed');
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(promise).resolves.toEqual({ goalCategory: 'service_placement', confidence: 0.8 });
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it('does not retry a real error', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(mapGoal('x')).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
