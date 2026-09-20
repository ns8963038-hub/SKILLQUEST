import { env } from './env';

// Client for the Python AI service. Every call carries the shared internal key
// in the X-Internal-Key header; the AI service rejects anything without it. The
// browser never calls the AI service directly — only this server does.

// Statuses that mean "the service isn't ready yet", not "your request is wrong".
// On free hosting the AI service sleeps after 15 minutes and restarts on every
// deploy; while it boots, the host answers 502/503/504. Retrying turns what the
// student would see as a failed onboarding into a slightly slow one.
const RETRY_STATUS = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// POST a JSON body to an AI-service path and return the parsed JSON response.
// Retries a waking or restarting service; a real error (400, 401, 500) is
// returned immediately, because retrying it would only waste the student's time.
async function callAi<T>(path: string, body: unknown): Promise<T> {
  let lastProblem = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
    try {
      const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': env.INTERNAL_API_KEY ?? '',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      if (!RETRY_STATUS.has(res.status)) throw new Error(`AI service ${path} failed with ${res.status}`);
      lastProblem = `status ${res.status}`;
    } catch (err) {
      // A thrown non-retryable error above must not be retried.
      if (err instanceof Error && err.message.startsWith('AI service ')) throw err;
      lastProblem = err instanceof Error ? err.message : String(err); // network error: retry
    }
  }
  throw new Error(`AI service ${path} is not responding (${lastProblem})`);
}

// On the free hosting tier the AI service sleeps when idle and takes 30-60 s to
// wake. warmAiService() pokes it (fire-and-forget) when a student signs in, so
// it is awake by the time they finish the onboarding quiz or open Settings.
// Throttled: at most one poke every 5 minutes. Never throws.
const WARM_EVERY_MS = 5 * 60_000;
let lastWarm = 0;
export function warmAiService(now = Date.now()): void {
  if (now - lastWarm < WARM_EVERY_MS) return;
  lastWarm = now;
  fetch(`${env.AI_SERVICE_URL}/health`).catch(() => undefined);
}

// One scheduled skill as returned by /ai/roadmap.
export interface RoadmapItemDto {
  skillId: string;
  weekNumber: number;
  position: number;
}

// Map a free-text goal to a goal category (NLP module #1).
export async function mapGoal(text: string): Promise<{ goalCategory: string; confidence: number }> {
  return callAi('/ai/goal-map', { text });
}

// Generate the week-by-week plan for the given inputs (roadmap engine).
export async function generateRoadmap(params: {
  goalCategory: string;
  hoursPerWeek: number;
  testedOut: string[];
}): Promise<RoadmapItemDto[]> {
  return callAi('/ai/roadmap', params);
}

// The disengagement-risk score for one feature row.
export interface RiskScoreResult {
  probability: number;
  tier: 'healthy' | 'watch' | 'atrisk';
  modelVersion: string;
  featureSetVersion: string;
  thresholdVersion: string;
}

// Score a student's disengagement risk from their computed feature row.
export async function riskScore(features: Record<string, number>): Promise<RiskScoreResult> {
  return callAi('/ai/risk-score', { features });
}
