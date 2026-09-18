import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Award, Brain, Briefcase, Code2, Flame, Orbit, Zap, type LucideIcon } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { cn } from '../lib/cn';
import { Constellation, ConstellationLegend } from '../features/constellation/Constellation';
import { buildBriefing, summarizePlan } from '../features/tutor/briefing';
import { badgeIcon } from '../features/badges/badgeIcons';
import type { RoadmapNode } from '../features/roadmap/types';
import { Button, ErrorState, GlassCard, Skeleton, rise, stagger } from '../ui/primitives';
import { MasteryRing } from '../ui/MasteryRing';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { Typewriter } from '../ui/Typewriter';
import { Nova, type NovaMood } from '../ui/Nova';

// The shape returned by GET /api/dashboard.
interface DashboardData {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  currentStreak: number;
  bestStreak: number;
  activeToday: boolean;
  badges: { id: string; title: string; icon: string | null; description: string }[];
  currentQuest: { skillId: string; title: string; levelId: string } | null;
}

// A time-of-day greeting for the tutor's status line.
function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// HOME: the tutor's briefing and your next quest, level progress, the live
// Knowledge Constellation, consistency, badges, and the placement tools.
export function DashboardScreen({
  onContinue,
  onViewRoadmap,
  onViewPlacement,
  onViewDsa,
}: {
  onContinue: (levelId: string) => void;
  onViewRoadmap: () => void;
  onViewPlacement: () => void;
  onViewDsa: () => void;
}) {
  const dash = useApi<DashboardData>('/api/dashboard');
  const roadmap = useApi<{ nodes?: RoadmapNode[] }>('/api/roadmap');
  // Nova thinks while the briefing "loads", talks while it types, then idles.
  const [novaMood, setNovaMood] = useState<NovaMood>('thinking');

  if (dash.error) return <ErrorState message="Could not load your dashboard." onRetry={dash.reload} />;
  if (!dash.data) return <DashboardSkeleton />;

  const data = dash.data;
  const quest = data.currentQuest;
  const planNodes = roadmap.data?.nodes;
  const nodes = Array.isArray(planNodes) && planNodes.length > 0 ? planNodes : null;
  const plan = nodes ? summarizePlan(nodes) : null;
  const briefing = buildBriefing(data, plan);
  const levelProgress = data.xpForNextLevel > 0 ? data.xpIntoLevel / data.xpForNextLevel : 0;

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-6">
      {/* ================= HERO: briefing + level ================= */}
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <motion.section variants={rise}>
          <GlassCard edge className="relative h-full overflow-hidden p-6 sm:p-9">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-ion-glow/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-aurora-teal/10 blur-3xl" />

            {/* Nova, the tutor — watches your cursor from the corner of the briefing. */}
            <div className="pointer-events-none absolute right-8 top-8 hidden sm:block lg:right-10 lg:top-10">
              <Nova mood={novaMood} size={116} />
            </div>

            <div className="relative">
              <p className="eyebrow flex items-center gap-2.5">
                <span className="sm:hidden">
                  <Nova mood={novaMood} size={26} />
                </span>
                <span className="live-dot hidden sm:inline-flex" aria-hidden />
                Tutor online · {greeting()}
              </p>

              {quest ? (
                <>
                  <p className="eyebrow mt-8 text-ion">Continue your quest</p>
                  <h1
                    tabIndex={-1}
                    className="mt-2 font-display text-5xl font-semibold leading-[0.98] tracking-tight outline-none sm:text-6xl"
                  >
                    <span className="text-gradient-ion">{quest.title}</span>
                  </h1>
                </>
              ) : (
                <h1 tabIndex={-1} className="mt-8 font-display text-5xl font-semibold tracking-tight outline-none">
                  Map complete
                </h1>
              )}

              {/* The tutor's briefing, streamed in like a live response. */}
              <Typewriter
                text={briefing}
                onPhase={(phase) => setNovaMood(phase === 'thinking' ? 'thinking' : phase === 'typing' ? 'talking' : 'idle')}
                className="mt-5 min-h-[5.25rem] max-w-xl text-[15px] leading-relaxed text-content-muted"
              />

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {quest && (
                  <Button size="lg" onClick={() => onContinue(quest.levelId)}>
                    Resume quest
                    <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={onViewRoadmap}>
                  <Orbit size={18} aria-hidden /> Open constellation
                </Button>
              </div>
            </div>
          </GlassCard>
        </motion.section>

        <motion.section variants={rise}>
          <GlassCard className="relative flex h-full flex-col items-center justify-center overflow-hidden p-6 text-center sm:p-8">
            <div
              aria-hidden
              className="dot-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]"
            />
            <p className="eyebrow relative">Level progress</p>
            <MasteryRing value={levelProgress} size={196} stroke={11} tone="gold" className="relative mt-5">
              <div aria-hidden>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-content-muted">Level</p>
                <p className="mt-1 font-display text-6xl font-semibold leading-none tracking-tight">{data.level}</p>
              </div>
              <span className="sr-only">Level {data.level}</span>
            </MasteryRing>
            <p className="relative mt-5 font-mono text-sm text-content">
              <AnimatedNumber value={data.xpIntoLevel} />
              <span className="text-content-muted"> / {data.xpForNextLevel} XP</span>
            </p>
            <p className="relative mt-1 text-xs text-content-muted">
              {data.xpForNextLevel - data.xpIntoLevel} XP until level {data.level + 1}
            </p>
            <p className="relative mt-5 inline-flex items-center gap-2 rounded-full border border-ion/20 bg-ion-tint px-3.5 py-1.5 text-sm text-ion">
              <Zap size={14} aria-hidden />
              <AnimatedNumber value={data.totalXp} /> total XP
            </p>
          </GlassCard>
        </motion.section>
      </div>

      {/* ================= KNOWLEDGE CONSTELLATION ================= */}
      <motion.section variants={rise}>
        <GlassCard className="overflow-hidden p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Knowledge model</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Your skill constellation
              </h2>
              <p className="mt-1.5 max-w-xl text-sm text-content-muted">
                Each star is a skill. It glows brighter as the tutor grows confident you’ve mastered it —
                re-estimated after every attempt.
              </p>
            </div>
            <Button variant="subtle" size="sm" onClick={onViewRoadmap}>
              Explore the map <ArrowRight size={15} aria-hidden />
            </Button>
          </div>

          <div className="dot-grid mt-5 rounded-2xl">
            {nodes ? (
              <Constellation nodes={nodes} compact onSelectSkill={(id) => onContinue(`${id}-01`)} />
            ) : roadmap.loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <p className="py-16 text-center text-sm text-content-muted">
                Your constellation appears once your roadmap is built.
              </p>
            )}
          </div>
          <ConstellationLegend className="mt-4" />
        </GlassCard>
      </motion.section>

      {/* ================= STATS ================= */}
      <motion.div variants={rise} className="grid gap-6 md:grid-cols-3">
        {/* Mastery */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Skills completed</p>
            <Brain size={16} className="text-ion" aria-hidden />
          </div>
          {plan ? (
            <>
              <p className="mt-4 font-display text-5xl font-semibold tracking-tight">
                {plan.completed}
                <span className="text-2xl text-content-muted"> / {plan.total}</span>
              </p>
              <div className="mt-4 flex gap-1" aria-hidden>
                {Array.from({ length: plan.total }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      i < plan.completed
                        ? 'bg-gradient-to-r from-success to-ion'
                        : i === plan.completed && plan.frontier
                          ? 'animate-pulse-dot bg-ion/60'
                          : 'bg-surface-3',
                    )}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-content-muted">
                {plan.testedOut > 0
                  ? `Includes ${plan.testedOut} tested out in your quiz`
                  : 'Completed = every level of the skill passed'}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-content-muted">Build your roadmap to start tracking mastery.</p>
          )}
        </GlassCard>

        {/* Consistency */}
        <GlassCard className="relative overflow-hidden p-6">
          {data.activeToday && (
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-2xl" />
          )}
          <div className="relative flex items-center justify-between">
            <p className="eyebrow">Consistency</p>
            <Flame size={16} className={data.activeToday ? 'text-accent' : 'text-content-muted'} aria-hidden />
          </div>
          <p className="relative mt-4 font-display text-3xl font-semibold tracking-tight">
            {data.currentStreak}-day streak
          </p>
          <WeekDots streak={data.currentStreak} activeToday={data.activeToday} />
          <p className="relative mt-3 text-xs text-content-muted">
            {data.activeToday ? 'Active today — nicely done.' : 'Solve anything today to keep it alive.'} Best:{' '}
            {data.bestStreak} days
          </p>
        </GlassCard>

        {/* Badges */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Badges</p>
            <Award size={16} className="text-accent" aria-hidden />
          </div>
          {data.badges.length === 0 ? (
            <p className="mt-4 text-sm text-content-muted">No badges yet — complete a level to earn your first.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {data.badges.map((b) => {
                const Icon = badgeIcon(b.id);
                return (
                  <li key={b.id} title={b.description} className="group flex flex-col items-center gap-2 text-center">
                    <span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-gradient-to-b from-accent-tint to-surface-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 ease-spring group-hover:-translate-y-1 group-hover:-rotate-6">
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_0%,rgba(255,197,61,0.35),transparent_70%)]"
                      />
                      <Icon size={22} className="relative text-accent" aria-hidden />
                    </span>
                    <span className="text-xs leading-tight text-content">{b.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </motion.div>

      {/* ================= PLACEMENT TOOLS ================= */}
      <motion.div variants={rise} className="grid gap-6 md:grid-cols-2">
        <ActionCard
          icon={Briefcase}
          tone="ion"
          eyebrow="Placement readiness"
          title="How ready are you for Infosys, TCS & more?"
          body="Coverage of each company’s published requirements — and the exact skills to close the gap."
          onClick={onViewPlacement}
        />
        <ActionCard
          icon={Code2}
          tone="gold"
          eyebrow="Company DSA prep"
          title="Practise what they actually ask"
          body="The most-asked interview questions for 10 companies, ranked by how often they appear."
          onClick={onViewDsa}
        />
      </motion.div>
    </motion.div>
  );
}

// The last seven days as flame dots. The streak ends today if the student was
// active today, otherwise yesterday (today is still open, shown dashed).
function WeekDots({ streak, activeToday }: { streak: number; activeToday: boolean }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
  const litUntil = activeToday ? 6 : 5;
  const litFrom = litUntil - Math.min(streak, litUntil + 1) + 1;

  return (
    <ol className="relative mt-5 grid grid-cols-7 gap-2" aria-label={`Last 7 days: ${Math.min(streak, 7)} active`}>
      {days.map((d, i) => {
        const lit = i >= litFrom && i <= litUntil;
        const isToday = i === 6;
        return (
          <li key={i} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full border',
                lit
                  ? 'border-accent/40 bg-gradient-to-b from-[#FFDD85] to-accent text-ink shadow-[0_0_14px_-2px_rgba(255,197,61,0.7)]'
                  : isToday
                    ? 'border-dashed border-accent/50'
                    : 'border-line bg-surface-2',
              )}
            >
              {lit && <Flame size={13} />}
            </span>
            <span aria-hidden className="font-mono text-[10px] uppercase text-content-muted">
              {d.toLocaleDateString('en-IN', { weekday: 'narrow' })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// A large, clickable glass card that links to a tool.
function ActionCard({
  icon: Icon,
  tone,
  eyebrow,
  title,
  body,
  onClick,
}: {
  icon: LucideIcon;
  tone: 'ion' | 'gold';
  eyebrow: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass group relative w-full overflow-hidden rounded-3xl p-6 text-left transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-ion/25 hover:shadow-glow-ion sm:p-7"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          tone === 'gold' ? 'bg-accent/15' : 'bg-ion-glow/20',
        )}
      />
      <span
        className={cn(
          'relative grid h-11 w-11 place-items-center rounded-xl border',
          tone === 'gold' ? 'border-accent/30 bg-accent-tint text-accent' : 'border-ion/25 bg-ion-tint text-ion',
        )}
      >
        <Icon size={20} aria-hidden />
      </span>
      <span className="eyebrow relative mt-5 block">{eyebrow}</span>
      <span className="relative mt-2 block font-display text-xl font-semibold tracking-tight">{title}</span>
      <span className="relative mt-1.5 block text-sm text-content-muted">{body}</span>
      <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-ion">
        Open
        <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </button>
  );
}

// Loading state: skeletons in the exact shape of the dashboard (UI doc §8).
function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <Skeleton className="h-[340px] rounded-3xl" />
        <Skeleton className="h-[340px] rounded-3xl" />
      </div>
      <Skeleton className="h-[380px] rounded-3xl" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </div>
  );
}
