import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setMotionChoice } from '../../lib/motionPref';
import { TracePlayer } from './TracePlayer';
import type { TraceFrame, TraceStep } from './types';

// jsdom lays nothing out, so every element reports offsetTop 0 and the arrow
// (measured from real positions) would collapse. Give each line a height, the
// way a browser would, so the gutter arrow can be tested at all.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement;
      return parent ? Array.prototype.indexOf.call(parent.children, this) * 20 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
});

const CODE = `public class Loops {
    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 3; i++) {
            total = total + i;
        }
        System.out.println(total);
    }
}`;

// The shape a real recording has for this program: the for header, the body,
// round again, and finally out of the loop to the println.
const at = (line: number, total: number): TraceFrame => ({
  done: false,
  stack: [{ m: 'main', line, vars: { total: { t: 'int', v: total } } }],
  heap: {},
  out: '',
});

const step: TraceStep = {
  id: 'run',
  type: 'trace',
  code: CODE,
  notes: {},
  trace: {
    truncated: false,
    frames: [
      at(3, 0), // 0: about to create total
      at(4, 0), // 1: the loop header
      at(5, 0), // 2: into the body  -> condition true
      at(4, 1), // 3: back to the header -> loop-back arrow
      at(5, 1), // 4: into the body again
      at(4, 3), // 5: header once more
      at(7, 6), // 6: out of the loop -> condition false, skip arrow
      { done: true, stack: [], heap: {}, out: '6\n' },
    ],
  },
};

const next = () => fireEvent.click(screen.getByRole('button', { name: /next line/i }));

// Let anything still moving run to the end inside act(), so no animation reports
// a React update after the test has already finished.
const settle = async (ms = 500) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

// The animations are driven by requestAnimationFrame, so a test about movement
// fakes the clock and steps it forward itself. Nothing is then left running when
// the test ends, and the assertions don't race a real animation.
const ROLL_MS = 300; // matches TracePlayer
const TYPE_MS = 420;
const useFakeFrames = () =>
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('TracePlayer annotations', () => {
  it('shows nothing until a decision has actually been made', async () => {
    render(<TracePlayer step={step} />);
    expect(screen.queryByText(/was (true|false)/)).not.toBeInTheDocument();
    next(); // frame 1: line 3 ran, which decides nothing
    expect(screen.queryByText(/was (true|false)/)).not.toBeInTheDocument();
    await settle();
  });

  it('marks the condition true on entering the body, and false on leaving the loop', async () => {
    render(<TracePlayer step={step} />);
    next();
    next(); // frame 2: the header let us into the body
    expect(screen.getByText('i <= 3 was true')).toBeInTheDocument();

    next(); // 3
    next(); // 4
    next(); // 5
    next(); // frame 6: the loop is finished
    expect(screen.getByText('i <= 3 was false')).toBeInTheDocument();
    expect(screen.queryByText('i <= 3 was true')).not.toBeInTheDocument();
    await settle();
  });

  it('draws the gutter arrow back to the top of the loop, then past it', async () => {
    render(<TracePlayer step={step} />);
    next();
    next();
    next(); // frame 3: the body jumped back to the header
    expect(screen.getByRole('img', { name: 'Execution went back to line 4' })).toBeInTheDocument();

    next();
    next();
    next(); // frame 6: the header jumped past the loop body
    expect(screen.getByRole('img', { name: 'Execution skipped ahead to line 7' })).toBeInTheDocument();
    await settle();
  });

  it('drops both annotations once the program has finished', async () => {
    render(<TracePlayer step={step} />);
    fireEvent.click(screen.getByRole('button', { name: /last step/i }));
    expect(screen.queryByText(/was (true|false)/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /execution/i })).not.toBeInTheDocument();
    await settle();
  });
});

// ---- values arriving: rolling numbers, typed output, the returned value -----

const CALLS = `public class Calls {
    static int twice(int n) {
        return n * 2;
    }

    public static void main(String[] args) {
        int x = 0;
        x = twice(3);
        System.out.println("total " + x);
    }
}`;

