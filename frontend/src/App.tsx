import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { api } from './lib/api';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { PlayScreen } from './screens/PlayScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PlacementScreen } from './screens/PlacementScreen';

// The minimal slice of the profile the app-level flow needs.
interface Profile {
  id: string;
  onboardingStep: number;
}

// A tiny full-screen loading state used while we check auth / fetch the profile.
function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-content-muted">Loading…</div>
  );
}

// Decides which screen to show based on auth + onboarding state. No router needed
// yet — there are three states:
//   not signed in            -> AuthScreen
//   signed in, not onboarded -> OnboardingWizard
//   signed in and onboarded  -> RoadmapScreen
function AppInner() {
  const { session, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  // Which authenticated screen is showing.
  type View = 'dashboard' | 'roadmap' | 'placement';
  const [view, setView] = useState<View>('dashboard');
  // When set, the play screen for this level is shown; playReturn is where Back goes.
  const [playLevelId, setPlayLevelId] = useState<string | null>(null);
  const [playReturn, setPlayReturn] = useState<View>('dashboard');

  // Fetch (creating on first login) the profile whenever we have a session.
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      setProfile(await api<Profile>('/api/me'));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadProfile();
    else setProfile(null);
  }, [session, loadProfile]);

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (profileLoading || !profile) return <Splash />;
  // Onboarding gate: incomplete users must finish the wizard first.
  if (profile.onboardingStep < 5) return <OnboardingWizard onComplete={loadProfile} />;

  // Open a level, remembering which screen to return to.
  const openLevel = (levelId: string, from: View) => {
    setPlayReturn(from);
    setPlayLevelId(levelId);
  };

  // Playing a level takes over the screen; Back returns to where it opened from.
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
  if (view === 'roadmap') {
    return (
      <RoadmapScreen
        onOpenLevel={(id) => openLevel(id, 'roadmap')}
        onBack={() => setView('dashboard')}
      />
    );
  }
  if (view === 'placement') {
    return (
      <PlacementScreen
        onOpenLevel={(id) => openLevel(id, 'placement')}
        onBack={() => setView('dashboard')}
      />
    );
  }
  // Home.
  return (
    <DashboardScreen
      onContinue={(id) => openLevel(id, 'dashboard')}
      onViewRoadmap={() => setView('roadmap')}
      onViewPlacement={() => setView('placement')}
    />
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
