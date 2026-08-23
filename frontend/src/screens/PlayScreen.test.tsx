import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Replace the Monaco editor with a plain textarea so it renders in jsdom.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// canvas-confetti touches a real canvas, which jsdom doesn't have — stub it.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

// Mock the API: the level GET returns a level, the submit POST returns a pass.
vi.mock('../lib/api', () => ({
  api: vi.fn((path: string) =>
    path.includes('/submit')
      ? Promise.resolve({
          verdict: 'accepted',
          passed: 1,
          total: 1,
          passRatio: 1,
          xpAwarded: 50,
          cases: [{ hidden: false, passed: true, stdin: '', expectedOutput: 'x', actualOutput: 'x' }],
        })
      : Promise.resolve({
          id: 'arrays-01',
          skillId: 'arrays',
          title: 'Max in Array',
          difficulty: 1,
          statementMd: 'Find the max.',
          starterCode: 'class Main {}',
          hints: [],
          xpReward: 50,
          sampleTests: [],
        }),
  ),
}));

import { PlayScreen } from './PlayScreen';

describe('PlayScreen', () => {
  it('loads the level, runs tests, and opens the treasure on a pass', async () => {
    render(<PlayScreen levelId="arrays-01" onBack={() => {}} />);

    // The level loads and its title shows.
    expect(await screen.findByRole('heading', { name: /max in array/i })).toBeInTheDocument();

    // Running the tests opens the treasure chest and shows the XP.
    screen.getByRole('button', { name: /run tests/i }).click();
    expect(await screen.findByText(/treasure unlocked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\+50 xp/i).length).toBeGreaterThan(0);
  });
});
