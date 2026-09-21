import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CASE_BREAK,
  LESSON_BKT,
  countsAsEvidence,
  fillCheckProgram,
  fillProgram,
  firstFailingCase,
  isAcceptedFill,
  normalizeFillAnswer,
  sanitizeLesson,
  scoreAnswers,
  splitCaseOutputs,
  splitNarration,
  type LessonContent,
  type LessonStep,
} from './content';
import { bktUpdate } from '../tutor/bkt';

const LESSON: LessonContent = {
  steps: [
    { id: 'hook', type: 'hook', title: 'Hi', body: 'Welcome' },
    {
      id: 'p1',
      type: 'predict',
      prompt: 'What prints?',
      code: 'int a = 1; //~ a starts at one\nSystem.out.println(a);',
      options: [
        { text: '1', why: 'Right.' },
        { text: '0', why: 'No — a was set to 1.' },
      ],
      answer: 0,
    },
    {
      id: 'run',
      type: 'trace',
      from: 'p1',
      visual: { array: 'a', pointers: ['i'], mode: 'cells' },
      trace: { frames: [] },
    },
    {
      id: 'c1',
      type: 'concept',
      ref: 'OOP008',
      topic: 'Constructors',
      question: 'The compiler still provides a default constructor if you define a parameterized constructor.',
      options: ['True', 'False'],
      answer: 1,
      explanation: 'Once any constructor is declared explicitly, the compiler no longer adds the default one.',
    },
    { id: 'fill', type: 'fill', prompt: 'Finish it', code: 'int a = ____;', accepted: ['1', '0 + 1'], expectedOutput: '1', hint: 'one', explain: 'because' },
  ],
};

describe('splitNarration', () => {
  it('takes the narration out of the code and keeps the line numbers', () => {
    const { code, notes } = splitNarration('int a = 1; //~ a starts at one\nint b = 2;\nprint(a); //~ show it');
    expect(code).toBe('int a = 1;\nint b = 2;\nprint(a);');
    expect(notes).toEqual({ 1: 'a starts at one', 3: 'show it' });
  });
});

describe('sanitizeLesson', () => {
  const steps = sanitizeLesson(LESSON);

  it('never sends the answer or the option explanations to the browser', () => {
    const json = JSON.stringify(steps);
    expect(json).not.toContain('Right.');
    expect(json).not.toContain('No — a was set to 1.');
    expect(steps.find((s) => s.id === 'p1')).not.toHaveProperty('answer');
    expect(steps.find((s) => s.id === 'p1')?.options).toEqual([{ text: '1' }, { text: '0' }]);
  });

  it('never sends the accepted fill-in answers, but keeps what to aim for', () => {
    const fill = steps.find((s) => s.id === 'fill');
    expect(fill).not.toHaveProperty('accepted');
    expect(fill).not.toHaveProperty('explain');
    expect(fill?.expectedOutput).toBe('1');
    expect(fill?.hint).toBe('one');
  });

  it('keeps a trace step\'s code, narration and array picture', () => {
    const run = steps.find((s) => s.id === 'run');
    expect(run?.code).toBe('int a = 1;\nSystem.out.println(a);'); // borrowed from the predict step, narration removed
    expect(run?.notes).toEqual({ 1: 'a starts at one' });
    expect(run?.visual).toEqual({ array: 'a', pointers: ['i'], mode: 'cells' }); // the browser draws the strip from this
  });

  it('sends a concept question without its answer or explanation', () => {
    const concept = steps.find((s) => s.id === 'c1') as unknown as { question: string; options: string[] };
    expect(concept.options).toEqual(['True', 'False']);
    expect(concept.question).toContain('default constructor');
    expect(steps.find((s) => s.id === 'c1')).not.toHaveProperty('answer');
    expect(JSON.stringify(steps)).not.toContain('no longer adds the default one');
  });

  it('gives the trace step the code and narration of the step it traces', () => {
    const trace = steps.find((s) => s.id === 'run') as unknown as { code: string; notes: Record<number, string> };
    expect(trace.code).toBe('int a = 1;\nSystem.out.println(a);');
    expect(trace.notes).toEqual({ 1: 'a starts at one' });
  });
});

