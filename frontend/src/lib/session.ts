import { supabase } from './supabase';
import { DEMO, exitDemo } from './demo';
import { invalidate } from './useApi';
import { clearDrafts } from './drafts';

// Sign out through one helper: clear every cached API response and every code
// draft (so the next person on this computer never sees the previous student's
// data or solutions), then end the session — or, in demo mode, simply leave the demo.
export async function signOut(): Promise<void> {
  invalidate();
  clearDrafts();
  if (DEMO) {
    exitDemo();
    return;
  }
  await supabase.auth.signOut();
}
