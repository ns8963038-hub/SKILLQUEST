import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpen, FastForward, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { cn } from '../lib/cn';
import { AmbientBackground } from '../ui/AmbientBackground';
import { Nova } from '../ui/Nova';
import { MasteryRing } from '../ui/MasteryRing';
import { Button, Chip } from '../ui/primitives';
import { QuestChest } from '../features/quest/QuestChest';
import { CodeView } from '../features/learn/CodeView';
import { TracePlayer } from '../features/learn/TracePlayer';
import { PredictStep } from '../features/learn/PredictStep';
import { FillStep } from '../features/learn/FillStep';
import type { AnswerResult, ExplainStep, HookStep, LessonStep, LessonView } from '../features/learn/types';
import { loadProblemMessage } from '../lib/loadProblems';

// LEARN MODE (PRD F8) — the ~5-minute lesson that opens every topic, following
// PRIMM: Predict → Run (watch it) → Investigate (key ideas) → Modify (try it) →
// Make (the topic's first level). Design: docs/notes/M7-learn-mode.md.

// The label each step shows in the progress bar.
function stepLabel(step: LessonStep | undefined, steps: LessonStep[]): string {
  if (!step) return 'Prove it';
  if (step.type === 'hook') return 'Intro';
  if (step.type === 'trace') return 'Watch it run';
  if (step.type === 'explain') return 'Understand';
  if (step.type === 'fill') return 'Try it';
  if (step.type === 'concept') return 'Concept';
  // The first prediction is "Predict"; later ones check understanding.
  return steps.filter((s) => s.type === 'predict')[0]?.id === step.id ? 'Predict' : 'Check';
}

