import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { useMotionOff } from '../../lib/motionPref';
import { Flash, Scalar, sig } from './values';
import type { TraceFrame, TraceStackFrame, TraceValue, TraceVisual } from './types';

// THE ARRAY, DRAWN
//
// Searching and sorting are the two topics where the memory panel isn't enough:
// what matters is *where* lo, mid and hi are, and which part of the array is
// still in play. So a lesson can ask for one array to be drawn as a strip of
// cells (or bars, for sorting), with its pointers marked underneath.
//
// Everything shown is read straight out of the recording. If the named array
// isn't in scope at this step, the strip disappears rather than showing a stale
// picture, and a pointer that has run off the end is simply not drawn.

const CELL = '2.75rem'; // one grid column, shared by the cells, indexes and markers

// The innermost call that actually holds the array right now. Exported so the
// memory panel can leave that one variable out and not draw it twice.
export function frameWithArray(stack: TraceStackFrame[], name: string): TraceStackFrame | undefined {
  return stack.find((f) => f.vars[name]?.t === 'array');
}

// An int variable's value, or undefined when it isn't a plain number here.
function indexOf(frame: TraceStackFrame, name: string): number | undefined {
  const v = frame.vars[name];
  return v && (v.t === 'int' || v.t === 'long') && typeof v.v === 'number' ? v.v : undefined;
}

export function ArrayStrip({ visual, frame, prev }: { visual: TraceVisual; frame: TraceFrame; prev?: TraceFrame }) {
  const off = useMotionOff();
  const here = frameWithArray(frame.stack, visual.array);
  if (!here) return null; // not in scope at this step

  const items = here.vars[visual.array]?.items ?? [];
  if (items.length === 0) return null;

  // The same array one step ago, for the "this cell just changed" flash.
  const beforeFrame = prev ? frameWithArray(prev.stack, visual.array) : undefined;
  const before = beforeFrame?.m === here.m ? beforeFrame.vars[visual.array]?.items : undefined;

  // Pointers that are currently pointing at a real cell.
  const pointers = (visual.pointers ?? [])
    .map((name) => ({ name, at: indexOf(here, name) }))
    .filter((p): p is { name: string; at: number } => p.at !== undefined && p.at >= 0 && p.at < items.length);

  // The part of the array still in play, when the lesson named two bounds.
  const low = visual.range ? indexOf(here, visual.range[0]) : undefined;
  const high = visual.range ? indexOf(here, visual.range[1]) : undefined;
  const bounded = low !== undefined && high !== undefined;
  const inPlay = (k: number) => !bounded || (k >= low! && k <= high!);

  const bars = visual.mode === 'bars';
  const biggest = Math.max(1, ...items.map((v) => (typeof v.v === 'number' ? Math.abs(v.v) : 0)));
  const column = { gridTemplateColumns: `repeat(${items.length}, ${CELL})` };

  return (
    <div className="glass rounded-2xl p-4">
      <p className="eyebrow mb-3">
        {visual.array}
        <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-content-faint">
          {items.length} items{bounded ? ` · searching ${low}…${high}` : ''}
        </span>
      </p>

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-max gap-y-1" style={column}>
          {/* Bars (sorting): height is the value, so a swap is visible as movement. */}
          {bars &&
            items.map((item, k) => (
              <div key={`bar-${k}`} className="flex h-16 items-end px-0.5" style={{ gridRow: 1, gridColumn: k + 1 }}>
                <motion.div
                  className="w-full rounded-t bg-gradient-to-t from-ion/40 to-ion/80"
                  animate={{ height: `${Math.max(6, (Math.abs(Number(item.v) || 0) / biggest) * 100)}%` }}
                  transition={{ duration: off ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            ))}

          {/* The cells themselves. */}
          {items.map((item, k) => (
            <Cell
              key={`cell-${k}`}
              item={item}
              index={k}
              row={bars ? 2 : 1}
              changed={before ? sig(before[k]) !== sig(item) : false}
              dim={!inPlay(k)}
            />
          ))}

          {/* Index labels. */}
          {items.map((_, k) => (
            <span
              key={`idx-${k}`}
              className={cn('text-center font-mono text-[9px]', inPlay(k) ? 'text-content-faint' : 'text-content-faint/40')}
              style={{ gridRow: bars ? 3 : 2, gridColumn: k + 1 }}
              aria-hidden
            >
              [{k}]
            </span>
          ))}

          {/* One lane per pointer, so two pointers on the same cell never overlap. */}
          {pointers.map((p, lane) => (
            <motion.span
              key={p.name}
              layout={!off}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              className="mx-auto inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-tint px-1.5 font-mono text-[10px] leading-[1.5] text-accent"
              style={{ gridRow: (bars ? 3 : 2) + 1 + lane, gridColumn: p.at + 1 }}
            >
              <span aria-hidden>▲</span>
              {p.name}
              <span className="sr-only">is at index {p.at}</span>
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}

// One cell: the value, flashing gold when this step changed it, dimmed when it
// has been ruled out of the search.
function Cell({ item, index, row, changed, dim }: { item: TraceValue; index: number; row: number; changed: boolean; dim: boolean }) {
  return (
    <div className="px-px" style={{ gridRow: row, gridColumn: index + 1 }}>
      <Flash on={changed} token={sig(item)} className="block w-full">
        <span
          className={cn(
            'grid h-9 w-full place-items-center rounded-lg border font-mono text-[12.5px] transition-opacity duration-200',
            dim ? 'border-line bg-surface-2/40 opacity-35' : 'border-line-strong bg-base/70',
          )}
        >
          <Scalar value={item} />
        </span>
      </Flash>
    </div>
  );
}
