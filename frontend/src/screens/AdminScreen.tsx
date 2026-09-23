import { Fragment, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Download, FlaskConical, RefreshCw, Timer, Users, Zap, type LucideIcon } from 'lucide-react';
import { api, apiBlob } from '../lib/api';
import { invalidate, useApi } from '../lib/useApi';
import { DEMO } from '../lib/demo';
import { cn } from '../lib/cn';
import { Button, Chip, ErrorState, GlassCard, PageHeader, Skeleton, rise, stagger, type Tone } from '../ui/primitives';

// ---- API shapes -------------------------------------------------------------
type Tier = 'healthy' | 'watch' | 'atrisk';

interface Prediction {
  probability: number;
  tier: Tier;
  modelVersion: string;
  featureSetVersion: string;
  thresholdVersion: string;
  observationWindowStart: string;
  observationWindowEnd: string;
  scoredAt: string;
  features: Record<string, number>;
}

interface Student {
  participant: string;
  email: string;
  onboarded: boolean;
  research: 'consented' | 'withdrawn' | 'not asked';
  totalXp: number;
  levelsCompleted: number;
  currentStreak: number;
  lastActive: string | null;
  riskTier: Tier;
  prediction: Prediction | null;
  nudges: { total: number; shown: number; clicked: number; dismissed: number };
}

interface Metrics {
  api: { n: number; p50: number | null; p95: number | null };
  execution: { n: number; p50: number | null; p95: number | null };
  survey: { n: number; susMean: number | null; susSd: number | null; engagementMean: number | null; recommendPct: number | null };
  nudges: { created: number; shown: number; clicked: number; dismissed: number };
  riskTiers: Partial<Record<Tier, number>>;
}

// The PRD §6 targets the console measures against.
const TARGET_API_P95_MS = 500;
const TARGET_EXEC_P95_MS = 15_000;
const SUS_BENCHMARK = 68; // the published SUS average (Sauro & Lewis)
const UAT_TARGET = { min: 20, max: 30 };

const TIER: Record<Tier, { label: string; tone: Tone; bar: string }> = {
  healthy: { label: 'Healthy', tone: 'mint', bar: 'bg-success' },
  watch: { label: 'Watch', tone: 'gold', bar: 'bg-accent' },
  atrisk: { label: 'At risk', tone: 'rose', bar: 'bg-danger' },
};

