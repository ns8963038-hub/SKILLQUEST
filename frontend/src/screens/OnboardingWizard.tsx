import { useState } from 'react';
import { api } from '../lib/api';
import { QUIZ_QUESTIONS } from '../features/onboarding/quizQuestions';
import { scoreQuiz, skillLevelFromScore } from '../features/onboarding/scoring';

// The five service companies students most often target. These slugs match the
// (yet-to-be-seeded) companies table; until then the backend simply ignores any
// that don't exist, so selecting them is harmless.
const COMPANIES = [
  { id: 'infosys', name: 'Infosys' },
  { id: 'tcs', name: 'TCS' },
  { id: 'wipro', name: 'Wipro' },
  { id: 'accenture', name: 'Accenture' },
  { id: 'cognizant', name: 'Cognizant' },
];

const TOTAL_STEPS = 5;

// The onboarding wizard. Collects profile info + a placement quiz + hours + goal,
// then makes ONE call to the Web API which maps the goal, builds the roadmap, and
// saves everything. On success it calls onComplete() so the app re-checks the
// profile and shows the roadmap.
export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState(3);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [hoursPerWeek, setHoursPerWeek] = useState(5);
  const [companies, setCompanies] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onComplete(); // parent re-fetches the profile -> roadmap screen
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish onboarding.');
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full min-h-[44px] rounded-lg border border-line bg-surface-2 px-3 py-2 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg';

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      {/* Progress indicator. */}
      <p className="mb-2 text-sm text-content-muted">
        Step {step + 1} of {TOTAL_STEPS}
      </p>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-primary-fg transition-all"
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* Step 0 — about you */}
      {step === 0 && (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">About you</h1>
          <div>
            <label htmlFor="branch" className="mb-1 block text-sm">
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
          <div>
            <label htmlFor="year" className="mb-1 block text-sm">
              Year of study
            </label>
            <select
              id="year"
              className={inputClass}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* Step 1 — placement quiz */}
      {step === 1 && (
        <section className="space-y-6">
          <h1 className="text-xl font-bold">Quick placement quiz</h1>
          <p className="text-sm text-content-muted">
            Answer these so we can skip what you already know. Get all questions in a topic right to
            test out of it.
          </p>
          {QUIZ_QUESTIONS.map((q) => (
            // fieldset/legend groups a question with its options for screen readers.
            <fieldset key={q.id} className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-medium">{q.prompt}</legend>
              <div className="mt-2 space-y-2">
                {q.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === i}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      )}

      {/* Step 2 — hours per week */}
      {step === 2 && (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">How much time each week?</h1>
          <label htmlFor="hours" className="mb-1 block text-sm">
            Hours per week: <span className="font-semibold text-content">{hoursPerWeek}</span>
          </label>
          <input
            id="hours"
            type="range"
            min={1}
            max={40}
            value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(Number(e.target.value))}
            className="w-full"
          />
        </section>
      )}

      {/* Step 3 — target companies */}
      {step === 3 && (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">Which companies are you aiming for?</h1>
          <p className="text-sm text-content-muted">Optional — pick any that apply.</p>
          <div className="space-y-2">
            {COMPANIES.map((c) => (
              <label
                key={c.id}
                className="flex min-h-[44px] items-center gap-3 rounded-lg border border-line px-3"
              >
                <input
                  type="checkbox"
                  checked={companies.includes(c.id)}
                  onChange={() => toggleCompany(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Step 4 — free-text goal */}
      {step === 4 && (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">What's your goal?</h1>
          <label htmlFor="goal" className="mb-1 block text-sm">
            Describe your career goal in your own words
          </label>
          <textarea
            id="goal"
            className={`${inputClass} min-h-[120px]`}
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="e.g. I want to crack the Infosys interview and move to a product company later"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </section>
      )}

      {/* Navigation: Back is always available after the first step. */}
      <div className="mt-8 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="min-h-[44px] rounded-lg border border-line px-4 py-2 disabled:opacity-40"
        >
          Back
        </button>
        {step < TOTAL_STEPS - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="min-h-[44px] rounded-lg bg-primary-bg px-5 py-2 font-medium text-content hover:bg-primary-bg-hover"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={submitting}
            className="min-h-[44px] rounded-lg bg-primary-bg px-5 py-2 font-medium text-content hover:bg-primary-bg-hover disabled:opacity-60"
          >
            {submitting ? 'Building your quest…' : 'Finish'}
          </button>
        )}
      </div>
    </main>
  );
}
