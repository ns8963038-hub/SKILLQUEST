import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward, Terminal } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Nova } from '../../ui/Nova';
import { CodeView } from './CodeView';
import type { TraceFrame, TraceStackFrame, TraceStep, TraceValue } from './types';

// "WATCH IT RUN" — plays back an execution recorded from the real JVM
// (content/tools/Tracer.java). Each frame is the program's state just BEFORE the
// highlighted line runs: every call on the stack with its variables, the
// program's own objects, and everything printed so far. Values that just
// changed flash gold, so the eye goes straight to what the line did.

const AUTOPLAY_MS = 1100;

// A stable string for comparing two values between frames.
const sig = (v: TraceValue | undefined) => JSON.stringify(v ?? null);

// A value as plain words, for Nova's narration ("returned 9").
function plain(v: TraceValue | null | undefined): string {
  if (!v) return 'nothing';
  switch (v.t) {
    case 'str':
      return `"${String(v.v)}"`;
    case 'char':
      return `'${String(v.v)}'`;
    case 'null':
      return 'null';
    case 'ref':
      return `object #${v.id}`;
    case 'array':
      return `[${(v.items ?? []).map(plain).join(', ')}]`;
    default:
      return String(v.v);
  }
}

// Match a stack frame to the same call in the previous frame (counted from the
// bottom of the stack, so a new call on top doesn't shift the others).
function previousFrameOf(prev: TraceFrame | undefined, stack: TraceStackFrame[], index: number): TraceStackFrame | undefined {
  if (!prev) return undefined;
  const fromBottom = stack.length - 1 - index;
  const candidate = prev.stack[prev.stack.length - 1 - fromBottom];
  return candidate && candidate.m === stack[index]!.m ? candidate : undefined;
}

