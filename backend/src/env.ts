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
  SUPABASE_JWT_SECRET: z.string().optional(),
  INTERNAL_API_KEY: z.string().optional(),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  // Which code-execution backend to use. 'mock' is a stub for building the UI;
  // 'judge0' runs real Java. Swappable without touching the routes (TRD 5.1).
  EXECUTION_BACKEND: z.enum(['mock', 'judge0']).default('mock'),
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
