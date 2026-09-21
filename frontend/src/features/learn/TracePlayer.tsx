import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward, Terminal } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useMotionOff } from '../../lib/motionPref';
import { Nova } from '../../ui/Nova';
import { ArrayStrip, frameWithArray } from './ArrayStrip';
import { Scalar, Variable, sig } from './values';
import { CodeView, type DecisionMark } from './CodeView';
import { conditionText, decisionAt, findControlBlocks, jumpAt } from './traceAnalysis';
import type { TraceFrame, TraceStackFrame, TraceStep, TraceValue } from './types';

// "WATCH IT RUN" — plays back an execution recorded from the real JVM
// (content/tools/Tracer.java). Each frame is the program's state just BEFORE the
// highlighted line runs: every call on the stack with its variables, the
// program's own objects, and everything printed so far. Values that just
// changed flash gold, so the eye goes straight to what the line did.
//
// Two more things are read out of the recording (traceAnalysis.ts) and drawn on
// the code itself, so a student can follow the run without reading much English:
// the true/false result of the condition that led here, and an arrow when
// execution jumped — back to the top of a loop, or past a block that was
// skipped. Both describe the step just taken, like the gold flash does.

const AUTOPLAY_MS = 1100;
// The new output types out inside one autoplay tick, like the value animations.
const TYPE_MS = 420;

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

// New output appearing character by character, like a real terminal. The whole
// line is revealed inside TYPE_MS however long it is.
function Typed({ text, stepKey }: { text: string; stepKey: number }) {
  const off = useMotionOff();
  const [shown, setShown] = useState(text.length);

  useEffect(() => {
    if (off || text.length === 0) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const per = Math.min(28, TYPE_MS / text.length);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const n = Math.min(text.length, Math.floor((now - start) / per));
      setShown(n);
      if (n < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, stepKey, off]);

  return <>{text.slice(0, shown)}</>;
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

  // Where every `if`, `for` and `while` in this listing keeps its body.
  const blocks = useMemo(() => findControlBlocks(step.code), [step.code]);

  // What the step just taken did: the condition that decided it (when the
  // recording proves it) and the jump it made. Both stay undefined whenever the
  // trace can't say for certain, and then nothing is drawn.
  const decision = useMemo<DecisionMark | undefined>(() => {
    const value = prev ? decisionAt(blocks, frames, i - 1) : undefined;
    if (!value || !prev) return undefined;
    const at = prev.stack[0]!.line;
    return { line: at, value, condition: conditionText(step.code.split('\n')[at - 1] ?? ''), token: i };
  }, [blocks, frames, i, prev, step.code]);
  const jump = prev ? jumpAt(frames, i - 1) : undefined;

  // A lesson can ask for one array to be drawn in full (searching, sorting).
  // When it is drawn, the memory panel leaves that variable out instead of
  // showing the same array twice on a small screen.
  const strip = step.visual && !frame.done ? frameWithArray(frame.stack, step.visual.array) : undefined;
  const hidden = strip && step.visual ? { m: strip.m, name: step.visual.array } : undefined;

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
        <CodeView code={step.code} activeLine={line} decision={decision} jump={jump} jumpLane />

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
        {step.visual && <ArrayStrip visual={step.visual} frame={frame} prev={prev} />}
        <Memory frame={frame} prev={prev} hidden={hidden} />
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
                    <Typed text={newOutput} stepKey={i} />
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

function Memory({
  frame,
  prev,
  hidden,
}: {
  frame: TraceFrame;
  prev?: TraceFrame;
  hidden?: { m: string; name: string }; // a variable already drawn by the array strip
}) {
  const objects = Object.entries(frame.heap);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{frame.stack.length > 1 ? `Memory · ${frame.stack.length} calls deep` : 'Memory'}</p>
        {/* Nothing is left to receive the last return, so it is shown up here. */}
        {frame.ret && frame.stack.length === 0 && (
          <ReturnChip key={`${frame.ret.m}-${sig(frame.ret.v ?? undefined)}-end`} ret={frame.ret} />
        )}
      </div>
      {frame.done ? (
        <p className="text-sm text-content-muted">The program has ended, so its variables are gone.</p>
      ) : (
        <ol className="space-y-2.5">
          <AnimatePresence initial={false}>
            {frame.stack.map((f, idx) => {
              const before = previousFrameOf(prev, frame.stack, idx);
              const top = idx === 0;
              return (
                <motion.li
                  key={`${frame.stack.length - idx}-${f.m}`}
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: top ? 1 : 0.62, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.16 } }}
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
                  {/* The value the call below just handed back, dropping into
                      the frame that asked for it. */}
                  {top && frame.ret && (
                    <ReturnChip key={`${frame.ret.m}-${sig(frame.ret.v ?? undefined)}-${frame.stack.length}`} ret={frame.ret} />
                  )}
                  {(() => {
                    const shown = Object.entries(f.vars).filter(
                      ([name]) => !(hidden && hidden.name === name && hidden.m === f.m),
                    );
                    return shown.length === 0 ? (
                      <p className="text-xs text-content-faint">
                        {Object.keys(f.vars).length === 0 ? 'no variables yet' : `${hidden?.name} is drawn above`}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {shown.map(([name, v]) => (
                          <Variable key={name} name={name} value={v} changed={!before || sig(before.vars[name]) !== sig(v)} previous={before?.vars[name]} />
                        ))}
                      </div>
                    );
                  })()}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
      {objects.length > 0 && !frame.done && <Objects heap={frame.heap} prevHeap={prev?.heap} />}
    </div>
  );
}

// "↩ factorial() returned 6" — the value a finished call handed back, dropping
// into the frame that receives it (or into the header once nothing is left).
function ReturnChip({ ret }: { ret: NonNullable<TraceFrame['ret']> }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-tint px-2.5 py-1 font-mono text-[11px] text-accent"
    >
      {ret.v ? (
        <>
          ↩ {ret.m}() returned <Scalar value={ret.v} />
        </>
      ) : (
        <>↩ {ret.m}() finished</>
      )}
    </motion.p>
  );
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