export function TracePlayer({ step, onFinished }: { step: TraceStep; onFinished?: () => void }) {
  const frames = step.trace.frames;
  const last = frames.length - 1;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frame = frames[i]!;
  const prev = i > 0 ? frames[i - 1] : undefined;
  const line = frame.stack[0]?.line;

  // Move to a frame, clamped; reaching the end stops autoplay and tells the lesson.
  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(last, n));
      setI(next);
      if (next === last) {
        setPlaying(false);
        onFinished?.();
      }
    },
    [last, onFinished],
  );

  // Autoplay: one line per tick.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go(i + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, i, go]);

  // Keyboard: ← / → step, space plays or pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => (i === last ? (go(0), true) : !p));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, last, go]);

  // Nova's line. Just after a method returns, say what it handed back (the line's
  // own narration would describe the call again). Otherwise the author's
  // narration for this line, or a neutral fallback.
  const ret = frame.ret;
  const back = frame.stack[0] ? `, back in ${frame.stack[0].m}()` : '';
  // A new call just started (the stack grew): say so when the line has no narration.
  const entered = Boolean(prev && frame.stack.length > prev.stack.length);
  const codeLine = line !== undefined ? step.code.split('\n')[line - 1]?.trim() : undefined;
  const note = frame.done
    ? 'Done! The program has finished. Everything it printed is in the output below.'
    : ret
      ? ret.v
        ? `${ret.m}() returned ${plain(ret.v)}${back}.`
        : `${ret.m}() finished${back}.`
      : (line !== undefined && step.notes[String(line)]) ||
        (entered
          ? `Calling ${frame.stack[0]?.m}(): a new frame goes on top of the stack, with its own variables.`
          : `Next up: ${codeLine ?? `line ${line}`}`);
  const newOutput = prev ? frame.out.slice(prev.out.length) : frame.out;
  const oldOutput = frame.out.slice(0, frame.out.length - newOutput.length);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ---- Left: Nova narrates, the code runs ---- */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-start gap-3" aria-live="polite">
          <Nova mood={frame.done ? 'happy' : playing ? 'talking' : 'idle'} size={44} className="shrink-0" />
          <AnimatePresence mode="wait">
            <motion.p
              key={`${i}-${note}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative min-h-[3.25rem] flex-1 rounded-2xl rounded-tl-md border border-ion/20 bg-ion-tint/70 px-4 py-2.5 text-sm leading-relaxed text-content"
            >
              {note}
            </motion.p>
          </AnimatePresence>
        </div>
        <CodeView code={step.code} activeLine={line} />

        {/* Transport controls */}
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
          <IconBtn label="First step" onClick={() => go(0)} disabled={i === 0}>
            <SkipBack size={15} />
          </IconBtn>
          <IconBtn label="Previous line" onClick={() => go(i - 1)} disabled={i === 0}>
            <ChevronLeft size={17} />
          </IconBtn>
          <button
            type="button"
            onClick={() => (i === last ? (go(0), setPlaying(true)) : setPlaying((p) => !p))}
            className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b from-ion-soft to-ion text-ink shadow-[0_8px_24px_-10px_rgba(77,124,255,0.9)] transition-transform active:scale-95"
            aria-label={playing ? 'Pause' : i === last ? 'Replay' : 'Play'}
          >
            {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="ml-0.5 fill-current" />}
          </button>
          <IconBtn label="Next line" onClick={() => go(i + 1)} disabled={i === last}>
            <ChevronRight size={17} />
          </IconBtn>
          <IconBtn label="Last step" onClick={() => go(last)} disabled={i === last}>
            <SkipForward size={15} />
          </IconBtn>
          <input
            type="range"
            min={0}
            max={last}
            value={i}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Step through the program"
            className="mx-1 min-w-[80px] flex-1"
          />
          <span className="font-mono text-[11px] tabular-nums text-content-muted">
            {i + 1}/{frames.length}
          </span>
        </div>
        <p className="hidden text-center text-[11px] text-content-faint sm:block">← → to step · space to play</p>
      </div>

      {/* ---- Right: memory and output ---- */}
      <div className="min-w-0 space-y-3">
        <Memory frame={frame} prev={prev} />
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#070B16]">
          <p className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-content-muted">
            <Terminal size={12} aria-hidden /> Output
          </p>
          <pre className="min-h-[3.5rem] whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-content">
            {frame.out === '' ? (
              <span className="text-content-faint">(nothing printed yet)</span>
            ) : (
              <>
                {oldOutput}
                {newOutput && (
                  <motion.span key={i} initial={{ backgroundColor: 'rgba(127,168,255,0.35)' }} animate={{ backgroundColor: 'rgba(127,168,255,0)' }} transition={{ duration: 1.2 }} className="rounded text-ion-soft">
                    {newOutput}
                  </motion.span>
                )}
              </>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---- Memory: the call stack, then the program's own objects -----------------------

function Memory({ frame, prev }: { frame: TraceFrame; prev?: TraceFrame }) {
  const objects = Object.entries(frame.heap);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{frame.stack.length > 1 ? `Memory · ${frame.stack.length} calls deep` : 'Memory'}</p>
        {/* A method just handed a value back to its caller. */}
        {frame.ret && (
          <motion.span
            key={`${frame.ret.m}-${sig(frame.ret.v ?? undefined)}-${frame.stack.length}`}
            initial={{ opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-tint px-2.5 py-1 font-mono text-[11px] text-accent"
          >
            ↩ {frame.ret.m}() returned{frame.ret.v ? <> <Scalar value={frame.ret.v} /></> : ''}
          </motion.span>
        )}
      </div>
      {frame.done ? (
        <p className="text-sm text-content-muted">The program has ended, so its variables are gone.</p>
      ) : (
        <ol className="space-y-2.5">
          {frame.stack.map((f, idx) => {
            const before = previousFrameOf(prev, frame.stack, idx);
            const top = idx === 0;
            return (
              <motion.li
                key={`${frame.stack.length - idx}-${f.m}`}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: top ? 1 : 0.62, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className={cn(
                  'rounded-xl border px-3 py-2.5',
                  top ? 'border-ion/35 bg-ion-tint/50' : 'border-line bg-surface-2/50',
                )}
              >
                <p className="mb-2 flex items-center justify-between font-mono text-[11px]">
                  <span className={top ? 'text-ion' : 'text-content-muted'}>{f.m}()</span>
                  <span className="text-content-faint">{top ? `line ${f.line}` : `waiting at line ${f.line}`}</span>
                </p>
                {Object.keys(f.vars).length === 0 ? (
                  <p className="text-xs text-content-faint">no variables yet</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(f.vars).map(([name, v]) => (
                      <Variable key={name} name={name} value={v} changed={!before || sig(before.vars[name]) !== sig(v)} previous={before?.vars[name]} />
                    ))}
                  </div>
                )}
              </motion.li>
            );
          })}
        </ol>
      )}
      {objects.length > 0 && !frame.done && <Objects heap={frame.heap} prevHeap={prev?.heap} />}
    </div>
  );
}

// One variable: its name above a value box that flashes when the value changes.
function Variable({ name, value, changed, previous }: { name: string; value: TraceValue; changed: boolean; previous?: TraceValue }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-mono text-[10px] text-content-muted">{name}</p>
      <ValueBox value={value} changed={changed} previous={previous} />
    </div>
  );
}

function ValueBox({ value, changed, previous }: { value: TraceValue; changed: boolean; previous?: TraceValue }) {
  if (value.t === 'array') {
    const prevItems = previous?.t === 'array' ? previous.items ?? [] : undefined;
    return (
      <div className="flex">
        {(value.items ?? []).map((item, k) => {
          const cellChanged = prevItems ? sig(prevItems[k]) !== sig(item) : changed;
          return (
            <div key={k} className="flex flex-col items-center">
              <Flash on={cellChanged} token={sig(item)}>
                <span className={cn('grid h-8 min-w-[2.25rem] place-items-center border border-line-strong bg-base/70 px-1.5 font-mono text-[12px]', k === 0 && 'rounded-l-lg', k === (value.items?.length ?? 0) - 1 && 'rounded-r-lg', k > 0 && '-ml-px')}>
                  <Scalar value={item} />
                </span>
              </Flash>
              <span className="mt-0.5 font-mono text-[9px] text-content-faint">[{k}]</span>
            </div>
          );
        })}
        {(value.items ?? []).length === 0 && <span className="font-mono text-xs text-content-faint">[ ] empty</span>}
      </div>
    );
  }
  return (
    <Flash on={changed} token={sig(value)}>
      <span className="inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-line-strong bg-base/70 px-2.5 font-mono text-[12.5px]">
        <Scalar value={value} />
      </span>
    </Flash>
  );
}

// A gold flash when a value changes (keyed on the value so each change replays it).
function Flash({ on, token, children }: { on: boolean; token: string; children: ReactNode }) {
  return (
    <motion.span
      key={on ? token : 'still'}
      initial={on ? { boxShadow: '0 0 0 2px rgba(255,197,61,0.95), 0 0 18px rgba(255,197,61,0.55)', scale: 1.08 } : false}
      animate={{ boxShadow: '0 0 0 0px rgba(255,197,61,0)', scale: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="inline-block rounded-lg"
    >
      {children}
    </motion.span>
  );
}

// A primitive / string / collection / reference, coloured like the code.
function Scalar({ value }: { value: TraceValue }) {
  switch (value.t) {
    case 'str':
      return <span className="text-success">&quot;{String(value.v)}&quot;</span>;
    case 'char':
      return <span className="text-success">&apos;{String(value.v)}&apos;</span>;
    case 'boolean':
      return <span className="text-ion">{String(value.v)}</span>;
    case 'null':
      return <span className="text-content-faint">null</span>;
    case 'coll':
      return (
        <span>
          <span className="text-ion-soft">{value.cls} </span>
          <span className="text-content">{String(value.v)}</span>
        </span>
      );
    case 'ref':
      return <span className="text-ember">→ #{value.id}</span>;
    case 'array':
      return <span className="text-content-muted">[…]</span>;
    case 'more':
      return <span className="text-content-faint">…</span>;
    default:
      return <span className="text-accent">{String(value.v)}</span>;
  }
}

// ---- Objects: linked lists as chains, everything else as cards ---------------------

function Objects({
  heap,
  prevHeap,
}: {
  heap: TraceFrame['heap'];
  prevHeap?: TraceFrame['heap'];
}) {
  // Linked-list chains: follow `next` from each node nothing points to.
  const chains = useMemo(() => {
    const ids = Object.keys(heap);
    if (!ids.every((id) => 'next' in heap[id]!.fields)) return null;
    const pointedTo = new Set(ids.map((id) => heap[id]!.fields.next).filter((v) => v?.t === 'ref').map((v) => String(v!.id)));
    const starts = ids.filter((id) => !pointedTo.has(id));
    return (starts.length ? starts : ids.slice(0, 1)).map((start) => {
      const chain: string[] = [];
      let at: string | undefined = start;
      while (at && heap[at] && !chain.includes(at)) {
        chain.push(at);
        const nxt: TraceValue | undefined = heap[at]!.fields.next;
        at = nxt?.t === 'ref' ? String(nxt.id) : undefined;
      }
      return chain;
    });
  }, [heap]);

  const card = (id: string) => {
    const obj = heap[id]!;
    const before = prevHeap?.[id];
    return (
      <div key={id} className="rounded-xl border border-ember/30 bg-ember-tint/40 px-3 py-2">
        <p className="mb-1.5 font-mono text-[10px] text-ember">
          #{id} {obj.cls}
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(obj.fields).map(([name, v]) => (
            <Variable key={name} name={name} value={v} changed={!before || sig(before.fields[name]) !== sig(v)} previous={before?.fields[name]} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4">
      <p className="eyebrow mb-2">Objects</p>
      {chains ? (
        <div className="space-y-2 overflow-x-auto pb-1">
          {chains.map((chain) => (
            <div key={chain[0]} className="flex min-w-max items-center gap-1.5">
              {chain.map((id, k) => (
                <div key={id} className="flex items-center gap-1.5">
                  {card(id)}
                  {k < chain.length - 1 && <span className="text-ember" aria-hidden>→</span>}
                </div>
              ))}
              <span className="font-mono text-xs text-content-faint">→ null</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">{Object.keys(heap).map(card)}</div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-3 hover:text-content disabled:opacity-35"
    >
      {children}
    </button>
  );
}
