import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { prisma } from './db';

// Builds the Express app. Kept separate from index.ts so tests can create an
// app instance without starting a listening server.
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: '1mb' }));

  // Liveness + readiness in one. The trivial query doubles as the Supabase
  // keep-alive: a scheduled hit on /health runs SELECT 1, which keeps the free
  // project from pausing after 7 days idle (TRD sec 8). Never throws — if the DB
  // is unreachable it reports db: "down" rather than failing the request.
  app.get('/health', async (_req, res) => {
    let db: 'up' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    res.json({ status: 'ok', db, ts: new Date().toISOString() });
  });

  return app;
}
