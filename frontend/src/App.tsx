import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ApiError, api } from './lib/api';
import { appProblem, type AppProblem } from './lib/loadProblems';
import { rememberAiWakeUrl, wakeAi } from './lib/aiWake';
import { invalidate } from './lib/useApi';
import { useNavHistory } from './lib/navHistory';
import { signOut } from './lib/session';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { PlayScreen } from './screens/PlayScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { DSAScreen } from './screens/DSAScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { AdminScreen } from './screens/AdminScreen';
import { FeedbackScreen } from './screens/FeedbackScreen';
import { LessonScreen } from './screens/LessonScreen';
import { AppShell, type NavView } from './ui/AppShell';
import { AmbientBackground } from './ui/AmbientBackground';
import { Nova } from './ui/Nova';
import { Button } from './ui/primitives';

// The minimal slice of the profile the app-level flow needs.
interface Profile {
  id: string;
  onboardingStep: number;
  isAdmin?: boolean;
  consentRequired?: boolean; // hasn't answered the current consent text yet
  currentConsentVersion?: string;
  aiWakeUrl?: string; // the AI service's health check, poked from here to wake it
}

// Full-screen loading state while we check auth / fetch the profile. On the
// free hosting tier the server sleeps when idle and takes up to a minute to
// wake, so after a few seconds we say so instead of leaving the student guessing.
function Splash() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="relative grid min-h-screen place-items-center" role="status">
      <AmbientBackground intensity={0.7} />
      <div className="flex flex-col items-center gap-6">
        {/* Nova dozes while the app checks your session. */}
        <Nova mood="sleepy" size={72} />
        <p className="eyebrow">Waking your tutor…</p>
        {slow && (
          <p className="max-w-xs text-center text-sm text-content-muted">
            The server naps when nobody’s using it. Waking it can take up to a minute. Hang on!
          </p>
        )}
      </div>
    </div>
  );
}

// Shown when signed in but the profile couldn't be loaded. Never a blank or
// endless spinner, and it says what actually went wrong (lib/loadProblems.ts):
// an expired sign-in, a server still waking up, or a real error.
const PROBLEM_TEXT: Record<AppProblem['kind'], { title: string; body: string }> = {
  signin: {
    title: 'Please sign in again',
    body: 'Your sign-in has expired. Nothing you have saved is affected — sign in again to carry on.',
  },
  waking: {
    title: 'The server is waking up',
    body: 'SkillQuest runs on free hosting that pauses when nobody is using it, and it takes about a minute to start (or your connection dropped). Nothing you have saved is affected — try again in a moment.',
  },
  server: {
    title: 'Something went wrong on our side',
    body: 'The server hit an error loading your profile. Nothing you have saved is affected. Try again — if it keeps happening, tell the SkillQuest team.',
  },
};

