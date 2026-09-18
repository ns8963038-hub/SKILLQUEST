import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { CONSENT_VERSION } from '../research/consent';

export const consentRouter = Router();

const ConsentBody = z.object({ decision: z.enum(['agree', 'decline']) });

// POST /api/consent — the student's answer on the research-participation screen
// (Backend Schema §5.1), shown before onboarding.
//   agree   -> consent_version + consent_given_at set; included in the research
//   decline -> withdrawn_at set; they use SkillQuest fully, but their data is
//              excluded from every analysis and export
// Either way the answer is recorded against the current version, so they aren't
// asked again until the text changes.
consentRouter.post(
  '/consent',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const { decision } = ConsentBody.parse(req.body);
    const now = new Date();

    await prisma.profile.update({
      where: { id: userId },
      data:
        decision === 'agree'
          ? { consentVersion: CONSENT_VERSION, consentGivenAt: now, withdrawnAt: null }
          : { consentVersion: CONSENT_VERSION, consentGivenAt: null, withdrawnAt: now },
    });
    await logEvent(userId, 'consent', { decision, version: CONSENT_VERSION });

    res.json({ ok: true, decision, version: CONSENT_VERSION });
  }),
);
