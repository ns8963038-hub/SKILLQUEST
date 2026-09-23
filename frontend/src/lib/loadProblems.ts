import { ApiError } from './apiError';

// What to say when a level or lesson can't be opened, by what actually went
// wrong — rather than one "isn't ready yet" for everything.
export function loadProblemMessage(err: unknown, what: 'level' | 'lesson'): string {
  if (err instanceof ApiError && err.status === 403) {
    // The server enforces the roadmap's locks (backend/src/progress/access.ts).
    return `This ${what} is locked — it opens when your roadmap reaches its topic.`;
  }
  if (err instanceof ApiError && err.status === 404) return `This ${what} isn’t ready yet.`;
  if (err instanceof ApiError) return `Could not open this ${what} (error ${err.status}). Please try again.`;
  return `Could not reach SkillQuest. Check your connection and try again.`;
}

// Why the signed-in app couldn't load the student's profile, so the error screen
// can say what is actually wrong instead of blaming the database every time.
//   signin  401/403: the sign-in has expired or isn't accepted -> sign in again
//   waking  502/503/504 or no connection at all: free hosting is starting up
//   server  anything else (a real error on our side)
export type AppProblem = { kind: 'signin' | 'waking' } | { kind: 'server'; status: number };

export function appProblem(err: unknown): AppProblem {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return { kind: 'signin' };
    if (err.status === 502 || err.status === 503 || err.status === 504) return { kind: 'waking' };
    return { kind: 'server', status: err.status };
  }
  return { kind: 'waking' }; // the request never got an answer: asleep, or offline
}
