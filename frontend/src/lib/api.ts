import { supabase } from './supabase';
import { DEMO, demoApi } from './demo';

// Base URL of the Node Web API.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Call the Web API with the current user's Supabase access token attached.
// Every data request goes through here, so authentication is applied in exactly
// one place. The backend verifies the token and enforces ownership.
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  // Demo mode answers from the in-browser demo store — no network, no database.
  if (DEMO) return demoApi<T>(path, options);

  // Read the freshest token (supabase-js refreshes it automatically).
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}
