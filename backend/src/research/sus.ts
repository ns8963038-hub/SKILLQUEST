// System Usability Scale (Brooke, 1996) — the standard 10-item usability
// questionnaire the PRD's success metrics call for (§6).
//
// Each item is answered 1 (strongly disagree) .. 5 (strongly agree). Odd items are
// positively worded (score = answer − 1); even items are negatively worded
// (score = 5 − answer). The 0–40 sum × 2.5 gives the familiar 0–100 SUS score.

// Minimum completed levels before a student is asked for feedback — they need
// real experience of the product for their answers to mean anything.
export const SURVEY_MIN_LEVELS = 3;

export function susScore(answers: number[]): number {
  if (answers.length !== 10 || answers.some((a) => !Number.isInteger(a) || a < 1 || a > 5)) {
    throw new Error('SUS needs exactly 10 answers, each 1..5');
  }
  const sum = answers.reduce((total, a, i) => total + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

export interface SurveySummary {
  n: number;
  susMean: number | null;
  susSd: number | null; // sample standard deviation
  engagementMean: number | null;
  recommendPct: number | null; // 0..100
}

// Aggregate survey rows for the report / admin panel.
export function summarizeSurveys(
  rows: { susScore: number; engagement: number; wouldRecommend: boolean }[],
): SurveySummary {
  const n = rows.length;
  if (n === 0) return { n, susMean: null, susSd: null, engagementMean: null, recommendPct: null };
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sus = rows.map((r) => r.susScore);
  const susMean = mean(sus);
  const susSd = n > 1 ? Math.sqrt(sus.reduce((s, x) => s + (x - susMean) ** 2, 0) / (n - 1)) : 0;
  return {
    n,
    susMean,
    susSd,
    engagementMean: mean(rows.map((r) => r.engagement)),
    recommendPct: (rows.filter((r) => r.wouldRecommend).length / n) * 100,
  };
}
