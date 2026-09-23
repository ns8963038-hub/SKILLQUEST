import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

// RATE LIMITS (TRD §8)
//
// Counted per signed-in student (requireAuth runs first and sets req.userId),
// never per IP address: a whole college lab reaches us from one IP, and it
// would be absurd for 30 students to share one budget.
//
//   codeRunLimit  anything that RUNS Java on the shared runner — graded
//                 submissions and lesson fill-ins: 10 a minute each student.
//                 Stops one account (email confirmation is off, so anyone can
//                 sign up) from turning us into a free Java runner and getting
//                 the shared Paiza key throttled for every student.
//   exampleRunLimit  "Run examples" (visible tests, recorded nowhere): 20 a
//                 minute, since students run examples often while debugging.
//   apiLimit      everything else, generously: 300 requests a minute.

function perStudent(limit: number, message: string): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit,
    keyGenerator: (req) => req.userId ?? 'signed-out',
    standardHeaders: 'draft-7', // RateLimit headers tell the client when to retry
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited', message });
    },
  });
}

export const codeRunLimit = perStudent(10, 'You are running code very quickly — wait a few seconds, then try again.');
export const exampleRunLimit = perStudent(20, 'You are running the examples very quickly — wait a few seconds, then try again.');
export const apiLimit = perStudent(300, 'Too many requests — slow down a little and try again.');

// A fresh limiter with the same rules, for tests (each has its own counters).
export const makeLimit = perStudent;
