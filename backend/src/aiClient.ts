import { env } from './env';

// Client for the Python AI service. Every call carries the shared internal key
// in the X-Internal-Key header; the AI service rejects anything without it. The
// browser never calls the AI service directly — only this server does.

// POST a JSON body to an AI-service path and return the parsed JSON response.
async function callAi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-key': env.INTERNAL_API_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AI service ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
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
