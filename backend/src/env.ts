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
});

export const env = schema.parse(process.env);
