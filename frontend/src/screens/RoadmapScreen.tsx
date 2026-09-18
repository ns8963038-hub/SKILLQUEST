import { useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, CircleDot, Lock, Play, Sparkles } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { cn } from '../lib/cn';
import { Constellation, ConstellationLegend } from '../features/constellation/Constellation';
import { summarizePlan } from '../features/tutor/briefing';
import type { RoadmapNode } from '../features/roadmap/types';
import { Chip, ErrorState, GlassCard, PageHeader, Skeleton, rise, stagger } from '../ui/primitives';

// The roadmap as the full Knowledge Constellation (the tutor's live model of the
// student), plus the same plan laid out week by week — a readable, keyboard- and
// screen-reader-friendly companion to the star map.
export function RoadmapScreen({ onOpenLevel }: { onOpenLevel: (levelId: string) => void }) {
  const { data, error, reload } = useApi<{ nodes: RoadmapNode[] }>('/api/roadmap');
  const nodes = data?.nodes ?? null;

  const plan = useMemo(() => (nodes && nodes.length > 0 ? summarizePlan(nodes) : null), [nodes]);

  // Group the plan by week, in order.
  const weeks = useMemo(() => {
    const byWeek = new Map<number, RoadmapNode[]>();
    for (const n of [...(nodes ?? [])].sort((a, b) => a.weekNumber - b.weekNumber || a.position - b.position)) {
      byWeek.set(n.weekNumber, [...(byWeek.get(n.weekNumber) ?? []), n]);
    }
    return [...byWeek.entries()];
  }, [nodes]);

  return (
    <div>
      <PageHeader
        eyebrow="Adaptive roadmap"
        title={
          <>
            Your skill <span className="text-gradient-ion">constellation</span>
          </>
        }
        description="The tutor’s live model of what you know. Lines are prerequisites; brightness is mastery. It re-plans as you learn — select any lit star to practise."
        actions={
          plan && (
            <>
              <Chip tone="mint">
                <CheckCircle2 size={13} aria-hidden />
                {plan.completed} of {plan.total} completed
              </Chip>
              {plan.frontier && (
                <Chip tone="ion">
                  <Sparkles size={13} aria-hidden />
                  Frontier: {plan.frontier.title}
                </Chip>
              )}
            </>
          )
        }
      />

      {error && <ErrorState message="Could not load your roadmap." onRetry={reload} />}
      {!error && !nodes && <Skeleton className="h-[480px] w-full rounded-3xl" />}

      {nodes && nodes.length === 0 && (
        <GlassCard className="p-10 text-center">
          <p className="font-display text-xl font-semibold">No roadmap yet</p>
          <p className="mt-2 text-sm text-content-muted">Finish onboarding and the tutor will plot your path.</p>
        </GlassCard>
      )}

      {nodes && nodes.length > 0 && (
        <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-8">
          <motion.div variants={rise}>
            <GlassCard edge className="overflow-hidden p-4 sm:p-6">
              <div className="dot-grid rounded-2xl">
                <Constellation nodes={nodes} onSelectSkill={(id) => onOpenLevel(`${id}-01`)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
                <ConstellationLegend />
                <p className="text-xs text-content-muted md:hidden">Scroll sideways to see the whole map</p>
              </div>
            </GlassCard>
          </motion.div>

          <motion.section variants={rise} aria-labelledby="plan-heading">
            <p className="eyebrow">Week by week</p>
            <h2 id="plan-heading" className="mt-2 font-display text-2xl font-semibold tracking-tight">
              Your plan
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {weeks.map(([week, items]) => (
                <GlassCard key={week} className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-content-muted">Week {week}</p>
                    <span className="font-mono text-xs text-content-muted">
                      {items.filter((i) => i.status === 'completed').length}/{items.length} done
                    </span>
                  </div>
                  <ul className="mt-4 space-y-1.5">
                    {items.map((n) => (
                      <PlanRow key={n.skillId} node={n} onPlay={() => onOpenLevel(`${n.skillId}-01`)} />
                    ))}
                  </ul>
                </GlassCard>
              ))}
            </div>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}

// One skill in the weekly plan. Status is carried by icon AND text, never colour alone.
function PlanRow({ node, onPlay }: { node: RoadmapNode; onPlay: () => void }) {
  const locked = node.status === 'locked';
  const pct = typeof node.mastery === 'number' ? Math.round(node.mastery * 100) : null;
  const Icon =
    node.status === 'completed' ? CheckCircle2 : node.status === 'current' ? CircleDot : locked ? Lock : Play;

  return (
    <li>
      <button
        type="button"
        disabled={locked}
        onClick={onPlay}
        className={cn(
          'group flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
          node.status === 'current'
            ? 'border-ion/30 bg-ion-tint'
            : 'border-transparent hover:border-line hover:bg-surface-3/70',
          locked && 'cursor-not-allowed opacity-60',
        )}
      >
        <Icon
          size={17}
          aria-hidden
          className={cn(
            'shrink-0',
            node.status === 'completed' ? 'text-success' : node.status === 'current' ? 'text-ion' : 'text-content-muted',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{node.title}</span>
          {pct !== null && !locked && (
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className={cn(
                  'block h-full rounded-full',
                  node.status === 'completed' ? 'bg-success' : 'bg-gradient-to-r from-ion to-ion-soft',
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-xs text-content-muted">
          {locked ? 'Locked' : pct !== null ? `${pct}%` : node.status === 'completed' ? 'Done' : 'Play'}
        </span>
      </button>
    </li>
  );
}
