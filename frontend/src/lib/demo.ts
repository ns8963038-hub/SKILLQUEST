import { SKILL_GRAPH } from '../features/constellation/skillGraph';
import { bktUpdate, MASTERY_THRESHOLD } from '../features/tutor/bkt';
import type { RoadmapNode, SkillStatus } from '../features/roadmap/types';

// =============================================================================
// DEMO MODE
// Runs the entire SkillQuest UI with NO backend and NO database — for UI reviews,
// the Phase 2 presentation, and whenever the free Supabase project is paused.
//
// Turn it on by adding `?demo` to the URL (remembered for that browser tab) or by
// setting VITE_DEMO=1. It is never on by default and never touches real data.
// State lives in memory, so a page refresh starts the demo over.
// =============================================================================

function detectDemo(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('demo')) {
      window.sessionStorage.setItem('sq-demo', '1');
      return true;
    }
    return window.sessionStorage.getItem('sq-demo') === '1';
  } catch {
    return false; // storage blocked (private mode): demo only via the URL flag
  }
}

// True when the app is running in demo mode.
export const DEMO = detectDemo();

// Leave demo mode and return to the normal sign-in screen.
export function exitDemo(): void {
  try {
    window.sessionStorage.removeItem('sq-demo');
  } catch {
    /* storage blocked — nothing to clear */
  }
  window.location.href = window.location.pathname;
}

// -----------------------------------------------------------------------------
// The in-memory "student". A mid-journey learner, so every screen has something
// real to show: 3 skills mastered, 1 tested out, Methods in progress at 58%.
// -----------------------------------------------------------------------------

type DemoStatus = SkillStatus | 'tested-out';
interface DemoSkill {
  status: DemoStatus;
  mastery: number; // BKT estimate 0..1
}

const SEED: Record<string, DemoSkill> = {
  'java-basics': { status: 'completed', mastery: 0.98 },
  'operators-expressions': { status: 'tested-out', mastery: 1 },
  conditionals: { status: 'completed', mastery: 0.97 },
  loops: { status: 'completed', mastery: 0.96 },
  methods: { status: 'current', mastery: 0.58 },
  arrays: { status: 'available', mastery: 0.24 },
};

const state = {
  totalXp: 520,
  currentStreak: 6,
  bestStreak: 9,
  activeToday: false,
  badges: ['first_quest', 'code_master'],
  solved: new Set<string>(['java-basics-01', 'conditionals-01', 'loops-01']),
  skills: Object.fromEntries(
    SKILL_GRAPH.map((s) => [s.id, { ...(SEED[s.id] ?? { status: 'locked', mastery: 0 }) }]),
  ) as Record<string, DemoSkill>,
};

const BADGES: Record<string, { title: string; description: string }> = {
  first_quest: { title: 'First Quest', description: 'Solved your first level.' },
  code_master: { title: 'Code Master', description: 'Solved a level on the first attempt.' },
  week_warrior: { title: 'Week Warrior', description: 'Kept a 7-day streak.' },
};

// A skill counts as done once mastered or tested out.
function isDone(id: string): boolean {
  const s = state.skills[id];
  return !!s && (s.status === 'completed' || s.status === 'tested-out');
}

// After a skill is mastered: unlock skills whose prerequisites are all done, and
// make sure exactly one skill is the student's current frontier.
function recomputeStatuses(): void {
  for (const skill of SKILL_GRAPH) {
    const s = state.skills[skill.id];
    if (s && s.status === 'locked' && skill.prereqs.every(isDone)) s.status = 'available';
  }
  const hasCurrent = SKILL_GRAPH.some((sk) => state.skills[sk.id]?.status === 'current');
  if (!hasCurrent) {
    const next = SKILL_GRAPH.find((sk) => state.skills[sk.id]?.status === 'available');
    const s = next && state.skills[next.id];
    if (s) s.status = 'current';
  }
}

