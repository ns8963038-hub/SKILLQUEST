// How a program's output is judged against a test's expected output — shared by
// every executor so the rule is identical everywhere (and in the content checker).
//
// Normalised before comparing: Windows line endings (\r\n → \n), trailing spaces
// at the end of each line, and blank lines/whitespace at the very start or end.
// Everything else — spacing between tokens, capitalisation, line order — must
// match exactly. This way "1 2 3 " (a stray space) is accepted, but "1  2 3" or
// "yes" instead of "Yes" is not.
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

// True when the actual output matches the expected output under that rule.
export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
