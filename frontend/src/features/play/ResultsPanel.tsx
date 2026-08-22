import { CheckCircle2, XCircle } from 'lucide-react';
import type { SubmitCase, SubmitResult } from './types';

// The results area. aria-live="polite" so a screen reader announces the outcome
// ("3 of 5 tests passed") without the user hunting for it.
export function ResultsPanel({
  result,
  running,
}: {
  result: SubmitResult | null;
  running: boolean;
}) {
  return (
    <div aria-live="polite" className="min-h-[120px] rounded-lg border border-line bg-surface p-4">
      {running && <p className="text-sm text-content-muted">Running tests…</p>}
      {!running && !result && (
        <p className="text-sm text-content-muted">Run the tests to see your results.</p>
      )}
      {!running && result && (
        <div className="space-y-3">
          <p className="font-medium">
            {result.passed}/{result.total} tests passed
            {result.xpAwarded > 0 && (
              <span className="ml-2 text-accent">+{result.xpAwarded} XP ⚡</span>
            )}
          </p>
          <ul className="space-y-2">
            {result.cases.map((c, i) => (
              <TestResultRow key={i} c={c} index={i} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// One test-case row. Pass/fail is shown with an icon AND text (not colour alone).
// A failing visible case expands to show expected vs actual; hidden cases show
// only pass/fail.
function TestResultRow({ c, index }: { c: SubmitCase; index: number }) {
  return (
    <li className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <div className="flex items-center gap-2">
        {c.passed ? (
          <CheckCircle2 size={16} className="text-success" aria-hidden />
        ) : (
          <XCircle size={16} className="text-danger" aria-hidden />
        )}
        <span>
          Test {index + 1} {c.hidden ? '(hidden)' : ''} — {c.passed ? 'passed' : 'failed'}
        </span>
      </div>
      {/* Show details only for a FAILING, non-hidden case. */}
      {!c.passed && !c.hidden && (
        <div className="mt-2 space-y-1 font-mono text-xs text-content-muted">
          <div>input: {c.stdin?.trim() || '(none)'}</div>
          <div>expected: {c.expectedOutput}</div>
          <div>actual: {c.actualOutput}</div>
        </div>
      )}
    </li>
  );
}
