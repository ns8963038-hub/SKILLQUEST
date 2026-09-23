import { describe, expect, it } from 'vitest';
import { sameSecret } from './secrets';

describe('sameSecret', () => {
  it('accepts only the exact secret', () => {
    expect(sameSecret('s3cret-key', 's3cret-key')).toBe(true);
    expect(sameSecret('s3cret-kez', 's3cret-key')).toBe(false);
    expect(sameSecret('s3cret', 's3cret-key')).toBe(false); // different lengths are fine to compare
  });
  it('never matches when either side is missing (a misconfigured server rejects everything)', () => {
    expect(sameSecret(undefined, 'k')).toBe(false);
    expect(sameSecret('k', undefined)).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});
