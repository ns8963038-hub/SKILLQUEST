import { z } from 'zod';

// Validate and normalize environment variables once, at startup.
// Fields are optional for now so the skeleton boots before Supabase exists;
// they become required at the point each feature starts using them.
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Comma-separated origins -> string[]
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim())),
  DATABASE_URL: z.string().optional(),
  // Supabase project URL — used to fetch the JWKS that verifies user tokens.
  // e.g. https://<project-ref>.supabase.co
  SUPABASE_URL: z.string().optional(),
  // Legacy HS256 secret. New Supabase projects sign tokens with ES256 keys
  // (verified via JWKS), so this is no longer used for verification.
  SUPABASE_JWT_SECRET: z.string().optional(),
  INTERNAL_API_KEY: z.string().optional(),
  // Comma-separated emails that get the internal admin view (risk tiers, UAT
  // metrics, research exports). Matched case-insensitively on sign-in.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  // Which code-execution backend to use. All implement the same interface, so
  // switching is pure config (TRD 5.1):
  //   'mock'   — stub for building the UI (no real execution)
  //   'paiza'  — real Java via Paiza.IO's free public runner (no card/account)
  //   'piston' — real Java via a Piston instance (public API is whitelist-only
  //              now, so this is mainly for a self-hosted Piston)
  //   'judge0' — real Java via a Judge0 instance (RapidAPI or self-hosted)
  EXECUTION_BACKEND: z.enum(['mock', 'paiza', 'piston', 'judge0']).default('mock'),
  // Paiza.IO base URL + key. Defaults to the free public API with the guest key.
  PAIZA_URL: z.string().default('https://api.paiza.io'),
  PAIZA_API_KEY: z.string().default('guest'),
  // How many runs may be in flight on the runner at once, across ALL students
  // (the shared guest key is the bottleneck), and how long a run may wait for a
  // free slot before the student is told the runner is busy.
  RUNNER_MAX_CONCURRENT: z.coerce.number().int().min(1).default(6),
  // 45 s: measured on 2026-09-23, 30 students pressing Run in the same second
  // all got through with the slowest at 28.8 s — 30 s would have been too tight.
  RUNNER_MAX_WAIT_MS: z.coerce.number().int().min(1000).default(45_000),
  // Piston base URL (for a self-hosted instance).
  PISTON_URL: z.string().default('https://emkc.org/api/v2/piston'),
  // Judge0 base URL — a hosted instance (RapidAPI) or your self-hosted one.
  // e.g. https://judge0-ce.p.rapidapi.com  or  http://<your-vm-ip>:2358
  JUDGE0_URL: z.string().optional(),
  // Set ONLY when using RapidAPI's hosted Judge0 (adds the RapidAPI headers).
  // Leave empty for a self-hosted instance.
  JUDGE0_RAPIDAPI_KEY: z.string().optional(),
  // The Java language id in your Judge0 (62 on common CE builds). The executor
  // resolves it from /languages at runtime and uses this only as a fallback.
  JUDGE0_JAVA_LANGUAGE_ID: z.coerce.number().default(62),
});

export const env = schema.parse(process.env);
