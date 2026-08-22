import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env';

// Make the authenticated user's id/email available to every route handler.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

// The claims we rely on from a Supabase access token.
interface SupabaseJwtPayload {
  sub: string; // the auth.users UUID — this becomes profiles.id
  email?: string;
  role?: string; // 'authenticated' for a signed-in user
}

/**
 * Verify a Supabase access token and pull out the user id.
 *
 * Supabase signs access tokens with HS256 using the project's JWT secret, so we
 * can verify them locally — no network call to Supabase per request. Throws if
 * the token is invalid, expired, or isn't a real user token.
 *
 * Kept as a pure function (secret passed in) so it's testable without env or a
 * running server.
 */
export function verifyAccessToken(token: string, secret: string): { userId: string; email?: string } {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as SupabaseJwtPayload;
  // The anon/public key is also a valid JWT, but it has no `sub`. Requiring a
  // subject rejects it, so only real signed-in users get through.
  if (!payload.sub) throw new Error('not a user token');
  return { userId: payload.sub, email: payload.email };
}

/**
 * Express middleware guarding every /api route. Reads the Bearer token, verifies
 * it, and attaches userId/userEmail to the request. Any failure ends as 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.SUPABASE_JWT_SECRET) {
    // Misconfiguration, not the caller's fault.
    res.status(500).json({ error: 'auth not configured (SUPABASE_JWT_SECRET missing)' });
    return;
  }
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  try {
    const { userId, email } = verifyAccessToken(token, env.SUPABASE_JWT_SECRET);
    req.userId = userId;
    req.userEmail = email;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
