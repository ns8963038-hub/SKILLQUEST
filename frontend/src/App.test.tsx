import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  // Stub fetch so the health check doesn't hit the network during tests.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ status: 'ok' }) })),
  );
});

describe('App', () => {
  it('renders the brand and the primary CTA', () => {
    render(<App />);
    // Accessible name is "Skill Quest" — a space appears between the styled
    // <span>Skill</span> and the trailing "Quest" text node.
    expect(screen.getByRole('heading', { name: /skill ?quest/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start your quest/i })).toBeInTheDocument();
  });
});
