import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ApiError } from '../lib/apiError';

// Replace the Monaco editor with a plain textarea so it renders in jsdom.
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

// canvas-confetti touches a real canvas, which jsdom doesn't have — stub it.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

// Mock the API like the real server: the level GET returns a level; "Run
// examples" (/run) returns the visible tests only; /submit refuses the untouched
// starter code with a 422 and otherwise returns a pass.
const STARTER = 'class Main {}';
let finishesTopic = false; // when true, the pass hands over to a new topic whose lesson comes first
const api = vi.fn((path: string, options?: { body?: { sourceCode?: string } }) => {
  if (path.endsWith('/run'))
    return Promise.resolve({
      mode: 'examples',
      verdict: 'wrong_answer',
      passed: 0,
      total: 1,
      cases: [{ hidden: false, passed: false, stdin: '', expectedOutput: 'x', actualOutput: '' }],
    });
  if (path.endsWith('/submit'))
    return options?.body?.sourceCode === STARTER
      ? Promise.reject(new ApiError(path, 422))
      : Promise.resolve({
          verdict: 'accepted',
          passed: 1,
          total: 1,
          passRatio: 1,
          xpAwarded: 50,
          cases: [{ hidden: false, passed: true, stdin: '', expectedOutput: 'x', actualOutput: 'x' }],
          ...(finishesTopic ? { nextLevelId: 'methods-01', nextLessonSkillId: 'methods' } : {}),
        });
  return Promise.resolve({
    id: 'arrays-01',
    skillId: 'arrays',
    title: 'Max in Array',
    difficulty: 1,
    statementMd: 'Find the max.',
    starterCode: STARTER,
    hints: [],
    xpReward: 50,
    sampleTests: [],
  });
});
vi.mock('../lib/api', () => ({ api: (...args: Parameters<typeof api>) => api(...args) }));

import { PlayScreen } from './PlayScreen';

// Type a solution into the (mocked) editor.
const writeSolution = () =>
  fireEvent.change(screen.getByTestId('editor'), { target: { value: 'class Main { /* solved */ }' } });

describe('PlayScreen', () => {
  beforeEach(() => {
    finishesTopic = false;
    api.mockClear();
    window.localStorage.clear();
  });

  it('loads the level, submits, and opens the treasure on a pass', async () => {
    render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} />);

    // The level loads and its title shows.
    expect(await screen.findByRole('heading', { name: /max in array/i })).toBeInTheDocument();

    // Submitting a solution opens the treasure chest and shows the XP.
    writeSolution();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i })); // via fireEvent, so React sees it inside act()
    expect(await screen.findByText(/treasure unlocked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\+50 xp/i).length).toBeGreaterThan(0);
  });

  it('runs the examples on their own route and says the run was not recorded', async () => {
    render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} />);
    await screen.findByRole('heading', { name: /max in array/i });

    fireEvent.click(screen.getByRole('button', { name: /run examples/i }));
    expect(await screen.findByText(/0 of 1 examples passed/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is recorded until you submit/i)).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/levels/arrays-01/run', expect.anything());
    expect(api).not.toHaveBeenCalledWith('/api/levels/arrays-01/submit', expect.anything());
    expect(screen.queryByText(/treasure unlocked/i)).not.toBeInTheDocument();
  });

  it('Ctrl+Enter runs the examples, never a graded submit', async () => {
    render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} />);
    await screen.findByRole('heading', { name: /max in array/i });

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(await screen.findByText(/0 of 1 examples passed/i)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith('/api/levels/arrays-01/submit', expect.anything());
  });

  it('asks for a solution when the untouched starter code is submitted', async () => {
    render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} />);
    await screen.findByRole('heading', { name: /max in array/i });

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(await screen.findByText(/still the starter code/i)).toBeInTheDocument();
  });

  it('restores the student’s own draft, never another student’s', async () => {
    const { unmount } = render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} />);
    await screen.findByRole('heading', { name: /max in array/i });
    writeSolution();
    unmount();

    render(<PlayScreen levelId="arrays-01" userId="student-2" onBack={() => {}} />);
    await screen.findByRole('heading', { name: /max in array/i });
    expect(screen.getByTestId('editor')).toHaveValue(STARTER);
  });

  it('after the last level of a topic, "Next topic" opens the next topic’s lesson, not its level', async () => {
    finishesTopic = true;
    const onNextTopic = vi.fn();
    const onOpenLevel = vi.fn();
    render(<PlayScreen levelId="arrays-01" userId="student-1" onBack={() => {}} onOpenLevel={onOpenLevel} onNextTopic={onNextTopic} />);
    await screen.findByRole('heading', { name: /max in array/i });
    writeSolution();
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /next topic/i }));
    expect(onNextTopic).toHaveBeenCalledWith('methods');
    expect(onOpenLevel).not.toHaveBeenCalled();
  });
});
