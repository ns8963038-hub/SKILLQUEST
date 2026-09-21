import { describe, expect, it, vi } from 'vitest';
import { isTransientDbError, withDbRetry } from './dbRetry';

// An error shaped like Prisma's known-request errors: a message plus a code.
const prismaError = (code: string, message = 'boom') => Object.assign(new Error(message), { code });
const noWait = () => Promise.resolve();

describe('isTransientDbError', () => {
  it('treats a dropped or unreachable connection as worth retrying', () => {
    expect(isTransientDbError(prismaError('P1017', 'Server has closed the connection.'))).toBe(true);
    expect(isTransientDbError(prismaError('P1001', "Can't reach database server"))).toBe(true);
    expect(isTransientDbError(prismaError('P2024'))).toBe(true);
    // The exact message the seed printed on 2026-09-21, with no code attached:
    expect(isTransientDbError(new Error('Invalid `prisma.level.upsert()` invocation: Server has closed the connection.'))).toBe(true);
    expect(isTransientDbError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('never retries a problem with the data itself', () => {
    expect(isTransientDbError(prismaError('P2002', 'Unique constraint failed'))).toBe(false);
    expect(isTransientDbError(prismaError('P2003', 'Foreign key constraint failed'))).toBe(false);
    expect(isTransientDbError(new Error('Lesson "x" references an unknown skill'))).toBe(false);
    expect(isTransientDbError('not even an error')).toBe(false);
  });
});

describe('withDbRetry', () => {
  it('returns at once when the work succeeds', async () => {
    const work = vi.fn(() => Promise.resolve(42));
    await expect(withDbRetry('x', work, { sleep: noWait })).resolves.toBe(42);
    expect(work).toHaveBeenCalledOnce();
  });

  it('rides out dropped connections and reports each retry', async () => {
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(prismaError('P1017', 'Server has closed the connection.'))
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValueOnce('done');
    const onRetry = vi.fn();
    const sleep = vi.fn(noWait);
    await expect(withDbRetry('level arrays-01', work, { sleep, onRetry, delaysMs: [10, 20, 30] })).resolves.toBe('done');
    expect(work).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ label: 'level arrays-01', attempt: 1, of: 3, waitMs: 10 }));
  });

  it('gives up after its retries with the real error', async () => {
    const dropped = prismaError('P1017', 'Server has closed the connection.');
    const work = vi.fn(() => Promise.reject(dropped));
    await expect(withDbRetry('x', work, { sleep: noWait, delaysMs: [1, 1] })).rejects.toBe(dropped);
    expect(work).toHaveBeenCalledTimes(3); // the first try plus two retries
  });

  it('fails immediately on a data error, without retrying', async () => {
    const bad = prismaError('P2002', 'Unique constraint failed');
    const work = vi.fn(() => Promise.reject(bad));
    await expect(withDbRetry('x', work, { sleep: noWait })).rejects.toBe(bad);
    expect(work).toHaveBeenCalledOnce();
  });
});
