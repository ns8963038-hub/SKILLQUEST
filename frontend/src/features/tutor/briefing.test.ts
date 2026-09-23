import { describe, it, expect } from 'vitest';
import { buildBriefing, summarizePlan } from './briefing';
import { bktUpdate, solvesToMastery } from './bkt';
import { SKILL_GRAPH } from '../constellation/skillGraph';
import type { RoadmapNode } from '../roadmap/types';

const node = (skillId: string, status: RoadmapNode['status'], mastery?: number): RoadmapNode => ({
  skillId,
  title: skillId,
  weekNumber: 1,
  position: 0,
  status,
  mastery,
});

describe('BKT mirror (frontend)', () => {
  it('matches the backend worked example', () => {
    expect(bktUpdate(0.2, true)).toBeCloseTo(0.6, 2);
    expect(bktUpdate(0.2, false)).toBeCloseTo(0.176, 2);
  });

  it('counts the first-time solves needed to reach mastery', () => {
    expect(solvesToMastery(0.58)).toBe(2);
    expect(solvesToMastery(0.99)).toBe(0);
  });
});

describe('summarizePlan', () => {
  it('counts skills missing from the plan as tested out (and so mastered)', () => {
    // Plan = every skill except java-basics (tested out). Two completed, then the frontier.
    const nodes = SKILL_GRAPH.slice(1).map((s, i) =>
      node(s.id, i < 2 ? 'completed' : i === 2 ? 'current' : 'locked', i === 2 ? 0.5 : undefined),
    );
    const plan = summarizePlan(nodes);
    // Derived from the graph, so adding a skill to the syllabus can't break this.
    expect(plan.total).toBe(SKILL_GRAPH.length);
    expect(plan.testedOut).toBe(1);
    expect(plan.completed).toBe(3);
    expect(plan.frontier?.skillId).toBe(SKILL_GRAPH[3]!.id);
    expect(plan.frontierMastery).toBe(0.5);
  });
});

describe('buildBriefing', () => {
  it('quotes the tutor’s estimate and the solves still needed', () => {
    const plan = {
      total: 19,
      completed: 4,
      testedOut: 1,
      frontier: node('methods', 'current', 0.58),
      frontierMastery: 0.58,
    };
    const text = buildBriefing({ currentStreak: 6, activeToday: false, currentQuest: { title: 'Methods' } }, plan);
    expect(text).toContain('58%');
    expect(text).toContain('about 2 more of its levels on the first submit');
    expect(text).toContain('4 of 19');
    expect(text).toContain('6-day run alive');
  });

  it('does not promise more first-time solves than the skill has levels left', () => {
    const frontier = { ...node('recursion', 'current', 0.2), levelsTotal: 2, levelsCompleted: 1 }; // 1 left, 3 needed
    const plan = { total: 19, completed: 4, testedOut: 1, frontier, frontierMastery: 0.2 };
    const text = buildBriefing({ currentStreak: 0, activeToday: false, currentQuest: { title: 'Recursion' } }, plan);
    expect(text).not.toMatch(/about \d+ more/);
    expect(text).toContain('first submit on each level and from your lesson answers');
  });

  it('never invents a percentage when there is no mastery estimate', () => {
    const text = buildBriefing({ currentStreak: 0, activeToday: false, currentQuest: { title: 'Arrays' } }, null);
    expect(text).not.toMatch(/%/);
    expect(text).toContain('Arrays is next on your map.');
  });
});
