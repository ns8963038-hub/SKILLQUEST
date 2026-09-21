import { describe, it, expect } from 'vitest';
import { SKILL_GRAPH, ancestorsOf, computeDepths, dependentsOf, layoutGraph } from './skillGraph';

// The real content file, bundled by Vite exactly as the demo loader does it.
const CONTENT = import.meta.glob('../../../../content/skills.json', { eager: true, import: 'default' });
const contentSkills = (Object.values(CONTENT)[0] as { skills: { id: string; prerequisites: string[] }[] }).skills;

describe('skill graph', () => {
  it('matches content/skills.json exactly, so the map and the roadmap agree', () => {
    const fromContent = Object.fromEntries(contentSkills.map((s) => [s.id, [...s.prerequisites].sort()]));
    const drawn = Object.fromEntries(SKILL_GRAPH.map((s) => [s.id, [...s.prereqs].sort()]));
    expect(drawn).toEqual(fromContent);
  });

  it('only references prerequisites that exist', () => {
    const ids = new Set(SKILL_GRAPH.map((s) => s.id));
    for (const s of SKILL_GRAPH) for (const p of s.prereqs) expect(ids.has(p)).toBe(true);
  });

  it('computes depth as the longest prerequisite chain', () => {
    const d = computeDepths(SKILL_GRAPH);
    expect(d.get('java-basics')).toBe(0);
    expect(d.get('recursion')).toBe(6); // via arrays (depth 5), which now needs methods
    expect(d.get('interview-patterns')).toBe(11); // via hashing (depth 10)
  });

  it('places every skill to the right of all its prerequisites', () => {
    const placed = layoutGraph(SKILL_GRAPH, 1000, 500);
    const byId = new Map(placed.map((p) => [p.id, p]));
    for (const s of placed) {
      for (const pre of s.prereqs) {
        expect(byId.get(pre)!.depth).toBeLessThan(s.depth);
        expect(byId.get(pre)!.x).toBeLessThan(s.x);
      }
    }
  });

  it('is deterministic (same layout on every render)', () => {
    expect(layoutGraph(SKILL_GRAPH, 1000, 500)).toEqual(layoutGraph(SKILL_GRAPH, 1000, 500));
  });

  it('finds the whole prerequisite chain of a skill', () => {
    expect([...ancestorsOf('recursion')].sort()).toEqual([
      'arrays',
      'conditionals',
      'java-basics',
      'loops',
      'methods',
      'operators-expressions',
    ]);
    expect(ancestorsOf('java-basics').size).toBe(0);
  });

  it('finds what a skill unlocks next', () => {
    expect(dependentsOf('loops').sort()).toEqual(['arrays', 'methods', 'time-complexity']);
    expect(dependentsOf('interview-patterns')).toEqual([]);
  });
});
