import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

// Counts smoothly from its previous value (or `initial`) to `value` — XP, scores,
// mastery. Writes straight to the DOM node each frame instead of re-rendering
// React 60 times a second. With reduced motion it simply shows the final number.
export function AnimatedNumber({
  value,
  initial = 0,
  duration = 1.1,
  format = (n: number) => Math.round(n).toLocaleString('en-IN'),
  className,
}: {
  value: number;
  initial?: number; // where the count starts on first mount
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(initial);
  const reduce = useReducedMotion();
  // Keep the latest formatter without restarting the animation when callers pass
  // a new inline function on every render.
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = formatRef.current(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = formatRef.current(v);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(reduce ? value : from.current)}
    </span>
  );
}
