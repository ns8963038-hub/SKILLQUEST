import type { TraceFrame } from './types';

// READING THE STORY OUT OF A TRACE
//
// The recording says which line runs next — not "the condition was true" or "the
// loop went round again". Those are the two things a beginner most needs to see,
// and both can be worked out honestly from line numbers, provided we know where
// each control statement's body starts and ends.
//
// The rule everywhere in this file: when the answer is not certain, return
// undefined and show nothing. A wrong "true" chip would teach the opposite of
// what the lesson intends.

export type Decision = 'true' | 'false';

export interface ControlBlock {
  /** 1-based line holding `for (…)`, `while (…)`, `if (…)`, `} else {` … */
  header: number;
  kind: 'for' | 'while' | 'if' | 'else' | 'do' | 'switch';
  /** First and last line of the body (only meaningful when inlineBody is false). */
  bodyStart: number;
  bodyEnd: number;
  /** The body shares the header's line (`if (x) y();`), so line numbers cannot tell us what happened. */
  inlineBody: boolean;
}

/**
 * Blank out what is inside string and character literals, and everything after
 * `//`, replacing each character with a space. The result is the SAME LENGTH as
 * the line, so positions found in it can be used to slice the original — while
 * a brace or keyword written inside a literal never confuses the scanner.
 */
export function maskLiterals(line: string): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '/' && line[i + 1] === '/') {
      out += ' '.repeat(line.length - i); // a line comment: nothing after it counts
      break;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i++;
      while (i < line.length) {
        if (line[i] === '\\' && i + 1 < line.length) {
          out += '  '; // an escape is two characters, so two spaces
          i += 2;
          continue;
        }
        if (line[i] === ch) {
          out += ch;
          i++;
          break;
        }
        out += ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// A control statement, optionally preceded by the brace that closed the last one.
const CONTROL = /^\s*(?:\}\s*)?(for|while|if|else\s+if|else|do|switch)\b/;

/**
 * The 1-based line holding the `}` that closes the block opened at `lines[i]`,
 * counting brace by brace from that line's own `{` — so a line like `} else {`
 * closes the previous block at its first brace. Returns -1 when it never closes.
 */
function closingLineOf(lines: string[], i: number, open: number): number {
  let depth = 0;
  for (let j = i; j < lines.length; j++) {
    const text = j === i ? lines[j]!.slice(open) : lines[j]!;
    for (const ch of text) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth <= 0) return j + 1;
      }
    }
  }
  return -1;
}

/**
 * Find every control statement in a listing, with the lines its body occupies.
 *
 * A braced body runs from the line after the header to the line before its
 * closing brace; a body written without braces is the next non-blank line.
 * Anything the scanner cannot measure is left out of the map, which simply means
 * no chip is ever shown for it.
 */
export function findControlBlocks(code: string): Map<number, ControlBlock> {
  const lines = code.split('\n').map(maskLiterals);
  const blocks = new Map<number, ControlBlock>();

  lines.forEach((line, i) => {
    const match = CONTROL.exec(line);
    if (!match) return;
    const word = match[1]!.replace(/\s+/g, ' ');
    const kind: ControlBlock['kind'] = word === 'else if' ? 'if' : (word as ControlBlock['kind']);
    const header = i + 1;
    const open = line.indexOf('{');
    const inline = (): void => {
      blocks.set(header, { header, kind, bodyStart: header, bodyEnd: header, inlineBody: true });
    };

    // Is there a statement after the closing `)` (or after the keyword, for a
    // bare `else`)? Then the body sits on this same line.
    const close = line.lastIndexOf(')');
    const tail = (close >= 0 ? line.slice(close + 1) : line.slice(match[0].length)).trim();
    if (open < 0) {
      if (tail !== '') return inline();
      // `if (x)` with its single statement on the following line.
      let next = i + 1;
      while (next < lines.length && lines[next]!.trim() === '') next++;
      if (next >= lines.length) return;
      blocks.set(header, { header, kind, bodyStart: next + 1, bodyEnd: next + 1, inlineBody: false });
      return;
    }

    const end = closingLineOf(lines, i, open);
    if (end < 0) return; // never closed: stay silent about this one
    if (end === header) return inline(); // opened and closed on the header line
    blocks.set(header, { header, kind, bodyStart: header + 1, bodyEnd: end - 1, inlineBody: false });
  });

  return blocks;
}

