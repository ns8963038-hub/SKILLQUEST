// SURVIVING A DROPPED DATABASE CONNECTION
//
// The seed talks to a database in Singapore, often over a laptop's Wi-Fi or a
// phone hotspot. A connection that drops half-way ("Server has closed the
// connection") used to kill the whole run and could leave a table cleared but
// not refilled. The seed now does each piece of work as one small, repeatable
// unit (an upsert, or a clear-and-refill inside a transaction) and runs it
// through withDbRetry, which tries again only when the failure is the
// CONNECTION's fault — never when the data itself is wrong.

// Prisma error codes that mean "couldn't talk to the database", not "bad data":
// P1001 can't reach the server · P1002 reached it but timed out · P1008 the
// operation timed out · P1017 the server closed the connection · P2024 no free
// connection in time · P2028 the transaction was cut off.
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028']);
const TRANSIENT_TEXT =
  /closed the connection|can't reach database server|connection (terminated|reset|refused)|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timed out/i;

// Is this failure worth retrying?
export function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  return TRANSIENT_TEXT.test(err.message);
}

export interface RetryOptions {
  delaysMs?: number[]; // wait before each retry; its length is the number of retries
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { label: string; attempt: number; of: number; waitMs: number; error: Error }) => Promise<void> | void;
}

// ~30 s of patience in all: long enough to ride out a network switch or a
// pooler hiccup, short enough that a database that is really down gives a clear
// error instead of hanging.
export const DEFAULT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

// Run `work`, retrying it while the failure is a dropped connection. `work` must
// be safe to repeat — an upsert, or a delete-and-refill inside one transaction.
export async function withDbRetry<T>(label: string, work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (!isTransientDbError(err) || attempt >= delays.length) throw err;
      const waitMs = delays[attempt]!;
      await options.onRetry?.({ label, attempt: attempt + 1, of: delays.length, waitMs, error: err as Error });
      await sleep(waitMs);
    }
  }
}
