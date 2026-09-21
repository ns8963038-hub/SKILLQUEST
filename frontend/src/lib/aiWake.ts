import { ApiError } from './api';

// WAKING THE AI TUTOR
//
// On the free hosting tier the AI service (goal mapping, roadmap engine) sleeps
// after 15 minutes without traffic. It wakes for a request from the internet —
// but NOT for one from our own API, which lives on the same host. We measured
// this on 2026-09-21: the API asked eight times over a minute and a half during
// two onboardings and the service never started; one request from outside woke
// it within seconds. So the student's browser does the waking:
//
//   1. /api/me tells us the service's public health URL; we poke it straight
//      away, a minute or more before onboarding needs the tutor.
//   2. We poke again as the student moves through onboarding (at most once a
//      minute), so a slow student doesn't find it asleep again.
//   3. If a request still comes back 503 ("ai_unavailable"), we say the tutor
//      is waking, poke once more, wait, and retry. The API calls the AI before
//      it writes anything, so a retry is always safe.
//
// Only the health check is ever called from the browser. Every /ai/* route still
// requires the internal key and is reached only through the API.

const POKE_EVERY_MS = 60_000;
export const AI_RETRY_ATTEMPTS = 3; // the first try plus two retries
export const AI_RETRY_WAIT_MS = 10_000;

let wakeUrl: string | null = null;
let lastPoke = -Infinity;

// Remember where the AI service's health check is (from /api/me).
export function rememberAiWakeUrl(url: string | null | undefined): void {
  wakeUrl = url ? url : null;
}

// Poke the AI service so it starts waking. Fire-and-forget: the answer is never
// read (so no CORS is needed), and a failure never reaches the page. Throttled
// to once a minute unless `force` is set.
export function wakeAi(options: { force?: boolean; now?: number } = {}): void {
  const now = options.now ?? Date.now();
  if (!wakeUrl) return;
  if (!options.force && now - lastPoke < POKE_EVERY_MS) return;
  lastPoke = now;
  try {
    void fetch(wakeUrl, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    /* a wake-up poke must never break the page */
  }
}

// Is this the API saying "the AI tutor didn't answer"?
export function isAiWaking(err: unknown): boolean {
  return err instanceof ApiError && err.status === 503;
}

// Run an API call that needs the AI tutor, retrying while the tutor wakes.
// `onWaiting` is told each time we start waiting, so the screen can say why.
export async function retryWhileAiWakes<T>(
  run: () => Promise<T>,
  onWaiting?: (attempt: number) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isAiWaking(err) || attempt >= AI_RETRY_ATTEMPTS) throw err;
      wakeAi({ force: true });
      onWaiting?.(attempt);
      await wait(AI_RETRY_WAIT_MS);
    }
  }
}

// For tests: forget the URL and the throttle.
export function resetAiWake(): void {
  wakeUrl = null;
  lastPoke = -Infinity;
}
