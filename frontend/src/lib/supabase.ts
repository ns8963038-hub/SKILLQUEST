import { createClient } from '@supabase/supabase-js';

// The Supabase client — used for AUTHENTICATION ONLY (email/password + session).
// The anon key is safe in the browser: RLS gives it no table access, so all
// actual data goes through our own Web API (which verifies the user's token).
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);
