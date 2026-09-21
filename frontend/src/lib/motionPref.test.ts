import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMotionChoice, motionIsOff, setMotionChoice } from './motionPref';

// Pretend the device asks (or doesn't ask) for reduced motion.
function device(reduced: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('reduce'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('motion preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setMotionChoice(null);
  });

  it('follows the device when the student has not chosen', () => {
    device(true);
    expect(getMotionChoice()).toBeNull();
    expect(motionIsOff()).toBe(true);
    device(false);
    expect(motionIsOff()).toBe(false);
  });

  it('lets the student override the device either way', () => {
    device(false);
    setMotionChoice(true); // wants calm on a lively device
    expect(motionIsOff()).toBe(true);
    device(true);
    setMotionChoice(false); // wants motion even though the device says reduce
    expect(motionIsOff()).toBe(false);
  });

  it('remembers the choice and can hand it back to the device', () => {
    device(true);
    setMotionChoice(false);
    expect(window.localStorage.getItem('sq-reduce-motion')).toBe('off');
    setMotionChoice(null);
    expect(window.localStorage.getItem('sq-reduce-motion')).toBeNull();
    expect(motionIsOff()).toBe(true); // back to following the device
  });
});
