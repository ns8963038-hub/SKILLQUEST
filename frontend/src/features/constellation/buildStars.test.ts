import { describe, expect, it } from 'vitest';
import { buildStars, labelBox, placeLabels } from './Constellation';
import { SKILL_GRAPH } from './skillGraph';
import type { RoadmapNode } from '../roadmap/types';

const node = (skillId: string, status: RoadmapNode['status']): RoadmapNode => ({
  skillId,
  title: skillId,
  weekNumber: 1,
  position: 0,
  status,
});

describe('buildStars', () => {
  const nodes = [node('loops', 'current')];

  it('draws only real test-outs as known; a skill the goal dropped is optional, not "tested out"', () => {
    const stars = new Map(buildStars(nodes, 540, ['java-basics']).map((s) => [s.id, s]));
    expect(stars.get('java-basics')).toMatchObject({ kind: 'done', status: 'tested-out' });
    expect(stars.get('trees-basics')).toMatchObject({ kind: 'locked', status: 'optional' });
    expect(stars.get('loops')).toMatchObject({ kind: 'frontier', status: 'current' });
  });

  it('without the list (the sign-in preview) keeps treating missing skills as tested out', () => {
    const stars = new Map(buildStars(nodes, 540).map((s) => [s.id, s]));
    expect(stars.get('trees-basics')).toMatchObject({ status: 'tested-out' });
  });
});

describe('placeLabels', () => {
  it('leaves no two labels overlapping on the real map (desktop and dashboard sizes)', () => {
    // A typical plan: the first four skills done, Methods current, the rest locked.
    const done = ['java-basics', 'operators-expressions', 'conditionals', 'loops'];
    const plan = SKILL_GRAPH.map((s) =>
      node(s.id, done.includes(s.id) ? 'completed' : s.id === 'methods' ? 'current' : 'locked'),
    );
    for (const [height, fontPx] of [
      [540, 13],
      [380, 15],
    ]) {
      const stars = buildStars(plan, height!);
      const dy = placeLabels(stars, fontPx!);
      const boxes = stars.map((s) => ({ id: s.id, ...labelBox(s, dy.get(s.id)!, fontPx!) }));
      const clashes: string[] = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) clashes.push(`${a.id} / ${b.id}`);
        }
      }
      expect(clashes, `height ${height}`).toEqual([]);
    }
  });
});
