import { DEFAULT_BKT, type BktParams } from '../tutor/bkt';
import { normalizeOutput } from '../execution/compare';

// Lesson content handling (Learn mode, PRD F8). Pure functions only — no DB, no
// I/O — so the rules that matter (what the browser is allowed to see, what
// counts as a right answer) are unit-tested.

// The marker for the blank in a "Try it" step.
export const BLANK = '____';

// BKT parameters for a multiple-choice lesson answer, as opposed to solving a
// level. Guessing is far easier here (four options, and weak ones can be
// eliminated) → high guess rate. The questions are deliberate traps, so even a
// student who knows the topic slips more often → higher slip rate. And
// answering a question is not practice → NO learning credit. Mastery is earned
// in the levels.
export const LESSON_BKT: BktParams = { ...DEFAULT_BKT, pS: 0.2, pG: 0.4, pT: 0 };

// Is this step one the student answers?
export function isQuestion(step: LessonStep): boolean {
  return step.type === 'predict' || step.type === 'concept';
}

// Does this question count as evidence of what the student knows? Only if it
// comes AFTER the teaching (an "explain" step). In PRIMM the first prediction is
// made before anything has been taught — it's there to make the student think,
// and being wrong is expected, so it must not lower their mastery estimate.
export function countsAsEvidence(steps: LessonStep[], stepId: string): boolean {
  const at = steps.findIndex((s) => s.id === stepId);
  const taught = steps.findIndex((s) => s.type === 'explain');
  return at >= 0 && taught >= 0 && taught < at;
}

// ---- Authored code -> what the student sees ---------------------------------

// A line of lesson code may end in `//~ narration`, which is Nova's line for
// that line in the Watch-it-run step. It is stripped before the code is shown
// or compiled. Mirrors splitNarration() in content/build-lessons.mjs.
export function splitNarration(code: string): { code: string; notes: Record<number, string> } {
  const notes: Record<number, string> = {};
  const clean = code
    .split('\n')
    .map((line, i) => {
      const at = line.indexOf('//~');
      if (at < 0) return line;
      notes[i + 1] = line.slice(at + 3).trim();
      return line.slice(0, at).trimEnd();
    })
    .join('\n');
  return { code: clean, notes };
}

// ---- Fill-in answers ---------------------------------------------------------

// Compare typed Java loosely enough to be fair, strictly enough to be right:
// whitespace is irrelevant in Java, and a trailing semicolon is usually already
// in the surrounding code. Everything else must match.
export function normalizeFillAnswer(answer: string): string {
  return answer.replace(/\s+/g, '').replace(/;+$/, '');
}

// Is this one of the answers the content author listed (and the build script
// proved correct)? Anything else still gets run for real before being rejected.
export function isAcceptedFill(answer: string, accepted: string[]): boolean {
  const a = normalizeFillAnswer(answer);
  return accepted.some((x) => normalizeFillAnswer(x) === a);
}

// Put the student's answer into the blank, giving a complete program to run.
// (A function replacer, so "$&" or "$'" typed by a student is inserted as text,
// not read as a replacement pattern.)
export function fillProgram(code: string, answer: string): string {
  return splitNarration(code).code.replace(BLANK, () => answer);
}

// ---- Hidden cases ------------------------------------------------------------

// The line printed between one case's output and the next in a checkProgram:
// the ASCII "record separator", char 30. Mirrors CASE_BREAK in build-lessons.mjs.
export const CASE_BREAK = String.fromCharCode(30);

// The check program with the student's answer in every case's blank.
export function fillCheckProgram(checkProgram: string, answer: string): string {
  return checkProgram.split(BLANK).join(answer);
}

// One output per case, each tidied the same way outputs are compared.
export function splitCaseOutputs(output: string): string[] {
  return output.split(CASE_BREAK).map(normalizeOutput);
}

export interface FailedCase {
  values: Record<string, string>; // the variables as they were set for this case
  expected: string;
  actual: string;
}

// When an answer is right for the values on screen but wrong for a hidden case,
// say which case — that is the whole lesson ("use the variables, not the
// answer"). Undefined when the answer already fails on screen (the ordinary
// "your output was different" feedback covers that) or when nothing failed.
export function firstFailingCase(actualOutput: string, step: Pick<LessonStep, 'cases' | 'checkOutput'>): FailedCase | undefined {
  if (!step.cases?.length || step.checkOutput === undefined) return undefined;
  const actual = splitCaseOutputs(actualOutput);
  const expected = splitCaseOutputs(step.checkOutput);
  if (actual[0] !== expected[0]) return undefined;
  for (let i = 1; i < expected.length; i++) {
    if (actual[i] !== expected[i]) return { values: step.cases[i - 1] ?? {}, expected: expected[i]!, actual: actual[i] ?? '' };
  }
  return undefined;
}

