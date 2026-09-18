import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// The survey endpoint: GET says "eligible, not yet answered"; POST records it.
const apiMock = vi.fn((_path: string, options?: { method?: string }) =>
  options?.method === 'POST'
    ? Promise.resolve({ ok: true, susScore: 75 })
    : Promise.resolve({ submitted: false, eligible: true, completedLevels: 4, minLevels: 3 }),
);
vi.mock('../lib/api', () => ({ api: (path: string, options?: { method?: string }) => apiMock(path, options) }));

import { FeedbackScreen } from './FeedbackScreen';

describe('FeedbackScreen', () => {
  it('only submits once every question is answered, and sends the SUS answers in order', async () => {
    render(<FeedbackScreen onDone={() => {}} />);
    const submit = await screen.findByRole('button', { name: /submit/i });
    expect(submit).toBeDisabled();

    // Answer all 10 SUS items with "4", engagement "5", and "Yes".
    for (let i = 0; i < 10; i++) {
      const group = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === `sus-${i}`);
      fireEvent.click(group[3]!);
    }
    const engagement = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'engagement');
    fireEvent.click(engagement[4]!);
    expect(submit).toBeDisabled(); // would-recommend still unanswered
    fireEvent.click(screen.getByLabelText('Yes'));
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByText(/thank you/i)).toBeInTheDocument();
    const post = apiMock.mock.calls.find(([, o]) => o?.method === 'POST') as unknown as [string, { body: { answers: number[]; engagement: number; wouldRecommend: boolean } }];
    expect(post[1].body.answers).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(post[1].body.engagement).toBe(5);
    expect(post[1].body.wouldRecommend).toBe(true);
  });
});
