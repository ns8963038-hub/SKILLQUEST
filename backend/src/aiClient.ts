import { env } from './env';

// Client for the Python AI service. Every call carries the shared internal key
// in the X-Internal-Key header; the AI service rejects anything without it. The
// browser never calls the AI service directly — only this server does.

// Statuses that mean "the service isn't ready yet", not "your request is wrong".
// On free hosting the AI service sleeps after 15 minutes and restarts on every
// deploy; while it boots, the host answers 502/503/504.
const RETRY_STATUS = new Set([502, 503, 504]);
// ~45 s of waiting in all: enough for a service that the student's browser has
// just woken (it boots in 30-40 s), short enough that a service which is NOT
// waking gives the student a clear answer instead of a spinner that never ends.
const RETRY_DELAYS_MS = [3_000, 6_000, 10_000, 12_000, 14_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The AI service did not answer at all (asleep, restarting or down) — as opposed
// to answering with an error. The API turns this into a 503 the frontend
// recognises, so the student sees "your tutor is waking up" and an automatic
// retry, never a bare "failed (500)".
export class AiUnavailableError extends Error {
  constructor(path: string, problem: string) {
    super(`AI service ${path} is not responding (${problem})`);
    this.name = 'AiUnavailableError';
  }
}

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
  throw new AiUnavailableError(path, lastProblem);
}

// WHO WAKES THE AI SERVICE
//
// A sleeping free-tier service is woken by traffic from the internet — but NOT
// by a request from another service on the same host. Measured on 2026-09-21:
// two onboardings sent the AI service eight requests from this API over a
// minute and a half, and it never started (no log line at all); one request
// from outside woke it within seconds. So the API can't wake it, however long
// it waits. The student's BROWSER does it instead: /api/me hands the frontend
// this public health URL, and the frontend pokes it the moment the student signs
// in — a minute or more before onboarding or a re-plan needs the tutor.
// (Only /health is ever called from the browser; every /ai/* route still
// requires the internal key and is reached only through this API.)
export function aiWakeUrl(): string {
  return `${env.AI_SERVICE_URL.replace(/\/+$/, '')}/health`;
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
