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
const STEP_TYPES = new Set(['hook', 'predict', 'trace', 'explain', 'fill']);

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
    // ---- Predict: exactly one option is what really happens ----
    if (s.type === 'predict') {
      const { clean } = splitNarration(s.code);
      const got = outcome(clean);
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
      const results = s.accepted.map((a) => outcome(clean.replace(BLANK, a)));
      const expected = results[0].kind === 'ok' ? results[0].text : null;
      if (!expected) fail(id, `${s.id}: first accepted answer doesn't run (${results[0].text}: ${results[0].error ?? ''})`);
      results.forEach((r, i) => {
        if (r.text !== expected) fail(id, `${s.id}: accepted "${s.accepted[i]}" prints ${JSON.stringify(r.text)}`);
      });
      for (const wrong of ['', ...(s.wrong ?? [])]) {
        const r = outcome(clean.replace(BLANK, wrong));
        if (r.kind === 'ok' && r.text === expected) fail(id, `${s.id}: the wrong answer "${wrong}" also works`);
      }
      if (expected !== null) {
        if (FILL && s.expectedOutput !== expected) {
          s.expectedOutput = expected;
          changed = true;
        } else if (!FILL && s.expectedOutput !== expected) {
          fail(id, `${s.id}: expectedOutput out of date (run --fill)`);
        }
      }
    }
  }

  if (changed) writeFileSync(join(LESSONS_DIR, file), `${JSON.stringify(lesson, null, 2)}\n`);
  console.log(`  ${failures === before ? '✓' : '✗'} ${id}${changed ? '  (generated fields written)' : ''}`);
}

if (tracerDir) rmSync(tracerDir, { recursive: true, force: true });
console.log(`\n${checked} lesson(s) checked, ${failures} problem(s).`);
process.exit(failures > 0 ? 1 : 0);
