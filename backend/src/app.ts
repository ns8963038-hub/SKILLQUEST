import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { prisma } from './db';
import { requireAuth } from './auth';
import { apiRouter } from './routes';
import { jobsRouter } from './routes/jobs';
import { timingMiddleware } from './metrics/timing';
import { errorHandler } from './errors';

// Builds the Express app. Kept separate from index.ts so tests can create an
// app instance without starting a listening server.
export function createApp(): Express {
  const app = express();

  // Hosted behind one proxy (Render / any load balancer): trust it, so req.ip
  // and req.protocol reflect the real client rather than the proxy.
  app.set('trust proxy', 1);

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

  // All /api routes require a valid Supabase token (requireAuth runs first).
  // timingMiddleware records each request's latency for the admin metrics panel.
  app.use('/api', timingMiddleware, requireAuth, apiRouter);

  // Internal jobs (scheduler-triggered) authenticate with the internal key.
  app.use('/internal', jobsRouter);

  // Central error handler (errors.ts): 400 for a bad body, 503 while the AI
  // service is waking, a generic 500 for anything else.
  app.use(errorHandler);

  return app;
}
