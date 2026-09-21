import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { AI_RETRY_ATTEMPTS, AI_RETRY_WAIT_MS, isAiWaking, rememberAiWakeUrl, resetAiWake, retryWhileAiWakes, wakeAi } from './aiWake';

const URL = 'https://skillquest-ai.example.com/health';

describe('wakeAi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetAiWake();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing until the API has said where the tutor lives', () => {
    wakeAi();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pokes the health check without needing to read the answer', () => {
    rememberAiWakeUrl(URL);
    wakeAi({ now: 1_000 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.mode).toBe('no-cors'); // the AI service needs no CORS rule for this
    expect(init.cache).toBe('no-store');
  });

  it('pokes at most once a minute, unless told to', () => {
    rememberAiWakeUrl(URL);
    wakeAi({ now: 0 });
    wakeAi({ now: 30_000 }); // throttled
    expect(fetchMock).toHaveBeenCalledTimes(1);
    wakeAi({ now: 30_000, force: true }); // a retry pokes regardless
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wakeAi({ now: 95_000 }); // a minute after the last poke
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never lets a failed poke reach the page', () => {
    rememberAiWakeUrl(URL);
    vi.stubGlobal('fetch', () => {
      throw new TypeError('blocked');
    });
    expect(() => wakeAi({ force: true })).not.toThrow();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    expect(() => wakeAi({ force: true })).not.toThrow();
  });
});

describe('retryWhileAiWakes', () => {
  const noWait = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    resetAiWake();
    noWait.mockClear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('recognises the API saying the tutor did not answer', () => {
    expect(isAiWaking(new ApiError('/api/x', 503))).toBe(true);
    expect(isAiWaking(new ApiError('/api/x', 500))).toBe(false);
    expect(isAiWaking(new Error('Request to /api/x failed (503)'))).toBe(false); // only a real ApiError counts
  });

  it('returns straight away when the tutor is awake', async () => {
    const onWaiting = vi.fn();
    await expect(retryWhileAiWakes(() => Promise.resolve('done'), onWaiting, noWait)).resolves.toBe('done');
    expect(onWaiting).not.toHaveBeenCalled();
    expect(noWait).not.toHaveBeenCalled();
  });

  it('says it is waiting, pokes the tutor, waits, and retries after a 503', async () => {
    rememberAiWakeUrl(URL);
    const run = vi.fn().mockRejectedValueOnce(new ApiError('/api/onboarding/complete', 503)).mockResolvedValueOnce('saved');
    const onWaiting = vi.fn();
    await expect(retryWhileAiWakes(run, onWaiting, noWait)).resolves.toBe('saved');
    expect(run).toHaveBeenCalledTimes(2);
    expect(onWaiting).toHaveBeenCalledWith(1);
    expect(noWait).toHaveBeenCalledWith(AI_RETRY_WAIT_MS);
    expect(fetch).toHaveBeenCalledWith(URL, expect.objectContaining({ mode: 'no-cors' })); // woken from the browser
  });

  it('gives up after its attempts with the 503, so the screen can explain', async () => {
    const waking = new ApiError('/api/onboarding/complete', 503);
    const run = vi.fn(() => Promise.reject(waking));
    await expect(retryWhileAiWakes(run, undefined, noWait)).rejects.toBe(waking);
    expect(run).toHaveBeenCalledTimes(AI_RETRY_ATTEMPTS);
  });

  it('never retries a real failure', async () => {
    const broken = new ApiError('/api/onboarding/complete', 500);
    const run = vi.fn(() => Promise.reject(broken));
    await expect(retryWhileAiWakes(run, undefined, noWait)).rejects.toBe(broken);
    expect(run).toHaveBeenCalledOnce();
  });
});