const callStep: TraceStep = {
  id: 'run',
  type: 'trace',
  code: CALLS,
  notes: {},
  trace: {
    truncated: false,
    frames: [
      { done: false, stack: [{ m: 'main', line: 8, vars: { x: { t: 'int', v: 0 } } }], heap: {}, out: '' },
      {
        done: false,
        stack: [
          { m: 'twice', line: 3, vars: { n: { t: 'int', v: 3 } } },
          { m: 'main', line: 8, vars: { x: { t: 'int', v: 0 } } },
        ],
        heap: {},
        out: '',
      },
      {
        done: false,
        stack: [{ m: 'main', line: 9, vars: { x: { t: 'int', v: 6 } } }],
        heap: {},
        out: '',
        ret: { m: 'twice', v: { t: 'int', v: 6 } },
      },
      { done: false, stack: [{ m: 'main', line: 10, vars: { x: { t: 'int', v: 6 } } }], heap: {}, out: 'total 6\n' },
    ],
  },
};

describe('TracePlayer values', () => {
  // Back to the suite-wide default. Wrapped in act() because changing the
  // setting re-renders every component that reads it, and some are still mounted.
  afterEach(() => act(() => setMotionChoice(true)));

  it('puts a new call on top of the stack and takes it off again', async () => {
    render(<TracePlayer step={callStep} />);
    expect(screen.getAllByRole('listitem').some((li) => li.textContent?.includes('twice()'))).toBe(false);

    next(); // the call
    expect(screen.getByText('twice()')).toBeInTheDocument();
    expect(screen.getByText('main()')).toBeInTheDocument();

    next(); // the return
    await waitFor(() => expect(screen.queryByText('twice()')).not.toBeInTheDocument());
    await settle();
  });

  it('hands the returned value to the frame that asked for it', async () => {
    render(<TracePlayer step={callStep} />);
    next();
    next();
    const chip = screen.getByText(/twice\(\) returned/);
    const card = chip.closest('li');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('main()')).toBeInTheDocument(); // it landed in the caller
    expect(card).toHaveTextContent('6');
    await settle();
  });

  it('counts a changed number up to its real value', async () => {
    useFakeFrames();
    setMotionChoice(false); // this one is about the movement itself
    try {
      render(<TracePlayer step={callStep} />);
      next();
      next();
      const x = screen.getByText('x').parentElement as HTMLElement; // the name sits above its value box
      expect(x).toHaveTextContent('x0'); // starts from the value it had
      await advance(ROLL_MS / 2);
      expect(x).not.toHaveTextContent('x0'); // on its way
      expect(x).not.toHaveTextContent('x6');
      await advance(ROLL_MS);
      expect(x).toHaveTextContent('x6'); // and lands exactly on the real value
    } finally {
      vi.useRealTimers();
    }
  });

  it('types the new output out in full', async () => {
    useFakeFrames();
    setMotionChoice(false);
    try {
      render(<TracePlayer step={callStep} />);
      next();
      next();
      next();
      const out = () => document.querySelector('pre') as HTMLElement;
      expect(out).not.toBeNull();
      await advance(TYPE_MS / 4);
      expect(out()).not.toHaveTextContent('total 6'); // still arriving
      await advance(TYPE_MS);
      expect(out()).toHaveTextContent('total 6'); // all of it, exactly once
      expect(out().textContent).toBe('total 6\n');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---- the student's own reduce-motion switch (Settings -> Animations) --------

describe('TracePlayer with animations turned off', () => {
  it('shows the new value and the new output at once, without any counting', async () => {
    setMotionChoice(true);
    render(<TracePlayer step={callStep} />);
    next();
    next();
    const x = screen.getByText('x').parentElement as HTMLElement;
    expect(x).toHaveTextContent('x6'); // straight to the answer, no roll
    next();
    expect(document.querySelector('pre')).toHaveTextContent('total 6'); // no typing either
    await settle();
  });
});
