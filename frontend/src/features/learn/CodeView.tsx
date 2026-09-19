import { Fragment, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/cn';

// Ligatures are OFF: a beginner must see `<=` and `i++` exactly as they type them,
// not the font's joined glyphs (≤, ⧺).
//
// A read-only Java listing for lessons: line numbers, light syntax colouring in
// the Neural Night palette (the same colours as the play screen's editor), an
// optional "about to run" line, and an optional slot where the fill-in blank goes.
// Deliberately NOT Monaco — lessons show short snippets, and a plain listing is
// instant, tiny, and easy to read on a phone.

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

export function CodeView({
  code,
  activeLine,
  blank,
  renderBlank,
  className,
}: {
  code: string;
  activeLine?: number; // 1-based line about to run
  blank?: string; // the placeholder text to replace with renderBlank()
  renderBlank?: () => ReactNode;
  className?: string;
}) {
  const lines = code.split('\n');
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#070B16] py-3 font-mono text-[13px] leading-[1.75] [font-variant-ligatures:none] sm:text-[13.5px]', className)}>
      <ol className="min-w-max">
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
                  'relative w-11 shrink-0 select-none pr-4 text-right tabular-nums',
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
