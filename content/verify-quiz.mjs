#!/usr/bin/env node
// =============================================================================
// Quiz checker — run before seeding a new or edited quiz (needs a local JDK).
//
//   node content/verify-quiz.mjs
//
// For every question in content/quiz.json it checks that:
//   1. the JSON has the right shape: unique ids, a real topic skill, exactly 3
//      questions per topic (PRD F1: a topic is skipped only on 3 out of 3), four
//      different options and an answer index that points at one of them;
//   2. the program compiles for Java 11 and RUNS, and what it prints is exactly
//      the marked answer — and matches NO other option. A quiz that marks the
//      wrong answer would test students out of topics they don't know (or keep
//      them in topics they do), which is the worst bug a placement quiz can have.
//
// Outputs are compared with the same rule as the backend
// (backend/src/execution/compare.ts): CRLF → LF, trailing spaces per line and
// outer blank lines ignored.
// =============================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { questions } = JSON.parse(readFileSync(join(HERE, 'quiz.json'), 'utf8'));
const skillIds = new Set(JSON.parse(readFileSync(join(HERE, 'skills.json'), 'utf8')).skills.map((s) => s.id));

// Mirror of backend/src/execution/compare.ts — keep the two in sync.
const normalize = (s) =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

// Indent every line of a block by n spaces.
const indent = (code, n) =>
  code
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n');

// The shown code as a complete Main.java (see `wrap` in quiz.json).
export function programFor(q) {
  if (q.wrap === 'main') {
    return `public class Main {\n    public static void main(String[] args) {\n${indent(q.code, 8)}\n    }\n}\n`;
  }
  if (q.wrap === 'class') return `public class Main {\n${indent(q.code, 4)}\n}\n`;
  return `${q.code}\n`; // 'file': the code is the whole file
}

// Compile and run a program; returns what it printed, or throws with the error.
function run(source) {
  const dir = mkdtempSync(join(tmpdir(), 'sq-quiz-'));
  try {
    writeFileSync(join(dir, 'Main.java'), source);
    try {
      execFileSync('javac', ['--release', '11', '-nowarn', '-d', dir, join(dir, 'Main.java')], { stdio: 'pipe' });
    } catch (e) {
      throw new Error(`does not compile: ${String(e.stderr || e.message).trim().split('\n').slice(0, 3).join(' | ')}`);
    }
    const r = spawnSync('java', ['-cp', dir, 'Main'], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) throw new Error(`crashed: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`);
    return r.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const problems = [];
const fail = (id, msg) => problems.push(`${id}: ${msg}`);

// ---- 1. Shape --------------------------------------------------------------
const ids = new Set();
const perTopic = new Map();
for (const q of questions) {
  const id = q.id ?? '(no id)';
  if (ids.has(id)) fail(id, 'duplicate id');
  ids.add(id);
  if (!Number.isInteger(q.version) || q.version < 1) fail(id, 'version must be a whole number from 1');
  if (!skillIds.has(q.topicSkillId)) fail(id, `unknown topic skill "${q.topicSkillId}"`);
  perTopic.set(q.topicSkillId, (perTopic.get(q.topicSkillId) ?? 0) + 1);
  if (!['main', 'class', 'file'].includes(q.wrap)) fail(id, `wrap must be main, class or file (got "${q.wrap}")`);
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) fail(id, 'missing prompt');
  if (typeof q.code !== 'string' || !q.code.trim()) fail(id, 'missing code');
  if (!Array.isArray(q.options) || q.options.length !== 4) fail(id, 'needs exactly 4 options');
  else if (new Set(q.options.map(normalize)).size !== 4) fail(id, 'two options are the same');
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= (q.options?.length ?? 0)) {
    fail(id, 'correctIndex does not point at an option');
  }
}
for (const [topic, n] of perTopic) if (n !== 3) fail(topic, `has ${n} questions; every topic needs exactly 3`);

// ---- 2. Run every program ----------------------------------------------------
let checked = 0;
for (const q of questions) {
  if (typeof q.code !== 'string' || !Array.isArray(q.options)) continue;
  let printed;
  try {
    printed = normalize(run(programFor(q)));
  } catch (e) {
    fail(q.id, e.message);
    continue;
  }
  const matching = q.options.map((o, i) => (normalize(o) === printed ? i : -1)).filter((i) => i >= 0);
  if (matching.length === 0) fail(q.id, `prints "${printed}", which is none of the options`);
  else if (matching[0] !== q.correctIndex) {
    fail(q.id, `prints "${printed}" (option ${matching[0]}), but option ${q.correctIndex} is marked correct`);
  }
  checked++;
}

if (problems.length) {
  console.log(`${problems.length} problem(s) in content/quiz.json:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`All ${checked} quiz questions compile, run, and print exactly their marked answer (${perTopic.size} topics × 3).`);
}
