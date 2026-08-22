import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

// Sign-in / sign-up screen (email + password). On a successful sign-in the
// AuthProvider's onAuthStateChange fires and the app advances automatically, so
// this component only has to talk to Supabase and show any error message.
export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is on, there's no session yet — tell the user.
        setMessage('Account created. If confirmation is required, check your email, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Success: the session updates and the app moves on.
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // Shared classes for the two text inputs (44px target + visible focus ring).
  const inputClass =
    'w-full min-h-[44px] rounded-lg border border-line bg-surface-2 px-3 py-2 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="mb-1 text-2xl font-bold">
          <span className="text-primary-fg">Skill</span>Quest
        </h1>
        <p className="mb-6 text-sm text-content-muted">
          {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            {/* Visible label, associated to the input via htmlFor/id. */}
            <label htmlFor="email" className="mb-1 block text-sm">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* role=alert so screen readers announce errors immediately. */}
          {message && (
            <p role="alert" className="text-sm text-info">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg bg-primary-bg px-4 py-2 font-medium text-content hover:bg-primary-bg-hover disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage(null);
          }}
          className="mt-4 text-sm text-primary-fg hover:underline"
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