export function LessonScreen({
  skillId,
  onBack,
  onStartLevel,
}: {
  skillId: string;
  onBack: () => void;
  onStartLevel: (levelId: string) => void;
}) {
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0); // steps.length = the final "Prove it" screen
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [firstTries, setFirstTries] = useState<Record<string, boolean>>({});
  const [masteryStart, setMasteryStart] = useState<number | null>(null);
  const [masteryNow, setMasteryNow] = useState<number | null>(null);
  const completedRef = useRef(false);

  // Load the lesson and record that it was opened.
  useEffect(() => {
    api<LessonView>(`/api/lessons/${skillId}`)
      .then((l) => {
        setLesson(l);
        setMasteryStart(l.mastery);
        setMasteryNow(l.mastery);
        void api(`/api/lessons/${skillId}/start`, { method: 'POST' }).catch(() => undefined);
      })
      .catch((err) => setLoadError(loadProblemMessage(err, 'lesson')));
  }, [skillId]);

  const steps = lesson?.steps ?? [];
  const step: LessonStep | undefined = steps[index];
  const atEnd = lesson !== null && index >= steps.length;

  // Reaching the end marks the lesson complete (once) and refreshes the map.
  useEffect(() => {
    if (!atEnd || completedRef.current) return;
    completedRef.current = true;
    void api(`/api/lessons/${skillId}/complete`, { method: 'POST' })
      .then(() => invalidate('/api/'))
      .catch(() => undefined);
  }, [atEnd, skillId]);

  // Move between steps, back to the top of the page each time.
  const goTo = useCallback((n: number) => {
    setIndex(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Straight to the challenge: logged, then open the level.
  async function skip() {
    try {
      const r = await api<{ levelId: string | null }>(`/api/lessons/${skillId}/skip`, { method: 'POST' });
      invalidate('/api/');
      if (r.levelId) onStartLevel(r.levelId);
      else onBack();
    } catch {
      if (lesson?.nextLevel) onStartLevel(lesson.nextLevel.id);
      else onBack();
    }
  }

  // Answers the tutor counted: remember first tries and follow the mastery estimate.
  const onEvidence = useCallback((stepId: string, r: AnswerResult) => {
    if (r.firstTry) setFirstTries((f) => ({ ...f, [stepId]: r.correct }));
    if (r.mastery) setMasteryNow(r.mastery.after);
  }, []);

  if (!lesson) {
    return (
      <div className="relative grid h-[100dvh] place-items-center p-6">
        <AmbientBackground intensity={0.5} />
        {loadError ? (
          <div className="text-center">
            <p role="alert" className="font-display text-2xl font-semibold">
              {loadError}
            </p>
            <Button variant="ghost" className="mt-6" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden /> Back
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" role="status">
            <Nova mood="thinking" size={64} />
            <p className="text-sm text-content-muted">Preparing your lesson…</p>
          </div>
        )}
      </div>
    );
  }

  // A step blocks "Continue" only while it's a question not yet answered.
  const needsAnswer = step && (step.type === 'predict' || step.type === 'concept' || step.type === 'fill') && !solved[step.id];
  const alreadyKnows = (lesson.mastery ?? 0) >= 0.6 && lesson.status !== 'completed';
  const total = steps.length + 1;

  return (
    <div className="relative min-h-[100dvh]">
      <AmbientBackground intensity={0.55} />

      {/* ---- Top bar: where you are, and the way out ---- */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-base/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-6">
          <Button variant="subtle" size="sm" onClick={onBack} aria-label="Leave the lesson">
            <ArrowLeft size={16} aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ion">
              <BookOpen size={12} aria-hidden /> Lesson · {lesson.skillTitle} · {lesson.minutes} min
            </p>
            <p className="truncate font-display text-[15px] font-semibold tracking-tight">{lesson.title}</p>
          </div>
          {!atEnd && (
            <button type="button" onClick={() => void skip()} className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-3 hover:text-content sm:flex">
              <FastForward size={13} aria-hidden /> Skip to the challenge
            </button>
          )}
        </div>
        {/* Progress: one segment per step, the current one glowing. */}
        <ol className="mx-auto flex max-w-6xl gap-1.5 px-3 pb-2.5 sm:px-6" aria-label={`Step ${Math.min(index + 1, total)} of ${total}`}>
          {Array.from({ length: total }, (_, k) => (
            <li key={k} className="flex-1">
              <span className="sr-only">{stepLabel(steps[k], steps)}</span>
              <span aria-hidden className={cn('block h-1 rounded-full transition-colors duration-500', k < index ? 'bg-ion' : k === index ? 'bg-ion shadow-[0_0_10px_rgba(127,168,255,0.9)]' : 'bg-surface-3')} />
              <span aria-hidden className={cn('mt-1.5 hidden text-[10px] lg:block', k === index ? 'text-ion' : 'text-content-faint')}>
                {stepLabel(steps[k], steps)}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <main id="main" className="relative mx-auto max-w-6xl px-3 pb-32 pt-6 sm:px-6 sm:pt-10">
        <AnimatePresence mode="wait">
          <motion.section
            key={index}
            initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -24, filter: 'blur(6px)' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            aria-label={stepLabel(step, steps)}
          >
            {step?.type === 'hook' && <Hook step={step} alreadyKnows={alreadyKnows} mastery={lesson.mastery} onSkip={() => void skip()} />}
            {(step?.type === 'predict' || step?.type === 'concept') && (
              <PredictStep
                key={step.id}
                skillId={skillId}
                step={step}
                onSolved={() => setSolved((s) => ({ ...s, [step.id]: true }))}
                onEvidence={(r) => onEvidence(step.id, r)}
              />
            )}
            {step?.type === 'trace' && (
              <div>
                <StepTitle eyebrow="Watch it run" title={step.title ?? 'Watch it run'} sub="Press play, or step line by line. Gold means a value just changed." />
                <TracePlayer step={step} />
              </div>
            )}
            {step?.type === 'explain' && <Explain step={step} />}
            {step?.type === 'fill' && <FillStep key={step.id} skillId={skillId} step={step} onSolved={() => setSolved((s) => ({ ...s, [step.id]: true }))} />}
            {atEnd && (
              <Prove
                lesson={lesson}
                firstTries={firstTries}
                masteryStart={masteryStart}
                masteryNow={masteryNow}
                onStart={() => (lesson.nextLevel ? onStartLevel(lesson.nextLevel.id) : onBack())}
                onBack={onBack}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* ---- Bottom bar: back / continue ---- */}
      {!atEnd && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.05] bg-base/80 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
            <Button variant="ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ArrowLeft size={16} aria-hidden /> Back
            </Button>
            <button type="button" onClick={() => void skip()} className="text-xs text-content-muted transition-colors hover:text-content sm:hidden">
              Skip lesson
            </button>
            <Button onClick={() => goTo(index + 1)} disabled={Boolean(needsAnswer)} className="min-w-[140px]">
              {needsAnswer ? 'Answer to continue' : index === steps.length - 1 ? 'Finish' : 'Continue'}
              {!needsAnswer && <ArrowRight size={16} aria-hidden />}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ---- The simple steps ---------------------------------------------------------------

function StepTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <p className="eyebrow text-ion">{eyebrow}</p>
      <h1 tabIndex={-1} className="mt-2 font-display text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
        {title}
      </h1>
      {sub && <p className="mt-2 text-sm text-content-muted">{sub}</p>}
    </div>
  );
}

// INTRO: why this topic matters, in one short scene.
function Hook({ step, alreadyKnows, mastery, onSkip }: { step: HookStep; alreadyKnows: boolean; mastery: number | null; onSkip: () => void }) {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-[auto_1fr]">
      <div className="flex justify-center">
        <Nova mood="talking" size={148} />
      </div>
      <div>
        <p className="eyebrow text-ion">Before the challenge</p>
        <h1 tabIndex={-1} className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight outline-none sm:text-5xl">
          {step.title}
        </h1>
        <div className="md-prose mt-5 text-[16px] leading-relaxed text-content-muted">
          <ReactMarkdown>{step.body}</ReactMarkdown>
        </div>
        {alreadyKnows && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-ion/25 bg-ion-tint/60 px-4 py-3">
            <p className="flex-1 text-sm text-content">
              The tutor thinks you already know this ({Math.round((mastery ?? 0) * 100)}%). A quick recap, or straight to the challenge?
            </p>
            <Button size="sm" variant="ghost" onClick={onSkip}>
              <FastForward size={14} aria-hidden /> Skip to the challenge
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// UNDERSTAND (PRIMM's Investigate): the few ideas that explain what they just saw.
function Explain({ step }: { step: ExplainStep }) {
  return (
    <div className="mx-auto max-w-4xl">
      <StepTitle eyebrow="Understand" title={step.title} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ul className="space-y-3">
          {step.points.map((p, k) => (
            <motion.li
              key={k}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * k }}
              className="glass flex gap-3 rounded-2xl px-4 py-3.5"
            >
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ion shadow-[0_0_8px_rgba(127,168,255,0.9)]" />
              <div className="md-prose text-[15px] leading-relaxed text-content">
                <ReactMarkdown>{p}</ReactMarkdown>
              </div>
            </motion.li>
          ))}
        </ul>
        {step.pattern && (
          <div>
            <p className="eyebrow mb-2">The pattern to remember</p>
            <CodeView code={step.pattern} />
          </div>
        )}
      </div>
    </div>
  );
}

// PROVE IT (PRIMM's Make): the lesson hands over to the topic's first level.
function Prove({
  lesson,
  firstTries,
  masteryStart,
  masteryNow,
  onStart,
  onBack,
}: {
  lesson: LessonView;
  firstTries: Record<string, boolean>;
  masteryStart: number | null;
  masteryNow: number | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const asked = Object.keys(firstTries).length;
  const right = Object.values(firstTries).filter(Boolean).length;
  const level = lesson.nextLevel;
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="flex justify-center">
        <QuestChest open={false} size={150} />
      </div>
      <p className="eyebrow mt-3 text-accent">Lesson complete</p>
      <h1 tabIndex={-1} className="mt-2 font-display text-4xl font-semibold tracking-tight outline-none">
        Now prove it
      </h1>
      <p className="mt-3 text-content-muted">
        You’ve read it, watched it run and written part of it. The vault opens when you write the whole thing.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {asked > 0 && (
          <Chip tone={right === asked ? 'mint' : 'ion'}>
            {right} of {asked} predicted right first time
          </Chip>
        )}
        {masteryNow !== null && (
          <span className="inline-flex items-center gap-2 rounded-full border border-ion/20 bg-ion-tint px-3 py-1 text-xs text-ion">
            <MasteryRing value={masteryNow} size={22} stroke={3} tone="ion" />
            Tutor’s estimate: {Math.round((masteryStart ?? 0.2) * 100)}% → {Math.round(masteryNow * 100)}%
          </span>
        )}
      </div>

      {level ? (
        <div className="glass edge mt-8 rounded-3xl p-5 text-left">
          <p className="eyebrow">Your first challenge</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="font-display text-xl font-semibold tracking-tight">{level.title}</p>
            <Chip tone="gold">
              <Zap size={12} aria-hidden /> {level.xpReward} XP
            </Chip>
          </div>
          <Button variant="gold" size="lg" className="mt-5 w-full" onClick={onStart}>
            Start the challenge <ArrowRight size={17} aria-hidden />
          </Button>
        </div>
      ) : (
        <Button className="mt-8" onClick={onBack}>
          Back to the map
        </Button>
      )}
    </div>
  );
}
