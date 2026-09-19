import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmAiService } from './aiClient';

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
