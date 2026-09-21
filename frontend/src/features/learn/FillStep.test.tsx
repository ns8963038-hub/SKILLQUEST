import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FillResult, FillStep as FillStepData } from './types';

// The server's reply is mocked; what matters here is how the screen explains it.
const reply = vi.hoisted(() => ({ current: null as FillResult | null }));
vi.mock('../../lib/api', () => ({ api: () => Promise.resolve(reply.current) }));

import { FillStep } from './FillStep';

// Lesson 1's exercise as the browser receives it: no loop, no array.
const step: FillStepData = {
  id: 'fill',
  type: 'fill',
  prompt: 'Your turn. Fix the trap so it prints the real total, "Sum: 8".',
  code: 'public class Main {\n    public static void main(String[] args) {\n        int a = 5;\n        int b = 3;\n        System.out.println("Sum: " + ____);\n    }\n}',
  blank: '____',
  expectedOutput: 'Sum: 8',
  hint: 'Brackets are worked out first, so put the addition in brackets.',
};

async function answer(text: string) {
  render(<FillStep skillId="java-basics" step={step} onSolved={() => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: /missing code/i }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /check/i }));
  await screen.findByRole('status');
}

describe('FillStep', () => {
  afterEach(() => {
    reply.current = null;
  });

  it('explains a typed-in answer using the case it got wrong', async () => {
    reply.current = {
      correct: false,
      via: 'run',
      output: 'Sum: 8',
      expectedOutput: 'Sum: 8',
      failedCase: { values: { a: '10', b: '20' }, expected: 'Sum: 30', actual: 'Sum: 8' },
    };
    await answer('8');
    expect(screen.getByText('Almost.')).toBeInTheDocument();
    expect(screen.getByText('a = 10, b = 20')).toBeInTheDocument();
    expect(screen.getByText('Sum: 30')).toBeInTheDocument();
    expect(screen.getByText(/use the variables, not the answer/i)).toBeInTheDocument();
    // The brackets hint would be the wrong advice here, so it stays hidden.
    expect(screen.queryByText(/brackets are worked out first/i)).not.toBeInTheDocument();
  });

  it('keeps the ordinary feedback and hint for a line that is wrong on screen', async () => {
    reply.current = { correct: false, via: 'run', output: 'Sum: 53', expectedOutput: 'Sum: 8' };
    await answer('a + b');
    expect(screen.getByText('Not yet.')).toBeInTheDocument();
    expect(screen.getByText('Sum: 53')).toBeInTheDocument();
    expect(screen.getByText(/brackets are worked out first/i)).toBeInTheDocument();
    expect(screen.queryByText('Almost.')).not.toBeInTheDocument();
  });
});
