#!/usr/bin/env node
// =============================================================================
// Course-order checker — no question may use a topic the student hasn't met.
//
//   node content/check-order.mjs
//
// Every lesson and level belongs to a skill. A student can only reach that
// skill after its prerequisites (content/skills.json), so the code a student
// READS or must WRITE there may only use constructs taught by the skill itself
// or by one of its prerequisites, directly or indirectly. Checked here:
//
//   lessons  the code of every predict, trace and fill step, pattern boxes, and
//            code written inside the text (hook, key ideas, prompts, hints,
//            concept questions and their options)
//   levels   the starter code, the reference solution (what the student must
//            write), and code inside the statement and hints
//   prose    the plain text of every statement, hint and lesson step, for Java
//            names that can only mean a construct (PROSE_NAMES) — a hint that
//            says "use a StringBuilder" suggests a topic just as surely as code
//   quiz     the program every placement-quiz question shows (content/quiz.json):
//            a question for a topic may only use what that topic and its
//            prerequisites teach, or it tests something else as well
//
// Why prerequisites and not simply "earlier in the list": the roadmap engine
// orders topics by the student's goal, so a topic shown earlier in the course
// is only GUARANTEED to come first if it is a prerequisite.
//
// Reading input with Scanner is given to the student in every level and is not
// a topic of its own, so it is not checked; neither is `main(String[] args)`.
// Detection is by pattern over the code with string literals and comments
// blanked out, so text inside quotes never counts.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const { skills } = JSON.parse(readFileSync(join(ROOT, 'skills.json'), 'utf8'));
const byId = new Map(skills.map((s) => [s.id, s]));

// Everything a student is guaranteed to have been taught when they reach a skill.
function taughtBy(id, seen = new Set()) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const p of byId.get(id)?.prerequisites ?? []) taughtBy(p, seen);
  return seen;
}

// Blank out string/char literals and comments (keeping line structure), and the
// signature every program has, so neither is mistaken for a construct in use.
export function prepare(code) {
  return code
    .replace(/\/\/~[^\n]*/g, '') // lesson narration
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*/g, (m) => (m.startsWith('//') ? '' : m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[0]))
    .replace(/main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]\s*\w+|\.\.\.\s*\w+|\w+\s*\[\s*\])\s*\)/g, 'main()');
}

