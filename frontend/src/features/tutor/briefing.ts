import { SKILL_GRAPH } from '../constellation/skillGraph';
import type { RoadmapNode } from '../roadmap/types';
import { solvesToMastery } from './bkt';

// What the dashboard knows about the student's plan, summarised once.
export interface PlanSummary {
  total: number; // the skills that count for this student: their plan plus what they tested out of
  completed: number; // skills finished (every level passed) + skills tested out in the quiz
  testedOut: number; // skills the placement quiz showed they already know
  frontier: RoadmapNode | null; // the skill they're working on now
  frontierMastery: number | null; // its BKT estimate, when the API provides one
}

// Summarise a roadmap. `testedOut` is the list GET /api/roadmap sends: skills the
// quiz showed they know count as done. A skill left out because the student's
// goal doesn't need it counts for nothing — neither done nor still to do.
// (Without the list, e.g. in the offline demo, every skill missing from the plan
// is taken to be tested out, as before.)
export function summarizePlan(nodes: RoadmapNode[], testedOutList?: string[]): PlanSummary {
  const inPlan = new Set(nodes.map((n) => n.skillId));
  const testedOut = testedOutList
    ? testedOutList.filter((id) => !inPlan.has(id)).length
    : SKILL_GRAPH.filter((s) => !inPlan.has(s.id)).length;
  const finished = nodes.filter((n) => n.status === 'completed').length;
  const frontier = nodes.find((n) => n.status === 'current') ?? null;
  return {
    total: testedOutList ? nodes.length + testedOut : SKILL_GRAPH.length,
    completed: finished + testedOut,
    testedOut,
    frontier,
    frontierMastery: typeof frontier?.mastery === 'number' ? frontier.mastery : null,
  };
}

export interface BriefingInput {
  currentStreak: number;
  activeToday: boolean;
  currentQuest: { title: string } | null;
}

// The tutor's short plain-English briefing on the dashboard. Deliberately
// deterministic and derived ONLY from the student's own data (mastery estimate,
// plan, streak) — every sentence can be traced to a number; nothing is invented.
export function buildBriefing(input: BriefingInput, plan: PlanSummary | null): string {
  if (!input.currentQuest) {
    return 'Every skill on your map is mastered. Pressure-test it with Company DSA prep — real questions from the companies you are targeting.';
  }

  const parts: string[] = [];
  const title = input.currentQuest.title;

  if (plan?.frontierMastery != null) {
    const pct = Math.round(plan.frontierMastery * 100);
    parts.push(`${title} is your frontier — the tutor estimates your mastery at ${pct}%.`);
    // Only a level's FIRST submit is evidence, so "solves" means new levels solved
    // first time — and a skill may not have that many levels left.
    const needed = solvesToMastery(plan.frontierMastery);
    const frontier = plan.frontier;
    const left =
      frontier?.levelsTotal != null ? frontier.levelsTotal - (frontier.levelsCompleted ?? 0) : null;
    if (needed === 0) parts.push('The tutor is confident you know it — finish its levels to move on.');
    else if (left !== null && needed > left)
      parts.push(
        'The tutor learns from your first submit on each level and from your lesson answers, so check with Run examples before you submit.',
      );
    else
      parts.push(
        needed === 1
          ? 'Solving its next level on the first submit should lock it in.'
          : `Solving about ${needed} more of its levels on the first submit should lock it in.`,
      );
  } else {
    parts.push(`${title} is next on your map.`);
  }

  if (plan) parts.push(`You have completed ${plan.completed} of ${plan.total} skills so far.`);

  if (input.activeToday) parts.push(`Your ${input.currentStreak}-day run is safe for today.`);
  else if (input.currentStreak > 0)
    parts.push(`Solve anything today to keep your ${input.currentStreak}-day run alive.`);
  else parts.push('Solve one problem today to start a new run.');

  return parts.join(' ');
}
