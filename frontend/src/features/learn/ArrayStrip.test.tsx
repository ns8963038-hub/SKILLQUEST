import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArrayStrip } from './ArrayStrip';
import type { TraceFrame, TraceValue, TraceVisual } from './types';

const cells = (...values: number[]): TraceValue => ({
  t: 'array',
  id: 1,
  cls: 'int[]',
  items: values.map((v) => ({ t: 'int', v })),
});

// One step of a binary search over {2, 5, 8, 12, 16, 23, 38}.
const search = (lo: number, mid: number, hi: number): TraceFrame => ({
  done: false,
  stack: [
    {
      m: 'main',
      line: 7,
      vars: {
        a: cells(2, 5, 8, 12, 16, 23, 38),
        lo: { t: 'int', v: lo },
        mid: { t: 'int', v: mid },
        hi: { t: 'int', v: hi },
      },
    },
  ],
  heap: {},
  out: '',
});

const visual: TraceVisual = { array: 'a', pointers: ['lo', 'mid', 'hi'], range: ['lo', 'hi'], mode: 'cells' };

describe('ArrayStrip', () => {
  it('draws every cell, its index, and each pointer where it stands', () => {
    render(<ArrayStrip visual={visual} frame={search(4, 5, 6)} />);
    for (const value of ['2', '5', '8', '12', '16', '23', '38']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('[6]')).toBeInTheDocument();
    expect(screen.getByText('lo').textContent).toContain('is at index 4');
    expect(screen.getByText('mid').textContent).toContain('is at index 5');
    expect(screen.getByText('hi').textContent).toContain('is at index 6');
  });

  it('dims the cells the search has already ruled out', () => {
    const { container } = render(<ArrayStrip visual={visual} frame={search(4, 5, 6)} />);
    const dimmed = [...container.querySelectorAll('span')].filter((el) => el.className.includes('opacity-35'));
    expect(dimmed).toHaveLength(4); // indexes 0–3 have been ruled out of [4, 6]
  });

  it('says how much of the array is still in play', () => {
    render(<ArrayStrip visual={visual} frame={search(0, 3, 6)} />);
    expect(screen.getByText(/7 items · searching 0…6/)).toBeInTheDocument();
  });

  it('leaves out a pointer that has run past the end', () => {
    render(<ArrayStrip visual={visual} frame={search(7, 6, 6)} />); // lo fell off the end
    expect(screen.queryByText('lo')).not.toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('shows nothing at all when the array is not in scope here', () => {
    const elsewhere: TraceFrame = { done: false, stack: [{ m: 'helper', line: 2, vars: {} }], heap: {}, out: '' };
    const { container } = render(<ArrayStrip visual={visual} frame={elsewhere} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws bars when the lesson asks for them, one per value', () => {
    const frame: TraceFrame = {
      done: false,
      stack: [{ m: 'main', line: 6, vars: { a: cells(5, 1, 4, 2), i: { t: 'int', v: 1 } } }],
      heap: {},
      out: '',
    };
    const { container } = render(<ArrayStrip visual={{ array: 'a', pointers: ['i'], mode: 'bars' }} frame={frame} />);
    const bars = container.querySelectorAll('div.flex.h-16');
    expect(bars).toHaveLength(4);
    expect(screen.getByText('i').textContent).toContain('is at index 1');
  });
});
