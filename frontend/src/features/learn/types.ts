// The shapes of Learn mode (PRD F8), as served by GET /api/lessons/:skillId.
// The browser never receives answers: predict options have no "correct" flag and
// fill steps have no accepted list — the server checks both.

export type LessonState = 'none' | 'new' | 'started' | 'completed' | 'skipped';

// One value in a recorded trace (see content/tools/Tracer.java).
export interface TraceValue {
  t: 'int' | 'long' | 'double' | 'boolean' | 'char' | 'str' | 'null' | 'array' | 'ref' | 'coll' | 'more';
  v?: string | number | boolean;
  items?: TraceValue[]; // arrays
  id?: number; // arrays and objects: stable per-trace id (1, 2, 3…)
  cls?: string; // arrays, objects and collections: the Java class
}

// One stack frame: the method, the line it's on, its local variables.
export interface TraceStackFrame {
  m: string;
  line: number;
  vars: Record<string, TraceValue>;
}

// One step of the recording: the whole program state just BEFORE a line runs.
export interface TraceFrame {
  done: boolean; // the program has finished
  stack: TraceStackFrame[]; // innermost call first
  heap: Record<string, { cls: string; fields: Record<string, TraceValue> }>;
  out: string; // everything printed so far
  ret?: { m: string; v: TraceValue | null }; // a method just returned (v is null for void)
}

export interface Trace {
  frames: TraceFrame[];
  truncated: boolean;
}

export interface HookStep {
  id: string;
  type: 'hook';
  title: string;
  body: string; // markdown
}

export interface PredictStep {
  id: string;
  type: 'predict';
  prompt: string;
  code: string;
  options: { text: string }[];
}

// A theory question (from content/questions/java-oop.json) asked after the
// teaching — the kind of thing service-company MCQ rounds test.
export interface ConceptStep {
  id: string;
  type: 'concept';
  question: string;
  topic?: string;
  options: string[];
}

export interface TraceStep {
  id: string;
  type: 'trace';
  title?: string;
  code: string;
  notes: Record<string, string>; // line number -> Nova's narration
  trace: Trace;
}

export interface ExplainStep {
  id: string;
  type: 'explain';
  title: string;
  points: string[]; // markdown
  pattern?: string; // code to remember (not run)
}

export interface FillStep {
  id: string;
  type: 'fill';
  prompt: string;
  code: string; // contains `blank` exactly once
  blank: string;
  expectedOutput: string;
  hint?: string;
}

export type LessonStep = HookStep | PredictStep | ConceptStep | TraceStep | ExplainStep | FillStep;

export interface LessonView {
  skillId: string;
  skillTitle: string;
  title: string;
  minutes: number;
  version: number;
  steps: LessonStep[];
  status: 'started' | 'completed' | 'skipped' | null;
  answered: Record<string, boolean>;
  mastery: number | null; // the tutor's current estimate for this skill
  nextLevel: { id: string; title: string; xpReward: number } | null;
}

// POST /api/lessons/:skillId/answer
export interface AnswerResult {
  correct: boolean;
  why?: string; // about the option they picked
  answer?: number; // only when right, or when they asked to be shown
  answerWhy?: string;
  firstTry: boolean;
  mastery?: { before: number; after: number };
}

// POST /api/lessons/:skillId/fill
export interface FillResult {
  correct: boolean;
  via: 'match' | 'run';
  output?: string;
  explain?: string;
  expectedOutput: string;
}
