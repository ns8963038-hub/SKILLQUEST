// Bayesian Knowledge Tracing (BKT) — the core of the adaptive tutor (M4).
//
// For each skill we track ONE hidden quantity: p_mastery = P(the student has
// learned this skill). BKT models this as a 2-state Hidden Markov Model where
// the hidden state is "known / not-known" and every problem attempt is a NOISY
// observation of it, because a student who knows a skill can still SLIP (a
// careless wrong answer) and one who doesn't can still GUESS right.
//
// Reference: Corbett & Anderson (1995), "Knowledge Tracing: Modeling the
// Acquisition of Procedural Knowledge."
//
// Kept pure (no DB, no I/O) so it is trivial to unit-test — same pattern as
// gamification/streak.ts and gamification/badges.ts.

// The four BKT parameters. In this first version they are global defaults taken
// from the ITS literature; they can later be fit per-skill from real attempt
// logs (EM / grid search) in ml/, exactly like the OULAD experiment.
export interface BktParams {
  pL0: number; // P(already knew the skill before starting) — the prior
  pT: number; // P(learn it on a given attempt) — the "transit"/learning rate
  pS: number; // P(slip)  — knows it but answers wrong
  pG: number; // P(guess) — doesn't know it but answers right
}

// Literature-standard starting values. Interpretable and defensible in a viva.
export const DEFAULT_BKT: BktParams = {
  pL0: 0.2,
  pT: 0.15,
  pS: 0.1,
  pG: 0.2,
};

// A skill counts as "mastered" once the estimate crosses this confidence.
// Never 1.0: because of the guess parameter, evidence can only approach
// certainty, so a reachable threshold is required.
export const MASTERY_THRESHOLD = 0.95;

/**
 * Advance the mastery estimate by ONE observed attempt.
 *
 * @param pPrev   the current p_mastery (use params.pL0 for a brand-new skill)
 * @param correct did the attempt succeed? (for us: did ALL the level's tests pass)
 * @param params  the BKT parameters (defaults to DEFAULT_BKT)
 * @returns       the updated p_mastery, clamped to [0, 1]
 */
export function bktUpdate(
  pPrev: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT,
): number {
  const { pT, pS, pG } = params;

  // Guard against out-of-range inputs so the Bayes step can't divide by zero
  // or produce NaN from a corrupt stored value.
  const p = Math.min(1, Math.max(0, pPrev));

  // --- Step 1: condition the estimate on the evidence (Bayes' rule). ---
  // Numerator = P(state=known AND this observation); denominator = P(observation).
  let pObs: number;
  if (correct) {
    // A correct answer is explained by "knew it and didn't slip" OR
    // "didn't know it but guessed".
    const num = p * (1 - pS);
    const den = num + (1 - p) * pG;
    pObs = den === 0 ? p : num / den; // den==0 only if p=0 and pG=0
  } else {
    // A wrong answer is explained by "knew it but slipped" OR
    // "didn't know it and didn't guess".
    const num = p * pS;
    const den = num + (1 - p) * (1 - pG);
    pObs = den === 0 ? p : num / den;
  }

  // --- Step 2: account for learning that may happen during the attempt. ---
  // Even a wrong attempt can teach the skill (the transit probability pT).
  const pNext = pObs + (1 - pObs) * pT;

  return Math.min(1, Math.max(0, pNext));
}

// True once the estimate has crossed the mastery threshold.
export function isMastered(pMastery: number): boolean {
  return pMastery >= MASTERY_THRESHOLD;
}
