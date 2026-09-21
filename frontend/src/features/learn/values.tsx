import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAnimate } from 'motion/react';
import { cn } from '../../lib/cn';
import { useMotionOff } from '../../lib/motionPref';
import type { TraceValue } from './types';

// HOW A RECORDED VALUE IS DRAWN
//
// Shared by the memory panel and the array strip, so a number looks and behaves
// the same wherever a student meets it. Everything that moves here is gated on
// the app's own animation setting (Settings → Animations) rather than only on
// Motion's config, so it behaves identically in the browser and in tests.

// Animations finish well inside one autoplay tick, so holding the arrow key
// never turns into a queue of half-finished animations.
export const ROLL_MS = 300;

// A stable string for comparing two values between frames.
export const sig = (v: TraceValue | undefined) => JSON.stringify(v ?? null);

// A number that counts from its old value to its new one, so a student sees the
// change happen rather than finding a different digit. Snaps instantly when the
// student has animations off (Settings → Animations).
export function AnimatedNumber({ value }: { value: number }) {
  const off = useMotionOff();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  // Doubles keep however many decimals the real value has; ints stay whole.
  const text = String(value);
  const decimals = text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;

  useEffect(() => {
    if (off || !Number.isFinite(value) || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const began = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const eased = 1 - (1 - t) ** 3;
      const at = began + (value - began) * eased;
      from.current = at;
      setShown(at);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, off]);

  return <>{shown.toFixed(decimals)}</>;
}

// One variable: its name above a value box that flashes when the value changes.
export function Variable({ name, value, changed, previous }: { name: string; value: TraceValue; changed: boolean; previous?: TraceValue }) {
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

// A gold flash when a value changes. The glow is replayed by animating the same
// element again — NOT by remounting it on a changing key, which would also throw
// away the number inside and make it jump instead of counting up.
// With animations off the changed value simply keeps a gold ring, so the student
// can still see what this line touched.
export function Flash({ on, token, className, children }: { on: boolean; token: string; className?: string; children: ReactNode }) {
  const [scope, animate] = useAnimate();
  const off = useMotionOff();

  useEffect(() => {
    if (!on || off || !scope.current) return;
    const controls = animate(
      scope.current,
      {
        boxShadow: [
          '0 0 0 2px rgba(255,197,61,0.95), 0 0 18px rgba(255,197,61,0.55)',
          '0 0 0 0px rgba(255,197,61,0)',
        ],
        scale: [1.08, 1],
      },
      { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
    );
    return () => controls.stop();
  }, [on, token, off, animate, scope]);

  return (
    <span ref={scope} className={cn('inline-block rounded-lg', off && on && 'shadow-[0_0_0_2px_rgba(255,197,61,0.85)]', className)}>
      {children}
    </span>
  );
}

// A primitive / string / collection / reference, coloured like the code.
export function Scalar({ value }: { value: TraceValue }) {
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
    case 'int':
    case 'long':
    case 'double':
      // The one case worth animating: a number the program just changed.
      return (
        <span className="text-accent">
          {typeof value.v === 'number' ? <AnimatedNumber value={value.v} /> : String(value.v)}
        </span>
      );
    default:
      return <span className="text-accent">{String(value.v)}</span>;
  }
}
