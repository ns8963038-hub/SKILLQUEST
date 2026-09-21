import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AiUnavailableError } from './aiClient';

// Central error handler, mounted last in app.ts.
//
// - A bad request body (zod) becomes a clean 400.
// - The AI service not answering becomes a 503 with a code the frontend knows,
//   so the student sees "your tutor is waking up" and an automatic retry. The
//   AI is called before anything is written, so a retry is always safe.
// - Anything else is logged and returned as a generic 500 (never leak internals).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid request', details: err.issues });
    return;
  }
  if (err instanceof AiUnavailableError) {
    console.warn(err.message); // expected on free hosting; kept visible in the logs
    res.status(503).json({ error: 'ai_unavailable', message: 'The AI tutor is waking up. Try again in a moment.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
};
