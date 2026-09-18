import { useState } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { Crown, EyeOff, Trophy, Zap } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { cn } from '../lib/cn';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Button, ErrorState, GlassCard, PageHeader, Skeleton, rise, stagger } from '../ui/primitives';

// One row of GET /api/leaderboard.
interface Row {
  rank: number;
  name: string;
  xp: number;
  isYou: boolean;
}
interface Board {
  period: 'week' | 'all';
  top: Row[];
  you: Row | null;
  players: number;
}

type Period = 'week' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' },
];

// Podium styling for ranks 1–3 (gold, silver-ion, ember-bronze).
const PODIUM: Record<number, { ring: string; bar: string; height: string; text: string }> = {
  1: { ring: 'border-accent/60 shadow-glow-gold', bar: 'from-accent/35 to-accent/5', height: 'h-36', text: 'text-accent' },
  2: { ring: 'border-ion-soft/50', bar: 'from-ion/30 to-ion/5', height: 'h-28', text: 'text-ion-soft' },
  3: { ring: 'border-ember/50', bar: 'from-ember/30 to-ember/5', height: 'h-20', text: 'text-ember' },
};

// Two initials for a player's avatar ("Quester 7F2A" → "7F").
function initials(name: string): string {
  if (name.startsWith('Quester ')) return name.slice(8, 10);
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// THE LEADERBOARD (PRD F7): weekly XP (so newcomers can win a week) and all-time
// XP. Display names or anonymous handles only; anyone can hide in Settings.
export function LeaderboardScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [period, setPeriod] = useState<Period>('week');
  const { data, error, reload } = useApi<Board>(`/api/leaderboard?period=${period}`);

  const podium = data ? data.top.filter((r) => r.rank <= 3).slice(0, 3) : [];
  const rest = data ? data.top.slice(podium.length) : [];
  const youOutsideTop = data?.you && !data.top.some((r) => r.isYou) ? data.you : null;
  // Display order on the podium: 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter((r): r is Row => Boolean(r));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Leaderboard"
        title={
          <>
            Who’s on a <span className="text-gradient-ion">roll</span>
          </>
        }
        description="Ranked by XP. The weekly board resets every 7 days, so anyone can top it."
        actions={
          <LayoutGroup id="lb-period">
            <div role="tablist" aria-label="Period" className="flex rounded-full border border-white/[0.06] bg-surface/70 p-1">
              {PERIODS.map((p) => {
                const on = p.id === period;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPeriod(p.id)}
                    className={cn('relative h-9 rounded-full px-4 text-sm', on ? 'text-content' : 'text-content-muted')}
                  >
                    {on && (
                      <motion.span
                        layoutId="lb-pill"
                        className="absolute inset-0 rounded-full border border-ion/25 bg-ion-tint"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        }
      />

      {error && <ErrorState message="Could not load the leaderboard." onRetry={reload} />}
      {!error && !data && <Skeleton className="h-[480px] rounded-3xl" />}

      {data && data.top.length === 0 && (
        <GlassCard className="p-10 text-center">
          <Trophy size={32} className="mx-auto text-accent" aria-hidden />
          <p className="mt-4 font-display text-xl font-semibold">
            {period === 'week' ? 'No XP earned this week yet' : 'No one on the board yet'}
          </p>
          <p className="mt-2 text-sm text-content-muted">Solve a level and you’re on it.</p>
        </GlassCard>
      )}

      {data && data.top.length > 0 && (
        <motion.div key={period} initial="hidden" animate="show" variants={stagger} className="space-y-5">
          {/* ---- Podium ---- */}
          <motion.div variants={rise}>
            <GlassCard edge className="relative overflow-hidden px-4 pb-0 pt-8 sm:px-8">
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
              <ol className="relative flex items-end justify-center gap-3 sm:gap-6" aria-label="Top three">
                {podiumOrder.map((r, i) => {
                  const style = PODIUM[r.rank] ?? PODIUM[3]!;
                  return (
                    <li key={`${r.rank}-${r.name}`} className="flex w-28 flex-col items-center sm:w-36">
                      {r.rank === 1 && <Crown size={22} className="mb-1 text-accent" aria-hidden />}
                      <span
                        className={cn(
                          'grid h-14 w-14 place-items-center rounded-full border-2 bg-surface-2 font-display text-lg font-semibold sm:h-16 sm:w-16',
                          style.ring,
                          r.isYou && 'ring-2 ring-ion ring-offset-2 ring-offset-base',
                        )}
                        aria-hidden
                      >
                        {initials(r.name)}
                      </span>
                      <p className="mt-2 w-full truncate text-center text-sm font-medium">
                        {r.name}
                        {r.isYou && <span className="text-ion"> (you)</span>}
                      </p>
                      <p className="font-mono text-xs text-content-muted">
                        <AnimatedNumber value={r.xp} /> XP
                      </p>
                      <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 160, damping: 20 }}
                        style={{ transformOrigin: 'bottom' }}
                        className={cn(
                          'mt-3 grid w-full place-items-start justify-center rounded-t-2xl border border-b-0 border-white/[0.06] bg-gradient-to-b pt-3',
                          style.bar,
                          style.height,
                        )}
                      >
                        <span className={cn('font-display text-3xl font-semibold', style.text)}>{r.rank}</span>
                      </motion.div>
                    </li>
                  );
                })}
              </ol>
            </GlassCard>
          </motion.div>

          {/* ---- Everyone else ---- */}
          {rest.length > 0 && (
            <motion.div variants={rise}>
              <GlassCard className="overflow-hidden">
                <ol aria-label="Rankings">
                  {rest.map((r) => (
                    <PlayerRow key={`${r.rank}-${r.name}`} row={r} />
                  ))}
                </ol>
              </GlassCard>
            </motion.div>
          )}

          {/* ---- You, when outside the top 20 ---- */}
          {youOutsideTop && (
            <motion.div variants={rise}>
              <p className="eyebrow mb-2">Your position</p>
              <GlassCard className="overflow-hidden">
                <ol>
                  <PlayerRow row={youOutsideTop} />
                </ol>
              </GlassCard>
            </motion.div>
          )}

          <motion.div variants={rise} className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-content-muted">
            <span>
              {data.players} {data.players === 1 ? 'student' : 'students'} on the board ·{' '}
              {period === 'week' ? 'XP earned in the last 7 days (hints deducted)' : 'lifetime XP'}
            </span>
            <Button variant="subtle" size="sm" onClick={onOpenSettings}>
              <EyeOff size={14} aria-hidden /> Hide me from the leaderboard
            </Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// A ranked row. "You" is highlighted so you can find yourself at a glance.
function PlayerRow({ row }: { row: Row }) {
  return (
    <li
      className={cn(
        'flex items-center gap-4 border-b border-white/[0.04] px-5 py-3.5 last:border-b-0',
        row.isYou && 'bg-ion-tint/70',
      )}
    >
      <span className="w-8 text-right font-mono text-sm text-content-muted">{row.rank}</span>
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-2 text-xs font-semibold"
      >
        {initials(row.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {row.name}
        {row.isYou && <span className="text-ion"> (you)</span>}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-sm text-content">
        <Zap size={13} className="text-ion" aria-hidden />
        {row.xp.toLocaleString('en-IN')}
      </span>
    </li>
  );
}