describe('fill-in answers', () => {
  it('ignores whitespace and a trailing semicolon', () => {
    expect(normalizeFillAnswer('  i <= 10 ;')).toBe('i<=10');
    expect(isAcceptedFill('i<=10', ['i <= 10'])).toBe(true);
    expect(isAcceptedFill('i < 10', ['i <= 10'])).toBe(false);
  });

  it('puts the answer into the blank', () => {
    expect(fillProgram('int a = ____; //~ note', '41 + 1')).toBe('int a = 41 + 1;');
  });
});

describe('lesson answers as evidence', () => {
  it('moves mastery less than solving a level does, and gives no learning credit', () => {
    const afterLesson = bktUpdate(0.2, true, LESSON_BKT);
    const afterLevel = bktUpdate(0.2, true);
    expect(afterLesson).toBeLessThan(afterLevel);
    expect(afterLesson).toBeCloseTo(0.333, 2);
    // Even two right answers leave the student well short of mastery (0.95).
    expect(bktUpdate(afterLesson, true, LESSON_BKT)).toBeLessThan(0.55);
  });

  it('only counts questions asked after the teaching', () => {
    const steps = [
      { id: 'hook', type: 'hook' as const },
      { id: 'p1', type: 'predict' as const },
      { id: 'ideas', type: 'explain' as const },
      { id: 'p2', type: 'predict' as const },
    ];
    expect(countsAsEvidence(steps, 'p1')).toBe(false); // a pre-teaching prediction
    expect(countsAsEvidence(steps, 'p2')).toBe(true);
    expect(countsAsEvidence(steps, 'nope')).toBe(false);
  });
});

describe('scoreAnswers', () => {
  it('counts first-try correct answers across predict AND concept questions', () => {
    expect(scoreAnswers({ p1: true, c1: true }, LESSON.steps)).toEqual({ correct: 2, total: 2 });
    expect(scoreAnswers({ p1: false, c1: true }, LESSON.steps)).toEqual({ correct: 1, total: 2 });
    expect(scoreAnswers({}, LESSON.steps)).toEqual({ correct: 0, total: 2 });
  });
});

describe('hidden cases in a fill step', () => {
  // The real lesson 1 exercise, exactly as the build script generated it.
  const lesson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'content', 'lessons', 'java-basics.json'), 'utf8'),
  ) as LessonContent;
  const fill = lesson.steps.find((s) => s.type === 'fill') as LessonStep;
  const out = (...cases: string[]) => cases.join(`\n${CASE_BREAK}\n`);

  it('shows the student a program with no loop or array, just the variables', () => {
    const body = fill.code!.replace(/main\s*\(String\[\] args\)/, 'main()'); // main's own signature isn't "using arrays"
    expect(body).not.toMatch(/\bfor\b|\bwhile\b|\[/);
    expect(fill.cases?.length).toBeGreaterThan(0);
    expect(fill.checkProgram).toBeDefined();
  });

  it('puts the answer into every case, and inserts "$&" as plain text', () => {
    const program = fillCheckProgram(fill.checkProgram!, '(a + b)');
    expect(program).not.toContain('____');
    expect(program.split('(a + b)').length - 1).toBe(fill.cases!.length + 1);
    expect(fillProgram('x = ____;', '"$&"')).toBe('x = "$&";');
  });

  it('splits the output back into one piece per case', () => {
    expect(splitCaseOutputs(out('Sum: 8 ', 'Sum: 30', ''))).toEqual(['Sum: 8', 'Sum: 30', '']);
  });

  it('names the case a hard-coded answer gets wrong', () => {
    // Typing 8 prints "Sum: 8" for every pair.
    const failed = firstFailingCase(out('Sum: 8', 'Sum: 8', 'Sum: 8'), fill);
    expect(failed).toEqual({ values: { a: '10', b: '20' }, expected: 'Sum: 30', actual: 'Sum: 8' });
  });

  it('stays quiet when the answer is already wrong on screen, or right everywhere', () => {
    expect(firstFailingCase(out('Sum: 53', 'Sum: 1020', 'Sum: 70'), fill)).toBeUndefined(); // ordinary feedback covers it
    expect(firstFailingCase(fill.checkOutput!, fill)).toBeUndefined();
    expect(firstFailingCase('anything', { cases: undefined, checkOutput: undefined })).toBeUndefined();
  });

  it('never sends the cases or the check program to the browser', () => {
    const sent = JSON.stringify(sanitizeLesson(lesson));
    expect(sent).not.toContain('checkProgram');
    expect(sent).not.toContain('checkOutput');
    expect(sent).not.toContain('"cases"');
  });
});
