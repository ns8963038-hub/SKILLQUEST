import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { setMotionChoice } from '../lib/motionPref';
import { Nova } from './Nova';

// Nova's current mood is written on its root as data-mood.
const moodOf = (c: HTMLElement) => c.querySelector('[data-mood]')!.getAttribute('data-mood');

// Poking reads the clock, so the tests drive it themselves.
function useFakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
}
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('Nova, poked', () => {
  afterEach(() => vi.useRealTimers());

  it('gets annoyed at three quick pokes and angry at five', () => {
    useFakeClock();
    const { container } = render(<Nova pokeable />);
    const nova = container.querySelector('[data-mood]')!;
    for (let i = 1; i <= 5; i++) {
      fireEvent.pointerDown(nova);
      if (i === 2) expect(moodOf(container)).toBe('idle'); // two pokes: just a boop
      if (i === 3) expect(moodOf(container)).toBe('annoyed');
      wait(300);
    }
    expect(moodOf(container)).toBe('angry');
    expect(container.querySelector('svg path[d^="M9.5 3"]')).not.toBeNull(); // the anger vein
  });

  it('calms down once the poking stops: angry, then annoyed, then its own mood', () => {
    useFakeClock();
    const { container } = render(<Nova pokeable mood="happy" />);
    const nova = container.querySelector('[data-mood]')!;
    for (let i = 0; i < 5; i++) {
      fireEvent.pointerDown(nova);
      wait(200);
    }
    expect(moodOf(container)).toBe('angry');
    wait(2600);
    expect(moodOf(container)).toBe('annoyed');
    wait(1200);
    expect(moodOf(container)).toBe('happy'); // back to what the screen asked for
  });

  it('only counts pokes that come in a row', () => {
    useFakeClock();
    const { container } = render(<Nova pokeable />);
    const nova = container.querySelector('[data-mood]')!;
    for (let i = 0; i < 6; i++) {
      fireEvent.pointerDown(nova);
      wait(1500); // slower than a streak
    }
    expect(moodOf(container)).toBe('idle');
  });

  it('ignores pokes unless the screen allows them', () => {
    const { container } = render(<Nova />);
    const nova = container.querySelector('[data-mood]')!;
    for (let i = 0; i < 6; i++) fireEvent.pointerDown(nova);
    expect(moodOf(container)).toBe('idle');
  });
});

describe('Nova, turned round', () => {
  afterEach(() => act(() => setMotionChoice(true))); // back to the suite default

  it('hides its face on the back', () => {
    const { container } = render(<Nova mood="turned" />);
    expect(moodOf(container)).toBe('turned');
    const face = [...container.querySelectorAll('span')].find((el) => el.style.backfaceVisibility === 'hidden');
    expect(face).toBeDefined(); // the face is drawn on the front only
  });

  it('whistles while turned — but only when animations are on', () => {
    const still = render(<Nova mood="turned" />);
    expect(still.container.textContent).not.toContain('♪'); // animations off (the test default)
    still.unmount();
    act(() => setMotionChoice(false));
    const moving = render(<Nova mood="turned" />);
    expect(moving.container.textContent).toContain('♪');
  });
});
