import { describe, expect, it, vi } from 'vitest';
import { RunnerSlots } from './runnerSlots';
import { RunnerUnavailableError } from './types';

describe('RunnerSlots', () => {
  it('never lets more than its size run at once, and serves waiters in order', async () => {
    const slots = new RunnerSlots(2);
    const order: string[] = [];
    const a = await slots.acquire(1000);
    const b = await slots.acquire(1000);
    const c = slots.acquire(1000).then((release) => (order.push('c'), release));
    const d = slots.acquire(1000).then((release) => (order.push('d'), release));
    expect(slots.stats).toEqual({ inUse: 2, queued: 2 });
    a();
    const releaseC = await c;
    expect(order).toEqual(['c']); // first in, first served
    b();
    const releaseD = await d;
    expect(order).toEqual(['c', 'd']);
    expect(slots.stats).toEqual({ inUse: 2, queued: 0 });
    releaseC();
    releaseD();
    expect(slots.stats).toEqual({ inUse: 0, queued: 0 });
  });

  it('gives up with "runner unavailable" after waiting too long', async () => {
    vi.useFakeTimers();
    try {
      const slots = new RunnerSlots(1);
      await slots.acquire(1000);
      const waiting = slots.acquire(30_000);
      const outcome = expect(waiting).rejects.toBeInstanceOf(RunnerUnavailableError);
      await vi.advanceTimersByTimeAsync(30_000);
      await outcome;
      expect(slots.stats.queued).toBe(0); // the timed-out run left the queue
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a slot being given back twice', async () => {
    const slots = new RunnerSlots(1);
    const release = await slots.acquire(1000);
    release();
    release();
    expect(slots.stats).toEqual({ inUse: 0, queued: 0 });
  });
});
