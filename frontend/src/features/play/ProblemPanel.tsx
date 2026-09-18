import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';
import { Lightbulb, Terminal } from 'lucide-react';
import type { LevelView } from './types';
import { QuestChest } from '../quest/QuestChest';
import { MasteryRing } from '../../ui/MasteryRing';

// The Problem side of the play screen: the sealed vault you're coding toward, the
// statement, worked examples, and hints. Hints are unlocked ON THE SERVER one at a
// time and each costs XP, so `level.hints` holds only the ones already paid for.
export function ProblemPanel({
  level,
  onRevealHint,
  revealing = false,
  hintError = null,
}: {
  level: LevelView;
  onRevealHint?: () => void;
  revealing?: boolean;
  hintError?: string | null;
}) {
  const hintCount = level.hintCount ?? level.hints.length; // total hints for the level
  const hintsShown = level.hints.length; // how many this student has unlocked
  const hintCost = level.hintCost ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      {/* The goal: break the vault's seal. */}
      <div className="glass edge relative flex items-center gap-4 overflow-hidden rounded-2xl p-4">
        <div aria-hidden className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-ion-glow/20 blur-2xl" />
        <QuestChest open={false} size={76} />
        <div className="relative min-w-0 flex-1">
          <p className="eyebrow text-ion">Sealed vault</p>
          <p className="mt-1 text-sm text-content">
            Pass every test to break the seal and claim{' '}
            <span className="font-semibold text-accent">+{level.xpReward} XP</span>.
          </p>
        </div>
        {typeof level.mastery === 'number' && (
          <div className="relative flex flex-col items-center gap-1">
            <MasteryRing value={level.mastery} size={56} stroke={4} tone="ion">
              <span className="font-mono text-[11px] text-content">{Math.round(level.mastery * 100)}%</span>
            </MasteryRing>
            <span className="text-[10px] text-content-muted">mastery</span>
          </div>
        )}
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{level.title}</h1>
        <p className="mt-1.5 text-sm text-content-muted">
          {level.skillTitle ? `${level.skillTitle} · ` : ''}Difficulty {level.difficulty} · {level.xpReward} XP
        </p>
      </div>

      <div className="md-prose">
        <ReactMarkdown>{level.statementMd}</ReactMarkdown>
      </div>

      {level.sampleTests.length > 0 && (
        <section aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="eyebrow mb-3 flex items-center gap-2">
            <Terminal size={13} aria-hidden /> Examples
          </h2>
          <div className="space-y-3">
            {level.sampleTests.map((t, i) => (
              <div
                key={i}
                className="grid overflow-hidden rounded-xl border border-line bg-base/60 font-mono text-[13px] sm:grid-cols-2"
              >
                <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-content-muted">Input</p>
                  <pre className="whitespace-pre-wrap text-content">{t.stdin.trim() || '(none)'}</pre>
                </div>
                <div className="p-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-content-muted">Output</p>
                  <pre className="whitespace-pre-wrap text-success">{t.expectedOutput}</pre>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hintCount > 0 && (
        <section aria-labelledby="hints-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="hints-heading" className="eyebrow flex items-center gap-2">
              <Lightbulb size={13} aria-hidden /> Hints
            </h2>
            <span className="font-mono text-[11px] text-content-muted">
              {hintsShown}/{hintCount}
            </span>
          </div>
          <ol className="space-y-2" aria-live="polite">
            <AnimatePresence initial={false}>
              {level.hints.map((hint, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-accent/20 bg-accent-tint/60 px-3.5 py-2.5 text-sm text-content">
                    <span className="mr-2 font-mono text-xs text-accent">{i + 1}</span>
                    {hint}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          {hintsShown < hintCount && onRevealHint && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={onRevealHint}
                disabled={revealing}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-line-strong px-3.5 text-sm text-content-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60"
              >
                <Lightbulb size={14} aria-hidden />
                {revealing ? 'Unlocking…' : hintsShown === 0 ? 'Stuck? Reveal a hint' : 'Reveal the next hint'}
                {hintCost > 0 && !revealing && (
                  <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ember">−{hintCost} XP</span>
                )}
              </button>
              {hintsShown === 0 && !level.completed && (
                <span className="text-xs text-content-muted">Solve with no hints to earn Code Master.</span>
              )}
            </div>
          )}
          {hintError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {hintError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
