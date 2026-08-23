import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
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

// Supabase signs each user's access token with an ASYMMETRIC key (ES256) and
// publishes the matching PUBLIC keys at /auth/v1/.well-known/jwks.json. We verify
// tokens against that key set — jose fetches and caches it, and rotates keys
// automatically. (Older projects used an HS256 shared secret; new ones don't,
// which is why verifying with the secret failed.)
let remoteJwks: JWTVerifyGetKey | null = null;
function jwks(): JWTVerifyGetKey {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return remoteJwks;
}

/**
 * Verify a Supabase access token against a JWKS and pull out the user id.
 *
 * The key set + issuer are passed in so this is testable with a locally
 * generated key (no network). Throws if the token is invalid, expired, from the
 * wrong issuer/audience, or isn't a real user token.
 */
export async function verifyAccessToken(
  token: string,
  keySet: JWTVerifyGetKey,
  issuer: string,
): Promise<{ userId: string; email?: string }> {
  const { payload } = await jwtVerify(token, keySet, { issuer, audience: 'authenticated' });
  // The anon/public key is also a signed JWT but has no `sub`. Requiring a
  // subject rejects it, so only real signed-in users get through.
  if (!payload.sub) throw new Error('not a user token');
  return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
}

/**
 * Express middleware guarding every /api route. Reads the Bearer token, verifies
 * it against Supabase's JWKS, and attaches userId/userEmail. Any failure -> 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!env.SUPABASE_URL) {
    res.status(500).json({ error: 'auth not configured (SUPABASE_URL missing)' });
    return;
  }
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  try {
    const { userId, email } = await verifyAccessToken(token, jwks(), `${env.SUPABASE_URL}/auth/v1`);
    req.userId = userId;
    req.userEmail = email;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
