import { createHash, timingSafeEqual } from 'node:crypto';

// Compare a presented secret with the real one in CONSTANT time. A plain `!==`
// stops at the first differing character, so how long a wrong guess takes to be
// rejected leaks how many leading characters were right. Both sides are hashed
// first: timingSafeEqual needs equal lengths, and hashing gives that without
// revealing the real secret's length. An unset secret never matches.
export function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
