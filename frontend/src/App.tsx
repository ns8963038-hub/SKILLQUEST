import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { api } from './lib/api';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { PlayScreen } from './screens/PlayScreen';

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
  // When set, the play screen for this level is shown instead of the roadmap.
  const [playLevelId, setPlayLevelId] = useState<string | null>(null);

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
  // Playing a level, or looking at the roadmap.
  if (playLevelId) return <PlayScreen levelId={playLevelId} onBack={() => setPlayLevelId(null)} />;
  return <RoadmapScreen onOpenLevel={setPlayLevelId} />;
}

export default function App() {
  // AuthProvider makes the session available to the whole tree.
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
