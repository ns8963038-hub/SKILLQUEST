import { Fragment, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { useMotionOff } from '../../lib/motionPref';
import type { Decision, Jump } from './traceAnalysis';

// Ligatures are OFF: a beginner must see `<=` and `i++` exactly as they type them,
// not the font's joined glyphs (≤, ⧺).
//
// A read-only Java listing for lessons: line numbers, light syntax colouring in
// the Neural Night palette (the same colours as the play screen's editor), an
// optional "about to run" line, and an optional slot where the fill-in blank goes.
// Deliberately NOT Monaco — lessons show short snippets, and a plain listing is
// instant, tiny, and easy to read on a phone.
//
// "Watch it run" adds two annotations on top of that (see traceAnalysis.ts):
// a true/false chip on the condition that was just tested, and an arrow drawn in
// the gutter when execution jumped instead of carrying on to the next line.

const KEYWORDS = new Set(
  'public private protected static final void class new return if else for while do break continue int long double float boolean char byte short true false null this super import extends implements abstract interface try catch throw throws switch case default'.split(
    ' ',
  ),
);

// Split one line into coloured tokens.
function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\/\/.*$)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])')|(\b\d+(?:\.\d+)?[lLdDfF]?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d"'/]+|\/)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    const [tok, comment, str, chr, num, word] = m;
    const key = k++;
    if (comment) out.push(<span key={key} className="italic text-content-faint">{tok}</span>);
    else if (str || chr) out.push(<span key={key} className="text-success">{tok}</span>);
    else if (num) out.push(<span key={key} className="text-accent">{tok}</span>);
    else if (word && KEYWORDS.has(word)) out.push(<span key={key} className="text-ion">{tok}</span>);
    else if (word && /^[A-Z]/.test(word)) out.push(<span key={key} className="text-ion-soft">{tok}</span>);
    else out.push(<Fragment key={key}>{tok}</Fragment>);
  }
  return out;
}

// What was just decided on one line, and how to say it out loud.
export interface DecisionMark {
  line: number;
  value: Decision;
  /** The condition as written (`i <= 3`), for the screen-reader label. */
  condition?: string;
  /** Changes whenever the same decision happens again, so the chip replays. */
  token?: string | number;
}

export function CodeView({
  code,
  activeLine,
  blank,
  renderBlank,
  decision,
  jump,
  jumpLane = false,
  className,
}: {
  code: string;
  activeLine?: number; // 1-based line about to run
  blank?: string; // the placeholder text to replace with renderBlank()
  renderBlank?: () => ReactNode;
  decision?: DecisionMark; // a true/false chip beside one line
  jump?: Jump; // an arrow from the line just left to the line now running
  jumpLane?: boolean; // reserve gutter space for that arrow (keeps the width steady)
  className?: string;
}) {
  const lines = code.split('\n');
  const listRef = useRef<HTMLOListElement>(null);
  const [arrow, setArrow] = useState<{ y1: number; y2: number } | null>(null);
  const motionOff = useMotionOff();

  // Where the arrow's two ends sit, measured from the rendered lines — never
  // from an assumed line height, which changes with the breakpoint and the font.
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!jump || !list) {
      setArrow(null);
      return;
    }
    const from = list.children[jump.from - 1] as HTMLElement | undefined;
    const to = list.children[jump.to - 1] as HTMLElement | undefined;
    if (!from || !to) {
      setArrow(null);
      return;
    }
    const y1 = from.offsetTop + from.offsetHeight / 2;
    const y2 = to.offsetTop + to.offsetHeight / 2;
    // Nothing to draw if the two ends landed on the same spot (an unlaid-out or
    // hidden listing) — a zero-length curve would show as a stray arrowhead.
    setArrow(y1 === y2 ? null : { y1, y2 });
  }, [jump]);

  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    // Re-measure if the font loads late, the window resizes, or the code changes height.
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure, code]);

  return (
    <div className={cn('relative rounded-2xl border border-white/[0.06] bg-[#070B16]', className)}>
      <div className="overflow-x-auto py-3 font-mono text-[13px] leading-[1.75] [font-variant-ligatures:none] sm:text-[13.5px]">
        <ol ref={listRef} className="min-w-max">
          {lines.map((line, i) => {
            const n = i + 1;
            const active = n === activeLine;
            const hasBlank = blank && renderBlank && line.includes(blank);
            const [before, after] = hasBlank ? line.split(blank) : [line, ''];
            return (
              <li key={n} className="relative flex pr-5" aria-current={active ? 'step' : undefined}>
                {active && (
                  <motion.span
                    layoutId="code-active-line"
                    className="absolute inset-0 border-l-2 border-ion bg-ion/[0.10] shadow-[inset_0_0_24px_rgba(127,168,255,0.12)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    aria-hidden
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    'relative shrink-0 select-none pr-4 text-right tabular-nums',
                    jumpLane ? 'w-14' : 'w-11',
                    active ? 'text-ion' : 'text-[#3A4563]',
                  )}
                >
                  {active ? '▶' : n}
                </span>
                <span className="relative whitespace-pre text-content">
                  {highlight(before ?? '')}
                  {hasBlank && renderBlank()}
                  {hasBlank && highlight(after ?? '')}
                </span>
                {decision?.line === n && <DecisionChip mark={decision} />}
              </li>
            );
          })}
        </ol>
      </div>
      <AnimatePresence>
        {jump && arrow && <JumpArrow jump={jump} y1={arrow.y1} y2={arrow.y2} still={motionOff} />}
      </AnimatePresence>
    </div>
  );
}

// The result of the condition on this line: green true, red false. Placed on the
// line that was tested, which by now is the line just above or below the one
// running — exactly like the gold flash on a variable that just changed.
function DecisionChip({ mark }: { mark: DecisionMark }) {
  const yes = mark.value === 'true';
  return (
    <motion.span
      key={`${mark.line}-${mark.value}-${mark.token ?? ''}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      className={cn(
        'relative ml-3 inline-flex shrink-0 items-center self-center rounded-md border px-1.5 py-px text-[10.5px] font-semibold leading-[1.45]',
        yes ? 'border-success/45 bg-success-tint text-success' : 'border-danger/45 bg-danger-tint text-danger',
      )}
    >
      <span aria-hidden>{mark.value}</span>
      <span className="sr-only">{mark.condition ? `${mark.condition} was ${mark.value}` : `the condition was ${mark.value}`}</span>
    </motion.span>
  );
}

// The arrow in the gutter: a curve from the line we left to the line now running.
// Gold and upward for a loop going round again, grey for lines being skipped.
function JumpArrow({ jump, y1, y2, still }: { jump: Jump; y1: number; y2: number; still: boolean }) {
  const back = jump.kind === 'back';
  const x = 23; // the lane sits left of the line numbers (gutter is 56px wide)
  const bulge = 8;
  return (
    <motion.svg
      key={`${jump.from}-${jump.to}`}
      className={cn('pointer-events-none absolute inset-y-0 left-0 w-14 overflow-visible', back ? 'text-accent' : 'text-content-faint')}
      initial={{ opacity: still ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="img"
      aria-label={back ? `Execution went back to line ${jump.to}` : `Execution skipped ahead to line ${jump.to}`}
    >
      <motion.path
        d={`M ${x} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x} ${y2}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={still ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.polygon
        points={`${x + 1},${y2} ${x - 5},${y2 - 3.6} ${x - 5},${y2 + 3.6}`}
        fill="currentColor"
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: still ? 0 : 0.22, duration: 0.14 }}
      />
    </motion.svg>
  );
}
