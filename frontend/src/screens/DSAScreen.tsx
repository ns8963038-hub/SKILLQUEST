import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Search } from 'lucide-react';
import problemData from '../features/dsa/companyProblems.json';
import { cn } from '../lib/cn';
import { Chip, GlassCard, PageHeader, rise, stagger, type Tone } from '../ui/primitives';

// A curated index of the LeetCode problems each company asks (title + link +
// difficulty + how often it's asked). This is a PREP INDEX — problems are solved on
// LeetCode; SkillQuest links out. It is NOT part of the in-game play loop (we don't
// have LeetCode's test cases).

interface Problem {
  title: string;
  url: string;
  difficulty: string;
  frequency: number;
}
interface Company {
  id: string;
  name: string;
  kind: 'service' | 'product';
  problems: Problem[];
}

const DATA = problemData as { source: string; snapshot: string; companies: Company[] };
const COMPANIES = DATA.companies;

type Filter = 'All' | 'Easy' | 'Medium' | 'Hard';
const FILTERS: Filter[] = ['All', 'Easy', 'Medium', 'Hard'];

// Difficulty -> tone. The difficulty is always written out too, not colour alone.
const DIFF_TONE: Record<string, Tone> = { Easy: 'mint', Medium: 'gold', Hard: 'rose' };
const FILTER_ACTIVE: Record<Filter, string> = {
  All: 'border-ion/30 bg-ion-tint text-ion',
  Easy: 'border-success/30 bg-success-tint text-success',
  Medium: 'border-accent/30 bg-accent-tint text-accent',
  Hard: 'border-danger/30 bg-danger-tint text-danger',
};

export function DSAScreen({ initialCompany }: { initialCompany?: string }) {
  const [companyId, setCompanyId] = useState(initialCompany ?? COMPANIES[0]?.id ?? '');
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const company = COMPANIES.find((c) => c.id === companyId) ?? COMPANIES[0];

  // How many problems each difficulty has, for the filter badges.
  const counts = useMemo(() => {
    const list = company?.problems ?? [];
    return {
      All: list.length,
      Easy: list.filter((p) => p.difficulty === 'Easy').length,
      Medium: list.filter((p) => p.difficulty === 'Medium').length,
      Hard: list.filter((p) => p.difficulty === 'Hard').length,
    } satisfies Record<Filter, number>;
  }, [company]);

  const problems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (company?.problems ?? []).filter(
      (p) => (filter === 'All' || p.difficulty === filter) && (!q || p.title.toLowerCase().includes(q)),
    );
  }, [company, filter, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Company DSA prep"
        title={
          <>
            Practise what <span className="text-gradient-ion">they actually ask</span>
          </>
        }
        description="The most-asked LeetCode questions for each company, ranked by how often they appear in real interviews. Each problem opens on LeetCode."
      />

      <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
        {/* ---- Company + filters ---- */}
        <motion.div variants={rise}>
          <GlassCard className="p-4 sm:p-5">
            <div className="space-y-3">
              {(['service', 'product'] as const).map((kind) => (
                <div key={kind} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <p className="eyebrow w-24 shrink-0">{kind === 'service' ? 'Service' : 'Product'}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`${kind} companies`}>
                    {COMPANIES.filter((c) => c.kind === kind).map((c) => {
                      const on = c.id === company?.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setCompanyId(c.id)}
                          className={cn(
                            'relative min-h-[38px] rounded-full px-4 text-sm transition-colors',
                            on
                              ? 'text-ink'
                              : 'border border-line bg-surface-2/60 text-content-muted hover:border-ion/30 hover:text-content',
                          )}
                        >
                          {on && (
                            <motion.span
                              layoutId="company-pill"
                              className="absolute inset-0 rounded-full bg-gradient-to-b from-ion-soft to-ion shadow-[0_8px_24px_-10px_rgba(77,124,255,0.9)]"
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            />
                          )}
                          <span className="relative font-medium">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.05] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3.5 text-sm transition-colors',
                      filter === f ? FILTER_ACTIVE[f] : 'border-line bg-surface-2/40 text-content-muted hover:text-content',
                    )}
                  >
                    {f}
                    <span className="font-mono text-[11px] opacity-80">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <label className="relative block sm:w-64">
                <span className="sr-only">Search problems</span>
                <Search
                  size={15}
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search problems"
                  className="min-h-[40px] w-full rounded-full border border-line-strong bg-base/60 pl-10 pr-4 text-sm text-content placeholder:text-content-muted transition-[border-color,box-shadow] focus:border-ion/60 focus:shadow-[0_0_0_4px_rgba(127,168,255,0.14)] focus:outline-none focus-visible:outline-none"
                />
              </label>
            </div>
          </GlassCard>
        </motion.div>

        {/* ---- Problem list ---- */}
        <motion.div variants={rise}>
          <GlassCard className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3.5">
              <p className="text-sm">
                <span className="font-medium text-content">{company?.name}</span>
                <span className="text-content-muted"> · {problems.length} problems</span>
              </p>
              <p className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-content-muted sm:block">
                How often asked
              </p>
            </div>
            {/* Numbered because the list is a ranking: most-asked first. */}
            <ol key={`${company?.id}-${filter}`} className="divide-y divide-white/[0.04]">
              {problems.map((p, i) => (
                <motion.li
                  key={p.url}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.025 }}
                >
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-[56px] items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-3/60"
                  >
                    <span className="w-6 shrink-0 font-mono text-xs text-content-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-content transition-colors group-hover:text-ion-soft">
                      {p.title}
                    </span>
                    <Chip tone={DIFF_TONE[p.difficulty] ?? 'neutral'} className="shrink-0">
                      {p.difficulty}
                    </Chip>
                    <span className="hidden w-28 shrink-0 items-center gap-2 sm:flex">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-ion to-ion-soft"
                          style={{ width: `${Math.min(100, p.frequency)}%` }}
                        />
                      </span>
                      <span className="w-9 text-right font-mono text-[11px] text-content-muted">
                        {Math.round(p.frequency)}%
                      </span>
                    </span>
                    <ExternalLink
                      size={14}
                      aria-hidden
                      className="shrink-0 text-content-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ion"
                    />
                  </a>
                </motion.li>
              ))}
              {problems.length === 0 && (
                <li className="px-5 py-12 text-center text-sm text-content-muted">
                  No problems match — try another filter or search.
                </li>
              )}
            </ol>
          </GlassCard>
        </motion.div>

        {/* Attribution — aggregated LeetCode metadata. */}
        <p className="text-xs text-content-muted">
          Problem lists from{' '}
          <a href={DATA.source} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-content">
            leetcode-companywise-interview-questions
          </a>{' '}
          (snapshot {DATA.snapshot}); problems are hosted on and solved at LeetCode.
        </p>
      </motion.div>
    </div>
  );
}
