import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { api } from './lib/api';
import { invalidate } from './lib/useApi';
import { signOut } from './lib/session';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { PlayScreen } from './screens/PlayScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { DSAScreen } from './screens/DSAScreen';
import { AppShell, type NavView } from './ui/AppShell';
import { AmbientBackground } from './ui/AmbientBackground';
import { Nova } from './ui/Nova';
import { Button } from './ui/primitives';

// The minimal slice of the profile the app-level flow needs.
interface Profile {
  id: string;
  onboardingStep: number;
}

// Full-screen loading state while we check auth / fetch the profile.
function Splash() {
  return (
    <div className="relative grid min-h-screen place-items-center" role="status">
      <AmbientBackground intensity={0.7} />
      <div className="flex flex-col items-center gap-6">
        {/* Nova dozes while the app checks your session. */}
        <Nova mood="sleepy" size={72} />
        <p className="eyebrow">Waking your tutor…</p>
      </div>
    </div>
  );
}

// Shown when signed in but the API can't be reached (e.g. the database is paused).
// Never a blank or endless spinner: explain, retry, or explore the demo.
function ServerUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="relative grid min-h-screen place-items-center p-4">
      <AmbientBackground intensity={0.6} />
      <div className="glass edge w-full max-w-md rounded-3xl p-8 text-center">
        <Nova mood="sleepy" size={72} className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Your tutor can’t reach the server</h1>
        <p className="mt-2 text-sm text-content-muted">
          The free database naps when it’s idle and may still be waking up. Your progress is safe — try again in a
          moment, or explore the demo meanwhile.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={onRetry}>Try again</Button>
          <Button
            variant="ghost"
            onClick={() => {
              window.location.search = '?demo';
            }}
          >
            Explore the demo
          </Button>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 text-xs text-content-muted transition-colors hover:text-content"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// Decides which screen to show from auth + onboarding state. No router needed:
//   not signed in            -> AuthScreen
//   signed in, not onboarded -> OnboardingWizard
//   signed in and onboarded  -> the app shell (dashboard / roadmap / placement / DSA)
//   playing a level          -> the full-screen PlayScreen
function AppInner() {
  const { session, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  // Which signed-in screen is showing.
  const [view, setView] = useState<NavView>('dashboard');
  // Company to preselect on the DSA prep screen (when opened from placement).
  const [dsaCompany, setDsaCompany] = useState<string | undefined>(undefined);
  // When set, the play screen for this level is shown; playReturn is where Back goes.
  const [playLevelId, setPlayLevelId] = useState<string | null>(null);
  const [playReturn, setPlayReturn] = useState<NavView>('dashboard');

  // Fetch (creating on first login) the profile whenever we have a session.
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileFailed(false);
    try {
      setProfile(await api<Profile>('/api/me'));
    } catch {
      setProfileFailed(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void loadProfile();
    else {
      setProfile(null);
      invalidate(); // never show a previous user's cached data
    }
  }, [session, loadProfile]);

  // After navigation: start at the top and move focus to the new page's heading, so
  // screen-reader users hear where they are (UI doc §9).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const t = window.setTimeout(() => {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(t);
  }, [view, playLevelId]);

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (profileFailed) return <ServerUnavailable onRetry={() => void loadProfile()} />;
  if (profileLoading || !profile) return <Splash />;
  // Onboarding gate: incomplete users must finish the wizard first.
  if (profile.onboardingStep < 5) return <OnboardingWizard onComplete={() => void loadProfile()} />;

  // Open a level, remembering which screen to return to.
  const openLevel = (levelId: string, from: NavView) => {
    setPlayReturn(from);
    setPlayLevelId(levelId);
  };

  // Playing a level takes over the whole screen; Back returns to where it opened from.
  if (playLevelId) {
    return (
      <PlayScreen
        levelId={playLevelId}
        onBack={() => {
          setPlayLevelId(null);
          setView(playReturn);
        }}
      />
    );
  }

  const navigate = (next: NavView) => {
    if (next === 'dsa') setDsaCompany(undefined);
    setView(next);
  };

  let screen: ReactNode;
  if (view === 'roadmap') {
    screen = <RoadmapScreen onOpenLevel={(id) => openLevel(id, 'roadmap')} />;
  } else if (view === 'placement') {
    screen = (
      <PlacementScreen
        onOpenLevel={(id) => openLevel(id, 'placement')}
        onOpenDsa={(companyId) => {
          setDsaCompany(companyId);
          setView('dsa');
        }}
      />
    );
  } else if (view === 'dsa') {
    screen = <DSAScreen initialCompany={dsaCompany} />;
  } else {
    screen = (
      <DashboardScreen
        onContinue={(id) => openLevel(id, 'dashboard')}
        onViewRoadmap={() => navigate('roadmap')}
        onViewPlacement={() => navigate('placement')}
        onViewDsa={() => navigate('dsa')}
      />
    );
  }

  return (
    <AppShell current={view} onNavigate={navigate}>
      {/* Pages cross-fade with a slight lift and blur. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

export default function App() {
  // AuthProvider makes the session available to the whole tree.
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
