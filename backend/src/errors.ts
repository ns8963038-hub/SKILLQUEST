import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AiUnavailableError } from './aiClient';
import { RunnerUnavailableError } from './execution/types';
import { SkillLockedError } from './progress/access';

// Central error handler, mounted last in app.ts.
//
// - A bad request body (zod) becomes a clean 400.
// - The code runner failing (not the student's program) becomes a 503
//   "runner_unavailable": no attempt, no failed submission, no mastery change.
// - The AI service not answering becomes a 503 with a code the frontend knows,
//   so the student sees "your tutor is waking up" and an automatic retry. The
//   AI is called before anything is written, so a retry is always safe.
// - A skill the student hasn't unlocked yet becomes a 403 "skill_locked".
// - Anything else is logged and returned as a generic 500 (never leak internals).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid request', details: err.issues });
    return;
  }
  if (err instanceof RunnerUnavailableError) {
    // Nothing was recorded: the route runs the code before it writes anything.
    console.warn(err.message);
    res.status(503).json({ error: 'runner_unavailable', message: 'The code runner is busy. Your code is safe — try again in a moment.' });
    return;
  }
  if (err instanceof SkillLockedError) {
    // The roadmap hasn't reached this skill yet (progress/access.ts).
    res.status(403).json({ error: 'skill_locked', message: 'This topic unlocks later on your roadmap — finish the current one first.' });
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
