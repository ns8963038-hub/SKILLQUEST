import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the Supabase client so the test needs no network and no env vars.
// By default getSession resolves to "no session", so the app shows sign-in.
const auth = vi.hoisted(() => ({ session: null as null | { access_token: string } }));
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import App from './App';
import { resetAiWake } from './lib/aiWake';

const AI_HEALTH = 'https://skillquest-ai.example.com/health';

describe('App', () => {
  it('shows the sign-in screen when there is no session', async () => {
    render(<App />);
    // getSession is async, so wait for the auth screen to appear.
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });
});

describe('App, once signed in', () => {
  afterEach(() => {
    auth.session = null;
    resetAiWake();
    vi.unstubAllGlobals();
  });

  it('starts waking the AI tutor from the browser as soon as the profile loads', async () => {
    auth.session = { access_token: 'token' };
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/api/me')
          ? new Response(JSON.stringify({ id: 'u1', onboardingStep: 0, consentRequired: true, aiWakeUrl: AI_HEALTH }))
          : new Response(null),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    // The free-tier AI service only wakes for traffic from outside our host, so
    // the browser pokes it — a minute or more before onboarding needs it.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(AI_HEALTH, expect.objectContaining({ mode: 'no-cors' })));
  });
});
