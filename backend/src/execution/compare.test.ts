import { describe, it, expect } from 'vitest';
import { normalizeOutput, outputsMatch } from './compare';

describe('outputsMatch', () => {
  it('ignores trailing spaces per line, CRLF, and outer blank lines', () => {
    expect(outputsMatch('1 2 3 \n4 5 \n', '1 2 3\n4 5')).toBe(true);
    expect(outputsMatch('Yes\r\n', 'Yes')).toBe(true);
    expect(outputsMatch('\n\n42\n\n', '42')).toBe(true);
  });

  it('still requires the same tokens, spacing between them, case and order', () => {
    expect(outputsMatch('1  2 3', '1 2 3')).toBe(false);
    expect(outputsMatch('yes', 'Yes')).toBe(false);
    expect(outputsMatch('4 5\n1 2 3', '1 2 3\n4 5')).toBe(false);
    expect(outputsMatch('  7', '7')).toBe(true); // leading space on the only line is outer whitespace
  });

  it('normalizes to a stable form', () => {
    expect(normalizeOutput('a \r\nb\t\n')).toBe('a\nb');
  });
});
