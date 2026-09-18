import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DEMO } from '../lib/demo';

// Holds the current auth session and exposes it to the whole app.
interface AuthState {
  session: Session | null;
  loading: boolean; // true until we've checked for an existing session
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo mode: a stand-in signed-in session, so the app opens straight onto the
    // dashboard. No Supabase call is made and no real account is involved.
    if (DEMO) {
      setSession({
        access_token: 'demo',
        user: { id: 'demo-student', email: 'demo@skillquest.app' },
      } as unknown as Session);
      setLoading(false);
      return;
    }

    // 1) Load any session already stored in the browser (a returning user).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // 2) Keep it in sync on sign-in, sign-out, and automatic token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

// Convenience hook for reading the session anywhere in the tree.
export const useAuth = () => useContext(AuthContext);
