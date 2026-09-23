import { useCallback, useEffect, useRef, useState } from 'react';

// Which screen the app shows, kept in the BROWSER HISTORY so the phone's (or the
// browser's) Back button moves back through the app instead of leaving it —
// before this, pressing Back in the middle of a level closed SkillQuest.
//
// This is the light version: the URL doesn't change (no router yet), so a
// refresh still starts at the dashboard. Each in-app move pushes a history
// entry carrying the screen; Back pops it and the app shows that screen again.
// The app's own Back buttons go through the same history, so the two never
// disagree about where "back" is.

interface Entry<T> {
  sqNav: T; // the screen
  sqDepth: number; // how many in-app entries sit below this one
}

function isEntry<T>(s: unknown): s is Entry<T> {
  return typeof s === 'object' && s !== null && 'sqNav' in s && 'sqDepth' in s;
}

export function useNavHistory<T>(home: T): {
  nav: T;
  go: (next: T, options?: { replace?: boolean }) => void;
  back: (fallback: T) => void;
} {
  const [nav, setNav] = useState<T>(home);
  const depth = useRef(0);

  useEffect(() => {
    // The page's own entry becomes the home screen.
    window.history.replaceState({ sqNav: home, sqDepth: 0 } satisfies Entry<T>, '');
    const onPop = (e: PopStateEvent) => {
      const entry = isEntry<T>(e.state) ? e.state : { sqNav: home, sqDepth: 0 };
      depth.current = entry.sqDepth;
      setNav(entry.sqNav);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Once: `home` is a constant for the app's lifetime.
  }, []);

  // Move to a screen. `replace` swaps the current entry instead of adding one
  // (for "next level": Back should return to the map, not the level before).
  const go = useCallback((next: T, options?: { replace?: boolean }) => {
    if (options?.replace) {
      window.history.replaceState({ sqNav: next, sqDepth: depth.current } satisfies Entry<T>, '');
    } else {
      depth.current += 1;
      window.history.pushState({ sqNav: next, sqDepth: depth.current } satisfies Entry<T>, '');
    }
    setNav(next);
  }, []);

  // The app's own Back: step back through history if there is an in-app entry
  // to return to; otherwise (nothing below us) show `fallback` in place.
  const back = useCallback((fallback: T) => {
    if (depth.current > 0) {
      window.history.back(); // popstate restores the screen below
    } else {
      window.history.replaceState({ sqNav: fallback, sqDepth: 0 } satisfies Entry<T>, '');
      setNav(fallback);
    }
  }, []);

  return { nav, go, back };
}
