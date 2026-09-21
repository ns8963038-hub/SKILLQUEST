import { supabase } from './supabase';
import { DEMO, demoApi, demoCsv } from './demo';
import { ApiError } from './apiError';

export { ApiError }; // screens import it from here, alongside api()

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

  if (!res.ok) throw new ApiError(path, res.status);
  return (await res.json()) as T;
}

// Fetch a file (e.g. a research CSV export) with the same authentication and
// return it as a Blob the browser can save.
export async function apiBlob(path: string): Promise<Blob> {
  if (DEMO) return demoCsv(path); // a clearly-labelled sample file in demo mode
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(path, res.status);
  return res.blob();
}
