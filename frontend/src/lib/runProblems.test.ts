import { describe, expect, it } from 'vitest';
import { ApiError } from './apiError';
import { runProblemMessage } from './runProblems';

describe('runProblemMessage', () => {
  it('tells a student who is going too fast to wait', () => {
    expect(runProblemMessage(new ApiError('/api/levels/x/submit', 429))).toMatch(/very quickly/);
  });
  it('says a busy runner did not count as an attempt', () => {
    expect(runProblemMessage(new ApiError('/api/levels/x/submit', 503))).toMatch(/didn’t count as an attempt/);
  });
  it('asks for a solution when Submit is pressed on the untouched starter code', () => {
    expect(runProblemMessage(new ApiError('/api/levels/x/submit', 422))).toMatch(/still the starter code/);
  });
  it('falls back to a connection message for anything else', () => {
    expect(runProblemMessage(new TypeError('Failed to fetch'))).toMatch(/connection/);
  });
});
