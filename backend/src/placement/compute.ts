import { prisma } from '../db';
import { scoreRole } from './scoring';
import { skillProgress } from '../progress/skills';

// One role's placement result, ready for the UI.
export interface PlacementRole {
  companyId: string;
  companyName: string;
  roleTitle: string;
  sourceUrl: string;
  collectedOn: Date;
  score: number; // 0..100 tracked-skill coverage
  missingAvailableNow: { skillId: string; title: string }[]; // gaps we teach -> "Train this"
  missingExternal: string[]; // gaps we don't teach yet -> informational
}

// Compute placement coverage for a student across their target companies (or all
// companies if they picked none). Recomputed fresh on each call, so it always
// reflects the latest completed levels.
export async function computePlacementForUser(userId: string): Promise<PlacementRole[]> {
  // A skill is "covered" when the student KNOWS it (progress/skills.ts): every
  // level completed — the same rule as the roadmap's "completed" — or tested out
  // in the placement quiz.
  const progress = await skillProgress(userId);
  const knownSkills = new Set([...progress.completed, ...progress.testedOut]);

  // Score the student's chosen companies, or all of them if none chosen.
  const targets = await prisma.userTargetCompany.findMany({
    where: { userId },
    select: { companyId: true },
  });
  const targetIds = targets.map((t) => t.companyId);

  const profiles = await prisma.companyRoleProfile.findMany({
    where: { isActive: true, ...(targetIds.length ? { companyId: { in: targetIds } } : {}) },
    include: {
      company: { select: { name: true } },
      skills: { select: { skillId: true, weight: true, jdPhrase: true, skill: { select: { title: true } } } },
    },
  });

  return profiles
    .map((p) => {
      const result = scoreRole(
        knownSkills,
        p.skills.map((s) => ({ skillId: s.skillId, weight: s.weight, jdPhrase: s.jdPhrase })),
      );
      const titleOf = new Map(p.skills.map((s) => [s.skillId, s.skill.title]));
      return {
        companyId: p.companyId,
        companyName: p.company.name,
        roleTitle: p.roleTitle,
        sourceUrl: p.sourceUrl,
        collectedOn: p.collectedOn,
        score: result.score,
        missingAvailableNow: result.missingTracked.map((m) => ({
          skillId: m.skillId,
          title: titleOf.get(m.skillId) ?? m.skillId,
        })),
        missingExternal: p.externalRequirements,
      };
    })
    .sort((a, b) => b.score - a.score); // most-ready first
}
