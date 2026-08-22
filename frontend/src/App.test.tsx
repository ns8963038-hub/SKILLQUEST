import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock the Supabase client so the test needs no network and no env vars.
// getSession resolves to "no session", so the app should show the sign-in screen.
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import App from './App';

describe('App', () => {
  it('shows the sign-in screen when there is no session', async () => {
    render(<App />);
    // getSession is async, so wait for the auth screen to appear.
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });
});
