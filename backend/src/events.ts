import { Prisma } from '@prisma/client';
import { prisma } from './db';

// Append one row to the events log — the append-only behavioural record that
// later feeds the disengagement-risk model. Every meaningful action calls this.
// `payload` is Prisma's JSON-object type so any plain object of JSON values fits.
export async function logEvent(
  userId: string,
  type: string,
  payload: Prisma.InputJsonObject = {},
): Promise<void> {
  await prisma.event.create({ data: { userId, type, payload } });
}
