import { describe, it, expect } from 'vitest';
import { bktUpdate, isMastered, DEFAULT_BKT, MASTERY_THRESHOLD } from './bkt';

describe('bktUpdate', () => {
  it('raises mastery after a correct attempt', () => {
    // From the prior (0.2), one correct answer should move the estimate up to
    // ~0.6 with the default parameters (worked by hand in the design note).
    const p = bktUpdate(DEFAULT_BKT.pL0, true);
    expect(p).toBeCloseTo(0.6, 2);
    expect(p).toBeGreaterThan(DEFAULT_BKT.pL0);
  });

  it('lowers mastery after an incorrect attempt', () => {
    // From the prior (0.2), one wrong answer should drop the estimate to ~0.176.
    const p = bktUpdate(DEFAULT_BKT.pL0, false);
    expect(p).toBeCloseTo(0.176, 2);
    expect(p).toBeLessThan(DEFAULT_BKT.pL0);
  });

  it('never jumps straight to certainty on a single correct answer (guess factor)', () => {
    // Because a right answer might be a lucky guess, one correct attempt from a
    // low prior cannot certify mastery.
    expect(bktUpdate(0.1, true)).toBeLessThan(MASTERY_THRESHOLD);
  });

  it('converges toward mastery under repeated correct attempts', () => {
    let p = DEFAULT_BKT.pL0;
    let attempts = 0;
    while (!isMastered(p) && attempts < 50) {
      p = bktUpdate(p, true);
      attempts += 1;
    }
    expect(isMastered(p)).toBe(true);
    expect(attempts).toBeGreaterThan(1); // takes several correct answers, not one
    expect(attempts).toBeLessThan(20); // but converges in a reasonable number
  });

  it('a correct attempt always ends higher than a wrong attempt from the same prior', () => {
    for (const prior of [0.05, 0.2, 0.5, 0.8]) {
      expect(bktUpdate(prior, true)).toBeGreaterThan(bktUpdate(prior, false));
    }
  });

  it('keeps the estimate within [0, 1] and tolerates out-of-range input', () => {
    expect(bktUpdate(1, true)).toBeLessThanOrEqual(1);
    expect(bktUpdate(0, false)).toBeGreaterThanOrEqual(0);
    // A corrupt stored value must not produce NaN or escape the range.
    expect(bktUpdate(1.5, true)).toBeLessThanOrEqual(1);
    expect(bktUpdate(-0.3, false)).toBeGreaterThanOrEqual(0);
  });

  it('still climbs overall even when a wrong answer is mixed in (learning applies)', () => {
    // A wrong attempt drops the estimate but the transit term means a following
    // correct attempt recovers and exceeds the starting point.
    let p = DEFAULT_BKT.pL0;
    p = bktUpdate(p, true); // ~0.60
    p = bktUpdate(p, false); // dips
    p = bktUpdate(p, true); // recovers above the original prior
    expect(p).toBeGreaterThan(DEFAULT_BKT.pL0);
  });
});

describe('isMastered', () => {
  it('uses the mastery threshold', () => {
    expect(isMastered(MASTERY_THRESHOLD)).toBe(true);
    expect(isMastered(MASTERY_THRESHOLD - 0.01)).toBe(false);
  });
});
