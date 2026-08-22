import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from './auth';

// A throwaway secret — these tests sign their own tokens, so no real secret and
// no database is involved.
const SECRET = 'test-secret';

describe('verifyAccessToken', () => {
  it('accepts a valid user token and returns the user id + email', () => {
    const token = jwt.sign(
      { sub: 'user-123', email: 'a@b.com', role: 'authenticated' },
      SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const result = verifyAccessToken(token, SECRET);
    expect(result.userId).toBe('user-123');
    expect(result.email).toBe('a@b.com');
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'user-123' }, 'other-secret', { algorithm: 'HS256' });
    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-123' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it('rejects a token with no sub (e.g. the anon key)', () => {
    const token = jwt.sign({ role: 'anon' }, SECRET, { algorithm: 'HS256' });
    expect(() => verifyAccessToken(token, SECRET)).toThrow('not a user token');
  });
});
