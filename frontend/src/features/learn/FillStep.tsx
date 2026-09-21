import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, Lightbulb, Play } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Nova } from '../../ui/Nova';
import { NeuralThinking } from '../../ui/NeuralThinking';
import { Button } from '../../ui/primitives';
import { CodeView } from './CodeView';
import { Inline } from './Inline';
import type { FillResult, FillStep as FillStepData } from './types';

// TRY IT (PRIMM's Modify): the program with one piece missing. The server first
// compares the answer with the ones the author listed (all proven by the build
// script); anything else is actually RUN, so a correct answer nobody thought of
// still counts.
export function FillStep({ skillId, step, onSolved }: { skillId: string; step: FillStepData; onSolved: () => void }) {
  const [answer, setAnswer] = useState('');
  const [checking, setChecking] = useState(false);
  const [slow, setSlow] = useState(false); // the check is running real code
  const [result, setResult] = useState<FillResult | null>(null);
  const [misses, setMisses] = useState(0);
  const [explain, setExplain] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const solved = Boolean(result?.correct) || explain !== null;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  async function check() {
    if (!answer.trim() || checking || solved) return;
    setChecking(true);
    setError(false);
    const slowTimer = window.setTimeout(() => setSlow(true), 600);
    try {
      const r = await api<FillResult>(`/api/lessons/${skillId}/fill`, { method: 'POST', body: { stepId: step.id, answer } });
      setResult(r);
      if (r.correct) {
        setExplain(r.explain ?? '');
        onSolved();
      } else {
        setMisses((m) => m + 1);
      }
    } catch {
      setError(true);
    } finally {
      window.clearTimeout(slowTimer);
      setSlow(false);
      setChecking(false);
    }
  }

  async function reveal() {
    try {
      const r = await api<{ answer: string; explain?: string }>(`/api/lessons/${skillId}/reveal`, { method: 'POST', body: { stepId: step.id } });
      setAnswer(r.answer);
      setExplain(r.explain ?? '');
      setResult(null);
      onSolved();
    } catch {
      setError(true);
    }
  }

  const mood = solved ? 'happy' : checking ? 'thinking' : result && !result.correct ? 'concerned' : 'idle';
  const width = Math.max(8, answer.length + 2);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-3">
        <CodeView
          code={step.code}
          blank={step.blank}
          renderBlank={() => (
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void check()}
              readOnly={solved}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="The missing code"
              style={{ width: `${width}ch` }}
              className={cn(
                'mx-0.5 rounded-md border bg-base px-1.5 py-0 font-mono text-[13.5px] text-content outline-none transition-[border-color,box-shadow] [font-variant-ligatures:none]',
                solved
                  ? 'border-success/60 text-success'
                  : 'border-ion/50 shadow-[0_0_0_3px_rgba(127,168,255,0.14)] focus:border-ion focus:shadow-[0_0_0_4px_rgba(127,168,255,0.25)]',
              )}
            />
          )}
        />
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#070B16]">
          <p className="border-b border-white/[0.05] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-content-muted">
            It should print
          </p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] text-success">{step.expectedOutput}</pre>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-4 flex items-start gap-3">
          <Nova mood={mood} size={40} className="shrink-0" />
          <h2 className="font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{step.prompt}</h2>
        </div>

        {!solved && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void check()} disabled={!answer.trim() || checking}>
              <Play size={15} aria-hidden className="fill-current" /> {checking ? 'Checking…' : 'Check'}
            </Button>
            {checking && slow && (
              <span className="flex items-center gap-2 text-xs text-content-muted">
                <NeuralThinking className="h-6 w-12" /> Running your line on a real Java runner…
              </span>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {result && !result.correct && (
            <motion.div key={`miss-${misses}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className="mt-4 space-y-2 rounded-2xl border border-danger/25 bg-danger-tint px-4 py-3 text-sm">
              {result.failedCase ? (
                <HiddenCaseMiss failed={result.failedCase} />
              ) : (
                <>
                  <p>
                    <strong className="text-danger">Not yet. </strong>
                    {result.via === 'run' && result.output !== undefined
                      ? 'Your line ran, but the output was different:'
                      : 'That doesn’t give the output above.'}
                  </p>
                  {result.via === 'run' && result.output !== undefined && (
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-base/60 px-3 py-2 font-mono text-[12px] text-content-muted">{result.output || '(nothing)'}</pre>
                  )}
                </>
              )}
              {step.hint && !result.failedCase && (
                <p className="flex items-start gap-2 text-content-muted">
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden /> <span><Inline text={step.hint} /></span>
                </p>
              )}
            </motion.div>
          )}
          {solved && (
            <motion.div key="solved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="status" className="mt-4 rounded-2xl border border-success/25 bg-success-tint px-4 py-3 text-sm leading-relaxed">
              <strong className="text-success">{result?.correct ? 'That works! ' : 'Here’s one way. '}</strong>
              {explain && <Inline text={explain} />}
              {result?.via === 'run' && <span className="mt-1 block text-xs text-content-muted">(Not an answer we’d listed — so we ran it, and it’s right.)</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            Couldn’t check that — try again.
          </p>
        )}
        {!solved && misses >= 2 && (
          <button type="button" onClick={() => void reveal()} className="mt-3 inline-flex items-center gap-1.5 text-sm text-content-muted transition-colors hover:text-content">
            <Eye size={14} aria-hidden /> Show me an answer
          </button>
        )}
      </div>
    </div>
  );
}

// Right for the numbers on screen, wrong for another set the checker tried —
// almost always a typed-in answer ("8") instead of the variables. Shown as a
// tiny side-by-side so it reads at a glance, with one plain sentence of advice:
// this is the moment the point of a variable lands.
function HiddenCaseMiss({ failed }: { failed: NonNullable<FillResult['failedCase']> }) {
  const values = Object.entries(failed.values)
    .map(([name, value]) => `${name} = ${value}`)
    .join(', ');
  return (
    <>
      <p>
        <strong className="text-danger">Almost. </strong>
        It works for the numbers above, but we also tried <code className="rounded bg-base/60 px-1 font-mono text-[12px] text-content">{values}</code>:
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-base/60 px-3 py-2 font-mono text-[12px]">
        <dt className="text-content-muted">Your line printed</dt>
        <dd className="whitespace-pre-wrap text-danger">{failed.actual || '(nothing)'}</dd>
        <dt className="text-content-muted">It should print</dt>
        <dd className="whitespace-pre-wrap text-success">{failed.expected || '(nothing)'}</dd>
      </dl>
      <p className="flex items-start gap-2 text-content-muted">
        <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>Use the variables, not the answer — then your line works for any numbers.</span>
      </p>
    </>
  );
}