// Split on a separator that sits outside any brackets.
function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * The condition a control line actually tests, as written — `i <= 3` from a for
 * header, `a[mid] == target` from an if. Used for the spoken/screen-reader label
 * beside a true/false chip. Undefined when there is no written condition (a
 * for-each loop) or the line cannot be read confidently.
 */
export function conditionText(line: string): string | undefined {
  const masked = maskLiterals(line);
  const open = masked.indexOf('(');
  if (open < 0) return undefined;

  let depth = 0;
  let close = -1;
  for (let k = open; k < masked.length; k++) {
    if (masked[k] === '(') depth++;
    else if (masked[k] === ')') {
      depth--;
      if (depth === 0) {
        close = k;
        break;
      }
    }
  }
  if (close < 0) return undefined;

  const inner = line.slice(open + 1, close); // sliced from the ORIGINAL, so literals survive
  if (inner.trim() === '') return undefined;

  if (/^\s*(?:\}\s*)?for\b/.test(masked)) {
    // `for (init; condition; update)` — the middle clause is the condition.
    // A for-each (`for (Animal p : pets)`) has no written condition.
    const parts = splitTop(masked.slice(open + 1, close), ';');
    if (parts.length !== 3) return undefined;
    const from = open + 1 + parts[0]!.length + 1;
    const text = line.slice(from, from + parts[1]!.length).trim();
    return text === '' ? undefined : text;
  }
  return inner.trim();
}

// Two steps can only be compared by line number when they are the same running
// call: same method, same depth, neither of them the "program finished" frame.
function comparable(current: TraceFrame | undefined, next: TraceFrame | undefined): boolean {
  if (!current || !next || current.done || next.done) return false;
  const a = current.stack[0];
  const b = next.stack[0];
  if (!a || !b) return false;
  return current.stack.length === next.stack.length && a.m === b.m;
}

/**
 * Was the condition on the line about to run true or false?
 *
 * Answered only when the next recorded step is in the same call: landing inside
 * the body means the condition held, landing anywhere else means it did not. A
 * method call inside the condition (`if (isPrime(n))`) changes the stack depth,
 * and then we say nothing rather than guess.
 */
export function decisionAt(
  blocks: Map<number, ControlBlock>,
  frames: TraceFrame[],
  index: number,
): Decision | undefined {
  const current = frames[index];
  const next = frames[index + 1];
  if (!comparable(current, next)) return undefined;

  const line = current!.stack[0]!.line;
  const block = blocks.get(line);
  if (!block || block.inlineBody) return undefined;
  // `do {` and `switch (…) {` are entered unconditionally, and `else` has no
  // condition of its own — nothing truthful to report for any of them.
  if (block.kind === 'do' || block.kind === 'switch' || block.kind === 'else') return undefined;

  const nextLine = next!.stack[0]!.line;
  if (nextLine === line) return undefined; // the same line again (a `for` header runs in parts)
  return nextLine >= block.bodyStart && nextLine <= block.bodyEnd ? 'true' : 'false';
}

export interface Jump {
  from: number;
  to: number;
  /** back = a loop going round again; skip = lines passed over. */
  kind: 'back' | 'skip';
}

/**
 * Did execution jump instead of falling through to the next line? Backwards is a
 * loop repeating; forwards over at least one line is a block being skipped (a
 * false condition, a `break`, a `continue`, the end of an if/else).
 */
export function jumpAt(frames: TraceFrame[], index: number): Jump | undefined {
  const current = frames[index];
  const next = frames[index + 1];
  if (!comparable(current, next)) return undefined;

  const from = current!.stack[0]!.line;
  const to = next!.stack[0]!.line;
  if (to < from) return { from, to, kind: 'back' };
  if (to > from + 1) return { from, to, kind: 'skip' };
  return undefined;
}
