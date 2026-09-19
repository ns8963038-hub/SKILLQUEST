import { SKILL_GRAPH } from '../features/constellation/skillGraph';
import { bktUpdate, LESSON_BKT, MASTERY_THRESHOLD } from '../features/tutor/bkt';
import type { RoadmapNode, SkillStatus } from '../features/roadmap/types';

// =============================================================================
// DEMO MODE
// Runs the entire SkillQuest UI with NO backend and NO database — for UI reviews,
// the Phase 2 presentation, and whenever the free Supabase project is paused.
//
// Turn it on by adding `?demo` to the URL (remembered for that browser tab) or by
// setting VITE_DEMO=1. It is never on by default and never touches real data.
// State lives in memory, so a page refresh starts the demo over. Everything shown
// in demo mode is SAMPLE data — the admin console says so in a banner.
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
// real to show: 3 skills completed, 1 tested out, Methods in progress at 58%.
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

const HINT_COST = 5;

const state = {
  totalXp: 520,
  weekXp: 110,
  currentStreak: 6,
  bestStreak: 9,
  activeToday: false,
  badges: ['first_quest', 'code_master'],
  solved: new Set<string>(['java-basics-01', 'conditionals-01', 'loops-01']),
  hintsUsed: {} as Record<string, number>,
  surveyDone: false,
  nudgeClosed: false,
  lessons: {} as Record<string, { status: 'started' | 'completed' | 'skipped'; answered: Record<string, boolean> }>,
  // ?demo&consent shows the consent screen first (for demonstrating F1).
  consentPending: typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('consent'),
  settings: {
    displayName: 'Demo Student' as string | null,
    hoursPerWeek: 8,
    goalText: 'Crack the Infosys and TCS coding rounds',
    goalCategory: 'service_company',
    targetCompanies: ['infosys', 'tcs'],
    leaderboardOptOut: false,
    researchParticipating: true,
  },
  skills: Object.fromEntries(
    SKILL_GRAPH.map((s) => [s.id, { ...(SEED[s.id] ?? { status: 'locked', mastery: 0 }) }]),
  ) as Record<string, DemoSkill>,
};

const BADGES: Record<string, { title: string; description: string }> = {
  first_quest: { title: 'First Quest', description: 'Solved your first level.' },
  code_master: { title: 'Code Master', description: 'Solved a level without any hints.' },
  week_warrior: { title: 'Week Warrior', description: 'Kept a 7-day streak.' },
  placement_ready: { title: 'Placement Ready', description: 'Reached 75% coverage for a target company.' },
};

// A skill counts as done once completed or tested out.
function isDone(id: string): boolean {
  const s = state.skills[id];
  return !!s && (s.status === 'completed' || s.status === 'tested-out');
}

// After a skill is completed: unlock skills whose prerequisites are all done, and
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

function currentSkill() {
  return SKILL_GRAPH.find((s) => state.skills[s.id]?.status === 'current');
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
      mastery: sk.status === 'locked' ? undefined : sk.mastery,
      levelsTotal: 1,
      levelsCompleted: sk.status === 'completed' ? 1 : 0,
      lesson: lessonState(s.id),
    };
  });
}

// ---- GET /api/dashboard -----------------------------------------------------
const LEVEL_SIZE = 150; // same as backend/src/routes/dashboard.ts
function dashboard() {
  const current = currentSkill();
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
    hints: ['Use in.nextLine() to read the whole line.', 'Then System.out.println(...) prints it back.'],
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
  const skill = state.skills[skillId];
  return {
    id: levelId,
    skillId,
    title: lvl.title,
    difficulty: lvl.difficulty,
    statementMd: lvl.statementMd,
    starterCode: lvl.starterCode,
    hints: lvl.hints.slice(0, state.hintsUsed[levelId] ?? 0),
    hintCount: lvl.hints.length,
    hintCost: HINT_COST,
    completed: state.solved.has(levelId),
    lessonAvailable: hasLesson(skillId),
    xpReward: lvl.xpReward,
    sampleTests: lvl.samples,
    skillTitle: SKILL_GRAPH.find((s) => s.id === skillId)?.title,
    mastery: skill && skill.status !== 'locked' && skill.status !== 'tested-out' ? skill.mastery : undefined,
  };
}