// ---- GET /api/roadmap -------------------------------------------------------
function roadmapNodes(): RoadmapNode[] {
  // Tested-out skills are not part of the plan (exactly like the real API).
  const plan = SKILL_GRAPH.filter((s) => state.skills[s.id]?.status !== 'tested-out');
  return plan.map((s, i) => {
    const sk = state.skills[s.id]!;
    return {
      skillId: s.id,
      title: s.title,
      weekNumber: Math.floor(i / 3) + 1,
      position: i % 3,
      status: sk.status as SkillStatus,
      mastery: sk.mastery,
    };
  });
}

// ---- GET /api/dashboard -----------------------------------------------------
const LEVEL_SIZE = 150; // same as backend/src/routes/dashboard.ts
function dashboard() {
  const current = SKILL_GRAPH.find((s) => state.skills[s.id]?.status === 'current');
  return {
    totalXp: state.totalXp,
    level: Math.floor(state.totalXp / LEVEL_SIZE) + 1,
    xpIntoLevel: state.totalXp % LEVEL_SIZE,
    xpForNextLevel: LEVEL_SIZE,
    currentStreak: state.currentStreak,
    bestStreak: state.bestStreak,
    activeToday: state.activeToday,
    badges: state.badges.map((id) => ({
      id,
      title: BADGES[id]?.title ?? id,
      icon: null,
      description: BADGES[id]?.description ?? '',
    })),
    currentQuest: current
      ? { skillId: current.id, title: current.title, levelId: `${current.id}-01` }
      : null,
  };
}

// ---- Levels -----------------------------------------------------------------
interface DemoLevel {
  title: string;
  difficulty: number;
  statementMd: string;
  starterCode: string;
  hints: string[];
  xpReward: number;
  samples: { stdin: string; expectedOutput: string }[];
  hidden: number; // how many hidden tests
}

const LEVELS: Record<string, DemoLevel> = {
  'methods-01': {
    title: 'The Digit Oracle',
    difficulty: 2,
    statementMd: [
      'An ancient oracle only answers in **digit sums**. Write a method `sumDigits(int n)` that returns the sum of the digits of `n`.',
      '',
      'Read one integer `n` (0 ≤ n ≤ 10⁹) from standard input and print `sumDigits(n)`.',
      '',
      '- `n % 10` gives you the last digit',
      '- `n / 10` drops the last digit',
    ].join('\n'),
    starterCode: [
      'import java.util.Scanner;',
      '',
      'public class Main {',
      '    // Return the sum of the digits of n.',
      '    static int sumDigits(int n) {',
      '        // TODO: your code here',
      '        return 0;',
      '    }',
      '',
      '    public static void main(String[] args) {',
      '        Scanner in = new Scanner(System.in);',
      '        int n = in.nextInt();',
      '        System.out.println(sumDigits(n));',
      '    }',
      '}',
      '',
    ].join('\n'),
    hints: [
      'Keep a running total that starts at 0.',
      'Loop while n > 0: add n % 10 to the total, then divide n by 10.',
      'int sum = 0; while (n > 0) { sum += n % 10; n /= 10; } return sum;',
    ],
    xpReward: 60,
    samples: [
      { stdin: '1234', expectedOutput: '10' },
      { stdin: '9045', expectedOutput: '18' },
    ],
    hidden: 2,
  },
  'arrays-01': {
    title: 'Tallest Tower',
    difficulty: 2,
    statementMd: [
      'A city skyline is a list of tower heights. Find the **tallest** one.',
      '',
      'The first line holds `n`, the number of towers. The second line holds `n` integers. Print the largest height.',
    ].join('\n'),
    starterCode: [
      'import java.util.Scanner;',
      '',
      'public class Main {',
      '    public static void main(String[] args) {',
      '        Scanner in = new Scanner(System.in);',
      '        int n = in.nextInt();',
      '        int[] heights = new int[n];',
      '        for (int i = 0; i < n; i++) heights[i] = in.nextInt();',
      '',
      '        // TODO: find and print the tallest height',
      '    }',
      '}',
      '',
    ].join('\n'),
    hints: [
      'Start by assuming the first tower is the tallest.',
      'Walk the array and replace your answer whenever you see something taller.',
    ],
    xpReward: 60,
    samples: [
      { stdin: '5\n3 9 2 7 4', expectedOutput: '9' },
      { stdin: '3\n-4 -1 -8', expectedOutput: '-1' },
    ],
    hidden: 2,
  },
};

