import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the brand and the roadmap screen', () => {
    render(<App />);
    // Brand in the header.
    expect(screen.getByText(/skill/i)).toBeInTheDocument();
    // The roadmap screen heading and at least one skill from the mock plan.
    expect(screen.getByRole('heading', { name: /your roadmap/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /java basics/i })).toBeInTheDocument();
  });
});