// ---- The shape of a lesson ---------------------------------------------------

export interface PredictOption {
  text: string; // what the program might print
  why: string; // the explanation for choosing it (right or wrong)
}

// A question the student answers: a Predict step (what does this print?) or a
// Concept step (theory, taken from content/questions/java-oop.json).
export const QUESTION_TYPES = ['predict', 'concept'] as const;

// One array drawn beside the trace (searching, sorting). Every name in here is
// checked against the recording by the build script, so the picture can never
// disagree with what the JVM actually did.
export interface TraceVisual {
  array: string;
  pointers?: string[];
  range?: [string, string];
  mode?: 'cells' | 'bars';
}

export interface LessonStep {
  id: string;
  type: 'hook' | 'predict' | 'trace' | 'explain' | 'fill' | 'concept';
  // hook / explain
  title?: string;
  body?: string;
  points?: string[];
  pattern?: string;
  // predict / concept
  prompt?: string;
  code?: string;
  options?: PredictOption[] | string[]; // {text, why} for predict, plain text for concept
  answer?: number; // generated by the build script — never sent to the browser
  // concept (filled from the question bank by content/build-lessons.mjs)
  ref?: string;
  question?: string;
  topic?: string;
  explanation?: string; // the bank's explanation, shown after answering
  // trace
  from?: string; // the step whose code this traces
  trace?: unknown; // recorded by content/tools/Tracer.java
  visual?: TraceVisual; // optional array picture, checked by content/build-lessons.mjs
  // added by sanitizeLesson for predict and trace steps: line number -> Nova's
  // narration, split out of the code (the browser needs both halves)
  notes?: Record<number, string>;
  // fill
  accepted?: string[]; // never sent to the browser
  wrong?: string[];
  expectedOutput?: string;
  hint?: string;
  explain?: string; // revealed once they get it right
  // Hidden cases (content/build-lessons.mjs): other values for main's variables.
  // The student sees only the program as written; their line must also work for
  // these, so a hard-coded answer fails. Never sent to the browser.
  cases?: Record<string, string>[];
  checkProgram?: string; // generated: main's body once per case, with CASE_BREAK between
  checkOutput?: string; // generated: what checkProgram prints with a right answer
}

export interface LessonContent {
  steps: LessonStep[];
}

// What the browser receives: the same steps with every answer removed, and the
// narration split out of the code. Options keep their text (they have to be
// shown) but lose `why`, which would give the answer away — the server returns
// the right `why` after the student chooses, exactly like hidden test cases.
export function sanitizeLesson(content: LessonContent): LessonStep[] {
  const steps = content.steps ?? [];
  return steps.map((s) => {
    if (s.type === 'predict') {
      const { code, notes } = splitNarration(s.code ?? '');
      const options = (s.options ?? []) as PredictOption[];
      return { id: s.id, type: s.type, prompt: s.prompt, code, notes, options: options.map((o) => ({ text: o.text })) };
    }
    if (s.type === 'trace') {
      const source = s.from ? steps.find((x) => x.id === s.from) : s;
      const { code, notes } = splitNarration(source?.code ?? '');
      return { id: s.id, type: s.type, title: s.title, code, notes, trace: s.trace, visual: s.visual };
    }
    if (s.type === 'concept') {
      // Theory question: the text and the options, never the answer.
      return { id: s.id, type: s.type, question: s.question, topic: s.topic, options: (s.options ?? []) as string[] };
    }
    if (s.type === 'fill') {
      const { code } = splitNarration(s.code ?? '');
      return {
        id: s.id,
        type: s.type,
        prompt: s.prompt,
        code,
        expectedOutput: s.expectedOutput,
        hint: s.hint,
        blank: BLANK,
      };
    }
    return s; // hook and explain carry no answers
  }) as LessonStep[];
}

// How many of the lesson's questions (predict + concept) the student got right
// on their first try.
export function scoreAnswers(answered: Record<string, boolean>, steps: LessonStep[]): { correct: number; total: number } {
  const questions = steps.filter((s) => s.type === 'predict' || s.type === 'concept').map((s) => s.id);
  const first = questions.filter((id) => id in answered);
  return { correct: first.filter((id) => answered[id]).length, total: questions.length };
}
