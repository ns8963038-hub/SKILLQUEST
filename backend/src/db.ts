import { PrismaClient } from '@prisma/client';

// A single shared Prisma client. `tsx watch` reloads modules on file changes,
// which would otherwise spawn a new client (and a new connection pool) each
// time — so in development we cache it on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
