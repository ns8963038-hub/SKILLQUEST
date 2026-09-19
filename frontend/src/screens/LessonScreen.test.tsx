import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// A two-step lesson (intro + one question) served by a mocked API. The server
// decides right/wrong: option index 1 ("6") is the right answer here.
const LESSON = {
  skillId: 'loops',
  skillTitle: 'Loops',
  title: 'Loops: make Java repeat itself',
  minutes: 5,
  version: 1,
  status: null,
  answered: {},
  mastery: null,
  nextLevel: { id: 'loops-01', title: 'Sum from 1 to N', xpReward: 50 },
  steps: [
    { id: 'hook', type: 'hook', title: 'Stop copy-pasting println', body: 'Loops repeat work.' },
    { id: 'p1', type: 'predict', prompt: 'What does this program print?', code: 'System.out.println(6);', options: [{ text: '3' }, { text: '6' }] },
  ],
};

const apiMock = vi.fn((path: string, options?: { method?: string; body?: { choice?: number } }) => {
  if (path.endsWith('/answer')) {
    const correct = options?.body?.choice === 1;
    return Promise.resolve({ correct, why: correct ? 'Right.' : 'That is i, not the total.', answer: correct ? 1 : undefined, answerWhy: correct ? 'Right.' : undefined, firstTry: true });
  }
  if (options?.method === 'POST') return Promise.resolve({ ok: true });
  return Promise.resolve(LESSON);
});
vi.mock('../lib/api', () => ({ api: (p: string, o?: { method?: string; body?: { choice?: number } }) => apiMock(p, o) }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

import { LessonScreen } from './LessonScreen';

describe('LessonScreen', () => {
  it('walks intro → question, blocks Continue until answered, and explains a wrong answer', async () => {
    render(<LessonScreen skillId="loops" onBack={() => {}} onStartLevel={() => {}} />);
    expect(await screen.findByRole('heading', { name: /stop copy-pasting println/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/what does this program print/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /answer to continue/i })).toBeDisabled();

    // Wrong first: the server's explanation for THAT option is shown.
    fireEvent.click(screen.getByRole('radio', { name: /3/ }));
    expect(await screen.findByText(/that is i, not the total/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /answer to continue/i })).toBeDisabled();

    // Then right: Continue unlocks (it's the last step, so it reads Finish).
    fireEvent.click(screen.getByRole('radio', { name: /6/ }));
    expect(await screen.findByRole('button', { name: /finish/i })).toBeEnabled();

    // The browser sent only the choice — the lesson it received had no answers.
    expect(JSON.stringify(LESSON)).not.toContain('"answer"');
  });

  it('opens the first level from the end of the lesson', async () => {
    const onStartLevel = vi.fn();
    render(<LessonScreen skillId="loops" onBack={() => {}} onStartLevel={onStartLevel} />);
    await screen.findByRole('heading', { name: /stop copy-pasting println/i });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /6/ }));
    fireEvent.click(await screen.findByRole('button', { name: /finish/i }));
    fireEvent.click(await screen.findByRole('button', { name: /start the challenge/i }));
    expect(onStartLevel).toHaveBeenCalledWith('loops-01');
  });
});
