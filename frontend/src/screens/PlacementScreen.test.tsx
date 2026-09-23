import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// One role with two gaps SkillQuest teaches: Methods (open) and Arrays (the
// roadmap hasn't reached it — the server says open: false).
vi.mock('../lib/api', () => ({
  api: vi.fn(() =>
    Promise.resolve({
      roles: [
        {
          companyId: 'tcs',
          companyName: 'TCS',
          roleTitle: 'Ninja',
          sourceUrl: 'https://example.com',
          collectedOn: '2026-09-01',
          score: 40,
          missingAvailableNow: [
            { skillId: 'methods', title: 'Methods', open: true },
            { skillId: 'arrays', title: 'Arrays', open: false },
          ],
          missingExternal: [],
        },
      ],
    }),
  ),
}));

import { PlacementScreen } from './PlacementScreen';

describe('PlacementScreen', () => {
  it('offers "Train" only for skills the student can open; locked ones are shown, not clickable', async () => {
    const onOpenSkill = vi.fn();
    render(<PlacementScreen onOpenSkill={onOpenSkill} onOpenDsa={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /methods/i }));
    expect(onOpenSkill).toHaveBeenCalledWith('methods');

    expect(screen.getByText(/later on your roadmap/i)).toBeInTheDocument();
    expect(screen.getByText('Arrays')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /arrays/i })).not.toBeInTheDocument();
  });
});
