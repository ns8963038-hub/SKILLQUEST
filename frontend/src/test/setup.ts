import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'motion/react';
import { setMotionChoice } from '../lib/motionPref';

// Tests run as if the student had turned animations off (Settings -> Animations),
// and Motion's own animations finish instantly. Components are then asserted on
// their final state — the state a student ends up looking at — instead of racing
// springs that keep updating React after the test has finished.
// A test that is specifically about an animation turns it back on for itself.
MotionGlobalConfig.skipAnimations = true;
setMotionChoice(true);

// jsdom is missing a few browser APIs that the redesigned UI touches. These are
// minimal no-op stubs so components render in tests as they would in a browser
// with animations switched off.

// matchMedia — used to detect "prefers-reduced-motion".
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Canvas — the ambient background draws on a <canvas>; jsdom has no 2D context.
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

// Observers used by layout-aware components.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const w = window as unknown as Record<string, unknown>;
if (!('ResizeObserver' in window)) w.ResizeObserver = NoopObserver;
if (!('IntersectionObserver' in window)) w.IntersectionObserver = NoopObserver;

// jsdom logs "not implemented" for scrollTo; screens scroll to top on navigation.
window.scrollTo = (() => {}) as typeof window.scrollTo;
