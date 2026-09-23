import { prisma } from '../db';
import { participantCode } from './pseudonym';

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
