#!/usr/bin/env node
// =============================================================================
// Lesson builder / checker — run before seeding lessons (needs a local JDK).
//
//   node content/build-lessons.mjs            check every lesson is correct and built
//   node content/build-lessons.mjs --fill     (re)compute the generated fields and
//                                             write them into the lesson files
//   node content/build-lessons.mjs loops      only these skill ids
//
// A lesson (content/lessons/<skillId>.json) is authored by hand; three kinds of
// field are GENERATED here, never typed:
//   predict.answer       the option index whose text equals what the program
//                        really prints (exactly one option must match)
//   trace.trace          the line-by-line execution, recorded from the real JVM
//                        by content/tools/Tracer.java
//   fill.expectedOutput  what the program prints with the first accepted answer
//                        (every accepted answer must print the same; the empty
//                        blank must NOT)
//
// Narration: a line of lesson code may end in  //~ some words  — that text is
// Nova's narration for the line in the Watch-it-run step. It is stripped before
// the code is compiled or shown (backend/src/lessons/content.ts mirrors this).
//
// Concept steps: { "type": "concept", "ref": "OOP008" } pulls a theory question
// (MCQ or true/false) out of content/questions/java-oop.json. The question,
// options, answer and explanation are inlined here so the app never has to load
// the bank. A predict step may also carry "ref": an Output Prediction item from
// the bank, whose program is then RUN and cross-checked against the bank's
// answer key — if the bank is wrong about its own program, the build fails.
//
// Hidden cases: a fill step may carry
//   "cases": [ { "a": "10", "b": "20" }, { "a": "7", "b": "0" } ]
// — other values for variables declared in main. The student sees only the
// program as written; the checker also runs their line with each case, so a
// hard-coded answer ("8") fails while the visible code stays beginner-simple
// (no loop or array just to try several inputs). Generated from it:
//   fill.checkProgram   main's body once per case, each in its own { block },
//                       with a marker line printed between cases
//   fill.checkOutput    what that program prints with the first accepted answer
//
// Array pictures: a trace step may carry
//   "visual": { "array": "a", "pointers": ["lo","mid","hi"],
//               "range": ["lo","hi"], "mode": "cells" | "bars" }
// which draws that array beside the code. Every name in it is checked against
// the recording below, so the picture can never show something the JVM didn't do.
// =============================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LESSONS_DIR = join(HERE, 'lessons');
const TOOLS_DIR = join(HERE, 'tools');
const args = process.argv.slice(2);
const FILL = args.includes('--fill');
const only = new Set(args.filter((a) => !a.startsWith('--')));

const BLANK = '____';
const COMPILE_ERROR = "It doesn't compile";
const MAX_TRACE_FRAMES = 120;
const STEP_TYPES = new Set(['hook', 'predict', 'trace', 'explain', 'fill', 'concept']);

// Mirror of backend/src/execution/compare.ts — keep in sync.
const normalize = (s) =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

// Split authored code into the code students see and Nova's per-line narration.
export function splitNarration(code) {
  const notes = {};
  const clean = code
    .split('\n')
    .map((line, i) => {
      const at = line.indexOf('//~');
      if (at < 0) return line;
      notes[i + 1] = line.slice(at + 3).trim();
      return line.slice(0, at).trimEnd();
    })
    .join('\n');
  return { clean, notes };
}

const skillIds = new Set(JSON.parse(readFileSync(join(HERE, 'skills.json'), 'utf8')).skills.map((s) => s.id));

// The theory question bank (imported from the team's Java OOP dataset).
const BANK = new Map(
  JSON.parse(readFileSync(join(HERE, 'questions', 'java-oop.json'), 'utf8')).questions.map((q) => [q.id, q]),
);

// ---- Java helpers -------------------------------------------------------------
function compile(source, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'sq-lesson-'));
  writeFileSync(join(dir, 'Main.java'), source);
  const files = [join(dir, 'Main.java'), ...extra.map((f) => (copyFileSync(f, join(dir, basename(f))), join(dir, basename(f))))];
  try {
    execFileSync('javac', ['--release', '11', '-g', '-nowarn', '-d', dir, ...files], { stdio: 'pipe' });
    return { dir, error: null };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    return { dir: null, error: String(e.stderr || e.message).trim().split('\n').slice(0, 3).join('\n') };
  }
}

