import { supabase } from './supabase';
import { DEMO, demoApi, demoCsv } from './demo';

// Base URL of the Node Web API.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// A failed API call, keeping the HTTP status so a screen can react to it
// (503 = the AI tutor is waking up; see lib/aiWake.ts). The message is the same
// "Request to … failed (N)" text as before.
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`Request to ${path} failed (${status})`);
    this.name = 'ApiError';
  }
}

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
