import { describe, expect, it } from 'vitest';
import { buildStars } from './Constellation';
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
