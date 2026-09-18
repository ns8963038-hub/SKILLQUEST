import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// A board where the viewer is 5th — outside the podium, inside the list.
vi.mock('../lib/api', () => ({
  api: vi.fn(() =>
    Promise.resolve({
      period: 'week',
      top: [
        { rank: 1, name: 'Riya S', xp: 310, isYou: false },
        { rank: 2, name: 'Arjun K', xp: 260, isYou: false },
        { rank: 2, name: 'Quester 7F2A', xp: 260, isYou: false },
        { rank: 4, name: 'Kavya R', xp: 150, isYou: false },
        { rank: 5, name: 'Demo Student', xp: 110, isYou: true },
      ],
      you: { rank: 5, name: 'Demo Student', xp: 110, isYou: true },
      players: 5,
    }),
  ),
}));

import { LeaderboardScreen } from './LeaderboardScreen';

describe('LeaderboardScreen', () => {
  it('shows the podium, tied ranks, and highlights the viewer', async () => {
    render(<LeaderboardScreen onOpenSettings={() => {}} />);
    expect(await screen.findByText('Riya S')).toBeInTheDocument();
    expect(screen.getByText('Quester 7F2A')).toBeInTheDocument(); // anonymous handle
    expect(screen.getByText(/\(you\)/)).toBeInTheDocument();
    expect(screen.getByText(/5 students on the board/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide me/i })).toBeInTheDocument();
  });
});
