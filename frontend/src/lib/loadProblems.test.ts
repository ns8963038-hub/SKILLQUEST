import { describe, expect, it } from 'vitest';
import { ApiError } from './apiError';
import { appProblem, loadProblemMessage } from './loadProblems';

describe('loadProblemMessage', () => {
  it('says a locked topic is locked, not missing', () => {
    expect(loadProblemMessage(new ApiError('/api/levels/arrays-01', 403), 'level')).toMatch(/locked/);
  });
  it('keeps "isn’t ready yet" for content that does not exist', () => {
    expect(loadProblemMessage(new ApiError('/api/lessons/x', 404), 'lesson')).toMatch(/lesson isn’t ready yet/);
  });
  it('tells a server error and a lost connection apart', () => {
    expect(loadProblemMessage(new ApiError('/api/levels/x', 500), 'level')).toMatch(/error 500/);
    expect(loadProblemMessage(new TypeError('Failed to fetch'), 'level')).toMatch(/connection/);
  });
});

describe('appProblem', () => {
  it('tells an expired sign-in, a waking server and a real error apart', () => {
    expect(appProblem(new ApiError('/api/me', 401))).toEqual({ kind: 'signin' });
    expect(appProblem(new ApiError('/api/me', 503))).toEqual({ kind: 'waking' });
    expect(appProblem(new TypeError('Failed to fetch'))).toEqual({ kind: 'waking' });
    expect(appProblem(new ApiError('/api/me', 500))).toEqual({ kind: 'server', status: 500 });
  });
});
