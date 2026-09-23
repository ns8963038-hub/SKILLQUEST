// Frontend mirror of backend/src/tutor/bkt.ts (Bayesian Knowledge Tracing).
//
// Used for two things only:
//   1. demo mode, so the offline demo updates mastery exactly like the real tutor;
//   2. estimating "how many more levels solved first time until mastered" for the briefing.
// The backend implementation (and its unit tests) is the source of truth.

export const BKT = { pT: 0.15, pS: 0.1, pG: 0.2 }; // learn, slip, guess
// A lesson's multiple-choice answer: easy to guess, a deliberate trap (so more
// slips), and not practice (no learning credit) — mirrors LESSON_BKT in
// backend/src/lessons/content.ts.
export const LESSON_BKT = { pT: 0, pS: 0.2, pG: 0.4 };
export const MASTERY_THRESHOLD = 0.95;

// One BKT step: condition on the attempt (Bayes), then apply learning.
export function bktUpdate(pPrev: number, correct: boolean, params = BKT): number {
  const { pT, pS, pG } = params;
  const p = Math.min(1, Math.max(0, pPrev));
  const num = correct ? p * (1 - pS) : p * pS;
  const den = correct ? num + (1 - p) * pG : num + (1 - p) * (1 - pG);
  const pObs = den === 0 ? p : num / den;
  return Math.min(1, Math.max(0, pObs + (1 - pObs) * pT));
}

// How many levels solved on the first submit (each one correct observation)
// would take `p` past the mastery threshold.
// Capped so a pathological value can't loop forever.
export function solvesToMastery(p: number, cap = 9): number {
  let estimate = p;
  let solves = 0;
  while (estimate < MASTERY_THRESHOLD && solves < cap) {
    estimate = bktUpdate(estimate, true);
    solves += 1;
  }
  return solves;
}