// Any skill without a hand-written demo level gets a friendly warm-up.
function genericLevel(skillTitle: string): DemoLevel {
  return {
    title: `${skillTitle}: First Contact`,
    difficulty: 1,
    statementMd: `A warm-up for **${skillTitle}**. Read a single line from standard input and print it back exactly.`,
    starterCode: [
      'import java.util.Scanner;',
      '',
      'public class Main {',
      '    public static void main(String[] args) {',
      '        Scanner in = new Scanner(System.in);',
      '        // TODO: read a line and print it',
      '    }',
      '}',
      '',
    ].join('\n'),
    hints: ['Use in.nextLine() to read the whole line.'],
    xpReward: 50,
    samples: [{ stdin: 'hello quest', expectedOutput: 'hello quest' }],
    hidden: 3,
  };
}

function skillIdOf(levelId: string): string {
  return levelId.replace(/-\d+$/, '');
}

function levelData(levelId: string): DemoLevel {
  const skill = SKILL_GRAPH.find((s) => s.id === skillIdOf(levelId));
  return LEVELS[levelId] ?? genericLevel(skill?.title ?? 'Warm-up');
}

// ---- GET /api/levels/:id ----------------------------------------------------
function levelView(levelId: string) {
  const skillId = skillIdOf(levelId);
  const lvl = levelData(levelId);
  return {
    id: levelId,
    skillId,
    title: lvl.title,
    difficulty: lvl.difficulty,
    statementMd: lvl.statementMd,
    starterCode: lvl.starterCode,
    hints: lvl.hints,
    xpReward: lvl.xpReward,
    sampleTests: lvl.samples,
    skillTitle: SKILL_GRAPH.find((s) => s.id === skillId)?.title,
    mastery: state.skills[skillId]?.mastery,
  };
}

// ---- POST /api/levels/:id/submit --------------------------------------------
const squash = (s: string) => s.replace(/\s+/g, '');

function submitLevel(levelId: string, sourceCode: string) {
  const view = levelView(levelId);
  const lvl = levelData(levelId);

  // In the demo, submitting the untouched starter code "fails" (so the failure
  // state can be shown); any real edit passes.
  const allPass = squash(sourceCode) !== squash(lvl.starterCode);

  const cases = [
    ...lvl.samples.map((t, i) => {
      const passed = allPass || i === 0;
      return {
        hidden: false,
        passed,
        stdin: t.stdin,
        expectedOutput: t.expectedOutput,
        actualOutput: passed ? t.expectedOutput : '0',
      };
    }),
    ...Array.from({ length: lvl.hidden }, () => ({ hidden: true, passed: allPass })),
  ];
  const passed = cases.filter((c) => c.passed).length;

  // XP: first full solve only (mirrors the backend's atomic award).
  let xpAwarded = 0;
  if (allPass && !state.solved.has(levelId)) {
    state.solved.add(levelId);
    state.totalXp += lvl.xpReward;
    xpAwarded = lvl.xpReward;
  }

  // Streak: any submission counts as activity today.
  if (!state.activeToday) {
    state.activeToday = true;
    state.currentStreak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
  }

  // Badge: a 7-day streak earns Week Warrior (shown in the solve celebration).
  const newBadges: { id: string; title: string; icon: null }[] = [];
  if (allPass && state.currentStreak >= 7 && !state.badges.includes('week_warrior')) {
    state.badges.push('week_warrior');
    newBadges.push({ id: 'week_warrior', title: BADGES.week_warrior!.title, icon: null });
  }

  // The adaptive tutor: one Bayesian Knowledge Tracing update for this skill.
  const skill = state.skills[view.skillId];
  let mastery;
  if (skill && skill.status !== 'tested-out') {
    const before = skill.mastery;
    const after = bktUpdate(before, allPass);
    skill.mastery = after;
    const mastered = after >= MASTERY_THRESHOLD;
    if (mastered && skill.status !== 'completed') {
      skill.status = 'completed';
      recomputeStatuses(); // unlock what this skill was blocking
    }
    mastery = { skillId: view.skillId, title: view.skillTitle ?? view.skillId, before, after, mastered };
  }

  return {
    verdict: allPass ? 'accepted' : 'wrong_answer',
    passed,
    total: cases.length,
    passRatio: passed / cases.length,
    xpAwarded,
    currentStreak: state.currentStreak,
    newBadges,
    cases,
    mastery,
  };
}

