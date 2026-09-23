import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Brain, Cpu, Eye, EyeOff, Lock, Mail, Sparkles, Target, type LucideIcon } from 'lucide-react';
import { caretPoint } from '../lib/caret';
import { supabase } from '../lib/supabase';
import { isSharedComputer, setSharedComputer } from '../lib/authStorage';
import { Constellation } from '../features/constellation/Constellation';
import { SKILL_GRAPH } from '../features/constellation/skillGraph';
import type { RoadmapNode } from '../features/roadmap/types';
import { AmbientBackground } from '../ui/AmbientBackground';
import { BrandMark } from '../ui/BrandMark';
import { Nova, type NovaMood } from '../ui/Nova';
import { Button, EASE_OUT, GlassCard, rise, stagger } from '../ui/primitives';

// A sample mid-journey student, used only for the decorative preview on this page.
const PREVIEW_NODES: RoadmapNode[] = SKILL_GRAPH.map((s, i) => ({
  skillId: s.id,
  title: s.title,
  weekNumber: Math.floor(i / 3) + 1,
  position: i % 3,
  status: i < 4 ? 'completed' : i === 4 ? 'current' : i === 5 ? 'available' : 'locked',
  mastery: i < 4 ? 0.96 : i === 4 ? 0.58 : i === 5 ? 0.24 : 0,
}));

const PROOF: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Brain, title: 'Models your mastery', body: 'Bayesian Knowledge Tracing on every first try' },
  { icon: Cpu, title: 'Runs real Java', body: 'Your code compiles and faces hidden tests' },
  { icon: Target, title: 'Placement-aware', body: 'Mapped to Infosys, TCS, Wipro & more' },
];

// Google sign-in appears only when the Google provider has been configured in
// Supabase (Authentication → Providers → Google) and VITE_GOOGLE_AUTH=1 is set —
// a button that errors would be worse than no button.
const GOOGLE_AUTH = import.meta.env.VITE_GOOGLE_AUTH === '1';