// ---- POST /api/levels/:id/hint ----------------------------------------------
function revealHint(levelId: string) {
  const lvl = levelData(levelId);
  const used = state.hintsUsed[levelId] ?? 0;
  if (used >= lvl.hints.length) throw new Error('Request failed (409)');
  state.hintsUsed[levelId] = used + 1;
  const deducted = Math.min(state.totalXp, HINT_COST);
  state.totalXp -= deducted;
  state.weekXp = Math.max(0, state.weekXp - deducted);
  return { hint: lvl.hints[used], index: used, hintsUsed: used + 1, hintCount: lvl.hints.length, xpCost: deducted, totalXp: state.totalXp };
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
    state.weekXp += lvl.xpReward;
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
  // Like the real backend, a skill is COMPLETED when its level passes (demo skills
  // have one level each); mastery is the tutor's separate estimate.
  const skill = state.skills[view.skillId];
  let mastery;
  if (skill && skill.status !== 'tested-out') {
    const before = skill.mastery;
    const after = bktUpdate(before, allPass);
    skill.mastery = after;
    if (allPass && skill.status !== 'completed') {
      skill.status = 'completed';
      recomputeStatuses(); // unlock what this skill was blocking
    }
    mastery = {
      skillId: view.skillId,
      title: view.skillTitle ?? view.skillId,
      before,
      after,
      mastered: after >= MASTERY_THRESHOLD,
    };
  }

  const next = currentSkill();
  return {
    verdict: allPass ? 'accepted' : 'wrong_answer',
    passed,
    total: cases.length,
    passRatio: passed / cases.length,
    xpAwarded,
    currentStreak: state.currentStreak,
    newBadges,
    nextLevelId: allPass && next ? `${next.id}-01` : null,
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

// ---- GET /api/leaderboard ---------------------------------------------------
const RIVALS = [
  { id: 'r1', name: 'Riya S', week: 310, all: 1240 },
  { id: 'r2', name: 'Arjun K', week: 260, all: 980 },
  { id: 'r3', name: null, tag: '7F2A', week: 190, all: 610 },
  { id: 'r4', name: 'Kavya R', week: 150, all: 890 },
  { id: 'r5', name: 'Mohammed A', week: 95, all: 450 },
  { id: 'r6', name: null, tag: 'C41D', week: 60, all: 300 },
  { id: 'r7', name: 'Sneha P', week: 45, all: 205 },
];

function leaderboard(period: 'week' | 'all') {
  const you = { id: 'you', name: state.settings.displayName, tag: 'DEMO', xp: period === 'week' ? state.weekXp : state.totalXp };
  const rows = [
    ...RIVALS.map((r) => ({ id: r.id, name: r.name, tag: r.tag ?? '', xp: period === 'week' ? r.week : r.all })),
    you,
  ].sort((a, b) => b.xp - a.xp);
  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    if (r.xp !== prev) {
      rank = i + 1;
      prev = r.xp;
    }
    return { rank, name: r.name || `Quester ${r.tag}`, xp: r.xp, isYou: r.id === 'you' };
  });
  return { period, top: ranked, you: ranked.find((r) => r.isYou) ?? null, players: ranked.length };
}

