import { useCallback, useEffect, useState } from 'react';

// WHO DECIDES WHETHER THINGS MOVE
//
// The phone (or laptop) already has a "reduce motion" accessibility setting, and
// that is the default answer. But plenty of students never find that setting, and
// some just want the animations off on a slow phone — so the app carries its own
// switch that overrides the device, remembered per device.
//
//   null  -> follow the device setting (the default)
//   true  -> the student asked for reduced motion
//   false -> the student asked for full motion
//
// Everything animated reads this through useMotionPref()/useMotionOff(), and
// MotionConfig in main.tsx turns it into Motion's own reducedMotion mode.

const KEY = 'sq-reduce-motion';
export type MotionChoice = null | boolean;

// Everyone listening to the setting, so a change anywhere updates every screen
// (including other tabs, via the storage event).
const listeners = new Set<(choice: MotionChoice) => void>();
let current: MotionChoice = read();

function read(): MotionChoice {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === 'on' ? true : raw === 'off' ? false : null;
  } catch {
    return null; // storage blocked (private mode): just follow the device
  }
}

// True when the device itself asks for reduced motion.
export function deviceWantsReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// The student's choice, or null when they haven't chosen.
export function getMotionChoice(): MotionChoice {
  return current;
}

// Should animation be suppressed right now?
export function motionIsOff(choice: MotionChoice = current): boolean {
  return choice ?? deviceWantsReducedMotion();
}

// Change (or clear) the choice and tell every listener.
export function setMotionChoice(choice: MotionChoice): void {
  current = choice;
  try {
    if (choice === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice ? 'on' : 'off');
  } catch {
    /* storage blocked — the choice still applies for this session */
  }
  for (const listener of listeners) listener(choice);
}

// Subscribe to the setting: React state that follows the choice, the device
// setting, and changes made in another tab.
export function useMotionPref(): { choice: MotionChoice; off: boolean; setChoice: (c: MotionChoice) => void } {
  const [choice, setChoiceState] = useState<MotionChoice>(current);
  const [deviceOff, setDeviceOff] = useState(deviceWantsReducedMotion);

  useEffect(() => {
    const onChange = (c: MotionChoice) => setChoiceState(c);
    listeners.add(onChange);
    // Another tab changed it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        current = read();
        setChoiceState(current);
      }
    };
    window.addEventListener('storage', onStorage);
    // The device setting itself changed.
    let media: MediaQueryList | null = null;
    const onMedia = () => setDeviceOff(deviceWantsReducedMotion());
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
      media.addEventListener('change', onMedia);
    } catch {
      /* matchMedia unavailable: the device default stays false */
    }
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
      media?.removeEventListener('change', onMedia);
    };
  }, []);

  const setChoice = useCallback((c: MotionChoice) => setMotionChoice(c), []);
  return { choice, off: choice ?? deviceOff, setChoice };
}

// The common case: "should I skip this animation?"
export function useMotionOff(): boolean {
  return useMotionPref().off;
}
