import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, EyeOff, XCircle } from 'lucide-react';
import type { SubmitCase, SubmitResult } from './types';
import { MasteryRing } from '../../ui/MasteryRing';
import { Nova } from '../../ui/Nova';
import { NeuralThinking } from '../../ui/NeuralThinking';
import { cn } from '../../lib/cn';

// The console under the editor, with Nova reacting to every run: watching while you
// code, thinking (beside a tiny neural net) while tests run, beaming on a pass,
// worried on a fail. aria-live="polite" so a screen reader announces the outcome
// ("3 of 4 tests passed") without the student hunting for it.
export function ResultsPanel({
  result,
  running,
  error,
}: {
  result: SubmitResult | null;
  running: boolean;
  error?: string | null;
}) {
  return (
    <div aria-live="polite" className="glass min-h-[150px] rounded-2xl p-4 sm:p-5">
      {running ? (
        <RunningState />
      ) : error ? (
        <div className="flex items-center gap-4">
          <Nova mood="concerned" size={44} />
          <p role="alert" className="flex-1 rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-3 text-sm text-danger">
            {error}
          </p>
        </div>
      ) : result ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Summary result={result} />
          <ul className="mt-4 space-y-2">
            {result.cases.map((c, i) => (
              <TestResultRow key={i} c={c} index={i} />
            ))}
          </ul>
        </motion.div>
      ) : (
        <div className="flex items-center gap-4">
          <Nova mood="idle" size={44} />
          <div>
            <p className="eyebrow">Console</p>
            <p className="mt-1.5 text-sm text-content-muted">Run the tests to see your results.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// The real stages of a submission, shown while the runner works.
const STAGES = ['Compiling Main.java', 'Running the test cases', 'Comparing outputs'];

function RunningState() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 520);
    return () => clearInterval(t);
  }, []);

  return (
    <div role="status" className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <Nova mood="thinking" size={44} />
        <div>
          <p className="font-medium">Running tests…</p>
          <ol className="mt-2 space-y-1 font-mono text-xs" aria-hidden>
            {STAGES.map((s, i) => (
              <li
                key={s}
                className={cn(
                  'flex items-center gap-2 transition-colors duration-300',
                  i < stage ? 'text-success' : i === stage ? 'text-content' : 'text-content-muted',
                )}
              >
                <span className="w-3">{i < stage ? '✓' : i === stage ? '›' : '·'}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <NeuralThinking className="sm:ml-auto" />
    </div>
  );
}

// Big pass-ratio ring, a plain-language verdict, and Nova's reaction. Failure is
// framed as progress.
function Summary({ result }: { result: SubmitResult }) {
  const allPass = result.total > 0 && result.passed === result.total;
  return (
    <div className="flex items-center gap-4">
      <MasteryRing
        value={result.total ? result.passed / result.total : 0}
        size={64}
        stroke={5}
        tone={allPass ? 'mint' : 'ion'}
        delay={0}
      >
        <span className="font-mono text-sm font-semibold">
          {result.passed}/{result.total}
        </span>
      </MasteryRing>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold tracking-tight">
          {allPass ? 'All tests passed' : `${result.passed} of ${result.total} tests passed`}
          {result.xpAwarded > 0 && <span className="ml-2 text-accent">+{result.xpAwarded} XP</span>}
        </p>
        <p className="text-sm text-content-muted">
          {allPass
            ? 'The vault seal is broken.'
            : 'Close. Check the failing case below — every attempt tells the tutor what to teach next.'}
        </p>
      </div>
      <Nova mood={allPass ? 'happy' : 'concerned'} size={48} className="hidden sm:block" />
    </div>
  );
}

// One test case. Pass/fail is shown with an icon AND text (never colour alone). A
// failing visible case opens a side-by-side of input, expected and actual output;
// hidden cases only ever reveal pass/fail.
function TestResultRow({ c, index }: { c: SubmitCase; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        'rounded-xl border px-3.5 py-2.5 text-sm',
        c.passed ? 'border-success/15 bg-success-tint/40' : 'border-danger/20 bg-danger-tint/50',
      )}
    >
      <div className="flex items-center gap-2.5">
        {c.passed ? (
          <CheckCircle2 size={16} className="text-success" aria-hidden />
        ) : (
          <XCircle size={16} className="text-danger" aria-hidden />
        )}
        <span className="font-medium">Test {index + 1}</span>
        {c.hidden && (
          <span className="inline-flex items-center gap-1 text-xs text-content-muted">
            <EyeOff size={12} aria-hidden />
            hidden
          </span>
        )}
        <span className={cn('ml-auto font-mono text-xs', c.passed ? 'text-success' : 'text-danger')}>
          {c.passed ? 'passed' : 'failed'}
        </span>
      </div>
      {!c.passed && !c.hidden && (
        <div className="mt-2.5 grid gap-2 font-mono text-xs sm:grid-cols-3">
          <OutputBox label="input" value={c.stdin?.trim() || '(none)'} />
          <OutputBox label="expected" value={c.expectedOutput ?? ''} className="text-success" />
          <OutputBox label="your output" value={c.actualOutput || '(empty)'} className="text-danger" />
        </div>
      )}
    </motion.li>
  );
}

function OutputBox({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-line bg-base/60 p-2.5">
      <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-content-muted">{label}</p>
      <pre className={cn('whitespace-pre-wrap break-words text-content', className)}>{value}</pre>
    </div>
  );
}
