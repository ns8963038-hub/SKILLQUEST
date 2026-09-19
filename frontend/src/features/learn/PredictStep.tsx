import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Eye, X } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Nova } from '../../ui/Nova';
import { CodeView } from './CodeView';
import { Inline } from './Inline';
import type { AnswerResult, PredictStep as PredictStepData } from './types';

const LETTERS = ['A', 'B', 'C', 'D'];

// PREDICT (PRIMM's first P): read the program, commit to what it prints. The
// browser doesn't know the answer — each choice goes to the server, which says
// right or wrong and explains THAT option's misconception. Wrong options stay
// visible (crossed out) so the student can see what they've ruled out.
export function PredictStep({
  skillId,
  step,
  onSolved,
  onEvidence,
}: {
  skillId: string;
  step: PredictStepData;
  onSolved: () => void; // right answer, or the answer was revealed
  onEvidence: (r: AnswerResult) => void; // lets the lesson track first tries + mastery
}) {
  const [wrong, setWrong] = useState<number[]>([]);
  const [right, setRight] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(choice: number, reveal = false) {
    if (pending !== null || right !== null) return;
    setPending(choice);
    setFailed(false);
    try {
      const r = await api<AnswerResult>(`/api/lessons/${skillId}/answer`, {
        method: 'POST',
        body: reveal ? { stepId: step.id, reveal: true } : { stepId: step.id, choice },
      });
      onEvidence(r);
      if (r.correct || (reveal && r.answer !== undefined)) {
        setRight(r.answer ?? choice);
        setFeedback({ tone: 'good', text: r.answerWhy ?? r.why ?? '' });
        onSolved();
      } else {
        setWrong((w) => [...w, choice]);
        setFeedback({ tone: 'bad', text: r.why ?? 'Not quite. Trace it line by line and try again.' });
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  const solved = right !== null;
  const mood = solved ? 'happy' : feedback?.tone === 'bad' ? 'concerned' : pending !== null ? 'thinking' : 'idle';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0">
        <CodeView code={step.code} />
      </div>

      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3">
          <Nova mood={mood} size={40} />
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{step.prompt}</h2>
        </div>

        <div role="radiogroup" aria-label="Your prediction" className="space-y-2.5">
          {step.options.map((o, k) => {
            const isWrong = wrong.includes(k);
            const isRight = right === k;
            return (
              <motion.button
                key={k}
                type="button"
                role="radio"
                aria-checked={isRight}
                disabled={solved || isWrong || pending !== null}
                onClick={() => void choose(k)}
                animate={isWrong ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                  isRight && 'border-success/60 bg-success-tint text-content shadow-[0_0_28px_-10px_rgba(69,224,160,0.8)]',
                  isWrong && 'border-danger/30 bg-danger-tint/40 text-content-muted',
                  !isRight && !isWrong && 'border-line-strong bg-surface-2/60 hover:border-ion/40 hover:bg-surface-3',
                  solved && !isRight && !isWrong && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-xs',
                    isRight ? 'border-success/60 text-success' : isWrong ? 'border-danger/40 text-danger' : 'border-line-strong text-content-muted',
                  )}
                  aria-hidden
                >
                  {isRight ? <Check size={14} /> : isWrong ? <X size={14} /> : pending === k ? '…' : LETTERS[k]}
                </span>
                <pre className={cn('whitespace-pre-wrap pt-0.5 font-mono text-[13.5px] leading-relaxed [font-variant-ligatures:none]', isWrong && 'line-through decoration-danger/50')}>
                  {o.text}
                </pre>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {feedback && (
            <motion.p
              key={feedback.text}
              role="status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                'mt-4 rounded-2xl border px-4 py-3 text-sm leading-relaxed',
                feedback.tone === 'good' ? 'border-success/25 bg-success-tint text-content' : 'border-danger/25 bg-danger-tint text-content',
              )}
            >
              <strong className={feedback.tone === 'good' ? 'text-success' : 'text-danger'}>
                {feedback.tone === 'good' ? 'Correct. ' : 'Not quite. '}
              </strong>
              <Inline text={feedback.text} />
            </motion.p>
          )}
        </AnimatePresence>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger">
            Couldn’t check that — try again.
          </p>
        )}
        {!solved && wrong.length >= 2 && (
          <button
            type="button"
            onClick={() => void choose(-1, true)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-content-muted transition-colors hover:text-content"
          >
            <Eye size={14} aria-hidden /> Show me the answer
          </button>
        )}
      </div>
    </div>
  );
}
