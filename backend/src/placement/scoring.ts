// Placement "role skill coverage" scoring (F6). Deterministic weighted coverage
// — no ML, no embeddings at runtime (embeddings only help map JD phrases to
// skill ids at authoring time). Pure and testable.

export interface RoleSkill {
  skillId: string;
  weight: number;
  jdPhrase: string | null;
}

export interface RoleScore {
  score: number; // 0..100 — % of the role's tracked-skill weight the student covers
  covered: string[]; // skill ids the student has
  missingTracked: { skillId: string; weight: number }[]; // gaps we DO teach (available now)
}

/**
 * Score one role. `score` is the weighted percentage of the role's TRACKED
 * skills the student KNOWS (every level completed, or tested out in the quiz —
 * see progress/skills.ts). External requirements (things we don't teach) are
 * handled separately by the caller — they're gaps, but not part of this
 * "tracked-skill coverage" percentage.
 */
export function scoreRole(knownSkills: Set<string>, roleSkills: RoleSkill[]): RoleScore {
  const totalWeight = roleSkills.reduce((sum, r) => sum + r.weight, 0);
  let coveredWeight = 0;
  const covered: string[] = [];
  const missingTracked: { skillId: string; weight: number }[] = [];

  for (const rs of roleSkills) {
    if (knownSkills.has(rs.skillId)) {
      coveredWeight += rs.weight;
      covered.push(rs.skillId);
    } else {
      missingTracked.push({ skillId: rs.skillId, weight: rs.weight });
    }
  }

  const score = totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 100) : 0;
  // Most important gaps first.
  missingTracked.sort((a, b) => b.weight - a.weight);
  return { score, covered, missingTracked };
}
