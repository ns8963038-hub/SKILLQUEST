import { describe, it, expect } from 'vitest';
import { latencySummary, percentile, recordTiming } from './timing';

describe('latency percentiles', () => {
  it('uses the nearest-rank method', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNull();
  });

  it('keeps code submission out of platform-API latency', () => {
    recordTiming('GET /api/dashboard', 40);
    recordTiming('POST /api/levels/:id/submit', 9000);
    const summary = latencySummary();
    expect(summary.p95).toBeLessThan(9000);
    expect(summary.byRoute.find((r) => r.route.endsWith('/submit'))?.p95).toBe(9000);
  });
});
