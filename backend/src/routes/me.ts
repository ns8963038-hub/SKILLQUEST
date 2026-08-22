import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';

export const meRouter = Router();

// GET /api/me — the current user's profile.
// Creates the profile row on first login (its id IS the auth.users UUID from the
// verified token, so the auth.users foreign key is satisfied), otherwise returns
// the existing one. This is where a brand-new Supabase user becomes a SkillQuest
// profile with onboarding_step = 0.
meRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.userId!; // guaranteed by requireAuth
    const existed = await prisma.profile.findUnique({ where: { id: userId } });

    const profile = await prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId, email: req.userEmail ?? '' },
      update: {}, // nothing to change on a normal fetch
    });

    // Record the login only the first time we see them each visit is overkill;
    // logging on profile creation is a clean "account started" signal.
    if (!existed) await logEvent(userId, 'login', { firstTime: true });

    res.json(profile);
  }),
);