// What a program "does", in the vocabulary of the predict options: its output,
// "It doesn't compile", or "Crashes: <ExceptionName>".
function outcome(source) {
  const { dir, error } = compile(source);
  if (!dir) return { kind: 'compile', text: COMPILE_ERROR, error };
  const r = spawnSync('java', ['-cp', dir, 'Main'], { input: '', encoding: 'utf8', timeout: 5000 });
  rmSync(dir, { recursive: true, force: true });
  if (r.error) return { kind: 'error', text: `Timed out`, error: r.error.message };
  if (r.status !== 0) {
    const m = /Exception in thread "main" ([\w.$]+)/.exec(r.stderr || '');
    const name = m ? m[1].split('.').pop() : 'Error';
    return { kind: 'crash', text: `Crashes: ${name}`, stdout: r.stdout };
  }
  return { kind: 'ok', text: normalize(r.stdout) };
}

// Compile the tracer once.
let tracerDir = null;
function tracer() {
  if (tracerDir) return tracerDir;
  tracerDir = mkdtempSync(join(tmpdir(), 'sq-tracer-'));
  execFileSync('javac', ['-d', tracerDir, join(TOOLS_DIR, 'Tracer.java')], { stdio: 'pipe' });
  return tracerDir;
}

// Record a trace, with object ids renumbered 1, 2, 3… in order of appearance so
// the output is deterministic (and friendlier on screen than JVM ids).
function recordTrace(source) {
  const { dir, error } = compile(source, [join(TOOLS_DIR, 'TraceBoot.java')]);
  if (!dir) throw new Error(`trace program does not compile:\n${error}`);
  const r = spawnSync('java', ['-cp', tracer(), 'Tracer', dir, String(MAX_TRACE_FRAMES)], { encoding: 'utf8', timeout: 30000 });
  rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`tracer failed: ${(r.stderr || '').split('\n')[0]}`);
  const raw = JSON.parse(r.stdout);
  const ids = new Map();
  const remap = (id) => {
    const key = String(id);
    if (!ids.has(key)) ids.set(key, ids.size + 1);
    return ids.get(key);
  };
  const fix = (v) => {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(fix);
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = k === 'id' ? remap(x) : fix(x);
    return out;
  };
  const frames = raw.frames.map((f) => {
    const stack = fix(f.stack);
    const heap = {};
    for (const [id, obj] of Object.entries(f.heap)) heap[remap(id)] = fix(obj);
    return f.ret ? { done: f.done, stack, heap, out: f.out, ret: fix(f.ret) } : { done: f.done, stack, heap, out: f.out };
  });
  return { frames, truncated: raw.truncated };
}

