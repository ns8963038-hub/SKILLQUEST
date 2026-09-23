import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { generateRoadmap, mapGoal } from '../aiClient';
import { advanceRoadmap } from '../roadmap/advance';
import { CONSENT_VERSION } from '../research/consent';
import { assignParticipantCode } from '../research/participants';
import { checkDisplayName } from '../gamification/displayName';

export const settingsRouter = Router();

// Everything the settings screen shows, in one shape.
async function loadSettings(userId: string) {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      fullName: true,
      hoursPerWeek: true,
      goalText: true,
      goalCategory: true,
      leaderboardOptOut: true,
      consentGivenAt: true,
      withdrawnAt: true,
    },
  });
  const [targets, companies] = await Promise.all([
    prisma.userTargetCompany.findMany({ where: { userId }, select: { companyId: true } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    email: profile.email,
    displayName: profile.fullName,
    hoursPerWeek: profile.hoursPerWeek,
    goalText: profile.goalText ?? '',
    goalCategory: profile.goalCategory,
    targetCompanies: targets.map((t) => t.companyId),
    leaderboardOptOut: profile.leaderboardOptOut,
    researchParticipating: !!profile.consentGivenAt && !profile.withdrawnAt,
    companies,
  };
}

// GET /api/settings
settingsRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    res.json(await loadSettings(req.userId!));
  }),
);

const SettingsBody = z.object({
  displayName: z.string().trim().max(60).nullable().optional(), // shown on the leaderboard; checked below
  hoursPerWeek: z.number().int().min(1).max(40).optional(),
  goalText: z.string().max(500).optional(),
  targetCompanies: z.array(z.string()).optional(),
  leaderboardOptOut: z.boolean().optional(),
  researchParticipation: z.boolean().optional(), // false = "Withdraw from research"
});

// PUT /api/settings — save preferences. If weekly hours or the goal changed, the
// roadmap is RE-PLANNED (PRD F2 acceptance (a)): a fresh plan from the AI service,
// with completed/current re-derived from actual progress so nothing earned is lost.
settingsRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const input = SettingsBody.parse(req.body);

    // The leaderboard name is seen by the whole batch: refuse abuse, odd
    // characters and names that pass as the team (gamification/displayName.ts).
    if (input.displayName) {
      const check = checkDisplayName(input.displayName);
      if (!check.ok) {
        res.status(400).json({ error: 'display_name', message: check.reason });
        return;
      }
      input.displayName = check.name;
    }

    const profile = await prisma.profile.findUniqueOrThrow({
      where: { id: userId },
      select: { hoursPerWeek: true, goalText: true, goalCategory: true },
    });
    const activeRoadmap = await prisma.roadmap.findFirst({
      where: { userId, isActive: true },
      select: { params: true },
    });

    const hoursChanged = input.hoursPerWeek !== undefined && input.hoursPerWeek !== profile.hoursPerWeek;
    const goalChanged =
      input.goalText !== undefined && input.goalText.trim() !== (profile.goalText ?? '').trim();
    const replan = !!activeRoadmap && (hoursChanged || goalChanged);

    // Plan inputs. The AI service is called BEFORE the transaction — network I/O
    // never runs while holding database locks.
    const hoursPerWeek = input.hoursPerWeek ?? profile.hoursPerWeek;
    let goalCategory = profile.goalCategory ?? 'general_placement';
    if (goalChanged && input.goalText !== undefined) {
      goalCategory = input.goalText.trim() ? (await mapGoal(input.goalText)).goalCategory : 'general_placement';
    }
    const previous = (activeRoadmap?.params ?? {}) as { testedOut?: unknown };
    const testedOut = Array.isArray(previous.testedOut)
      ? previous.testedOut.filter((s): s is string => typeof s === 'string')
      : [];
    const items = replan ? await generateRoadmap({ goalCategory, hoursPerWeek, testedOut }) : [];

    // Rejoining the research: give them a participant code first, as the consent
    // screen does (a consent recorded without one would leave them out of exports).
    if (input.researchParticipation === true) await assignParticipantCode(userId);

    const validCompanies = input.targetCompanies
      ? await prisma.company.findMany({ where: { id: { in: input.targetCompanies } }, select: { id: true } })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: userId },
        data: {
          hoursPerWeek,
          ...(input.displayName !== undefined ? { fullName: input.displayName || null } : {}),
          ...(input.leaderboardOptOut !== undefined ? { leaderboardOptOut: input.leaderboardOptOut } : {}),
          ...(input.goalText !== undefined ? { goalText: input.goalText, goalCategory } : {}),
          // Rejoin the research: consent to the current text again.
          ...(input.researchParticipation === true
            ? { consentVersion: CONSENT_VERSION, consentGivenAt: new Date(), withdrawnAt: null }
            : {}),
          // Withdraw: excluded from every analysis and export from now on.
          ...(input.researchParticipation === false ? { withdrawnAt: new Date() } : {}),
        },
      });

      if (validCompanies) {
        await tx.userTargetCompany.deleteMany({ where: { userId } });
        if (validCompanies.length) {
          await tx.userTargetCompany.createMany({
            data: validCompanies.map((c) => ({ userId, companyId: c.id })),
            skipDuplicates: true,
          });
        }
      }

      if (replan) {
        await tx.roadmap.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
        const created = await tx.roadmap.create({
          data: {
            userId,
            isActive: true,
            params: { goalCategory, hoursPerWeek, testedOut, source: 'settings' },
          },
        });
        await tx.roadmapItem.createMany({
          data: items.map((it) => ({
            roadmapId: created.id,
            skillId: it.skillId,
            weekNumber: it.weekNumber,
            position: it.position,
            status: 'locked' as const,
          })),
        });
      }
    });

    // Re-derive completed/current from real progress on the new plan.
    if (replan) await advanceRoadmap(userId);
    await logEvent(userId, 'settings_update', { replanned: replan, hoursChanged, goalChanged });

    res.json({
      ...(await loadSettings(userId)),
      replanned: replan,
      weeks: replan && items.length ? Math.max(...items.map((i) => i.weekNumber)) : null,
      plannedSkills: replan ? items.length : null,
    });
  }),
);
