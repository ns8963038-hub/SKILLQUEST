import { describe, expect, it } from 'vitest';
import { conditionText, decisionAt, findControlBlocks, jumpAt, maskLiterals } from './traceAnalysis';
import type { TraceFrame } from './types';

// A listing with a loop, a nested if, an else, and a brace inside a string —
// deliberately the awkward shapes, since a wrong body range would show a wrong
// true/false chip to a student.
const CODE = `public class Demo {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) {
            if (i % 2 == 0) {
                sum += i;
                System.out.println("even {");
            } else {
                sum -= i;
            }
        }
        System.out.println(sum);
    }
}`;

// One recorded step: the line about to run, at the given stack depth.
function frame(line: number, opts: { m?: string; depth?: number; done?: boolean } = {}): TraceFrame {
  const { m = 'main', depth = 1, done = false } = opts;
  const stack = Array.from({ length: depth }, (_, k) => ({
    m: k === 0 ? m : 'main',
    line: k === 0 ? line : 100,
    vars: {},
  }));
  return { done, stack: done ? [] : stack, heap: {}, out: '' };
}

describe('maskLiterals', () => {
  it('blanks strings, chars and comments so their braces never count', () => {
    const line = 'System.out.println("a { b }"); // } here';
    expect(maskLiterals(line).trimEnd()).toBe('System.out.println("       ");');
    expect(maskLiterals(line)).toHaveLength(line.length);
    expect(maskLiterals("char c = '}';")).toBe("char c = ' ';");
  });

  it('keeps the line the same length, so positions still line up', () => {
    const line = '        if (s.equals("a}b") && c == \'{\') { // {{{';
    expect(maskLiterals(line)).toHaveLength(line.length);
    expect(maskLiterals(line).split('{').length - 1).toBe(1); // only the real block brace
  });
});

describe('conditionText', () => {
  it('reads the test out of each kind of header', () => {
    expect(conditionText('        while (l < r) {')).toBe('l < r');
    expect(conditionText('        if (a[mid] == target) {')).toBe('a[mid] == target');
    expect(conditionText('        } else if (x > 1) {')).toBe('x > 1');
    expect(conditionText('        for (int i = 1; i <= 3; i++) {')).toBe('i <= 3');
    expect(conditionText('        if (name.equals("ok")) {')).toBe('name.equals("ok")'); // literals survive
  });

  it('gives nothing when there is no written condition', () => {
    expect(conditionText('        for (Animal p : pets) {')).toBeUndefined();
    expect(conditionText('        } else {')).toBeUndefined();
    expect(conditionText('        sum += i;')).toBeUndefined();
  });
});

describe('findControlBlocks', () => {
  const blocks = findControlBlocks(CODE);

  it('measures a loop body up to its closing brace', () => {
    const forBlock = blocks.get(4);
    expect(forBlock).toMatchObject({ kind: 'for', bodyStart: 5, bodyEnd: 10, inlineBody: false });
  });

  it('measures a nested if, ignoring a brace written inside a string', () => {
    expect(blocks.get(5)).toMatchObject({ kind: 'if', bodyStart: 6, bodyEnd: 7 });
  });

  it('treats `} else {` as its own block instead of ending at that line', () => {
    expect(blocks.get(8)).toMatchObject({ kind: 'else', bodyStart: 9, bodyEnd: 9 });
  });

  it('marks a body written on the header line as inline', () => {
    const inline = findControlBlocks('class A {\n    void f() {\n        if (x) go();\n    }\n}');
    expect(inline.get(3)).toMatchObject({ kind: 'if', inlineBody: true });
  });

  it('takes the next line as the body when there are no braces', () => {
    const bare = findControlBlocks('class A {\n    void f() {\n        if (x)\n            go();\n    }\n}');
    expect(bare.get(3)).toMatchObject({ kind: 'if', bodyStart: 4, bodyEnd: 4, inlineBody: false });
  });

  it('stays silent about a block that is never closed', () => {
    expect(findControlBlocks('while (x) {\n    y();').get(1)).toBeUndefined();
  });
});

describe('decisionAt', () => {
  const blocks = findControlBlocks(CODE);
  const decide = (frames: TraceFrame[]) => decisionAt(blocks, frames, 0);

  it('says true when the next step is inside the body', () => {
    expect(decide([frame(5), frame(6)])).toBe('true');
    expect(decide([frame(4), frame(5)])).toBe('true');
  });

  it('says false when the next step lands outside the body', () => {
    expect(decide([frame(5), frame(9)])).toBe('false'); // the if failed: into the else
    expect(decide([frame(4), frame(12)])).toBe('false'); // the loop is finished
  });

  it('says nothing when the stack changed, so the jump may be a call', () => {
    expect(decide([frame(5), frame(6, { depth: 2 })])).toBeUndefined();
    expect(decide([frame(5, { depth: 2 }), frame(6, { m: 'other', depth: 2 })])).toBeUndefined();
  });

  it('says nothing about lines that are not conditions, or at the end of the run', () => {
    expect(decide([frame(6), frame(7)])).toBeUndefined(); // an ordinary statement
    expect(decide([frame(8), frame(9)])).toBeUndefined(); // `else` has no condition
    expect(decide([frame(5), frame(0, { done: true })])).toBeUndefined();
    expect(decide([frame(5)])).toBeUndefined();
  });

  it('says nothing when the same line runs again, as a for header does', () => {
    expect(decide([frame(4), frame(4)])).toBeUndefined();
  });

  it('says nothing when the body shares the header line', () => {
    const inline = findControlBlocks('class A {\n    void f() {\n        if (x) go();\n        done();\n    }\n}');
    expect(decisionAt(inline, [frame(3), frame(4)], 0)).toBeUndefined();
  });
});

describe('jumpAt', () => {
  it('spots a loop going round again', () => {
    expect(jumpAt([frame(10), frame(4)], 0)).toEqual({ from: 10, to: 4, kind: 'back' });
  });

  it('spots lines being skipped', () => {
    expect(jumpAt([frame(5), frame(9)], 0)).toEqual({ from: 5, to: 9, kind: 'skip' });
  });

  it('says nothing when execution simply falls to the next line', () => {
    expect(jumpAt([frame(6), frame(7)], 0)).toBeUndefined();
    expect(jumpAt([frame(6), frame(6)], 0)).toBeUndefined();
  });

  it('says nothing across a call or a return, where lines are not comparable', () => {
    expect(jumpAt([frame(6), frame(20, { depth: 2 })], 0)).toBeUndefined();
    expect(jumpAt([frame(6), frame(0, { done: true })], 0)).toBeUndefined();
  });
});
