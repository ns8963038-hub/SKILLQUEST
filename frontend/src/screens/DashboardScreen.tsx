import { useEffect, useState } from 'react';
import { Flame, Zap, Map } from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

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

// The home screen: the "game" surface — level + XP, streak, the next quest, and
// the student's badges. This is what makes it feel gamified rather than a plain
// problem list.
export function DashboardScreen({
  onContinue,
  onViewRoadmap,
}: {
  onContinue: (levelId: string) => void;
  onViewRoadmap: () => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(() => setError('Could not load your dashboard.'));
  }, []);

  if (error) return <p role="alert" className="p-8 text-danger">{error}</p>;
  if (!data) return <div className="p-8 text-content-muted">Loading…</div>;

  const pct = Math.min(100, Math.round((data.xpIntoLevel / data.xpForNextLevel) * 100));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-8">
        <span className="text-lg font-bold">
          <span className="text-primary-fg">Skill</span>Quest
        </span>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="min-h-[44px] text-sm text-content-muted hover:text-content"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
        {/* Level + XP and streak. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* XP / level card */}
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-2 flex items-center gap-2">
              <Zap size={18} className="text-accent" aria-hidden />
              <span className="font-semibold">Level {data.level}</span>
              <span className="ml-auto text-sm text-content-muted">{data.totalXp} XP</span>
            </div>
            {/* Progress to next level */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-content-muted">
              {data.xpIntoLevel} / {data.xpForNextLevel} XP to level {data.level + 1}
            </p>
          </div>

          {/* Streak card */}
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <Flame
                size={18}
                className={data.activeToday ? 'text-accent' : 'text-content-muted'}
                aria-hidden
              />
              <span className="font-semibold">{data.currentStreak}-day streak</span>
            </div>
            <p className="mt-1 text-xs text-content-muted">
              {data.activeToday ? 'Active today 🔥' : 'Solve a level today to keep it alive'} · best{' '}
              {data.bestStreak}
            </p>
          </div>
        </div>

        {/* Continue your quest. */}
        {data.currentQuest && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-content-muted">Continue your quest</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">{data.currentQuest.title}</span>
              <button
                type="button"
                onClick={() => onContinue(data.currentQuest!.levelId)}
                className="min-h-[44px] shrink-0 rounded-lg bg-primary-bg px-5 py-2 font-medium text-content hover:bg-primary-bg-hover"
              >
                Resume →
              </button>
            </div>
          </div>
        )}

        {/* Badge shelf. */}
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="mb-3 text-xs uppercase tracking-wide text-content-muted">Badges</p>
          {data.badges.length === 0 ? (
            <p className="text-sm text-content-muted">
              No badges yet — complete a level to earn your first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.badges.map((b) => (
                <div
                  key={b.id}
                  title={b.description}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm"
                >
                  <span aria-hidden>{b.icon}</span>
                  {b.title}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link to the full roadmap. */}
        <button
          type="button"
          onClick={onViewRoadmap}
          className="flex min-h-[44px] items-center gap-2 text-sm text-primary-fg hover:underline"
        >
          <Map size={16} aria-hidden /> View full roadmap
        </button>
      </main>
    </div>
  );
}
