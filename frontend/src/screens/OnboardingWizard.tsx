import { useEffect, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { QUIZ_QUESTIONS } from '../features/onboarding/quizQuestions';
import { scoreQuiz, skillLevelFromScore } from '../features/onboarding/scoring';
import { AmbientBackground } from '../ui/AmbientBackground';
import { BrandMark } from '../ui/BrandMark';
import { Nova } from '../ui/Nova';
import { NeuralThinking } from '../ui/NeuralThinking';
import { Button, Chip, EASE_OUT, GlassCard } from '../ui/primitives';

// The five service companies students most often target. These slugs match the
// companies table; the backend ignores any that don't exist.
const COMPANIES = [
  { id: 'infosys', name: 'Infosys' },
  { id: 'tcs', name: 'TCS' },
  { id: 'wipro', name: 'Wipro' },
  { id: 'accenture', name: 'Accenture' },
  { id: 'cognizant', name: 'Cognizant' },
];

const STEPS = ['About you', 'Calibration quiz', 'Weekly time', 'Target companies', 'Your goal'];
const TOTAL_STEPS = STEPS.length;

const GOAL_IDEAS = [
  'Crack the Infosys and TCS coding rounds',
  'Get strong at DSA for product companies',
  'Build solid Java fundamentals first',
];

// What the backend really does when onboarding completes, shown while it works.
const BUILD_STAGES = [
  'Understanding your goal',
  'Ordering the skill graph by prerequisites',
  'Skipping what you already know',
  'Calibrating your mastery model',
];

// A radio/checkbox "card": the real input is visually hidden but still focusable,
// and the card reacts to its checked and keyboard-focus states.
const optionClass =
  'group relative flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-base/40 px-4 text-sm text-content-muted ' +
  'transition-[border-color,background-color,color,box-shadow] duration-200 hover:border-ion/30 hover:text-content ' +
  'has-[:checked]:border-ion/60 has-[:checked]:bg-ion-tint has-[:checked]:text-content has-[:checked]:shadow-[0_0_0_1px_rgba(127,168,255,0.35)] ' +
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ion';

const inputClass =
  'w-full min-h-[48px] rounded-xl border border-line-strong bg-base/60 px-4 text-[15px] text-content placeholder:text-content-muted ' +
  'transition-[border-color,box-shadow] duration-200 focus:border-ion/60 focus:shadow-[0_0_0_4px_rgba(127,168,255,0.14)] focus:outline-none focus-visible:outline-none';

// Steps slide in the direction of travel.
const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 36 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -36 }),
};

function intensity(hours: number): { label: string; tone: 'mint' | 'ion' | 'gold' | 'ember' } {
  if (hours < 5) return { label: 'Light', tone: 'mint' };
  if (hours < 10) return { label: 'Steady', tone: 'ion' };
  if (hours < 20) return { label: 'Focused', tone: 'gold' };
  return { label: 'Intense', tone: 'ember' };
}

