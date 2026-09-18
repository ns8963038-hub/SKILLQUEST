import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Code2, ExternalLink } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { Button, Chip, ErrorState, GlassCard, PageHeader, Skeleton, rise, stagger } from '../ui/primitives';
import { MasteryRing } from '../ui/MasteryRing';
import { AnimatedNumber } from '../ui/AnimatedNumber';

// One role's coverage, as returned by GET /api/placement.
interface PlacementRole {
  companyId: string;
  companyName: string;
  roleTitle: string;
  sourceUrl: string;
  collectedOn: string;
  score: number;
  missingAvailableNow: { skillId: string; title: string }[];
  missingExternal: string[];
}

// Placement readiness (F6). Deliberately framed as COVERAGE of published role
// requirements, NOT a hiring prediction. Gaps SkillQuest teaches get a one-click
// "train" action; gaps it doesn't teach are shown as information only.
export function PlacementScreen({
  onOpenLevel,
  onOpenDsa,
}: {
  onOpenLevel: (levelId: string) => void;
  onOpenDsa: (companyId: string) => void;
}) {
  const { data, error, reload } = useApi<{ roles: PlacementRole[] }>('/api/placement');
  const roles = data ? [...data.roles].sort((a, b) => b.score - a.score) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Placement readiness"
        title={
          <>
            How ready are you for <span className="text-gradient-ion">the companies you want?</span>
          </>
        }
        description={
          <>
            Coverage of each company’s published role requirements, based on the skills you’ve mastered.{' '}
            <strong className="font-medium text-content">Not a hiring prediction</strong> — a map of what to
            learn next.
          </>
        }
      />

      {error && <ErrorState message="Could not load placement readiness." onRetry={reload} />}

      {!error && !roles && (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 rounded-3xl" />
          ))}
        </div>
      )}

      {roles && roles.length === 0 && (
        <GlassCard className="p-10 text-center">
          <p className="font-display text-xl font-semibold">No target companies yet</p>
          <p className="mt-2 text-sm text-content-muted">Pick target companies during onboarding to track them here.</p>
        </GlassCard>
      )}

      {roles && roles.length > 0 && (
        <motion.div initial="hidden" animate="show" variants={stagger} className="grid gap-5 md:grid-cols-2">
          {roles.map((role, i) => (
            <motion.div key={`${role.companyId}-${role.roleTitle}`} variants={rise}>
              <RoleCard role={role} top={i === 0} onOpenLevel={onOpenLevel} onOpenDsa={onOpenDsa} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function RoleCard({
  role,
  top,
  onOpenLevel,
  onOpenDsa,
}: {
  role: PlacementRole;
  top: boolean;
  onOpenLevel: (levelId: string) => void;
  onOpenDsa: (companyId: string) => void;
}) {
  const tone = role.score >= 70 ? 'mint' : role.score >= 50 ? 'ion' : 'gold';
  const allCovered = role.missingAvailableNow.length === 0 && role.missingExternal.length === 0;

  return (
    <GlassCard edge={top} className="flex h-full flex-col p-6">
      <div className="flex-1">
        <div className="flex items-start gap-5">
          <MasteryRing value={role.score / 100} size={92} stroke={7} tone={tone}>
            <span className="font-display text-2xl font-semibold tracking-tight">
              <AnimatedNumber value={role.score} />%
            </span>
          </MasteryRing>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight">{role.companyName}</h2>
              {top && <Chip tone="mint">Closest match</Chip>}
            </div>
            <p className="mt-0.5 text-sm text-content-muted">{role.roleTitle}</p>
            <p className="mt-2 text-xs text-content-muted">of tracked requirements covered</p>
          </div>
        </div>

        {/* Gaps SkillQuest teaches — one click to train. */}
        {role.missingAvailableNow.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow mb-2.5">Train these now</p>
            <div className="flex flex-wrap gap-2">
              {role.missingAvailableNow.map((s) => (
                <button
                  key={s.skillId}
                  type="button"
                  onClick={() => onOpenLevel(`${s.skillId}-01`)}
                  className="group inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-ion/30 bg-ion-tint px-3 text-sm text-ion transition-shadow hover:shadow-glow-ion"
                >
                  {s.title}
                  <ArrowRight size={13} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gaps it doesn't teach — informational. */}
        {role.missingExternal.length > 0 && (
          <div className="mt-5">
            <p className="eyebrow mb-2.5">Also required · not on SkillQuest yet</p>
            <div className="flex flex-wrap gap-2">
              {role.missingExternal.map((name) => (
                <Chip key={name}>{name}</Chip>
              ))}
            </div>
          </div>
        )}

        {allCovered && (
          <p className="mt-6 flex items-center gap-2 text-sm text-success">
            <CheckCircle2 size={16} aria-hidden /> Every tracked requirement is covered.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
        <Button variant="subtle" size="sm" onClick={() => onOpenDsa(role.companyId)}>
          <Code2 size={15} aria-hidden /> Practise {role.companyName}’s DSA questions
        </Button>
        <a
          href={role.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-content-muted transition-colors hover:text-content"
        >
          Source <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </GlassCard>
  );
}
