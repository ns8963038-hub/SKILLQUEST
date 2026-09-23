import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// canvas-confetti touches a real canvas, which jsdom doesn't have — stub it.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

import { QuestReward } from './QuestReward';

const update = { skillId: 'arrays', title: 'Arrays', before: 0.6, after: 0.89, mastered: false };

describe('QuestReward tutor panel', () => {
  it('shows the estimate moving when this was the level’s first submit', () => {
    render(<QuestReward xp={50} mastery={{ ...update, counted: true }} onContinue={() => {}} />);
    expect(screen.getByText(/raised its estimate from this first submit/i)).toBeInTheDocument();
  });

  it('says a re-solve does not move the estimate, instead of showing a non-update', () => {
    render(<QuestReward xp={0} mastery={{ ...update, before: 0.6, after: 0.6, counted: false }} onContinue={() => {}} />);
    expect(screen.getByText(/solving this one again doesn’t move the estimate/i)).toBeInTheDocument();
    expect(screen.queryByText(/raised its estimate/i)).not.toBeInTheDocument();
  });
});
