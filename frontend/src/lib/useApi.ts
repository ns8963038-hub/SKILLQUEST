import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// A tiny request cache shared across the app. The top bar and the dashboard both
// read /api/dashboard — with this they share ONE request instead of two.
const cache = new Map<string, Promise<unknown>>();

// Drop cached responses (all of them, or those whose path starts with `prefix`).
// Called after a submission (XP/mastery changed) and on sign-out.
export function invalidate(prefix = ''): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

interface ApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

// Fetch `path` through the shared cache and expose { data, error, loading, reload }.
// Pass null to skip fetching.
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true; // ignore results that arrive after unmount

    let request = cache.get(path) as Promise<T> | undefined;
    if (!request) {
      request = api<T>(path);
      cache.set(path, request);
      request.catch(() => cache.delete(path)); // never cache a failure
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    request.then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        alive &&
        setState({
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }),
    );
    return () => {
      alive = false;
    };
  }, [path, nonce]);

  // Force a fresh request (e.g. the "Try again" button on an error state).
  const reload = useCallback(() => {
    if (path) cache.delete(path);
    setNonce((n) => n + 1);
  }, [path]);

  return { ...state, reload };
}
