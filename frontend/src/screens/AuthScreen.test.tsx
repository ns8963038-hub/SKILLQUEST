import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth } }));

import { AuthScreen } from './AuthScreen';
import { isSharedComputer, setSharedComputer } from '../lib/authStorage';

const nova = (c: HTMLElement) => c.querySelector('[data-mood]')!;

describe('AuthScreen: Nova reacts to the form', () => {
  it('watches the email field while you type your email', () => {
    const { container } = render(<AuthScreen />);
    const email = screen.getByLabelText('Email');
    fireEvent.focus(email);
    fireEvent.change(email, { target: { value: 'asha@sea.edu' } });
    expect(nova(container).getAttribute('data-watching')).toBe('point'); // following the text cursor
    expect(nova(container).getAttribute('data-mood')).toBe('idle');
  });

  it('turns round for the password, and turns half back to peek when it is shown', () => {
    const { container } = render(<AuthScreen />);
    fireEvent.focus(screen.getByLabelText('Password'));
    expect(nova(container).getAttribute('data-mood')).toBe('turned');
    expect(nova(container).getAttribute('data-watching')).toBeNull(); // not looking at all

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    fireEvent.focus(screen.getByRole('button', { name: /hide password/i }));
    expect(nova(container).getAttribute('data-mood')).toBe('glance');
    expect(nova(container).getAttribute('data-watching')).toBe('point'); // peeking at what you type
  });

  it('can be poked here — and gets angry', () => {
    const { container } = render(<AuthScreen />);
    for (let i = 0; i < 5; i++) fireEvent.pointerDown(nova(container));
    expect(nova(container).getAttribute('data-mood')).toBe('angry');
  });
});

describe('AuthScreen: shared computers', () => {
  it('ticking "shared computer" is saved BEFORE signing in, so the session stays in this tab only', async () => {
    setSharedComputer(false);
    let sharedWhenSigningIn: boolean | null = null;
    auth.signInWithPassword.mockImplementation(async () => {
      sharedWhenSigningIn = isSharedComputer(); // where the session is about to be written
      return { error: null };
    });
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@sea.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /shared computer/i }));
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await vi.waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled());
    expect(sharedWhenSigningIn).toBe(true);
    setSharedComputer(false);
  });

  it('remembers the choice on the computer, so the next student sees it ticked', () => {
    setSharedComputer(true);
    render(<AuthScreen />);
    expect(screen.getByRole('checkbox', { name: /shared computer/i })).toBeChecked();
    setSharedComputer(false);
  });
});
