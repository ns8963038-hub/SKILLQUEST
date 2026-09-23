import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNavHistory } from './navHistory';

type Nav = { view: string; level: string | null };
const HOME: Nav = { view: 'dashboard', level: null };

describe('useNavHistory (the Back button moves through the app)', () => {
  it('the browser’s Back returns to the previous screen instead of leaving the app', async () => {
    const { result } = renderHook(() => useNavHistory<Nav>(HOME));
    act(() => result.current.go({ view: 'roadmap', level: null }));
    act(() => result.current.go({ view: 'roadmap', level: 'loops-01' }));
    expect(result.current.nav.level).toBe('loops-01');

    act(() => window.history.back()); // the phone's Back button
    await waitFor(() => expect(result.current.nav).toEqual({ view: 'roadmap', level: null }));
    act(() => window.history.back());
    await waitFor(() => expect(result.current.nav).toEqual(HOME));
  });

  it('"next level" replaces the entry, so Back goes to the map, not the level before', async () => {
    const { result } = renderHook(() => useNavHistory<Nav>(HOME));
    act(() => result.current.go({ view: 'roadmap', level: 'loops-01' }));
    act(() => result.current.go({ view: 'roadmap', level: 'loops-02' }, { replace: true }));
    act(() => window.history.back());
    await waitFor(() => expect(result.current.nav).toEqual(HOME));
  });

  it('the app’s own Back uses the same history, or shows the fallback when there is nothing below', async () => {
    const { result } = renderHook(() => useNavHistory<Nav>(HOME));
    act(() => result.current.back({ view: 'roadmap', level: null })); // nothing below: shown in place
    expect(result.current.nav).toEqual({ view: 'roadmap', level: null });

    act(() => result.current.go({ view: 'roadmap', level: 'loops-01' }));
    act(() => result.current.back({ view: 'ignored', level: null }));
    await waitFor(() => expect(result.current.nav).toEqual({ view: 'roadmap', level: null }));
  });
});
