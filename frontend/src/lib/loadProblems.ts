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
