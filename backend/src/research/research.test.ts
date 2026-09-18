import { describe, it, expect } from 'vitest';
import { susScore, summarizeSurveys } from './sus';
import { maskEmail, participantCode, toCsv } from './pseudonym';

describe('System Usability Scale', () => {
  it('scores the best possible answers as 100 and the worst as 0', () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
  });
  it('scores all-neutral answers as 50', () => {
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
  });
  it('rejects malformed answers', () => {
    expect(() => susScore([5, 5, 5])).toThrow();
    expect(() => susScore([6, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toThrow();
  });
  it('summarises responses for the report', () => {
    const s = summarizeSurveys([
      { susScore: 80, engagement: 4, wouldRecommend: true },
      { susScore: 60, engagement: 2, wouldRecommend: false },
    ]);
    expect(s).toMatchObject({ n: 2, susMean: 70, engagementMean: 3, recommendPct: 50 });
    expect(s.susSd).toBeCloseTo(14.142, 2);
    expect(summarizeSurveys([]).susMean).toBeNull();
  });
});

describe('pseudonymisation', () => {
  it('codes participants P01, P02…', () => {
    expect(participantCode(0)).toBe('P01');
    expect(participantCode(11)).toBe('P12');
  });
  it('masks emails', () => {
    expect(maskEmail('anjith@college.edu')).toBe('an•••@college.edu');
    expect(maskEmail('nope')).toBe('•••');
  });
  it('writes valid CSV, quoting commas and quotes', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y'], ['say "hi"', null]])).toBe('a,b\n1,"x,y"\n"say ""hi""",\n');
  });
});