// ---- /api/settings ----------------------------------------------------------
function settings() {
  return {
    email: 'demo@skillquest.app',
    ...state.settings,
    companies: ROLES.map((r) => ({ id: r.companyId, name: r.companyName })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function saveSettings(body: Record<string, unknown>) {
  const s = state.settings;
  const hours = typeof body.hoursPerWeek === 'number' ? body.hoursPerWeek : s.hoursPerWeek;
  const goal = typeof body.goalText === 'string' ? body.goalText : s.goalText;
  const replanned = hours !== s.hoursPerWeek || goal.trim() !== s.goalText.trim();
  s.hoursPerWeek = hours;
  s.goalText = goal;
  if ('displayName' in body) s.displayName = (body.displayName as string | null) || null;
  if (Array.isArray(body.targetCompanies)) s.targetCompanies = body.targetCompanies as string[];
  if (typeof body.leaderboardOptOut === 'boolean') s.leaderboardOptOut = body.leaderboardOptOut;
  if (typeof body.researchParticipation === 'boolean') s.researchParticipating = body.researchParticipation;
  return {
    ...settings(),
    replanned,
    weeks: replanned ? Math.max(4, Math.round(60 / hours)) : null,
    plannedSkills: replanned ? 18 : null,
  };
}

// ---- GET /api/nudges/active -------------------------------------------------
// The demo student isn't at risk, so the intervention card only appears when the
// URL asks for it (?demo&nudge) — for demonstrating and screenshotting F5.
function demoNudge() {
  const wanted = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nudge');
  if (!wanted || state.nudgeClosed) return null;
  return {
    id: 1,
    variant: 'confidence_booster',
    suggestedLevel: { id: 'arrays-01', title: 'Tallest Tower', skillTitle: 'Arrays' },
  };
}

// ---- /api/survey ------------------------------------------------------------
function susScore(answers: number[]): number {
  return answers.reduce((t, a, i) => t + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
}

// ---- /api/admin (SAMPLE data, labelled as such in the UI) --------------------
const DAY_MS = 86_400_000;
function adminOverview() {
  const today = new Date();
  const sample = [
    { tier: 'healthy', p: 0.07, xp: 1240, lv: 21, streak: 9, away: 0, nudges: [0, 0, 0, 0] },
    { tier: 'healthy', p: 0.11, xp: 980, lv: 17, streak: 5, away: 1, nudges: [0, 0, 0, 0] },
    { tier: 'watch', p: 0.41, xp: 610, lv: 11, streak: 0, away: 6, nudges: [0, 0, 0, 0] },
    { tier: 'healthy', p: 0.09, xp: 890, lv: 15, streak: 4, away: 0, nudges: [0, 0, 0, 0] },
    { tier: 'atrisk', p: 0.78, xp: 450, lv: 8, streak: 0, away: 13, nudges: [1, 1, 1, 0] },
    { tier: 'watch', p: 0.38, xp: 300, lv: 5, streak: 1, away: 3, nudges: [0, 0, 0, 0] },
    { tier: 'atrisk', p: 0.71, xp: 205, lv: 4, streak: 0, away: 17, nudges: [1, 1, 0, 1] },
    { tier: 'healthy', p: 0.14, xp: state.totalXp, lv: state.solved.size, streak: state.currentStreak, away: 0, nudges: [0, 0, 0, 0] },
  ];
  return {
    generatedAt: today.toISOString(),
    students: sample.map((s, i) => ({
      participant: `P${String(i + 1).padStart(2, '0')}`,
      email: `s${i + 1}•••@college.edu`,
      onboarded: true,
      research: i === 5 ? 'withdrawn' : 'consented',
      totalXp: s.xp,
      levelsCompleted: s.lv,
      currentStreak: s.streak,
      lastActive: new Date(today.getTime() - s.away * DAY_MS).toISOString(),
      riskTier: s.tier,
      prediction: {
        probability: s.p,
        tier: s.tier,
        modelVersion: 'sample',
        featureSetVersion: 'fs-v2',
        thresholdVersion: 'thr-v2',
        observationWindowStart: new Date(today.getTime() - 28 * DAY_MS).toISOString(),
        observationWindowEnd: today.toISOString(),
        scoredAt: today.toISOString(),
        features: {
          active_days_in_window: Math.max(0, 20 - s.away),
          mean_session_gap_days: 1 + s.away / 4,
          days_since_last_activity: s.away,
          completion_ratio: Math.min(1, s.lv / 22),
          avg_score: 0.6 + (1 - s.p) * 0.35,
          activity_trend: s.away > 5 ? -6 : 3,
          current_streak: s.streak,
        },
      },
      nudges: { total: s.nudges[0]!, shown: s.nudges[1]!, clicked: s.nudges[2]!, dismissed: s.nudges[3]! },
    })),
  };
}

function adminMetrics() {
  return {
    api: { n: 1240, p50: 58, p95: 184, byRoute: [] },
    execution: { n: 312, p50: 6100, p95: 11800 },
    survey: state.surveyDone
      ? { n: 1, susMean: 82.5, susSd: 0, engagementMean: 5, recommendPct: 100 }
      : { n: 0, susMean: null, susSd: null, engagementMean: null, recommendPct: null },
    nudges: { created: 2, shown: 2, clicked: 1, dismissed: 1 },
    riskTiers: { healthy: 4, watch: 2, atrisk: 2 },
  };
}

// ---- GET /api/admin/export/:kind (SAMPLE file) -------------------------------
export function demoCsv(path: string): Blob {
  const kind = path.split('/').pop() ?? 'export';
  const rows = adminOverview().students.map((s) =>
    [s.participant, s.research, s.totalXp, s.levelsCompleted, s.riskTier, s.prediction.probability].join(','),
  );
  const csv = [`# SAMPLE ${kind} export (demo mode) - not real participants`, 'participant,research,total_xp,levels_completed,risk_tier,probability', ...rows].join('\r\n');
  return new Blob([csv], { type: 'text/csv' });
}

// ---- Lessons (Learn mode) ---------------------------------------------------
// The real lesson files from /content/lessons, loaded on demand (one chunk each).
// The demo checks answers in the browser; the real app checks them on the server.
const LESSON_FILES = import.meta.glob('../../../content/lessons/*.json', { import: 'default' });
const lessonPath = (skillId: string) => `../../../content/lessons/${skillId}.json`;
const hasLesson = (skillId: string) => lessonPath(skillId) in LESSON_FILES;

interface DemoLessonStep {
  id: string;
  type: string;
  code?: string;
  from?: string;
  options?: { text: string; why: string }[];
  answer?: number;
  accepted?: string[];
  explain?: string;
  [key: string]: unknown;
}
interface DemoLesson {
  skillId: string;
  title: string;
  minutes: number;
  version: number;
  steps: DemoLessonStep[];
}

async function loadLesson(skillId: string): Promise<DemoLesson | null> {
  const load = LESSON_FILES[lessonPath(skillId)];
  return load ? ((await load()) as DemoLesson) : null;
}

// Mirrors splitNarration() in backend/src/lessons/content.ts.
function splitNarration(code: string) {
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

// Mirrors sanitizeLesson(): the same shape the real API sends.
function lessonSteps(lesson: DemoLesson) {
  return lesson.steps.map((s) => {
    if (s.type === 'predict') {
      const { code, notes } = splitNarration(s.code ?? '');
      return { id: s.id, type: s.type, prompt: s.prompt, code, notes, options: (s.options ?? []).map((o) => ({ text: o.text })) };
    }
    if (s.type === 'trace') {
      const src = s.from ? lesson.steps.find((x) => x.id === s.from) : s;
      const { code, notes } = splitNarration(src?.code ?? '');
      return { id: s.id, type: s.type, title: s.title, code, notes, trace: s.trace };
    }
    if (s.type === 'fill') {
      return { id: s.id, type: s.type, prompt: s.prompt, code: splitNarration(s.code ?? '').code, expectedOutput: s.expectedOutput, hint: s.hint, blank: '____' };
    }
    return s;
  });
}

type LessonStateName = 'none' | 'new' | 'started' | 'completed' | 'skipped';
function lessonState(skillId: string): LessonStateName {
  if (!hasLesson(skillId)) return 'none';
  return state.lessons[skillId]?.status ?? 'new';
}

async function lessonApi(skillId: string, action: string, body: Record<string, unknown>) {
  const lesson = await loadLesson(skillId);
  if (!lesson) throw new Error('Request failed (404)');
  const mine = (state.lessons[skillId] ??= { status: 'started', answered: {} });
  const skill = state.skills[skillId];
  const firstLevel = `${skillId}-01`;

  if (action === '') {
    const lv = levelData(firstLevel);
    return {
      skillId,
      skillTitle: SKILL_GRAPH.find((s) => s.id === skillId)?.title ?? skillId,
      title: lesson.title,
      minutes: lesson.minutes,
      version: lesson.version,
      steps: lessonSteps(lesson),
      status: state.lessons[skillId]?.status ?? null,
      answered: mine.answered,
      mastery: skill && skill.status !== 'locked' ? skill.mastery : null,
      nextLevel: { id: firstLevel, title: lv.title, xpReward: lv.xpReward },
    };
  }
  if (action === 'start') return { status: mine.status };
  if (action === 'answer') {
    const step = lesson.steps.find((s) => s.id === body.stepId && s.type === 'predict');
    if (!step) throw new Error('Request failed (404)');
    const answer = step.answer ?? 0;
    const choice = body.choice as number | undefined;
    const correct = choice === answer;
    const firstTry = choice !== undefined && !(step.id in mine.answered);
    let mastery;
    // Only questions after the teaching count as evidence (mirrors the backend).
    const taught = lesson.steps.findIndex((s) => s.type === 'explain');
    const counts = taught >= 0 && taught < lesson.steps.findIndex((s) => s.id === step.id);
    if (firstTry) {
      mine.answered[step.id] = correct;
      if (skill && counts) {
        const before = skill.mastery;
        skill.mastery = bktUpdate(before, correct, LESSON_BKT);
        mastery = { before, after: skill.mastery };
      }
    }
    const opts = step.options ?? [];
    return {
      correct,
      why: choice !== undefined ? opts[choice]?.why : undefined,
      answer: correct || body.reveal ? answer : undefined,
      answerWhy: correct || body.reveal ? opts[answer]?.why : undefined,
      firstTry,
      mastery,
    };
  }
  if (action === 'fill') {
    const step = lesson.steps.find((s) => s.id === body.stepId && s.type === 'fill');
    const norm = (x: string) => x.replace(/\s+/g, '').replace(/;+$/, '');
    const correct = (step?.accepted ?? []).some((a) => norm(a) === norm(String(body.answer ?? '')));
    return { correct, via: 'match', explain: correct ? step?.explain : undefined, expectedOutput: step?.expectedOutput };
  }
  if (action === 'reveal') {
    const step = lesson.steps.find((s) => s.id === body.stepId && s.type === 'fill');
    return { answer: step?.accepted?.[0] ?? '', explain: step?.explain };
  }
  if (action === 'complete') {
    mine.status = 'completed';
    const answers = Object.values(mine.answered);
    return { status: 'completed', correct: answers.filter(Boolean).length, total: answers.length, levelId: firstLevel };
  }
  if (action === 'skip') {
    if (mine.status !== 'completed') mine.status = 'skipped';
    return { levelId: firstLevel };
  }
  throw new Error('Request failed (404)');
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
  const body = (options.body ?? {}) as Record<string, unknown>;
  await wait(path.endsWith('/submit') ? 1500 : 260);

  if (path === '/api/me')
    return as<T>({
      id: 'demo-student',
      onboardingStep: 5,
      isAdmin: true, // the demo shows the research console too
      consentRequired: state.consentPending,
      currentConsentVersion: 'v1-2026-09',
    });
  if (path === '/api/dashboard') return as<T>(dashboard());
  if (path === '/api/roadmap') return as<T>({ nodes: roadmapNodes() });
  if (path === '/api/placement') return as<T>({ roles: placementRoles() });
  if (path === '/api/onboarding/complete' && method === 'POST') return as<T>({ ok: true });
  if (path === '/api/consent' && method === 'POST') {
    state.consentPending = false;
    return as<T>({ ok: true });
  }
  if (path === '/api/settings') return as<T>(method === 'PUT' ? saveSettings(body) : settings());
  if (path.startsWith('/api/leaderboard')) return as<T>(leaderboard(path.includes('period=all') ? 'all' : 'week'));
  if (path === '/api/nudges/active') return as<T>({ nudge: demoNudge() });
  if (path.startsWith('/api/nudges/')) {
    if (/\/(clicked|dismissed)$/.test(path)) state.nudgeClosed = true;
    return as<T>({ ok: true, recorded: true });
  }
  if (path === '/api/survey' && method === 'GET')
    return as<T>({ submitted: state.surveyDone, eligible: true, completedLevels: state.solved.size, minLevels: 3 });
  if (path === '/api/survey' && method === 'POST') {
    state.surveyDone = true;
    return as<T>({ ok: true, susScore: susScore((body.answers as number[]) ?? []) });
  }
  if (path === '/api/admin/overview') return as<T>(adminOverview());
  if (path === '/api/admin/metrics') return as<T>(adminMetrics());
  if (path === '/api/admin/run-scoring') return as<T>({ scored: 8, nudged: 0, windowEnd: new Date() });

  const nextLevel = path.match(/^\/api\/skills\/([^/]+)\/next-level$/);
  if (nextLevel?.[1]) {
    const lesson = lessonState(nextLevel[1]);
    return as<T>({ levelId: `${nextLevel[1]}-01`, lesson, lessonFirst: lesson === 'new' || lesson === 'started' });
  }

  const lessonRoute = path.match(/^\/api\/lessons\/([^/]+)(?:\/([a-z]+))?$/);
  if (lessonRoute?.[1]) return as<T>(await lessonApi(lessonRoute[1], lessonRoute[2] ?? '', body));

  const hint = path.match(/^\/api\/levels\/([^/]+)\/hint$/);
  if (hint?.[1] && method === 'POST') return as<T>(revealHint(hint[1]));

  const submit = path.match(/^\/api\/levels\/([^/]+)\/submit$/);
  if (submit?.[1] && method === 'POST') return as<T>(submitLevel(submit[1], (body.sourceCode as string) ?? ''));

  const level = path.match(/^\/api\/levels\/([^/]+)$/);
  if (level?.[1]) return as<T>(levelView(level[1]));

  throw new Error(`Request to ${path} failed (404)`);
}
