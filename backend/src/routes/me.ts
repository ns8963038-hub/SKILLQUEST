import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';
import { env } from '../env';
import { CONSENT_VERSION } from '../research/consent';
import { aiWakeUrl } from '../aiClient';

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
    const email = req.userEmail ?? '';
    const existed = await prisma.profile.findUnique({ where: { id: userId } });

    // Team members listed in ADMIN_USER_IDS get the internal admin view — by user
    // id, never by email (see env.ts). Admin is only ever granted here, never
    // revoked automatically.
    const makeAdmin = env.ADMIN_USER_IDS.includes(userId.toLowerCase());

    const profile = await prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId, email, isAdmin: makeAdmin },
      update: makeAdmin && !existed?.isAdmin ? { isAdmin: true } : {},
    });

    // Log account creation once — a clean "account started" signal.
    if (!existed) await logEvent(userId, 'login', { firstTime: true });

    res.json({
      ...profile,
      // The consent screen shows until the student has answered (agree or
      // decline) the CURRENT version of the research-participation text.
      consentRequired: profile.consentVersion !== CONSENT_VERSION,
      currentConsentVersion: CONSENT_VERSION,
      // The browser pokes this to wake the AI service (free tier) well before
      // onboarding or a re-plan needs it — see aiWakeUrl() for why the API can't.
      aiWakeUrl: aiWakeUrl(),
    });
  }),
);
