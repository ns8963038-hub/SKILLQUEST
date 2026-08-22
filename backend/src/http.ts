import type { RequestHandler } from 'express';

// Express 4 doesn't catch errors thrown inside an async handler, so an unhandled
// rejection would hang the request. This wrapper forwards any rejection to the
// error-handling middleware (which turns it into a clean 400/500).
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
