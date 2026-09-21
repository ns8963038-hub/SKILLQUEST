// A failed API call, keeping the HTTP status so a screen can react to it
// (503 = the AI tutor is waking up; see lib/aiWake.ts). The message is the same
// "Request to … failed (N)" text the app has always shown.
//
// Kept in its own file, free of imports, so code that only needs to recognise an
// error (like aiWake.ts) doesn't pull in the Supabase client with it.
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`Request to ${path} failed (${status})`);
    this.name = 'ApiError';
  }
}
