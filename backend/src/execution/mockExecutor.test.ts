import { describe, it, expect } from 'vitest';
import { MockExecutor } from './mockExecutor';
import type { TestCaseInput } from './types';

const tests: TestCaseInput[] = [
  { stdin: '1', expectedOutput: 'a', isHidden: false },
  { stdin: '2', expectedOutput: 'b', isHidden: true },
];

describe('MockExecutor', () => {
  it('passes all tests for ordinary source and reports "accepted"', async () => {
    const run = await new MockExecutor().run('class Main {}', tests, 5000);
    expect(run.results.every((r) => r.passed)).toBe(true);
    expect(run.verdict).toBe('accepted');
  });

  it('fails all tests when the FAILTEST sentinel is present', async () => {
    const run = await new MockExecutor().run('// FAILTEST\nclass Main {}', tests, 5000);
    expect(run.results.every((r) => r.passed)).toBe(false);
    expect(run.verdict).toBe('wrong_answer');
  });
});
