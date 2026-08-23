import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import problemData from '../features/dsa/companyProblems.json';

// A curated list of the LeetCode problems each company asks (title + link +
// difficulty + how frequently it's asked). This is a PREP INDEX — the problems
// are solved on LeetCode; SkillQuest links out to them. It is NOT part of the
// in-game play loop (we don't have LeetCode's test cases).

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

// Difficulty -> colour (meaning also carried by the text label, not colour alone).
const DIFF_CLASS: Record<string, string> = {
  Easy: 'text-success',
  Medium: 'text-accent',
  Hard: 'text-danger',
};

type Filter = 'All' | 'Easy' | 'Medium' | 'Hard';

export function DSAScreen({ onBack, initialCompany }: { onBack: () => void; initialCompany?: string }) {
  const [companyId, setCompanyId] = useState(initialCompany ?? COMPANIES[0]?.id ?? '');
  const [filter, setFilter] = useState<Filter>('All');

  const company = COMPANIES.find((c) => c.id === companyId) ?? COMPANIES[0];
  const problems = useMemo(
    () => (company ? company.problems.filter((p) => filter === 'All' || p.difficulty === filter) : []),
    [company, filter],
  );

  const service = COMPANIES.filter((c) => c.kind === 'service');
  const product = COMPANIES.filter((c) => c.kind === 'product');

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
          <h1 className="text-2xl font-bold">Company DSA Prep</h1>
          <p className="mt-1 text-sm text-content-muted">
            The interview questions each company asks most, from LeetCode. Pick a company and practise
            — each problem opens on LeetCode.
          </p>
        </div>

        {/* Company picker + difficulty filter */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="company">
            Company
          </label>
          <select
            id="company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="min-h-[44px] rounded-lg border border-line bg-surface-2 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg"
          >
            <optgroup label="Service companies">
              {service.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Product companies">
              {product.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>

          <div className="flex gap-1">
            {(['All', 'Easy', 'Medium', 'Hard'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`min-h-[36px] rounded-full px-3 text-sm ${
                  filter === f ? 'bg-primary-bg text-content' : 'bg-surface-2 text-content-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Problem list */}
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {problems.map((p) => (
            <li key={p.url}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 text-sm hover:bg-surface-2"
              >
                <span className="flex-1">{p.title}</span>
                <span className={`w-16 text-right text-xs font-medium ${DIFF_CLASS[p.difficulty] ?? ''}`}>
                  {p.difficulty}
                </span>
                <span className="w-12 text-right text-xs text-content-muted">{p.frequency}%</span>
                <ExternalLink size={14} className="text-content-muted" aria-hidden />
              </a>
            </li>
          ))}
          {problems.length === 0 && (
            <li className="p-4 text-sm text-content-muted">No problems for this filter.</li>
          )}
        </ol>

        {/* Attribution — this data is aggregated LeetCode metadata. */}
        <p className="text-xs text-content-muted">
          Problem lists from{' '}
          <a href={DATA.source} target="_blank" rel="noopener noreferrer" className="underline">
            leetcode-companywise-interview-questions
          </a>{' '}
          (snapshot {DATA.snapshot}); problems are hosted on and solved at LeetCode.
        </p>
      </main>
    </div>
  );
}