// ---- Check / build one lesson -----------------------------------------------------
let failures = 0;
const fail = (id, msg) => {
  failures += 1;
  console.error(`  ✗ ${id}: ${msg}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json')).sort();
let checked = 0;
// ---- Hidden cases for a fill step ----------------------------------------------

// The line printed between one case's output and the next: the ASCII "record
// separator" (char 30). Java prints it as-is; a student never types it. Mirrored
// in backend/src/lessons/content.ts (CASE_BREAK).
const CASE_BREAK = String.fromCharCode(30);

// Blank out string/char literals and // comments, keeping positions, so braces
// inside them never confuse a brace count.
function maskLiterals(code) {
  return code.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

// Where main's body sits: the index just after its "{" and the index of its
// matching "}". Null when there is no main or its braces don't balance.
function mainBody(code) {
  const masked = maskLiterals(code);
  const head = /public\s+static\s+void\s+main\s*\([^)]*\)\s*(?:throws\s+[\w.,\s]+)?\{/.exec(masked);
  if (!head) return null;
  const start = head.index + head[0].length;
  let depth = 1;
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}' && --depth === 0) return { start, end: i };
  }
  return null;
}

// Build the program the checker really runs. Each case gets main's body in its
// own { block } — so its variables can be declared again — with that case's
// values put into the declarations; case 0 is the program exactly as shown.
// Returns { program } or { problem } explaining what the author must fix.
function checkProgramFor(code, cases) {
  const body = mainBody(code);
  if (!body) return { problem: 'cases need a main method whose braces balance' };
  const inside = code.slice(body.start, body.end);
  if (!inside.includes(BLANK)) return { problem: `cases need the ${BLANK} inside main` };

  const blocks = [];
  for (const [n, values] of [{}, ...cases].entries()) {
    let text = inside;
    for (const [name, value] of Object.entries(values)) {
      if (!/^[A-Za-z_]\w*$/.test(name)) return { problem: `case ${n}: "${name}" is not a variable name` };
      if (typeof value !== 'string' || value.trim() === '') return { problem: `case ${n}: "${name}" needs a value written as Java, e.g. "10"` };
      // The one line in main that declares this variable: `int a = 5;`
      const decl = new RegExp(`^([ \\t]*(?:final\\s+)?[A-Za-z_][\\w<>\\[\\], ]*?\\s+${name}\\s*=\\s*)([^;\\n]+)(;[^\\n]*)$`, 'gm');
      const found = [...text.matchAll(decl)];
      if (found.length !== 1) return { problem: `case ${n}: "${name}" must be declared exactly once in main (found ${found.length})` };
      if (found[0][0].includes(BLANK)) return { problem: `case ${n}: "${name}" is declared on the line with the blank` };
      text = text.replace(decl, (_all, before, _old, after) => `${before}${value}${after}`);
    }
    blocks.push(`\n        {${text}}\n`);
  }
  const between = '        System.out.println((char) 30); // next case\n';
  return { program: code.slice(0, body.start) + blocks.join(between) + code.slice(body.end) };
}

// ---- The optional array picture ----------------------------------------------

// Everything a "visual" block names must exist in the recording with the right
// type, or the drawing would quietly disagree with the program. Checked against
// the trace we have just recorded, never against what an author believed.
function checkVisual(id, step, trace) {
  const v = step.visual;
  const where = `${step.id}: visual`;
  const KEYS = ['array', 'pointers', 'range', 'mode'];
  for (const key of Object.keys(v)) {
    if (!KEYS.includes(key)) fail(id, `${where} has an unknown key "${key}" (allowed: ${KEYS.join(', ')})`);
  }

  // Does a variable of this type ever exist in the recording?
  const isEver = (name, ...types) =>
    trace.frames.some((f) => (f.stack ?? []).some((sf) => types.includes(sf.vars?.[name]?.t)));

  if (typeof v.array !== 'string' || v.array === '') {
    fail(id, `${where}.array must name a variable`);
    return;
  }
  if (!isEver(v.array, 'array')) fail(id, `${where}.array "${v.array}" is never an array in the recording`);

  const pointers = v.pointers ?? [];
  if (!Array.isArray(pointers)) {
    fail(id, `${where}.pointers must be a list of variable names`);
    return;
  }
  for (const name of pointers) {
    if (!isEver(name, 'int', 'long')) fail(id, `${where}.pointers "${name}" is never a whole number in the recording`);
  }

  if (v.range !== undefined) {
    if (!Array.isArray(v.range) || v.range.length !== 2) {
      fail(id, `${where}.range must be exactly two pointer names`);
    } else {
      for (const name of v.range) {
        if (!pointers.includes(name)) fail(id, `${where}.range "${name}" is not one of the pointers`);
      }
    }
  }

  if (v.mode !== undefined && !['cells', 'bars'].includes(v.mode)) {
    fail(id, `${where}.mode must be "cells" or "bars"`);
  }
}

for (const file of files) {
  const lesson = JSON.parse(readFileSync(join(LESSONS_DIR, file), 'utf8'));
  const id = lesson.skillId ?? file;
  if (only.size > 0 && !only.has(id)) continue;
  checked += 1;
  const before = failures;
  let changed = false;

  // ---- Shape ----
  if (basename(file, '.json') !== lesson.skillId) fail(id, `skillId must match the file name`);
  if (!skillIds.has(lesson.skillId)) fail(id, `unknown skillId`);
  if (!lesson.title || !Array.isArray(lesson.steps)) fail(id, 'needs a title and steps');
  const steps = lesson.steps ?? [];
  const stepIds = new Set();
  for (const s of steps) {
    if (!STEP_TYPES.has(s.type)) fail(id, `step "${s.id}" has unknown type "${s.type}"`);
    if (stepIds.has(s.id)) fail(id, `duplicate step id "${s.id}"`);
    stepIds.add(s.id);
  }
  for (const t of ['hook', 'predict', 'trace', 'explain', 'fill']) {
    if (!steps.some((s) => s.type === t)) fail(id, `needs at least one "${t}" step`);
  }

  for (const s of steps) {
    // ---- Concept: a theory question taken from the bank ----
    if (s.type === 'concept') {
      const q = BANK.get(s.ref);
      if (!q) {
        fail(id, `${s.id}: no question "${s.ref}" in content/questions/java-oop.json`);
        continue;
      }
      if (!Array.isArray(q.options) || typeof q.answerIndex !== 'number') {
        fail(id, `${s.id}: question ${s.ref} is a ${q.type} — only MCQ and True/False can be asked here`);
        continue;
      }
      const built = { question: q.question, options: q.options, answer: q.answerIndex, explanation: q.explanation ?? '', topic: q.topic };
      if (FILL && !same({ question: s.question, options: s.options, answer: s.answer, explanation: s.explanation, topic: s.topic }, built)) {
        Object.assign(s, built);
        changed = true;
      } else if (!FILL && !same({ question: s.question, options: s.options, answer: s.answer, explanation: s.explanation, topic: s.topic }, built)) {
        fail(id, `${s.id}: out of date with the question bank (run --fill)`);
      }
      continue;
    }

    // ---- Predict: exactly one option is what really happens ----
    if (s.type === 'predict') {
      // A predict step may borrow its program from an Output Prediction item in
      // the bank; then the bank's own answer key is checked against the real run.
      if (s.ref) {
        const q = BANK.get(s.ref);
        if (!q?.code) {
          fail(id, `${s.id}: question "${s.ref}" has no runnable program`);
          continue;
        }
        if (FILL && s.code !== q.code) {
          s.code = q.code;
          changed = true;
        }
      }
      const { clean } = splitNarration(s.code);
      const got = outcome(clean);
      if (s.ref) {
        // Cross-check the bank: its stated answer must be what the program prints.
        const want = normalize(BANK.get(s.ref).expectedOutput ?? '');
        if (want !== got.text) fail(id, `${s.id}: the bank says ${s.ref} prints ${JSON.stringify(want)}, but it prints ${JSON.stringify(got.text)}`);
      }
      const matches = s.options
        .map((o, i) => ({ i, hit: normalize(o.text) === got.text }))
        .filter((m) => m.hit);
      if (s.options.length < 2 || s.options.length > 4) fail(id, `${s.id}: needs 2–4 options`);
      if (s.options.some((o) => !o.why)) fail(id, `${s.id}: every option needs a "why"`);
      if (matches.length !== 1) {
        fail(id, `${s.id}: ${matches.length} options match the real result ${JSON.stringify(got.text)}${got.error ? ` (${got.error})` : ''}`);
      } else if (FILL && s.answer !== matches[0].i) {
        s.answer = matches[0].i;
        changed = true;
      } else if (!FILL && s.answer !== matches[0].i) {
        fail(id, `${s.id}: stored answer ${s.answer} but option ${matches[0].i} is right (run --fill)`);
      }
    }

    // ---- Trace: recorded from the real JVM ----
    if (s.type === 'trace') {
      const src = s.from ? steps.find((x) => x.id === s.from) : s;
      if (!src?.code) {
        fail(id, `${s.id}: "from" must name a step with code`);
        continue;
      }
      const { clean } = splitNarration(src.code);
      try {
        const trace = recordTrace(clean);
        if (trace.truncated) fail(id, `${s.id}: over ${MAX_TRACE_FRAMES} steps — shorten the program`);
        if (s.visual) checkVisual(id, s, trace);
        if (FILL && !same(s.trace, trace)) {
          s.trace = trace;
          changed = true;
        } else if (!FILL && !same(s.trace, trace)) {
          fail(id, `${s.id}: stored trace is out of date (run --fill)`);
        }
      } catch (e) {
        fail(id, `${s.id}: ${e.message}`);
      }
    }

    // ---- Fill: every accepted answer works; the empty blank doesn't ----
    if (s.type === 'fill') {
      const blanks = s.code.split(BLANK).length - 1;
      if (blanks !== 1) {
        fail(id, `${s.id}: needs exactly one ${BLANK}`);
        continue;
      }
      if (!Array.isArray(s.accepted) || s.accepted.length === 0) {
        fail(id, `${s.id}: needs accepted answers`);
        continue;
      }
      const { clean } = splitNarration(s.code);
      // The answer goes into the blank as-is (split/join, so "$&" in an answer is
      // never read as a replacement pattern).
      const put = (program, answer) => program.split(BLANK).join(answer);
      const results = s.accepted.map((a) => outcome(put(clean, a)));
      const expected = results[0].kind === 'ok' ? results[0].text : null;
      if (!expected) fail(id, `${s.id}: first accepted answer doesn't run (${results[0].text}: ${results[0].error ?? ''})`);
      results.forEach((r, i) => {
        if (r.text !== expected) fail(id, `${s.id}: accepted "${s.accepted[i]}" prints ${JSON.stringify(r.text)}`);
      });

      // Hidden cases: the same line must also work for the other values.
      let check = null; // { program, output } when the step has cases
      if (s.cases !== undefined) {
        if (!Array.isArray(s.cases) || s.cases.length === 0 || !s.cases.every((c) => c && typeof c === 'object' && !Array.isArray(c))) {
          fail(id, `${s.id}: "cases" must be a list of { variable: value } objects`);
        } else {
          const built = checkProgramFor(clean, s.cases);
          if (built.problem) fail(id, `${s.id}: ${built.problem}`);
          else {
            const runs = s.accepted.map((a) => outcome(put(built.program, a)));
            if (runs[0].kind !== 'ok') fail(id, `${s.id}: the hidden cases don't run with "${s.accepted[0]}" (${runs[0].text}: ${runs[0].error ?? ''})`);
            else {
              check = { program: built.program, output: runs[0].text };
              runs.forEach((r, i) => {
                if (r.text !== check.output) fail(id, `${s.id}: accepted "${s.accepted[i]}" fails a hidden case`);
              });
              const parts = check.output.split(CASE_BREAK).map((x) => normalize(x));
              if (parts.length !== s.cases.length + 1) fail(id, `${s.id}: expected ${s.cases.length + 1} case outputs, got ${parts.length}`);
              if (parts[0] !== expected) fail(id, `${s.id}: case 0 should print exactly what the student is shown`);
              parts.slice(1).forEach((p, i) => {
                if (p === parts[0]) fail(id, `${s.id}: hidden case ${i + 1} prints the same as the shown one, so it can't catch anything`);
              });
            }
          }
        }
      }

      // A wrong answer (and the empty blank) must fail — against the hidden cases
      // too when there are some, which is what makes a hard-coded "8" wrong.
      for (const wrong of ['', ...(s.wrong ?? [])]) {
        const r = outcome(put(check ? check.program : clean, wrong));
        const target = check ? check.output : expected;
        if (r.kind === 'ok' && r.text === target) fail(id, `${s.id}: the wrong answer "${wrong}" also works`);
      }
      if (expected !== null) {
        if (FILL && s.expectedOutput !== expected) {
          s.expectedOutput = expected;
          changed = true;
        } else if (!FILL && s.expectedOutput !== expected) {
          fail(id, `${s.id}: expectedOutput out of date (run --fill)`);
        }
      }
      if (check) {
        const stale = s.checkProgram !== check.program || s.checkOutput !== check.output;
        if (FILL && stale) {
          s.checkProgram = check.program;
          s.checkOutput = check.output;
          changed = true;
        } else if (!FILL && stale) {
          fail(id, `${s.id}: checkProgram/checkOutput out of date (run --fill)`);
        }
      } else if (s.cases === undefined && (s.checkProgram !== undefined || s.checkOutput !== undefined)) {
        // The cases were removed: drop what was generated from them.
        if (FILL) {
          delete s.checkProgram;
          delete s.checkOutput;
          changed = true;
        } else fail(id, `${s.id}: has checkProgram but no cases (run --fill)`);
      }
    }
  }

  if (changed) writeFileSync(join(LESSONS_DIR, file), `${JSON.stringify(lesson, null, 2)}\n`);
  console.log(`  ${failures === before ? '✓' : '✗'} ${id}${changed ? '  (generated fields written)' : ''}`);
}

if (tracerDir) rmSync(tracerDir, { recursive: true, force: true });
console.log(`\n${checked} lesson(s) checked, ${failures} problem(s).`);
process.exit(failures > 0 ? 1 : 0);
