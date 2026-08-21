import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoadmapView } from './RoadmapView';
import type { RoadmapNode } from './types';

// A tiny two-week plan covering every status.
const NODES: RoadmapNode[] = [
  { skillId: 'a', title: 'Alpha', weekNumber: 1, position: 0, status: 'completed' },
  { skillId: 'b', title: 'Beta', weekNumber: 1, position: 1, status: 'current' },
  { skillId: 'c', title: 'Gamma', weekNumber: 2, position: 0, status: 'available' },
  { skillId: 'd', title: 'Delta', weekNumber: 2, position: 1, status: 'locked' },
];

describe('RoadmapView', () => {
  it('renders each week and every skill', () => {
    render(<RoadmapView nodes={NODES} />);
    expect(screen.getByRole('heading', { name: /week 1/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /week 2/i })).toBeInTheDocument();
    for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(screen.getByRole('button', { name: new RegExp(title, 'i') })).toBeInTheDocument();
    }
  });

  it('disables locked skills and enables the rest', () => {
    render(<RoadmapView nodes={NODES} />);
    // Locked skill can't be clicked.
    expect(screen.getByRole('button', { name: /delta/i })).toBeDisabled();
    // A completed / available skill can.
    expect(screen.getByRole('button', { name: /alpha/i })).toBeEnabled();
  });

  it('calls onSelectSkill with the skill id when a node is clicked', () => {
    const onSelect = vi.fn();
    render(<RoadmapView nodes={NODES} onSelectSkill={onSelect} />);
    screen.getByRole('button', { name: /gamma/i }).click();
    expect(onSelect).toHaveBeenCalledWith('c');
  });
});