// The standard multicolour Google "G" mark (per Google's sign-in branding guidance).
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// Sign in / sign up (email + password, or Google when enabled). On success the AuthProvider's
// onAuthStateChange fires and the app moves on automatically, so this screen only
// talks to Supabase and shows any message.
export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Lab PCs: keep the sign-in only for this tab (lib/authStorage.ts). Remembered per computer.
  const [shared, setShared] = useState(isSharedComputer);
  // What Nova reacts to: which field has focus, and whether the message is an error.
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info');

  // Where Nova looks while you type: the text cursor of the email field (it
  // reads along), or of the password once you've chosen to show it (it peeks).
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [watch, setWatch] = useState<{ x: number; y: number } | null>(null);
  const measureWatch = useCallback(() => {
    const field = focus === 'email' ? emailRef.current : focus === 'password' && showPassword ? passwordRef.current : null;
    setWatch(field ? caretPoint(field) : null);
  }, [focus, showPassword]);
  // After every keystroke, once the new text is on screen.
  useLayoutEffect(() => measureWatch(), [measureWatch, email, password]);
  // The layout moves when the page scrolls, the window resizes, or a phone's
  // keyboard opens.
  useEffect(() => {
    window.addEventListener('resize', measureWatch);
    window.addEventListener('scroll', measureWatch, true);
    return () => {
      window.removeEventListener('resize', measureWatch);
      window.removeEventListener('scroll', measureWatch, true);
    };
  }, [measureWatch]);

  // Hand off to Google; Supabase redirects back here with a session.
  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);
    setSharedComputer(shared); // before the session is written
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessageKind('error');
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setSharedComputer(shared); // decides where the session is kept, so set it before signing in
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is on there's no session yet — tell the user.
        setMessageKind('info');
        setMessage('Account created. If confirmation is required, check your email, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Success: the session updates and the app moves on.
      }
    } catch (err) {
      setMessageKind('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // 48px targets, a visible label on every field, and a soft ion focus glow that
  // replaces (never just removes) the outline.
  const inputClass =
    'w-full min-h-[48px] rounded-xl border border-line-strong bg-base/60 pl-11 pr-3.5 text-[15px] text-content ' +
    'placeholder:text-content-muted transition-[border-color,box-shadow] duration-200 ' +
    'focus:border-ion/60 focus:shadow-[0_0_0_4px_rgba(127,168,255,0.14)] focus:outline-none focus-visible:outline-none';

  // Nova reacts to the form: thinks while signing in, worries at an error, reads
  // along as you type your email, turns right round while you type a password —
  // and turns half back to peek if you choose to show it. Poke it too often and
  // it gets angry (that part lives in Nova itself).
  const novaMood: NovaMood = busy
    ? 'thinking'
    : message && messageKind === 'error'
      ? 'concerned'
      : focus === 'password'
        ? showPassword
          ? 'glance'
          : 'turned'
        : message
          ? 'happy'
          : 'idle';

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AmbientBackground />

      {/* minmax(0, …): the columns keep their share. Without it the pitch's wide
          content stretched its column and squeezed the sign-in card to ~170px. */}
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ---- The pitch (desktop) ---- */}
        <motion.section initial="hidden" animate="show" variants={stagger} className="hidden min-w-0 lg:block">
          <motion.div variants={rise} className="flex items-center gap-3">
            <BrandMark size={36} />
            <span className="font-display text-xl font-semibold tracking-tight">SkillQuest</span>
            <span className="rounded-md border border-ion/25 bg-ion-tint px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ion">
              AI Tutor
            </span>
          </motion.div>
          <motion.h1 variants={rise} className="mt-10 font-display text-5xl font-semibold leading-[0.98] tracking-tight xl:text-6xl">
            An AI tutor that knows <span className="text-gradient-ion">what you know.</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-5 max-w-lg text-lg leading-relaxed text-content-muted">
            SkillQuest keeps a mastery estimate for each Java &amp; DSA topic, updated from your first try at each level,
            and orders your topics by what they build on and your placement goal.
          </motion.p>
          <motion.div variants={rise} className="glass mt-9 overflow-hidden rounded-3xl p-3" aria-hidden>
            <div className="dot-grid pointer-events-none rounded-2xl">
              <Constellation nodes={PREVIEW_NODES} compact fit />
            </div>
          </motion.div>
          <motion.ul variants={rise} className="mt-7 grid grid-cols-3 gap-5">
            {PROOF.map(({ icon: Icon, title, body }) => (
              <li key={title} className="text-sm">
                <Icon size={18} className="text-ion" aria-hidden />
                <p className="mt-2 font-medium text-content">{title}</p>
                <p className="mt-0.5 text-content-muted">{body}</p>
              </li>
            ))}
          </motion.ul>
        </motion.section>

        {/* ---- The form ---- */}
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="mb-14 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex items-center gap-3">
              <BrandMark size={34} />
              <span className="font-display text-xl font-semibold tracking-tight">SkillQuest</span>
            </div>
            <p className="text-sm text-content-muted">An AI tutor that knows what you know.</p>
          </div>

          <GlassCard edge className="relative p-7 sm:p-9">
            {/* Nova perches on the card's top edge, watching you sign in. */}
            <div className="pointer-events-none absolute -top-10 right-7">
              <Nova mood={novaMood} size={72} lookAt={watch} pokeable />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <p className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Start your quest'}</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                  {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
                </h2>
              </motion.div>
            </AnimatePresence>

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <Field id="email" label="Email" icon={Mail}>
                <input
                  ref={emailRef}
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocus('email')}
                  onBlur={() => setFocus(null)}
                  className={inputClass}
                />
              </Field>

              <Field
                id="password"
                label="Password"
                icon={Lock}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    onFocus={() => setFocus('password')}
                    onBlur={() => setFocus(null)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="grid h-9 w-9 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-3 hover:text-content"
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                }
              >
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onSelect={measureWatch}
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus(null)}
                  className={`${inputClass} pr-12`}
                />
              </Field>

              {/* A college lab PC: don't leave this student signed in for the next one. */}
              <label className="flex cursor-pointer items-start gap-3 text-sm text-content-muted">
                <input
                  id="shared-computer"
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#7FA8FF]"
                />
                <span>
                  <span className="text-content">This is a shared computer</span> — sign me out when I close this tab.
                </span>
              </label>

              {/* role=alert so screen readers announce messages immediately. */}
              {message && (
                <p role="alert" className="rounded-xl border border-ion/20 bg-ion-tint px-3.5 py-2.5 text-sm text-ion">
                  {message}
                </p>
              )}

              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setMessage(null);
              }}
              className="mt-5 w-full text-center text-sm text-content-muted transition-colors hover:text-content"
            >
              {mode === 'signin' ? (
                <>
                  New here? <span className="font-medium text-ion">Create an account</span>
                </>
              ) : (
                <>
                  Have an account? <span className="font-medium text-ion">Sign in</span>
                </>
              )}
            </button>

            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-content-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {GOOGLE_AUTH && (
              <Button
                variant="ghost"
                size="lg"
                className="mb-3 w-full"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                <GoogleMark /> Continue with Google
              </Button>
            )}

            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => {
                window.location.search = '?demo';
              }}
            >
              <Sparkles size={17} aria-hidden className="text-ion" /> Explore the live demo
            </Button>
            <p className="mt-3 text-center text-xs text-content-muted">No account needed · sample student data</p>
          </GlassCard>
        </motion.section>
      </div>
    </div>
  );
}

// A labelled input with a leading icon and an optional trailing control.
function Field({
  id,
  label,
  icon: Icon,
  trailing,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-content">
        {label}
      </label>
      <div className="relative">
        <Icon
          size={17}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
        />
        {children}
        {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </div>
  );
}