// ---- GET /api/placement -----------------------------------------------------
const ROLES = [
  {
    companyId: 'infosys',
    companyName: 'Infosys',
    roleTitle: 'Systems Engineer',
    sourceUrl: 'https://www.infosys.com/careers/',
    base: 58,
    missing: ['arrays', 'strings', 'oop-basics'],
    external: ['SQL & DBMS', 'Aptitude'],
  },
  {
    companyId: 'cognizant',
    companyName: 'Cognizant',
    roleTitle: 'GenC Developer',
    sourceUrl: 'https://careers.cognizant.com/',
    base: 55,
    missing: ['oop-basics', 'collections'],
    external: ['SQL & DBMS'],
  },
  {
    companyId: 'tcs',
    companyName: 'TCS',
    roleTitle: 'Ninja / Digital',
    sourceUrl: 'https://www.tcs.com/careers',
    base: 52,
    missing: ['arrays', 'recursion', 'time-complexity'],
    external: ['Aptitude', 'Verbal ability'],
  },
  {
    companyId: 'wipro',
    companyName: 'Wipro',
    roleTitle: 'Project Engineer',
    sourceUrl: 'https://careers.wipro.com/',
    base: 49,
    missing: ['arrays', 'strings'],
    external: ['Aptitude', 'Essay writing'],
  },
  {
    companyId: 'accenture',
    companyName: 'Accenture',
    roleTitle: 'Associate Software Engineer',
    sourceUrl: 'https://www.accenture.com/in-en/careers',
    base: 46,
    missing: ['oop-basics', 'hashing', 'sorting'],
    external: ['Cognitive assessment', 'Communication'],
  },
];

function placementRoles() {
  const doneCount = SKILL_GRAPH.filter((s) => isDone(s.id)).length;
  return ROLES.map((r) => ({
    companyId: r.companyId,
    companyName: r.companyName,
    roleTitle: r.roleTitle,
    sourceUrl: r.sourceUrl,
    collectedOn: '2026-08-01',
    score: Math.min(100, r.base + doneCount * 2),
    missingAvailableNow: r.missing
      .filter((id) => !isDone(id))
      .map((id) => ({ skillId: id, title: SKILL_GRAPH.find((s) => s.id === id)?.title ?? id })),
    missingExternal: r.external,
  }));
}

// ---- The request router -----------------------------------------------------
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const as = <T>(value: unknown) => value as T;

// Answer an API request from the demo store, with a realistic network delay.
export async function demoApi<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  await wait(path.endsWith('/submit') ? 1500 : 260);

  if (path === '/api/me') return as<T>({ id: 'demo-student', onboardingStep: 5 });
  if (path === '/api/dashboard') return as<T>(dashboard());
  if (path === '/api/roadmap') return as<T>({ nodes: roadmapNodes() });
  if (path === '/api/placement') return as<T>({ roles: placementRoles() });
  if (path === '/api/onboarding/complete' && method === 'POST') return as<T>({ ok: true });

  const submit = path.match(/^\/api\/levels\/([^/]+)\/submit$/);
  if (submit?.[1] && method === 'POST') {
    const body = options.body as { sourceCode?: string } | undefined;
    return as<T>(submitLevel(submit[1], body?.sourceCode ?? ''));
  }
  const level = path.match(/^\/api\/levels\/([^/]+)$/);
  if (level?.[1]) return as<T>(levelView(level[1]));

  throw new Error(`Request to ${path} failed (404)`);
}