// How many arguments a call or parameter list has: commas at the top level.
function arity(inside) {
  if (inside.trim() === '') return 0;
  let depth = 0;
  let n = 1;
  for (const ch of inside) {
    if ('([{<'.includes(ch)) depth++;
    else if (')]}>'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  return n;
}

// A method that calls itself. Overloads share a name, so a call only counts
// when it is unqualified (or this.name(...)) AND has as many arguments as the
// method has parameters — max(int, int, int) calling max(a, b) is not recursion.
function recursive(code) {
  const head = /\b(?:static\s+)?[\w<>\[\]]+\s+([a-z]\w*)\s*\(([^;{)]*)\)\s*(?:throws\s+[\w.,\s]+)?\{/g;
  for (const m of code.matchAll(head)) {
    const [, name, params] = m;
    if (['if', 'for', 'while', 'switch', 'catch', 'main'].includes(name)) continue;
    const own = arity(params);
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
    }
    const body = code.slice(start, i);
    const call = new RegExp(`(?:^|[^.\\w]|\\bthis\\.)${name}\\s*\\(`, 'g');
    for (const c of body.matchAll(call)) {
      // Read the call's argument list up to its matching ")".
      let d = 1;
      let j = c.index + c[0].length;
      const argsStart = j;
      for (; j < body.length && d > 0; j++) {
        if (body[j] === '(') d++;
        else if (body[j] === ')') d--;
      }
      if (arity(body.slice(argsStart, j - 1)) === own) return true;
    }
  }
  return false;
}

// construct name -> [the skill that teaches it (null = not in this course), test]
export const CONSTRUCTS = [
  ['% (remainder)', 'operators-expressions', (c) => /[\w)\]]\s*%=?\s*[\w(]/.test(c)],
  ['a cast like (double) x', 'operators-expressions', (c) => /\(\s*(int|double|long|char|float)\s*\)\s*[\w(]/.test(c)],
  ['if / else / switch / ? :', 'conditionals', (c) => /\bif\s*\(|\bswitch\s*\(|\?[^:;\n]*:/.test(c)],
  ['a loop (for / while / do)', 'loops', (c) => /\b(for|while)\s*\(|\bdo\s*\{/.test(c)],
  ['a method of your own', 'methods', (c) => /\b(?:static\s+)?[\w<>\[\]]+\s+(?!main\b|if\b|for\b|while\b|switch\b|catch\b)[a-z]\w*\s*\([^;{)]*\)\s*(?:throws\s+[\w.,\s]+)?\{/.test(c)],
  ['an array', 'arrays', (c) => /\[\s*\]|[\w)]\s*\[[^\]\n]+\]|\bArrays\./.test(c)],
  ['String methods / StringBuilder', 'strings', (c) => /\.(charAt|substring|indexOf|lastIndexOf|toUpperCase|toLowerCase|equals|equalsIgnoreCase|split|trim|isEmpty|toCharArray|contains|startsWith|endsWith|replace|compareTo)\s*\(|\bStringBuilder\b|\.length\s*\(\s*\)/.test(c)],
  ['a class of your own / new object', 'oop-basics', (c) => /\bclass\s+(?!Main\b)\w+/.test(c) || /\bnew\s+(?!(?:int|long|double|char|boolean|String|StringBuilder|Scanner|ArrayList|HashMap|HashSet|LinkedList|ArrayDeque|TreeMap|TreeSet|PriorityQueue|Random|int\[|[A-Z]\w*Exception)\b)[A-Z]\w*\s*[(<]/.test(c)],
  ['inheritance / interface', 'oop-advanced', (c) => /\b(extends|implements|interface|abstract)\b|@Override/.test(c)],
  ['try / catch / throw', 'exceptions', (c) => /\btry\s*\{|\bcatch\s*\(|\bthrow\s+\w|\bthrows\b/.test(c)],
  ['recursion', 'recursion', recursive],
  ['collections (List / Map / Set / Deque)', 'collections', (c) => /\b(ArrayList|HashMap|HashSet|LinkedList|ArrayDeque|TreeMap|TreeSet|PriorityQueue|Deque|Queue|List|Map|Set|Collections)\b\s*[<.(]/.test(c)],
  ['a node that points to another node', 'linked-lists', (c) => [...c.matchAll(/\bclass\s+(\w+)[^{]*\{([^}]*)\}/g)].some((m) => new RegExp(`\\b${m[1]}\\s+\\w+\\s*[;=]`).test(m[2]))],
  ['lambdas / streams', null, (c) => /->|\.stream\s*\(|::/.test(c)],
  ['enum / record / var', null, (c) => /\b(enum|record)\s+[A-Z]|\bvar\s+[a-z]\w*\s*=/.test(c)],
  ['generic classes or methods', null, (c) => /\bclass\s+\w+\s*<|\bstatic\s+<\w/.test(c)],
];

// Java names that can only mean one construct, even in plain prose ("build the
// line with a StringBuilder"). Code in backticks is checked by CONSTRUCTS above;
// this catches a hint or explanation that SUGGESTS a construct in words. Only
// unambiguous names — no English words like "try" or "list".
export const PROSE_NAMES = [
  ['String methods / StringBuilder', 'strings', /\b(StringBuilder|charAt|substring|indexOf|toUpperCase|toLowerCase|equalsIgnoreCase|toCharArray|startsWith|endsWith|compareTo)\b/],
  ['an array', 'arrays', /\bArrays\.(sort|fill|toString|asList)\b/],
  ['collections (List / Map / Set / Deque)', 'collections', /\b(ArrayList|HashMap|HashSet|LinkedList|ArrayDeque|TreeMap|TreeSet|PriorityQueue|LinkedHashMap)\b/],
  ['inheritance / interface', 'oop-advanced', /(@Override|\bextends\b|\bimplements\b)/],
  // Naming the exception a crash throws ("ArrayIndexOutOfBoundsException") is
  // fine — the arrays lesson teaches that crash. Handling it is the later topic.
  ['try / catch / throw', 'exceptions', /\b(try-catch|try\/catch|catch block|throws clause)\b/],
  ['lambdas / streams', null, /(\.stream\(\)|\blambda\b)/],
];

// The plain prose of a text: with fenced blocks and `inline code` removed (those
// are code, checked separately).
function proseOf(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]+`/g, ' ');
}

// Code written inside prose: fenced blocks and `inline code`.
function codeInText(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  for (const m of text.matchAll(/```[a-z]*\n?([\s\S]*?)```/g)) out.push(m[1]);
  for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)) out.push(m[1]);
  return out;
}

// Every piece of code a student sees or writes, labelled with where it lives.
function lessonSources(lesson) {
  const out = [];
  for (const s of lesson.steps) {
    const at = `${s.id} (${s.type})`;
    if (typeof s.code === 'string') out.push([at, s.code]);
    if (typeof s.pattern === 'string') out.push([`${at} pattern`, s.pattern]);
    for (const field of ['body', 'prompt', 'hint', 'explain', 'question', 'title']) {
      for (const code of codeInText(s[field])) out.push([`${at} ${field}`, code]);
    }
    for (const p of s.points ?? []) for (const code of codeInText(p)) out.push([`${at} key idea`, code]);
    for (const o of s.options ?? []) for (const code of codeInText(typeof o === 'string' ? o : o.text)) out.push([`${at} option`, code]);
  }
  return out;
}

// Every piece of prose a student reads, labelled with where it lives.
function lessonProse(lesson) {
  const out = [];
  for (const s of lesson.steps) {
    const at = `${s.id} (${s.type})`;
    for (const field of ['body', 'prompt', 'hint', 'explain', 'question', 'title']) out.push([`${at} ${field} (prose)`, proseOf(s[field])]);
    for (const p of s.points ?? []) out.push([`${at} key idea (prose)`, proseOf(p)]);
    for (const o of s.options ?? []) out.push([`${at} option (prose)`, proseOf(typeof o === 'string' ? o : o.text)]);
  }
  return out;
}

function levelProse(level) {
  const out = [['statement (prose)', proseOf(level.statementMd)]];
  (level.hints ?? []).forEach((h, i) => out.push([`hint ${i + 1} (prose)`, proseOf(h)]));
  return out;
}

function levelSources(level) {
  const out = [];
  if (level.starterCode) out.push(['starter code', level.starterCode]);
  if (level.referenceSolution) out.push(['solution', level.referenceSolution]);
  for (const code of codeInText(level.statementMd)) out.push(['statement', code]);
  (level.hints ?? []).forEach((h, i) => codeInText(h).forEach((code) => out.push([`hint ${i + 1}`, code])));
  return out;
}

export function findProblems() {
  const problems = [];
  // Prose: a name that belongs to a skill the student can't have reached yet.
  const checkProse = (kind, name, skillId, texts) => {
    const allowed = taughtBy(skillId);
    for (const [where, text] of texts) {
      for (const [construct, owner, pattern] of PROSE_NAMES) {
        const hit = text.match(pattern);
        if (!hit) continue;
        if (owner === null) problems.push({ kind, name, where, construct: `${construct} ("${hit[0]}")`, taughtIn: 'not in this course' });
        else if (!allowed.has(owner)) {
          const later = byId.get(owner).displayOrder > byId.get(skillId).displayOrder;
          problems.push({ kind, name, where, construct: `${construct} ("${hit[0]}")`, taughtIn: `${owner} (#${byId.get(owner).displayOrder}${later ? ', later' : ', not a prerequisite'})` });
        }
      }
    }
  };
  const check = (kind, name, skillId, sources) => {
    const allowed = taughtBy(skillId);
    for (const [where, code] of sources) {
      const c = prepare(code);
      for (const [construct, owner, test] of CONSTRUCTS) {
        if (!test(c)) continue;
        if (owner === null) problems.push({ kind, name, where, construct, taughtIn: 'not in this course' });
        else if (!allowed.has(owner)) {
          const later = byId.get(owner).displayOrder > byId.get(skillId).displayOrder;
          problems.push({ kind, name, where, construct, taughtIn: `${owner} (#${byId.get(owner).displayOrder}${later ? ', later' : ', not a prerequisite'})` });
        }
      }
    }
  };
  for (const f of readdirSync(join(ROOT, 'lessons')).filter((f) => f.endsWith('.json')).sort()) {
    const lesson = JSON.parse(readFileSync(join(ROOT, 'lessons', f), 'utf8'));
    check('lesson', lesson.skillId, lesson.skillId, lessonSources(lesson));
    checkProse('lesson', lesson.skillId, lesson.skillId, lessonProse(lesson));
  }
  for (const f of readdirSync(join(ROOT, 'levels')).filter((f) => f.endsWith('.json')).sort()) {
    const level = JSON.parse(readFileSync(join(ROOT, 'levels', f), 'utf8'));
    check('level', level.id, level.skillId, levelSources(level));
    checkProse('level', level.id, level.skillId, levelProse(level));
  }
  const { questions } = JSON.parse(readFileSync(join(ROOT, 'quiz.json'), 'utf8'));
  for (const q of questions) check('quiz', q.id, q.topicSkillId, [['program', q.code]]);
  // One row per place and construct.
  const seen = new Set();
  return problems.filter((p) => {
    const key = `${p.kind}|${p.name}|${p.where}|${p.construct}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findProblems();
  if (problems.length === 0) {
    console.log('Every lesson, level and quiz question uses only what has been taught before it.');
  } else {
    console.log(`${problems.length} place(s) use something the student hasn't been taught yet:\n`);
    console.table(problems);
    process.exitCode = 1;
  }
}
