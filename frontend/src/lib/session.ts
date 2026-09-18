import { supabase } from './supabase';
import { DEMO, exitDemo } from './demo';
import { invalidate } from './useApi';

// Sign out through one helper: clear every cached API response (so the next user
// never sees the previous user's data), then end the session — or, in demo mode,
// simply leave the demo.
export async function signOut(): Promise<void> {
  invalidate();
  if (DEMO) {
    exitDemo();
    return;
  }
  await supabase.auth.signOut();
}
