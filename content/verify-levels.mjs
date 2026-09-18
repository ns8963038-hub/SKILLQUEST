#!/usr/bin/env node
// =============================================================================
// Level checker — run BEFORE seeding new or edited levels (needs a local JDK).
//
//   node content/verify-levels.mjs            check every level
//   node content/verify-levels.mjs --fill     compute each test's expectedOutput by
//                                             running the referenceSolution, write it
//                                             back into the JSON, then check
//   node content/verify-levels.mjs loops-02   check only these level ids
//
// For every level it checks that:
//   1. the JSON has the right shape (id matches the file name, skillId exists,
//      at least one visible AND one hidden test, hints present, unique order);
//   2. the referenceSolution compiles for Java 11 (the online runner's JDK may be
//      older than ours, so `--release 11` rejects newer-only syntax) and produces
//      every expectedOutput — a wrong expected output is the most demo-breaking
//      content bug there is;
//   3. the starterCode compiles, and does NOT already pass every test (otherwise
//      submitting the untouched scaffold would "solve" the level).
//
// Outputs are compared with the same rule as the backend
// (backend/src/execution/compare.ts): CRLF → LF, trailing spaces per line and
// outer blank lines ignored; everything else must match exactly.
// =============================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(HERE, 'levels');
const args = process.argv.slice(2);
const FILL = args.includes('--fill');
const only = new Set(args.filter((a) => !a.startsWith('--')));

// Mirror of backend/src/execution/compare.ts — keep the two in sync.
const normalize = (s) =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

const skillIds = new Set(JSON.parse(readFileSync(join(HERE, 'skills.json'), 'utf8')).skills.map((s) => s.id));

// Compile Main.java in a fresh temp dir; returns the dir, or throws with javac's message.
function compile(source) {
  const dir = mkdtempSync(join(tmpdir(), 'sq-level-'));
  writeFileSync(join(dir, 'Main.java'), source);
  try {
    execFileSync('javac', ['--release', '11', '-nowarn', '-d', dir, join(dir, 'Main.java')], { stdio: 'pipe' });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n'));
  }
  return dir;
}

// Run the compiled Main with this stdin; returns { stdout, error }.
function run(dir, stdin, timeLimitMs) {
  const r = spawnSync('java', ['-Xss64m', '-cp', dir, 'Main'], {
    input: stdin,
    encoding: 'utf8',
    timeout: Math.max(timeLimitMs, 2000),
  });
  if (r.error) return { stdout: '', error: r.error.code === 'ETIMEDOUT' ? 'timed out' : r.error.message };
  if (r.status !== 0) return { stdout: r.stdout, error: (r.stderr || `exit ${r.status}`).trim().split('\n')[0] };
  return { stdout: r.stdout, error: null };
}

const files = readdirSync(LEVELS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const all = files.map((f) => ({ file: f, level: JSON.parse(readFileSync(join(LEVELS_DIR, f), 'utf8')) }));

// Order-in-skill must be unique within each skill (across ALL levels, not just the checked ones).
const orderSeen = new Map();
for (const { level } of all) {
  const key = `${level.skillId}#${level.orderInSkill}`;
  orderSeen.set(key, [...(orderSeen.get(key) ?? []), level.id]);
}

let failures = 0;
let checked = 0;
const fail = (id, msg) => {
  failures += 1;
  console.error(`  ✗ ${id}: ${msg}`);
};

for (const { file, level } of all) {
  if (only.size > 0 && !only.has(level.id)) continue;
  checked += 1;
  const id = level.id ?? file;

  // ---- 1. Shape ----
  if (basename(file, '.json') !== level.id) fail(id, `id "${level.id}" doesn't match file name ${file}`);
  if (!skillIds.has(level.skillId)) fail(id, `unknown skillId "${level.skillId}"`);
  if (!Array.isArray(level.hints) || level.hints.length === 0) fail(id, 'needs at least one hint');
  const tests = level.testCases ?? [];
  if (!tests.some((t) => !t.isHidden)) fail(id, 'needs at least one visible test (shown as an example)');
  if (!tests.some((t) => t.isHidden)) fail(id, 'needs at least one hidden test');
  const dupes = orderSeen.get(`${level.skillId}#${level.orderInSkill}`) ?? [];
  if (dupes.length > 1) fail(id, `orderInSkill ${level.orderInSkill} shared with ${dupes.join(', ')}`);
  if (!/public\s+class\s+Main\b/.test(level.starterCode)) fail(id, 'starterCode must declare public class Main');

  // ---- 2. Reference solution produces every expected output ----
  let refDir;
  try {
    refDir = compile(level.referenceSolution);
  } catch (e) {
    fail(id, `referenceSolution does not compile (Java 11):\n${e.message}`);
    continue;
  }
  let changed = false;
  tests.forEach((t, i) => {
    const { stdout, error } = run(refDir, t.stdin, level.timeLimitMs ?? 5000);
    if (error) return fail(id, `reference crashed on test ${i + 1}: ${error}`);
    if (FILL) {
      const out = normalize(stdout);
      if (out === '') return fail(id, `reference printed nothing on test ${i + 1}`);
      if (t.expectedOutput !== out) {
        t.expectedOutput = out;
        changed = true;
      }
    } else if (normalize(stdout) !== normalize(t.expectedOutput ?? '')) {
      fail(id, `test ${i + 1}: expected ${JSON.stringify(t.expectedOutput)}, reference printed ${JSON.stringify(normalize(stdout))}`);
    }
  });
  rmSync(refDir, { recursive: true, force: true });

  // ---- 3. Starter compiles and doesn't already pass ----
  let starterDir;
  try {
    starterDir = compile(level.starterCode);
  } catch (e) {
    fail(id, `starterCode does not compile:\n${e.message}`);
  }
  if (starterDir) {
    const passesAll = tests.every((t) => {
      const { stdout, error } = run(starterDir, t.stdin, level.timeLimitMs ?? 5000);
      return !error && normalize(stdout) === normalize(t.expectedOutput ?? '');
    });
    if (passesAll) fail(id, 'the untouched starterCode already passes every test');
    rmSync(starterDir, { recursive: true, force: true });
  }

  if (changed) writeFileSync(join(LEVELS_DIR, file), `${JSON.stringify(level, null, 2)}\n`);
  console.log(`  ${failures === 0 ? '✓' : '·'} ${level.id}${changed ? '  (expected outputs filled)' : ''}`);
}

console.log(`\n${checked} level(s) checked, ${failures} problem(s).`);
process.exit(failures > 0 ? 1 : 0);
