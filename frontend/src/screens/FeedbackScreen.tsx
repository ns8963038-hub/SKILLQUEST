import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '../lib/api';
import { invalidate, useApi } from '../lib/useApi';
import { cn } from '../lib/cn';
import type { SurveyStatus } from '../features/engagement/FeedbackCard';
import { Nova } from '../ui/Nova';
import { Button, ErrorState, GlassCard, PageHeader, Skeleton, rise, stagger } from '../ui/primitives';

// The System Usability Scale (Brooke, 1996): ten standard items, with "the
// system" replaced by "SkillQuest". The wording and order must NOT change, or the
// score stops being comparable with the SUS benchmark (68 = average).
const SUS_ITEMS = [
  'I think that I would like to use SkillQuest frequently.',
  'I found SkillQuest unnecessarily complex.',
  'I thought SkillQuest was easy to use.',
  'I think that I would need the support of a technical person to be able to use SkillQuest.',
  'I found the various functions in SkillQuest were well integrated.',
  'I thought there was too much inconsistency in SkillQuest.',
  'I would imagine that most people would learn to use SkillQuest very quickly.',
  'I found SkillQuest very cumbersome to use.',
  'I felt very confident using SkillQuest.',
  'I needed to learn a lot of things before I could get going with SkillQuest.',
];

const AGREE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const ENGAGE = ['Not at all', 'Slightly', 'Moderately', 'Very', 'Extremely'];

// A 1–5 scale as a radio group: keyboard-navigable, labelled at both ends.
function Scale({
  name,
  legend,
  labels,
  value,
  onChange,
  index,
}: {
  name: string;
  legend: string;
  labels: string[];
  value: number | null;
  onChange: (v: number) => void;
  index?: number;
}) {
  return (
    <fieldset className="border-b border-white/[0.05] py-5 last:border-b-0">
      <legend className="flex gap-3 text-[15px] leading-relaxed text-content">
        {index !== undefined && <span className="font-mono text-sm text-ion">{String(index + 1).padStart(2, '0')}</span>}
        {legend}
      </legend>
      <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
        {labels.map((label, i) => {
          const v = i + 1;
          const on = value === v;
          return (
            <label
              key={v}
              className={cn(
                'relative flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-center transition-colors',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ion',
                on ? 'border-ion/60 bg-ion-tint text-content' : 'border-line bg-surface-2/50 text-content-muted hover:border-ion/30',
              )}
            >
              <input
                type="radio"
                name={name}
                value={v}
                checked={on}
                onChange={() => onChange(v)}
                className="sr-only"
              />
              <span className="font-mono text-sm">{v}</span>
              <span className="hidden text-[10px] leading-tight sm:block">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-content-muted sm:hidden" aria-hidden>
        <span>{labels[0]}</span>
        <span>{labels[4]}</span>
      </div>
    </fieldset>
  );
}

// The UAT questionnaire (PRD §6): SUS + engagement rating + would-recommend +
// an optional comment. One submission per student.
export function FeedbackScreen({ onDone }: { onDone: () => void }) {
  const status = useApi<SurveyStatus>('/api/survey');
  const [answers, setAnswers] = useState<(number | null)[]>(() => SUS_ITEMS.map(() => null));
  const [engagement, setEngagement] = useState<number | null>(null);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comments, setComments] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const answered = answers.filter((a) => a !== null).length + (engagement ? 1 : 0) + (recommend !== null ? 1 : 0);
  const total = SUS_ITEMS.length + 2;
  const complete = answered === total;

  async function submit() {
    if (!complete) return;
    setSending(true);
    setError(null);
    try {
      await api('/api/survey', {
        method: 'POST',
        body: { answers, engagement, wouldRecommend: recommend, comments: comments.trim() || undefined },
      });
      invalidate('/api/survey');
      setDone(true);
    } catch {
      setError('Could not send your answers. Check your connection and try again — nothing was lost.');
    } finally {
      setSending(false);
    }
  }

  if (status.error) return <ErrorState message="Could not load the questionnaire." onRetry={status.reload} />;
  if (!status.data) return <Skeleton className="mx-auto h-[520px] max-w-3xl rounded-3xl" />;

  // Already answered (or just finished): a warm thank-you.
  if (done || status.data.submitted) {
    return (
      <GlassCard edge className="mx-auto max-w-lg p-10 text-center">
        <Nova mood="happy" size={84} className="mx-auto" />
        <h1 tabIndex={-1} className="mt-6 font-display text-3xl font-semibold tracking-tight outline-none">
          Thank you!
        </h1>
        <p className="mt-2 text-sm text-content-muted">
          Your answers are in. They go into our final-year report anonymously, as a participant code.
        </p>
        <Button className="mt-7" onClick={onDone}>
          <ArrowLeft size={16} aria-hidden /> Back to home
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Feedback · about 2 minutes"
        title="How was SkillQuest?"
        description="There are no right answers — tell us honestly. Your first reaction to each statement is best."
      />

      <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
        <motion.div variants={rise}>
          <GlassCard className="px-5 py-2 sm:px-7">
            {SUS_ITEMS.map((item, i) => (
              <Scale
                key={i}
                index={i}
                name={`sus-${i}`}
                legend={item}
                labels={AGREE}
                value={answers[i] ?? null}
                onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
              />
            ))}
          </GlassCard>
        </motion.div>

        <motion.div variants={rise}>
          <GlassCard className="px-5 py-2 sm:px-7">
            <Scale
              name="engagement"
              legend="How engaging was SkillQuest to learn with?"
              labels={ENGAGE}
              value={engagement}
              onChange={setEngagement}
            />
            <fieldset className="py-5">
              <legend className="text-[15px] text-content">
                Would you recommend SkillQuest to a friend preparing for placements?
              </legend>
              <div className="mt-3 flex gap-2">
                {[
                  { v: true, label: 'Yes' },
                  { v: false, label: 'No' },
                ].map(({ v, label }) => (
                  <label
                    key={label}
                    className={cn(
                      'flex min-h-[46px] min-w-[96px] cursor-pointer items-center justify-center rounded-xl border px-5 text-sm transition-colors',
                      'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ion',
                      recommend === v
                        ? 'border-ion/60 bg-ion-tint text-content'
                        : 'border-line bg-surface-2/50 text-content-muted hover:border-ion/30',
                    )}
                  >
                    <input
                      type="radio"
                      name="recommend"
                      checked={recommend === v}
                      onChange={() => setRecommend(v)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="pb-6">
              <label htmlFor="comments" className="text-[15px] text-content">
                Anything else? <span className="text-content-muted">(optional)</span>
              </label>
              <textarea
                id="comments"
                rows={3}
                maxLength={2000}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="What did you like? What confused you?"
                className="mt-3 w-full rounded-xl border border-line-strong bg-base/60 px-4 py-3 text-[15px] text-content placeholder:text-content-muted focus:border-ion/60 focus:shadow-[0_0_0_4px_rgba(127,168,255,0.14)] focus:outline-none focus-visible:outline-none"
              />
            </div>
          </GlassCard>
        </motion.div>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Progress + submit, pinned so it's always reachable. */}
        <motion.div
          variants={rise}
          className="sticky bottom-24 z-10 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-surface/90 p-3 pl-5 backdrop-blur-xl lg:bottom-6"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-content">
              {answered} of {total} answered
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-ion to-success"
                animate={{ width: `${(answered / total) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              />
            </div>
          </div>
          <Button onClick={() => void submit()} disabled={!complete || sending}>
            <Send size={15} aria-hidden /> {sending ? 'Sending…' : 'Submit'}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
