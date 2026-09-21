import { describe, expect, it } from 'vitest';
import { caretPoint } from './caret';

// An input laid out at x 100–400, y 50–98, with 44px/12px padding, like the
// sign-in fields. jsdom does no layout, so the box and padding are supplied.
function field(value: string, opts: { type?: string; scrollLeft?: number; selection?: number } = {}) {
  const input = document.createElement('input');
  input.type = opts.type ?? 'text';
  input.value = value;
  input.style.paddingLeft = '44px';
  input.style.paddingRight = '12px';
  input.getBoundingClientRect = () => ({ left: 100, right: 400, top: 50, bottom: 98, width: 300, height: 48, x: 100, y: 50, toJSON: () => ({}) });
  Object.defineProperty(input, 'scrollLeft', { value: opts.scrollLeft ?? 0 });
  if (opts.selection !== undefined) input.setSelectionRange(opts.selection, opts.selection);
  return input;
}
const tenPerChar = (text: string) => text.length * 10;

describe('caretPoint', () => {
  it('starts at the text start when the field is empty, level with its middle', () => {
    expect(caretPoint(field(''), tenPerChar)).toEqual({ x: 144, y: 74 });
  });

  it('moves right as you type', () => {
    expect(caretPoint(field('asha'), tenPerChar).x).toBe(184);
    expect(caretPoint(field('asha@sea'), tenPerChar).x).toBe(224);
  });

  it('follows the cursor, not the end, when the field reports one', () => {
    expect(caretPoint(field('asha@sea', { selection: 2 }), tenPerChar).x).toBe(164);
  });

  it('treats an email field as typing at the end (it reports no cursor)', () => {
    expect(caretPoint(field('ab@c', { type: 'email' }), tenPerChar).x).toBe(184);
  });

  it('stays inside the box when a long value has scrolled', () => {
    const long = 'x'.repeat(60); // 600px of text in a 244px box
    expect(caretPoint(field(long), tenPerChar).x).toBe(388); // the right edge, less padding
    expect(caretPoint(field(long, { scrollLeft: 400 }), tenPerChar).x).toBe(344);
  });
});