const fmtMs = (ms: number | null) => (ms === null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const DAY_MS = 86_400_000;
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

// THE RESEARCH CONSOLE (admins only — PRD F5 "internal admin view" + §6 metrics):
// live success metrics against their targets, risk tiers and the nudge funnel,
// every student's latest prediction with the metadata to reproduce it, and
// pseudonymised CSV exports for the report.
export function AdminScreen() {
  const metrics = useApi<Metrics>('/api/admin/metrics');
  const overview = useApi<{ generatedAt: string; students: Student[] }>('/api/admin/overview');
  const [scoring, setScoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function runScoring() {
    setScoring(true);
    setNotice(null);
    try {
      const res = await api<{ scored: number; nudged: number; failed?: number }>('/api/admin/run-scoring', { method: 'POST' });
      // Students with under 28 days since onboarding aren't scored yet (too new to judge).
      setNotice(
        `Scored ${res.scored} students · ${res.nudged} new nudges` +
          (res.failed ? ` · ${res.failed} couldn't be scored (see the API log) — run it again.` : '.'),
      );
      invalidate('/api/admin');
      metrics.reload();
      overview.reload();
    } catch {
      setNotice('Scoring failed — is the AI service running?');
    } finally {
      setScoring(false);
    }
  }

  async function download(kind: 'survey' | 'risk' | 'progress') {
    try {
      const blob = await apiBlob(`/api/admin/export/${kind}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skillquest-${kind}-${new Date().toISOString().slice(0, 10)}${DEMO ? '-SAMPLE' : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice(`Could not export ${kind}.`);
    }
  }

  if (metrics.error || overview.error)
    return <ErrorState message="Could not load the research console (admins only)." onRetry={() => { metrics.reload(); overview.reload(); }} />;

  const m = metrics.data;
  const students = overview.data?.students;

  return (
    <div>
      <PageHeader
        eyebrow="Research console · team only"
        title="UAT & risk monitor"
        description="Live success metrics against the PRD targets, the dropout model’s latest predictions, and pseudonymised exports. Withdrawn students are excluded from every figure and export."
        actions={
          <Button variant="ghost" onClick={() => void runScoring()} disabled={scoring}>
            <RefreshCw size={16} aria-hidden className={cn(scoring && 'animate-spin')} />
            {scoring ? 'Scoring…' : 'Run scoring now'}
          </Button>
        }
      />

      {DEMO && (
        <p className="mb-6 rounded-2xl border border-ember/30 bg-ember-tint px-4 py-3 text-sm text-ember">
          <strong className="font-semibold">Demo mode · sample data.</strong> These are illustrative numbers, not
          measurements — never quote them in the report.
        </p>
      )}
      {notice && (
        <p role="status" className="mb-6 rounded-2xl border border-ion/25 bg-ion-tint px-4 py-3 text-sm text-ion">
          {notice}
        </p>
      )}

      {!m ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
          {/* ---- Success metrics vs targets ---- */}
          <motion.div variants={rise} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              icon={Zap}
              label="API latency p95"
              value={fmtMs(m.api.p95)}
              sub={`p50 ${fmtMs(m.api.p50)} · ${m.api.n} requests`}
              verdict={m.api.p95 === null ? null : m.api.p95 < TARGET_API_P95_MS}
              target="< 500 ms"
            />
            <MetricTile
              icon={Timer}
              label="Code execution p95"
              value={fmtMs(m.execution.p95)}
              sub={`p50 ${fmtMs(m.execution.p50)} · ${m.execution.n} runs`}
              verdict={m.execution.p95 === null ? null : m.execution.p95 < TARGET_EXEC_P95_MS}
              target="< 15 s"
            />
            <MetricTile
              icon={FlaskConical}
              label="SUS score"
              value={m.survey.susMean === null ? '—' : m.survey.susMean.toFixed(1)}
              sub={
                m.survey.susMean === null
                  ? 'No responses yet'
                  : `SD ${m.survey.susSd?.toFixed(1) ?? '—'} · benchmark ${SUS_BENCHMARK} = average`
              }
              verdict={m.survey.susMean === null ? null : m.survey.susMean >= SUS_BENCHMARK}
              target={`≥ ${SUS_BENCHMARK}`}
            />
            <MetricTile
              icon={Users}
              label="UAT responses"
              value={String(m.survey.n)}
              sub={
                m.survey.n === 0
                  ? 'Engagement and recommend appear here'
                  : `Engagement ${m.survey.engagementMean?.toFixed(1) ?? '—'}/5 · ${Math.round(m.survey.recommendPct ?? 0)}% would recommend`
              }
              verdict={m.survey.n >= UAT_TARGET.min ? true : null}
              target={`${UAT_TARGET.min}–${UAT_TARGET.max} students`}
            />
          </motion.div>

          {/* ---- Risk tiers + nudge funnel ---- */}
          <motion.div variants={rise} className="grid gap-5 lg:grid-cols-2">
            <GlassCard className="p-6">
              <p className="eyebrow">Risk tiers · latest weekly scoring</p>
              <TierBar tiers={m.riskTiers} />
            </GlassCard>
            <GlassCard className="p-6">
              <p className="eyebrow">Nudge funnel</p>
              <Funnel steps={[
                { label: 'Created', value: m.nudges.created },
                { label: 'Shown', value: m.nudges.shown },
                { label: 'Clicked', value: m.nudges.clicked },
                { label: 'Dismissed', value: m.nudges.dismissed },
              ]} />
              <p className="mt-3 text-xs text-content-muted">
                Interaction counts only — a pilot of this size cannot show that nudges reduce dropout (PRD §6).
              </p>
            </GlassCard>
          </motion.div>

          {/* ---- Exports ---- */}
          <motion.div variants={rise}>
            <GlassCard className="flex flex-wrap items-center gap-3 p-5">
              <p className="mr-auto text-sm text-content-muted">
                Pseudonymised CSV (participant codes only — no names, emails or USNs):
              </p>
              {(['survey', 'risk', 'progress'] as const).map((k) => (
                <Button key={k} variant="ghost" size="sm" onClick={() => void download(k)}>
                  <Download size={14} aria-hidden /> {k}.csv
                </Button>
              ))}
            </GlassCard>
          </motion.div>
        </motion.div>
      )}

      {/* ---- Students ---- */}
      <section className="mt-8" aria-labelledby="students-heading">
        <h2 id="students-heading" className="font-display text-2xl font-semibold tracking-tight">
          Students
        </h2>
        <p className="mt-1 text-sm text-content-muted">
          Select a row to see the exact features, window and versions behind its prediction.
        </p>
        {!students ? (
          <Skeleton className="mt-4 h-64 rounded-3xl" />
        ) : students.length === 0 ? (
          <GlassCard className="mt-4 p-8 text-center text-sm text-content-muted">No students yet.</GlassCard>
        ) : (
          <GlassCard className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/[0.06] text-xs uppercase tracking-wider text-content-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Participant</th>
                  <th scope="col" className="px-3 py-3 font-medium">Research</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">XP</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Levels</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Streak</th>
                  <th scope="col" className="px-3 py-3 font-medium">Last active</th>
                  <th scope="col" className="px-3 py-3 font-medium">Tier</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Risk score</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Nudges</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {students.map((s) => {
                  const isOpen = open === s.participant;
                  return (
                    <Fragment key={s.participant}>
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-surface-2/60',
                          isOpen && 'bg-surface-2/60',
                        )}
                        onClick={() => setOpen(isOpen ? null : s.participant)}
                      >
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            className="flex items-center gap-2 font-mono text-content"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(isOpen ? null : s.participant);
                            }}
                          >
                            <ChevronDown size={14} aria-hidden className={cn('transition-transform', isOpen && 'rotate-180')} />
                            {s.participant}
                          </button>
                          <span className="ml-6 block text-xs text-content-muted">{s.email}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone={s.research === 'consented' ? 'ion' : s.research === 'withdrawn' ? 'neutral' : 'ember'}>
                            {s.research}
                          </Chip>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">{s.totalXp.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-right font-mono">{s.levelsCompleted}</td>
                        <td className="px-3 py-3 text-right font-mono">{s.currentStreak}</td>
                        <td className="px-3 py-3 text-content-muted">{ago(s.lastActive)}</td>
                        <td className="px-3 py-3">
                          <Chip tone={TIER[s.riskTier].tone}>{TIER[s.riskTier].label}</Chip>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {s.prediction ? s.prediction.probability.toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-content-muted">
                          {s.nudges.total === 0 ? '—' : `${s.nudges.clicked}/${s.nudges.shown}/${s.nudges.total}`}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-white/[0.04] bg-base/40">
                          <td colSpan={9} className="px-5 py-4">
                            {s.prediction ? <PredictionDetail p={s.prediction} /> : (
                              <p className="text-sm text-content-muted">Not scored yet — run scoring once they’ve been active.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        )}
        <p className="mt-3 text-xs text-content-muted">Nudges column: clicked / shown / created.</p>
      </section>
    </div>
  );
}

// A summary metric with its target and a met / not met / not yet chip.
function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  verdict,
  target,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  verdict: boolean | null; // null = not enough data yet
  target: string;
}) {
  return (
    <GlassCard className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <Icon size={16} className="text-ion" aria-hidden />
      </div>
      <p className="mt-3 font-display text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-content-muted">{sub}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="font-mono text-[11px] text-content-muted">target {target}</span>
        <Chip tone={verdict === null ? 'neutral' : verdict ? 'mint' : 'rose'}>
          {verdict === null ? 'Not yet' : verdict ? 'Met' : 'Missed'}
        </Chip>
      </div>
    </GlassCard>
  );
}

// One stacked bar of healthy / watch / at-risk counts, with a legend.
function TierBar({ tiers }: { tiers: Partial<Record<Tier, number>> }) {
  const order: Tier[] = ['healthy', 'watch', 'atrisk'];
  const total = order.reduce((t, k) => t + (tiers[k] ?? 0), 0);
  return (
    <div className="mt-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {total > 0 &&
          order.map((k) => (
            <motion.span
              key={k}
              className={cn('h-full', TIER[k].bar)}
              initial={{ width: 0 }}
              animate={{ width: `${((tiers[k] ?? 0) / total) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          ))}
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3">
        {order.map((k) => (
          <li key={k}>
            <p className="font-display text-3xl font-semibold tabular-nums">{tiers[k] ?? 0}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-content-muted">
              <span className={cn('h-2 w-2 rounded-full', TIER[k].bar)} aria-hidden />
              {TIER[k].label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars for the nudge funnel, scaled to the first step.
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ul className="mt-4 space-y-2.5">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[80px_1fr_36px] items-center gap-3 text-sm">
          <span className="text-content-muted">{s.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-ion to-ion-soft"
              initial={{ width: 0 }}
              animate={{ width: `${(s.value / max) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </span>
          <span className="text-right font-mono tabular-nums">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

// Everything needed to reproduce one prediction (PRD F5 acceptance).
function PredictionDetail({ p }: { p: Prediction }) {
  return (
    <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="eyebrow mb-2">Features (observation window)</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-xs sm:grid-cols-3">
          {Object.entries(p.features).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-white/[0.04] py-1">
              <dt className="text-content-muted">{k}</dt>
              <dd className="text-content">{Number.isInteger(v) ? v : v.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="eyebrow mb-2">Provenance</p>
        <dl className="space-y-1 font-mono text-xs">
          {[
            ['model', p.modelVersion],
            ['feature set', p.featureSetVersion],
            ['thresholds', p.thresholdVersion],
            ['window', `${p.observationWindowStart.slice(0, 10)} → ${p.observationWindowEnd.slice(0, 10)}`],
            ['scored', new Date(p.scoredAt).toLocaleString('en-IN')],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-content-muted">{k}</dt>
              <dd className="text-content">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
