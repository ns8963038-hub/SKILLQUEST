import { ApiError } from './apiError';

// What to tell a student when running their code didn't happen. None of these
// count as an attempt: the server records nothing unless the code actually ran.
export function runProblemMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'You’re running code very quickly — wait a few seconds, then try again.';
  }
  if (err instanceof ApiError && err.status === 503) {
    return 'The code runner is busy right now. Your code is safe, and this didn’t count as an attempt — try again in a moment.';
  }
  return 'Could not reach SkillQuest. Check your connection and try again — your code is saved.';
}
