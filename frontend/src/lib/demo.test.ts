import { describe, expect, it } from 'vitest';
import { SKILL_GRAPH } from '../features/constellation/skillGraph';
import { demoApi } from './demo';

// The offline demo is what examiners may see if there's no internet, so its
// made-up progress has to obey the same course order as the real product.
describe('demo roadmap', () => {
  it('never opens a skill before everything it needs is done', async () => {
    const { nodes } = await demoApi<{ nodes: { skillId: string; status: string }[] }>('/api/roadmap', {});
    const status = new Map(nodes.map((n) => [n.skillId, n.status]));
    // A skill missing from the plan was tested out in the quiz, which counts as done.
    const done = (id: string) => !status.has(id) || status.get(id) === 'completed';
    for (const n of nodes) {
      if (n.status === 'locked' || n.status === 'completed') continue;
      const prereqs = SKILL_GRAPH.find((s) => s.id === n.skillId)!.prereqs;
      for (const p of prereqs) expect(done(p), `${n.skillId} is ${n.status} but ${p} isn't done`).toBe(true);
    }
  });

  it('has exactly one current skill', async () => {
    const { nodes } = await demoApi<{ nodes: { status: string }[] }>('/api/roadmap', {});
    expect(nodes.filter((n) => n.status === 'current')).toHaveLength(1);
  });
});
