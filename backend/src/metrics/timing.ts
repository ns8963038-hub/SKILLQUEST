import type { RequestHandler } from 'express';

// Lightweight API latency recorder (PRD §6: "p95 < 500 ms for platform APIs;
// code execution reported separately"). Keeps the most recent samples per route
// in memory — enough for the admin metrics panel during UAT, with zero
// infrastructure. Resets when the server restarts (documented in the report).

const MAX_SAMPLES_PER_ROUTE = 500;
const samples = new Map<string, number[]>();

export function recordTiming(route: string, ms: number): void {
  const list = samples.get(route) ?? [];
  list.push(ms);
  if (list.length > MAX_SAMPLES_PER_ROUTE) list.shift();
  samples.set(route, list);
}

// Nearest-rank percentile (p in 0..100). Null for an empty sample.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

export interface LatencySummary {
  n: number;
  p50: number | null;
  p95: number | null;
  byRoute: { route: string; n: number; p50: number | null; p95: number | null }[];
}

// Platform-API latency: every recorded route EXCEPT code submission, whose time is
// dominated by running Java and is reported separately (execution p95).
export function latencySummary(): LatencySummary {
  const isPlatform = (route: string) => !route.endsWith('/submit');
  const platform = [...samples].filter(([route]) => isPlatform(route)).flatMap(([, v]) => v);
  return {
    n: platform.length,
    p50: percentile(platform, 50),
    p95: percentile(platform, 95),
    byRoute: [...samples]
      .map(([route, v]) => ({ route, n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) }))
      .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)),
  };
}

// Express middleware: time each request and file it under its route pattern
// (e.g. "GET /api/levels/:id"), so ids don't explode the number of buckets.
export const timingMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const pattern = (req.route as { path?: string } | undefined)?.path;
    if (!pattern) return; // unmatched (404) requests aren't platform latency
    recordTiming(`${req.method} ${req.baseUrl}${pattern}`, Math.round(ms * 10) / 10);
  });
  next();
};
