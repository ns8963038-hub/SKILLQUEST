import { describe, it, expect } from 'vitest';
import { SKILL_GRAPH, ancestorsOf, computeDepths, dependentsOf, layoutGraph } from './skillGraph';

describe('skill graph', () => {
  it('only references prerequisites that exist', () => {
    const ids = new Set(SKILL_GRAPH.map((s) => s.id));
    for (const s of SKILL_GRAPH) for (const p of s.prereqs) expect(ids.has(p)).toBe(true);
  });

  it('computes depth as the longest prerequisite chain', () => {
    const d = computeDepths(SKILL_GRAPH);
    expect(d.get('java-basics')).toBe(0);
    expect(d.get('recursion')).toBe(5); // via methods/arrays (depth 4)
    expect(d.get('interview-patterns')).toBe(8); // via hashing (depth 7)
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