function ServerUnavailable({ problem, onRetry }: { problem: AppProblem; onRetry: () => void }) {
  const text = PROBLEM_TEXT[problem.kind];
  return (
    <div className="relative grid min-h-screen place-items-center p-4">
      <AmbientBackground intensity={0.6} />
      <div className="glass edge w-full max-w-md rounded-3xl p-8 text-center">
        <Nova mood={problem.kind === 'waking' ? 'sleepy' : 'concerned'} size={72} className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">{text.title}</h1>
        <p className="mt-2 text-sm text-content-muted">
          {text.body}
          {problem.kind === 'server' && <span className="font-mono"> (error {problem.status})</span>}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {problem.kind === 'signin' ? (
            <Button onClick={() => void signOut()}>Sign in again</Button>
          ) : (
            <Button onClick={onRetry}>Try again</Button>
          )}
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

// Where the signed-in app is: a main view, plus a full-screen level or lesson on
// top of it (each remembering the view to return to).
interface Nav {
  view: NavView;
  dsaCompany?: string; // company to preselect on DSA prep (when opened from Placement)
  playLevelId: string | null; // when set, the play screen for this level is shown
  playReturn: NavView;
  lessonSkillId: string | null; // when set, this skill's lesson is shown (Learn mode, PRD F8)
  lessonReturn: NavView;
}
const HOME: Nav = { view: 'dashboard', playLevelId: null, playReturn: 'dashboard', lessonSkillId: null, lessonReturn: 'dashboard' };

// Decides which screen to show from auth + consent + onboarding state. No router:
//   not signed in                 -> AuthScreen
//   consent not answered (v1)     -> ConsentScreen (research consent comes FIRST)
//   signed in, not onboarded      -> OnboardingWizard
//   signed in and onboarded       -> the app shell (home / map / placement / DSA /
//                                    leaderboard / settings / feedback / admin)
//   playing a level               -> the full-screen PlayScreen
function AppInner() {
  const { session, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileProblem, setProfileProblem] = useState<AppProblem | null>(null); // why /api/me failed
  // Which signed-in screen is showing — kept in the browser history, so the
  // phone's Back button moves back through the app (lib/navHistory.ts).
  const { nav, go, back } = useNavHistory<Nav>(HOME);
  const { view, dsaCompany, playLevelId, playReturn, lessonSkillId, lessonReturn } = nav;

  // Fetch (creating on first login) the profile whenever we have a session.
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileProblem(null);
    try {
      const me = await api<Profile>('/api/me');
      // Start waking the AI tutor now (free tier), long before onboarding or a
      // re-plan needs it. Only the browser can wake it — see lib/aiWake.ts.
      rememberAiWakeUrl(me.aiWakeUrl);
      wakeAi();
      setProfile(me);
    } catch (err) {
      setProfileProblem(appProblem(err));
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

  // Deep link: ?lesson=<skillId> opens that topic's lesson straight away (handy
  // for demos and for sharing a lesson). The server still decides what exists.
  useEffect(() => {
    if (!profile) return;
    const wanted = new URLSearchParams(window.location.search).get('lesson');
    if (wanted && /^[a-z-]{2,40}$/.test(wanted)) go({ ...HOME, lessonSkillId: wanted });
  }, [profile, go]);

  // After navigation: start at the top and move focus to the new page's heading, so
  // screen-reader users hear where they are (UI doc §9).
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const t = window.setTimeout(() => {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(t);
  }, [view, playLevelId, lessonSkillId]);

  if (loading) return <Splash />;
  if (!session) return <AuthScreen />;
  if (profileProblem) return <ServerUnavailable problem={profileProblem} onRetry={() => void loadProfile()} />;
  if (profileLoading || !profile) return <Splash />;
  // Consent gate (Backend Schema §5.1): answered before any research data is
  // collected — agreeing or declining both continue into the app.
  if (profile.consentRequired)
    return <ConsentScreen version={profile.currentConsentVersion} onDone={() => void loadProfile()} />;
  // Onboarding gate: incomplete users must finish the wizard first.
  if (profile.onboardingStep < 5) return <OnboardingWizard onComplete={() => void loadProfile()} />;

  // Open a level, remembering which screen to return to.
  const openLevel = (levelId: string, from: NavView) =>
    go({ ...nav, lessonSkillId: null, playLevelId: levelId, playReturn: from });

  // Open a lesson, remembering which screen to return to.
  const openLesson = (skillId: string, from: NavView) =>
    go({ ...nav, playLevelId: null, lessonSkillId: skillId, lessonReturn: from });

  // Open a SKILL: its lesson first if the student hasn't done (or skipped) it,
  // otherwise its next unfinished level — the server decides both. Falls back to
  // the first level if the request fails — unless the skill is LOCKED (403): the
  // screen that offered it was out of date, so refresh everything instead.
  const openSkill = (skillId: string, from: NavView) => {
    api<{ levelId: string | null; lessonFirst?: boolean }>(`/api/skills/${skillId}/next-level`)
      .then(({ levelId, lessonFirst }) => {
        if (lessonFirst) openLesson(skillId, from);
        else if (levelId) openLevel(levelId, from);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) invalidate('/api/');
        else openLevel(`${skillId}-01`, from);
      });
  };

  // A lesson takes over the whole screen; it hands over to the topic's level.
  if (lessonSkillId) {
    return (
      <LessonScreen
        key={lessonSkillId}
        skillId={lessonSkillId}
        onBack={() => back({ ...nav, lessonSkillId: null, view: lessonReturn })}
        // The lesson is done: the level REPLACES it, so Back goes to the map.
        onStartLevel={(levelId) =>
          go({ ...nav, lessonSkillId: null, playLevelId: levelId, playReturn: lessonReturn }, { replace: true })
        }
      />
    );
  }

  // Playing a level takes over the whole screen; Back returns to where it opened
  // from. The key remounts it cleanly when "Next level" swaps the level.
  if (playLevelId) {
    return (
      <PlayScreen
        key={playLevelId}
        levelId={playLevelId}
        userId={session.user.id}
        // "Next level" replaces this one, so Back goes to the map, not the level before.
        onOpenLevel={(id) => go({ ...nav, playLevelId: id }, { replace: true })}
        onOpenLesson={(skillId) => openLesson(skillId, playReturn)}
        onBack={() => back({ ...nav, playLevelId: null, view: playReturn })}
      />
    );
  }

  const navigate = (next: NavView) =>
    go({ ...nav, view: next, dsaCompany: next === 'dsa' ? undefined : dsaCompany });

  let screen: ReactNode;
  if (view === 'roadmap') {
    screen = <RoadmapScreen onOpenSkill={(id) => openSkill(id, 'roadmap')} />;
  } else if (view === 'placement') {
    screen = (
      <PlacementScreen
        onOpenSkill={(id) => openSkill(id, 'placement')}
        onOpenDsa={(companyId) => go({ ...nav, view: 'dsa', dsaCompany: companyId })}
      />
    );
  } else if (view === 'dsa') {
    screen = <DSAScreen initialCompany={dsaCompany} />;
  } else if (view === 'leaderboard') {
    screen = <LeaderboardScreen onOpenSettings={() => navigate('settings')} />;
  } else if (view === 'settings') {
    screen = <SettingsScreen />;
  } else if (view === 'feedback') {
    screen = <FeedbackScreen onDone={() => navigate('dashboard')} />;
  } else if (view === 'admin' && profile.isAdmin) {
    screen = <AdminScreen />;
  } else {
    screen = (
      <DashboardScreen
        onContinue={(id) => openLevel(id, 'dashboard')}
        onResume={(skillId) => openSkill(skillId, 'dashboard')}
        onOpenSkill={(id) => openSkill(id, 'dashboard')}
        onViewRoadmap={() => navigate('roadmap')}
        onViewPlacement={() => navigate('placement')}
        onViewDsa={() => navigate('dsa')}
        onGiveFeedback={() => navigate('feedback')}
      />
    );
  }

  return (
    <AppShell current={view} onNavigate={navigate} isAdmin={profile.isAdmin}>
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
