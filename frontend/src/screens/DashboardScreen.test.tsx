import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../lib/api', () => ({
  api: vi.fn(() =>
    Promise.resolve({
      totalXp: 100,
      level: 1,
      xpIntoLevel: 100,
      xpForNextLevel: 150,
      currentStreak: 3,
      bestStreak: 5,
      activeToday: true,
      badges: [{ id: 'first_quest', title: 'First Quest', icon: '🏅', description: 'x' }],
      currentQuest: { skillId: 'arrays', title: 'Arrays', levelId: 'arrays-01' },
    }),
  ),
}));

import { DashboardScreen } from './DashboardScreen';

describe('DashboardScreen', () => {
  it('shows level, streak, quest, and badges', async () => {
    render(<DashboardScreen onContinue={() => {}} onViewRoadmap={() => {}} />);
    expect(await screen.findByText(/level 1/i)).toBeInTheDocument();
    expect(screen.getByText(/3-day streak/i)).toBeInTheDocument();
    expect(screen.getByText(/continue your quest/i)).toBeInTheDocument();
    expect(screen.getByText('Arrays')).toBeInTheDocument();
    expect(screen.getByText(/first quest/i)).toBeInTheDocument();
  });

  it('opens the quest level when Resume is clicked', async () => {
    const onContinue = vi.fn();
    render(<DashboardScreen onContinue={onContinue} onViewRoadmap={() => {}} />);
    (await screen.findByRole('button', { name: /resume/i })).click();
    expect(onContinue).toHaveBeenCalledWith('arrays-01');
  });
});
