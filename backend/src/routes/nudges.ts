import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../http';
import { logEvent } from '../events';

export const nudgesRouter = Router();

const DAY_MS = 86_400_000;
const NUDGE_LIFETIME_DAYS = 14; // an old nudge is stale — the next weekly run decides afresh

// GET /api/nudges/active — the student's current in-app nudge, if any (PRD F5
// intervention): created by the weekly scoring run when they move INTO "at risk",
// with an easy "confidence booster" level to come back to.
nudgesRouter.get(
  '/nudges/active',
  asyncHandler(async (req, res) => {
    const cutoff = new Date(Date.now() - NUDGE_LIFETIME_DAYS * DAY_MS);
    const nudge = await prisma.nudge.findFirst({
      where: {
        userId: req.userId!,
        dismissedAt: null,
        clickedAt: null,
        dropoutScore: { scoredAt: { gte: cutoff } },
      },
      orderBy: { id: 'desc' },
      include: {
        suggestedLevel: { select: { id: true, title: true, skill: { select: { title: true } } } },
      },
    });

    res.json({
      nudge: nudge
        ? {
            id: nudge.id,
            variant: nudge.variant,
            suggestedLevel: nudge.suggestedLevel
              ? {
                  id: nudge.suggestedLevel.id,
                  title: nudge.suggestedLevel.title,
                  skillTitle: nudge.suggestedLevel.skill.title,
                }
              : null,
          }
        : null,
    });
  }),
);

// POST /api/nudges/:id/shown | clicked | dismissed — the nudge funnel the PRD asks
// us to log. Each timestamp is set once (the first time) and only by the owner.
nudgesRouter.post(
  '/nudges/:id/:action',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const id = Number(req.params.id);
    const action = req.params.action;
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid nudge id' });
      return;
    }

    const now = new Date();
    let updated = 0;
    if (action === 'shown') {
      updated = (await prisma.nudge.updateMany({ where: { id, userId, shownAt: null }, data: { shownAt: now } })).count;
    } else if (action === 'clicked') {
      updated = (await prisma.nudge.updateMany({ where: { id, userId, clickedAt: null }, data: { clickedAt: now } })).count;
    } else if (action === 'dismissed') {
      updated = (await prisma.nudge.updateMany({ where: { id, userId, dismissedAt: null }, data: { dismissedAt: now } }))
        .count;
    } else {
      res.status(400).json({ error: 'action must be shown, clicked or dismissed' });
      return;
    }

    if (updated) await logEvent(userId, `nudge_${action}`, { nudgeId: id });
    res.json({ ok: true, recorded: updated > 0 });
  }),
);
