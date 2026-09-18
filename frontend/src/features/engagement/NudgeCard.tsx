import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Nova } from '../../ui/Nova';
import { Button } from '../../ui/primitives';

// GET /api/nudges/active
interface ActiveNudge {
  id: number;
  variant: string;
  suggestedLevel: { id: string; title: string; skillTitle: string } | null;
}

// Record one step of the nudge funnel (shown → clicked | dismissed). Best-effort:
// a failed log must never block the student.
function track(id: number, action: 'shown' | 'clicked' | 'dismissed') {
  return api(`/api/nudges/${id}/${action}`, { method: 'POST' }).catch(() => undefined);
}

// The in-app intervention (PRD F5). When the weekly risk model moves a student
// INTO "at risk", this card offers an easy "confidence booster" level. It never
// says "at risk" to the student — the tone is a friendly invitation, not a label.
export function NudgeCard({ onPlay }: { onPlay: (levelId: string) => void }) {
  const { data } = useApi<{ nudge: ActiveNudge | null }>('/api/nudges/active');
  const [hidden, setHidden] = useState(false);
  const loggedShown = useRef<number | null>(null);
  const nudge = data?.nudge ?? null;

  // Log "shown" once per nudge, the first time it actually renders.
  useEffect(() => {
    if (nudge && loggedShown.current !== nudge.id) {
      loggedShown.current = nudge.id;
      void track(nudge.id, 'shown');
    }
  }, [nudge]);

  const level = nudge?.suggestedLevel;

  return (
    <AnimatePresence>
      {nudge && !hidden && (
        <motion.section
          aria-label="A quick win from your tutor"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="glass edge relative overflow-hidden rounded-3xl p-5 sm:p-6"
        >
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-aurora-teal/15 blur-3xl" />
          <button
            type="button"
            onClick={() => {
              setHidden(true);
              void track(nudge.id, 'dismissed');
            }}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-3 hover:text-content"
            aria-label="Not now"
            title="Not now"
          >
            <X size={16} aria-hidden />
          </button>

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <Nova mood="peek" size={64} />
            <div className="min-w-0 flex-1 pr-6">
              <p className="eyebrow text-success">Welcome back</p>
              <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight sm:text-2xl">
                Missed you! Fancy a quick win?
              </h2>
              <p className="mt-1.5 text-sm text-content-muted">
                {level
                  ? `I picked something you can finish in a few minutes: “${level.title}” from ${level.skillTitle}. Small wins rebuild momentum.`
                  : 'Pick up any level you like — even ten minutes keeps your skills warm.'}
              </p>
            </div>
            {level && (
              <Button
                className="shrink-0"
                onClick={() => {
                  setHidden(true);
                  void track(nudge.id, 'clicked');
                  onPlay(level.id);
                }}
              >
                Play it <ArrowRight size={16} aria-hidden />
              </Button>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
