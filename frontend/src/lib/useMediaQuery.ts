import { useEffect, useState } from 'react';

// Does the screen match a CSS media query right now? Re-renders when it changes
// (a phone rotated, a window resized). For layout that CSS alone can't express —
// like moving a control to a different place in the page — so the control is
// rendered once, in one place, rather than twice with one copy hidden.
export function useMediaQuery(query: string): boolean {
  const read = () => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false; // matchMedia unavailable: assume the wide layout
    }
  };
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(media.matches);
    onChange(); // the query may have changed since the first render
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
