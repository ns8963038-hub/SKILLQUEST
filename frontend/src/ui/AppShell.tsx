import type { ReactNode } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { Briefcase, Code2, Flame, House, LogOut, Orbit, Zap, type LucideIcon } from 'lucide-react';
import { AmbientBackground } from './AmbientBackground';
import { BrandMark } from './BrandMark';
import { useApi } from '../lib/useApi';
import { signOut } from '../lib/session';
import { DEMO } from '../lib/demo';
import { cn } from '../lib/cn';

export type NavView = 'dashboard' | 'roadmap' | 'placement' | 'dsa';

const NAV: { id: NavView; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', icon: House },
  { id: 'roadmap', label: 'Constellation', icon: Orbit },
  { id: 'placement', label: 'Placement', icon: Briefcase },
  { id: 'dsa', label: 'DSA Prep', icon: Code2 },
];

// The subset of /api/dashboard the top bar shows.
interface ShellStats {
  totalXp: number;
  currentStreak: number;
  activeToday: boolean;
}

// The frame around every signed-in screen: living background, a floating glass top
// bar (brand, navigation with a sliding indicator, run + XP), and a bottom tab bar
// on phones.
export function AppShell({
  current,
  onNavigate,
  children,
}: {
  current: NavView;
  onNavigate: (view: NavView) => void;
  children: ReactNode;
}) {
  const { data } = useApi<ShellStats>('/api/dashboard'); // shared with the dashboard (one request)

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />

      {/* Skip link: the first focusable element on every page (UI doc §9). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/[0.04] bg-base/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-8">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 rounded-lg"
            aria-label="SkillQuest home"
          >
            <BrandMark size={30} />
            <span className="font-display text-[17px] font-semibold tracking-tight">SkillQuest</span>
            <span className="hidden rounded-md border border-ion/25 bg-ion-tint px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ion sm:inline">
              AI Tutor
            </span>
          </button>

          {/* Desktop navigation — the active pill glides between items. */}
          <nav aria-label="Main" className="ml-4 hidden md:block">
            <LayoutGroup id="top-nav">
              <ul className="flex items-center gap-1 rounded-full border border-white/[0.05] bg-surface/60 p-1">
                {NAV.map(({ id, label, icon: Icon }) => {
                  const on = id === current;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(id)}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'relative flex h-9 items-center gap-2 rounded-full px-3.5 text-sm transition-colors',
                          on ? 'text-content' : 'text-content-muted hover:text-content',
                        )}
                      >
                        {on && (
                          <motion.span
                            layoutId="nav-pill"
                            className="absolute inset-0 rounded-full border border-ion/25 bg-ion-tint shadow-[0_0_24px_-6px_rgba(77,124,255,0.6)]"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                        <Icon size={15} className="relative" aria-hidden />
                        <span className="relative">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </LayoutGroup>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {data && (
              <>
                <span
                  className={cn(
                    'hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm sm:flex',
                    data.activeToday
                      ? 'border-accent/30 bg-accent-tint text-accent'
                      : 'border-line bg-surface-2 text-content-muted',
                  )}
                >
                  <Flame size={15} aria-hidden />
                  <span className="font-mono tabular-nums">{data.currentStreak}</span>
                  <span className="sr-only">days in a row</span>
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-ion/20 bg-ion-tint px-3 py-1.5 text-sm text-ion">
                  <Zap size={15} aria-hidden />
                  <span className="font-mono tabular-nums">{data.totalXp.toLocaleString('en-IN')}</span>
                  <span className="sr-only">experience points</span>
                </span>
              </>
            )}
            {DEMO && (
              <span className="hidden rounded-full border border-ember/30 bg-ember-tint px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ember lg:inline">
                Demo
              </span>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="grid h-10 w-10 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-3 hover:text-content"
              aria-label={DEMO ? 'Exit demo' : 'Sign out'}
              title={DEMO ? 'Exit demo' : 'Sign out'}
            >
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="relative mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 md:pb-16 md:pt-10">
        {children}
      </main>

      {/* Phone navigation: a bottom tab bar clear of the home indicator. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.05] bg-base/80 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-[60px] w-full flex-col items-center justify-center gap-1 text-[11px]',
                    on ? 'text-ion' : 'text-content-muted',
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-ion shadow-[0_0_12px_rgba(127,168,255,0.9)]"
                    />
                  )}
                  <Icon size={19} aria-hidden />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
