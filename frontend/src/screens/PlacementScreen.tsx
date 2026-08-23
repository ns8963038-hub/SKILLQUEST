import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

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

// The placement-readiness screen (F6). Deliberately framed as "tracked-skill
// coverage", NOT a hiring prediction. Gaps we teach get a "Train this" action;
// gaps we don't teach are shown as information only.
export function PlacementScreen({
  onBack,
  onOpenLevel,
}: {
  onBack: () => void;
  onOpenLevel: (levelId: string) => void;
}) {
  const [roles, setRoles] = useState<PlacementRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ roles: PlacementRole[] }>('/api/placement')
      .then((r) => setRoles(r.roles))
      .catch(() => setError('Could not load placement readiness.'));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-8">
        <button type="button" onClick={onBack} className="min-h-[44px] text-sm text-primary-fg hover:underline">
          ← Dashboard
        </button>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="min-h-[44px] text-sm text-content-muted hover:text-content"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
        <div>
          <h1 className="text-2xl font-bold">Placement Readiness</h1>
          <p className="mt-1 text-sm text-content-muted">
            How much of each company&apos;s published role requirements you currently cover. Based on
            public job descriptions represented in SkillQuest — <strong>not a hiring prediction</strong>.
          </p>
        </div>

        {error && <p role="alert" className="text-danger">{error}</p>}
        {!error && !roles && <p className="text-content-muted">Loading…</p>}

        {roles?.map((r) => (
          <div key={`${r.companyId}-${r.roleTitle}`} className="rounded-xl border border-line bg-surface p-5">
            {/* Company + coverage % */}
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-semibold">{r.companyName}</p>
                <p className="text-xs text-content-muted">{r.roleTitle}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-primary-fg">{r.score}%</span>
                <p className="text-xs text-content-muted">covered</p>
              </div>
            </div>

            {/* Coverage bar */}
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary-fg transition-all" style={{ width: `${r.score}%` }} />
            </div>

            {/* Gaps we teach — each links to training. */}
            {r.missingAvailableNow.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Train these now
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.missingAvailableNow.map((s) => (
                    <button
                      key={s.skillId}
                      type="button"
                      onClick={() => onOpenLevel(`${s.skillId}-01`)}
                      className="min-h-[36px] rounded-full border border-primary-fg px-3 py-1 text-sm text-primary-fg hover:bg-surface-2"
                    >
                      {s.title} →
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Gaps we don't teach — informational, no action. */}
            {r.missingExternal.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Also required (not on SkillQuest yet)
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.missingExternal.map((name) => (
                    <span
                      key={name}
                      className="rounded-full border border-line px-3 py-1 text-sm text-content-muted"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-xs text-content-muted hover:text-content"
            >
              Source: {r.sourceUrl} ↗
            </a>
          </div>
        ))}
      </main>
    </div>
  );
}
