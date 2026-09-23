import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/apiError';

// The API, mocked: GET /api/onboarding/quiz returns the questions WITHOUT their
// answers (as the real server does); POST /api/onboarding/complete succeeds.
const QUIZ = {
  questions: [
    {
      id: 'lp-out-2',
      topicSkillId: 'loops',
      prompt: 'What does this print?',
      code: 'int n = 1;\nwhile (n < 20) {\n    n = n * 2;\n}\nSystem.out.println(n);',
      options: ['16', '20', '64', '32'],
    },
  ],
};
const api = vi.fn();
vi.mock('../lib/api', () => ({ ApiError, api: (...args: unknown[]) => api(...args) }));

import { OnboardingWizard } from './OnboardingWizard';

const next = () => fireEvent.click(screen.getByRole('button', { name: /continue/i }));

describe('OnboardingWizard quiz', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation((path: string) =>
      path === '/api/onboarding/quiz' ? Promise.resolve(QUIZ) : Promise.resolve({ ok: true }),
    );
  });

  it('shows the program, and sends only the options picked — the server grades them', async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    next(); // About you -> quiz

    // The program is shown as code, with the topic it tests.
    expect(await screen.findByText(/n = n \* 2;/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /question 1, loops/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('32'));

    next(); // hours
    next(); // companies
    next(); // goal
    fireEvent.click(screen.getByRole('button', { name: /build my quest/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());

    const [, options] = api.mock.calls.find(([path]) => path === '/api/onboarding/complete')!;
    expect(options.body.quizAnswers).toEqual({ 'lp-out-2': 3 });
    // Nothing the browser could use to award itself a test-out.
    expect(options.body).not.toHaveProperty('testedOut');
    expect(options.body).not.toHaveProperty('quizAttempts');
    expect(options.body).not.toHaveProperty('skillLevel');
  });

  it('offers a retry when the quiz fails to load, and the student can still carry on', async () => {
    api.mockImplementationOnce(() => Promise.reject(new ApiError('/api/onboarding/quiz', 500)));
    render(<OnboardingWizard onComplete={() => {}} />);
    next();

    expect(await screen.findByText(/the quiz didn’t load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled(); // not trapped
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/n = n \* 2;/)).toBeInTheDocument();
  });
});
