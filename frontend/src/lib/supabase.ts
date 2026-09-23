import { createClient } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

// The Supabase client — used for AUTHENTICATION ONLY (email/password + session).
// The anon key is safe in the browser: RLS gives it no table access, so all
// actual data goes through our own Web API (which verifies the user's token).
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// The session is kept where authStorage says: localStorage normally, or only for
// the tab on a computer marked as shared (lab PCs) — see lib/authStorage.ts.
export const supabase = createClient(url, anonKey, { auth: { storage: authStorage } });
