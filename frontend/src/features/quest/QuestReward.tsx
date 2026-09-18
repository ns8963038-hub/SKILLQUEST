import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Nova } from '../../ui/Nova';
import { QuestChest } from './QuestChest';
import { badgeIcon } from '../badges/badgeIcons';
import { AnimatedNumber } from '../../ui/AnimatedNumber';
import { Button } from '../../ui/primitives';
import type { MasteryUpdate } from '../play/types';

interface RewardBadge {
  id: string;
  title: string;
  icon: string | null;
}

// The payoff when the student's code passes: the vault's seal breaks, gold light
// and confetti burst out, XP counts up, and — the AI moment — the tutor shows how
// this solve moved its mastery estimate. Any new badges pop in last.
export function QuestReward({
  xp,
  badges = [],
  mastery,
  onContinue,
  onBackToMap,
}: {
  xp: number;
  badges?: RewardBadge[];
  mastery?: MasteryUpdate;
  onContinue: () => void;
  onBackToMap?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  // Latest close handler, so the timers below never restart on a parent re-render.
  const closeRef = useRef(onContinue);
  closeRef.current = onContinue;

  useEffect(() => {
    // Beat 1: break the seal. Beat 2: confetti from the centre and both sides.
    const openTimer = setTimeout(() => setOpen(true), 380);
    const burstTimer = setTimeout(() => {
      const colors = ['#FFC53D', '#FFE08A', '#7FA8FF', '#45E0A0', '#EEF2FF'];
      confetti({ particleCount: 90, spread: 70, startVelocity: 42, origin: { y: 0.42 }, colors, scalar: 0.9, disableForReducedMotion: true });
      confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors, disableForReducedMotion: true });
    }, 760);

    // Focus goes into the dialog; Escape closes it (UI doc §9: modals).
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(burstTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Keep Tab focus inside the dialog.
  const trapFocus = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const before = mastery ? Math.round(mastery.before * 100) : 0;
  const after = mastery ? Math.round(mastery.after * 100) : 0;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reward-title"
      onKeyDown={trapFocus}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
    >
      <div aria-hidden className="absolute inset-0 bg-base/80 backdrop-blur-md" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,197,61,0.22),rgba(77,124,255,0.12)_40%,transparent_70%)]"
      />

      <motion.div
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="glass edge relative w-full max-w-md overflow-hidden rounded-[28px] p-7 text-center sm:p-8"
      >
        <div className="flex justify-center">
          <QuestChest open={open} size={184} />
        </div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="eyebrow mt-2 text-accent"
        >
          Seal broken
        </motion.p>
        <motion.h2
          id="reward-title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58 }}
          className="mt-2 font-display text-4xl font-semibold tracking-tight"
        >
          Treasure unlocked
        </motion.h2>
        <p className="mt-2 text-sm text-content-muted">Your code passed every test.</p>

        {xp > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, type: 'spring', stiffness: 300, damping: 18 }}
            className="mx-auto mt-5 inline-flex items-baseline gap-1 rounded-2xl border border-accent/30 bg-accent-tint px-5 py-2.5 font-display text-3xl font-semibold text-accent shadow-glow-gold"
          >
            <span aria-hidden>+</span>
            <AnimatedNumber value={xp} />
            <span className="text-lg">XP</span>
          </motion.div>
        )}

        {/* The adaptive tutor's update: how this solve moved the mastery estimate. */}
        {mastery && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="mt-6 rounded-2xl border border-ion/20 bg-ion-tint/60 p-4 text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-content">
                <Nova mood="happy" size={30} className="-my-1.5" />
                <span className="truncate">Tutor update · {mastery.title}</span>
              </p>
              <span className="shrink-0 font-mono text-sm text-ion">
                {before}% → <AnimatedNumber value={after} initial={before} duration={1.4} />%
              </span>
            </div>
            <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="absolute inset-y-0 left-0 rounded-full bg-ion/35" style={{ width: `${before}%` }} />
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ion to-success shadow-[0_0_12px_rgba(69,224,160,0.6)]"
                initial={{ width: `${before}%` }}
                animate={{ width: `${after}%` }}
                transition={{ delay: 1.2, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              />
              {/* The mastery threshold (95%). */}
              <span aria-hidden className="absolute inset-y-0 w-px bg-content/70" style={{ left: '95%' }} />
            </div>
            <p className="mt-2 text-xs text-content-muted">
              {mastery.mastered
                ? `${mastery.title} mastered — the next skill on your map is unlocked.`
                : 'Bayesian Knowledge Tracing raised its estimate after this solve. The line marks mastery.'}
            </p>
          </motion.div>
        )}

        {badges.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {badges.map((b, i) => {
              const Icon = badgeIcon(b.id);
              return (
                <motion.span
                  key={b.id}
                  initial={{ opacity: 0, scale: 0.5, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ delay: 1.3 + i * 0.12, type: 'spring', stiffness: 320, damping: 16 }}
                  className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-tint px-3.5 py-1.5 text-sm text-content"
                >
                  <Icon size={15} className="text-accent" aria-hidden />
                  New badge: {b.title}
                </motion.span>
              );
            })}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button ref={continueRef} variant="gold" size="lg" onClick={onContinue}>
            Continue <ArrowRight size={17} aria-hidden />
          </Button>
          {onBackToMap && (
            <Button variant="ghost" size="lg" onClick={onBackToMap}>
              Back to map
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
