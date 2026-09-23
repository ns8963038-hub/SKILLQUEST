import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { CONSENT_VERSION } from '../research/consent';
import { participantCode } from '../research/pseudonym';

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

    // The code first: if this fails the student is simply asked again, whereas
    // consent recorded without a code would leave them out of every export.
    if (decision === 'agree') await assignParticipantCode(userId);
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

// Give a consenting student their participant code, once. Students only — the
// team's own accounts are never part of the research data. The number comes from
// a database sequence (race-free), and the write only lands if the student still
// has no code, so a code, once given, never changes.
export async function assignParticipantCode(userId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { participantCode: true, isAdmin: true },
  });
  if (!profile || profile.participantCode || profile.isAdmin) return;
  const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('participant_code_seq') AS n`;
  if (!row) throw new Error('participant_code_seq returned nothing');
  await prisma.profile.updateMany({
    where: { id: userId, participantCode: null },
    data: { participantCode: participantCode(Number(row.n)) },
  });
}
