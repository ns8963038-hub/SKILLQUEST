import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { verifyAccessToken } from './auth';

// These tests generate their own ES256 key pair and a LOCAL JWKS, so they verify
// real ES256 tokens (exactly what Supabase issues) without any network.
const ISSUER = 'https://example.supabase.co/auth/v1';
let keySet: JWTVerifyGetKey;
// Infer the private key's type from generateKeyPair so we don't depend on a
// specific jose type export name.
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

// Sign a token with our test key, with sensible defaults the tests can override.
function makeToken(claims: Record<string, unknown>, opts: { issuer?: string; expSec?: number } = {}) {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-kid' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience('authenticated');
  return jwt.setExpirationTime(opts.expSec ?? Math.floor(Date.now() / 1000) + 3600).sign(privateKey);
}

beforeAll(async () => {
  const { publicKey, privateKey: pk } = await generateKeyPair('ES256');
  privateKey = pk;
  const pubJwk = await exportJWK(publicKey);
  pubJwk.kid = 'test-kid';
  pubJwk.alg = 'ES256';
  keySet = createLocalJWKSet({ keys: [pubJwk] });
});

describe('verifyAccessToken', () => {
  it('accepts a valid ES256 user token and returns the user id + email', async () => {
    const token = await makeToken({ sub: 'user-123', email: 'a@b.com' });
    const result = await verifyAccessToken(token, keySet, ISSUER);
    expect(result.userId).toBe('user-123');
    expect(result.email).toBe('a@b.com');
  });

  it('rejects a token from the wrong issuer', async () => {
    const token = await makeToken({ sub: 'user-123' }, { issuer: 'https://evil.example/auth/v1' });
    await expect(verifyAccessToken(token, keySet, ISSUER)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await makeToken({ sub: 'user-123' }, { expSec: Math.floor(Date.now() / 1000) - 10 });
    await expect(verifyAccessToken(token, keySet, ISSUER)).rejects.toThrow();
  });

  it('rejects a token with no sub (e.g. the anon key)', async () => {
    const token = await makeToken({ role: 'anon' });
    await expect(verifyAccessToken(token, keySet, ISSUER)).rejects.toThrow('not a user token');
  });
});
