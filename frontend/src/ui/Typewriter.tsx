import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../lib/cn';

export type TypewriterPhase = 'thinking' | 'typing' | 'done';

// Types the tutor's message out like a live model response: a short "thinking"
// pause (three pulsing dots), then the text streams in. Screen readers get the
// whole sentence at once — the animated copy is aria-hidden. `onPhase` lets a
// companion (Nova) think while it pauses and "talk" while it types.
export function Typewriter({
  text,
  speed = 14,
  startDelay = 650,
  className,
  onPhase,
}: {
  text: string;
  speed?: number; // ms per tick
  startDelay?: number; // the "thinking" pause before typing begins
  className?: string;
  onPhase?: (phase: TypewriterPhase) => void;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? text.length : 0);
  const [thinking, setThinking] = useState(!reduce);
  // Latest callback, so a new inline function never restarts the typing.
  const phaseRef = useRef(onPhase);
  phaseRef.current = onPhase;

  useEffect(() => {
    if (reduce) {
      setShown(text.length);
      setThinking(false);
      phaseRef.current?.('done');
      return;
    }
    setShown(0);
    setThinking(true);
    phaseRef.current?.('thinking');
    let typed = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      setThinking(false);
      phaseRef.current?.('typing');
      interval = window.setInterval(() => {
        typed += 2; // two characters per tick reads as fast, fluid streaming
        setShown(Math.min(typed, text.length));
        if (typed >= text.length) {
          window.clearInterval(interval);
          phaseRef.current?.('done');
        }
      }, speed);
    }, startDelay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [text, speed, startDelay, reduce]);

  const done = shown >= text.length;

  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {thinking ? (
          <span className="inline-flex items-center gap-1 align-middle">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ion"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
        ) : (
          <>
            {text.slice(0, shown)}
            <span
              className={cn(
                'ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded-full bg-ion',
                done && 'animate-pulse-dot',
              )}
            />
          </>
        )}
      </span>
    </p>
  );
}