// Onboarding, framed as calibrating the tutor. Collects profile info, a placement
// quiz, weekly hours, target companies and a free-text goal, then makes ONE call to
// the Web API, which maps the goal, builds the roadmap and saves everything.
export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState(3);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [hoursPerWeek, setHoursPerWeek] = useState(5);
  const [companies, setCompanies] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = QUIZ_QUESTIONS.filter((q) => answers[q.id] !== undefined).length;
  const effort = intensity(hoursPerWeek);

  // Move to a step, remembering the direction for the slide animation.
  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Toggle a company in/out of the selected set.
  function toggleCompany(id: string) {
    setCompanies((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  // Final step: score the quiz, build the payload, and submit.
  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const { attempts, testedOut, totalCorrect } = scoreQuiz(QUIZ_QUESTIONS, answers);
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: {
          branch: branch || undefined,
          year,
          skillLevel: skillLevelFromScore(totalCorrect),
          hoursPerWeek,
          targetCompanies: companies,
          goalText,
          testedOut,
          quizAttempts: attempts,
        },
      });
      onComplete(); // parent re-fetches the profile -> dashboard
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish onboarding.');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />

      <div className="relative mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="flex items-center gap-3">
          <BrandMark size={30} />
          <span className="font-display text-lg font-semibold tracking-tight">SkillQuest</span>
          <span className="ml-auto font-mono text-xs text-content-muted">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>

        {/* Named progress segments */}
        <div className="mt-8">
          <p className="eyebrow text-ion">Calibrating your tutor</p>
          <ol className="mt-4 grid grid-cols-5 gap-2" aria-label="Onboarding progress">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? 'step' : undefined}>
                <span className="block h-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.span
                    className="block h-full rounded-full bg-gradient-to-r from-ion to-ion-soft"
                    initial={false}
                    animate={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                  />
                </span>
                <span className={cn('mt-2 hidden text-[11px] sm:block', i === step ? 'text-content' : 'text-content-muted')}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <GlassCard edge className="relative mt-8 overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.section
              key={step}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {/* Step 0 — about you */}
              {step === 0 && (
                <>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">Tell us about you</h1>
                  <p className="mt-2 text-sm text-content-muted">This sets the pace your tutor starts at.</p>
                  <div className="mt-7 space-y-6">
                    <div>
                      <label htmlFor="branch" className="mb-2 block text-sm font-medium">
                        Branch
                      </label>
                      <input
                        id="branch"
                        className={inputClass}
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="e.g. AI & DS"
                      />
                    </div>
                    <fieldset>
                      <legend className="mb-2 block text-sm font-medium">Year of study</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[1, 2, 3, 4].map((y) => (
                          <label key={y} className={cn(optionClass, 'justify-center')}>
                            <input
                              type="radio"
                              name="year"
                              className="sr-only"
                              checked={year === y}
                              onChange={() => setYear(y)}
                            />
                            Year {y}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </>
              )}

              {/* Step 1 — calibration quiz */}
              {step === 1 && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="font-display text-3xl font-semibold tracking-tight">Calibration quiz</h1>
                      <p className="mt-2 text-sm text-content-muted">
                        Answer what you can. Get every question in a topic right and the tutor skips it — no
                        relearning what you already know.
                      </p>
                    </div>
                    <Chip tone="ion" className="shrink-0">
                      {answered}/{QUIZ_QUESTIONS.length}
                    </Chip>
                  </div>
                  <div className="mt-7 space-y-4">
                    {QUIZ_QUESTIONS.map((q, qi) => (
                      // fieldset/legend groups a question with its options for screen readers.
                      <fieldset key={q.id} className="rounded-2xl border border-line bg-base/30 p-4 sm:p-5">
                        <legend className="sr-only">{q.prompt}</legend>
                        <p aria-hidden className="flex gap-3 text-[15px] font-medium text-content">
                          <span className="pt-0.5 font-mono text-xs text-ion">{String(qi + 1).padStart(2, '0')}</span>
                          {q.prompt}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {q.options.map((opt, i) => (
                            <label key={i} className={optionClass}>
                              <input
                                type="radio"
                                name={q.id}
                                className="sr-only"
                                checked={answers[q.id] === i}
                                onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                              />
                              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong transition-colors group-has-[:checked]:border-ion">
                                <span className="h-2 w-2 scale-0 rounded-full bg-ion transition-transform group-has-[:checked]:scale-100" />
                              </span>
                              {opt}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </>
              )}

              {/* Step 2 — hours per week */}
              {step === 2 && (
                <>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">How much time each week?</h1>
                  <p className="mt-2 text-sm text-content-muted">Your roadmap is sized to fit. You can change it later.</p>
                  <div className="mt-8 flex flex-wrap items-end gap-3">
                    <span className="text-gradient-ion font-display text-7xl font-semibold leading-none tracking-tight">
                      {hoursPerWeek}
                    </span>
                    <span className="pb-2 text-lg text-content-muted">hours / week</span>
                    <Chip tone={effort.tone} className="mb-2.5 ml-auto">
                      {effort.label}
                    </Chip>
                  </div>
                  <label htmlFor="hours" className="sr-only">
                    Hours per week
                  </label>
                  <input
                    id="hours"
                    type="range"
                    min={1}
                    max={40}
                    value={hoursPerWeek}
                    onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                    className="mt-7 w-full"
                  />
                  <div className="mt-2 flex justify-between font-mono text-[11px] text-content-muted" aria-hidden>
                    <span>1h</span>
                    <span>10h</span>
                    <span>20h</span>
                    <span>40h</span>
                  </div>
                </>
              )}

              {/* Step 3 — target companies */}
              {step === 3 && (
                <>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">Which companies are you aiming for?</h1>
                  <p className="mt-2 text-sm text-content-muted">Optional — the tutor tracks your readiness for each.</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {COMPANIES.map((c) => {
                      const on = companies.includes(c.id);
                      return (
                        <label key={c.id} className={cn(optionClass, 'min-h-[60px]')}>
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCompany(c.id)} />
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 font-display text-sm font-semibold text-content">
                            {c.name.charAt(0)}
                          </span>
                          <span className="flex-1 font-medium">{c.name}</span>
                          <span
                            className={cn(
                              'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                              on ? 'border-ion bg-ion text-ink' : 'border-line-strong',
                            )}
                          >
                            {on && <Check size={13} strokeWidth={3} aria-hidden />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Step 4 — free-text goal */}
              {step === 4 && (
                <>
                  <h1 className="font-display text-3xl font-semibold tracking-tight">What’s your goal?</h1>
                  <p className="mt-2 text-sm text-content-muted">
                    Say it in your own words — the tutor maps it to a learning focus with sentence embeddings.
                  </p>
                  <label htmlFor="goal" className="mb-2 mt-7 block text-sm font-medium">
                    Your career goal
                  </label>
                  <textarea
                    id="goal"
                    rows={4}
                    className={cn(inputClass, 'min-h-[128px] py-3 leading-relaxed')}
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    placeholder="e.g. I want to crack the Infosys interview and move to a product company later"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-content-muted">Try:</span>
                    {GOAL_IDEAS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGoalText(g)}
                        className="rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-ion/30 hover:text-content"
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  {error && (
                    <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm text-danger">
                      {error}
                    </p>
                  )}
                </>
              )}
            </motion.section>
          </AnimatePresence>
        </GlassCard>

        {/* Back is always available after the first step (UI doc §9: no trapped wizards). */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || submitting}>
            <ArrowLeft size={16} aria-hidden /> Back
          </Button>
          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={() => go(step + 1)}>
              Continue <ArrowRight size={16} aria-hidden />
            </Button>
          ) : (
            <Button onClick={() => void finish()} disabled={submitting}>
              <Sparkles size={16} aria-hidden /> Build my quest
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>{submitting && <BuildingOverlay />}</AnimatePresence>
    </div>
  );
}

// Shown while the backend maps the goal, orders the skill graph and saves the plan.
function BuildingOverlay() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((n) => Math.min(n + 1, BUILD_STAGES.length - 1)), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-base/85 p-6 backdrop-blur-md"
    >
      <div className="w-full max-w-sm text-center">
        {/* Nova thinks while a tiny neural net fires beneath it. */}
        <div className="mx-auto grid h-32 w-32 place-items-center">
          <Nova mood="thinking" size={88} />
        </div>
        <p className="mt-6 font-display text-2xl font-semibold tracking-tight">Building your quest</p>
        <NeuralThinking className="mx-auto mt-4" />
        <ul className="mt-5 space-y-2 text-left text-sm">
          {BUILD_STAGES.map((s, k) => (
            <li
              key={s}
              className={cn(
                'flex items-center gap-2.5 transition-colors duration-300',
                k < stage ? 'text-success' : k === stage ? 'text-content' : 'text-content-muted',
              )}
            >
              {k < stage ? (
                <Check size={15} aria-hidden />
              ) : k === stage ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ion/30 border-t-ion" aria-hidden />
              ) : (
                <span className="mx-1 h-1.5 w-1.5 rounded-full bg-content-muted/40" aria-hidden />
              )}
              {s}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
