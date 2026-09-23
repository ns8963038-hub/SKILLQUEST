import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, Play, RotateCcw, Send, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { runProblemMessage } from '../lib/runProblems';
import { invalidate } from '../lib/useApi';
import { cn } from '../lib/cn';
import { useMediaQuery } from '../lib/useMediaQuery';
import { ProblemPanel } from '../features/play/ProblemPanel';
import { ResultsPanel } from '../features/play/ResultsPanel';
import { QuestReward } from '../features/quest/QuestReward';
import type { ExampleRunResult, HintResult, LevelView, SubmitResult } from '../features/play/types';
import { AmbientBackground } from '../ui/AmbientBackground';
import { Button, Chip, Skeleton } from '../ui/primitives';

type Tab = 'problem' | 'code' | 'results';
// The two ways to run code: the visible examples (recorded nowhere, run as often
// as you like) or a graded submission (every test, hidden ones included).
type RunMode = 'examples' | 'submit';
const TABS: Tab[] = ['problem', 'code', 'results'];

// Show the right shortcut for the student's keyboard.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Where unsaved code is kept, per level.
const storageKey = (levelId: string) => `sq-code:${levelId}`;

// Monaco colours matched to the Neural Night palette.
const EDITOR_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '66728F', fontStyle: 'italic' },
    { token: 'keyword', foreground: '7FA8FF' },
    { token: 'string', foreground: '45E0A0' },
    { token: 'number', foreground: 'FFC53D' },
    { token: 'type', foreground: 'A9C4FF' },
    { token: 'type.identifier', foreground: 'CFE0FF' },
    { token: 'annotation', foreground: 'FF9F4A' },
    { token: 'delimiter', foreground: '93A0BF' },
  ],
  colors: {
    'editor.background': '#070B16',
    'editor.foreground': '#EEF2FF',
    'editorLineNumber.foreground': '#3A4563',
    'editorLineNumber.activeForeground': '#93A0BF',
    'editor.lineHighlightBackground': '#0F1628',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#7FA8FF',
    'editor.selectionBackground': '#2A3A6A',
    'editor.inactiveSelectionBackground': '#1E2A4A',
    'editorIndentGuide.background1': '#151C30',
    'editorIndentGuide.activeBackground1': '#2A3350',
    'editorGutter.background': '#070B16',
    'editorWidget.background': '#0B1020',
    'editorBracketMatch.background': '#2A3A6A55',
    'editorBracketMatch.border': '#7FA8FF55',
    'scrollbarSlider.background': '#2A335066',
    'scrollbarSlider.hoverBackground': '#2A3350AA',
  },
};

// The play screen (S6) — a focused, full-screen "mission" view. Desktop: problem
// on the left, editor + console on the right. Phone: Problem / Code / Results tabs.
// Two buttons: "Run examples" (Ctrl/Cmd+Enter, from anywhere) checks the visible
// tests and records nothing; "Submit" runs every test and is what counts — and a
// level's FIRST submit is what the tutor learns from. There is deliberately no
// shortcut for Submit, so it is never pressed by accident. `onOpenLevel` lets the
// reward's "Next level" button move straight on to the following level.
export function PlayScreen({
  levelId,
  onBack,
  onOpenLevel,
  onOpenLesson,
}: {
  levelId: string;
  onBack: () => void;
  onOpenLevel?: (levelId: string) => void;
  onOpenLesson?: (skillId: string) => void; // replay this topic's lesson
}) {
  const [level, setLevel] = useState<LevelView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [running, setRunning] = useState<RunMode | null>(null); // which kind of run is in flight
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | ExampleRunResult | null>(null);
  const [tab, setTab] = useState<Tab>('problem');
  const [showReward, setShowReward] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const runningRef = useRef(false); // guards against double runs (button + shortcut)
  const isPhone = useMediaQuery('(max-width: 767px)'); // below Tailwind's md: the tabbed phone layout

  // Load the level, restoring any code the student left unsubmitted.
  useEffect(() => {
    api<LevelView>(`/api/levels/${levelId}`)
      .then((lv) => {
        setLevel(lv);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(storageKey(levelId));
        } catch {
          /* storage blocked — start from the starter code */
        }
        setCode(saved ?? lv.starterCode);
      })
      .catch(() => setLoadError('This level isn’t ready yet.'));
  }, [levelId]);

  // Edit the code and keep a copy locally, so a refresh or dropped connection never
  // loses work (UI doc §8).
  const updateCode = (value: string) => {
    setCode(value);
    try {
      window.localStorage.setItem(storageKey(levelId), value);
    } catch {
      /* storage blocked — the code still lives in memory */
    }
  };

  // Run the code one of two ways and show the results.
  //   examples: the visible tests only; nothing is recorded, nothing refreshes.
  //   submit:   every test; refresh XP/mastery everywhere and open the vault on
  //             a full pass.
  async function runCode(mode: RunMode) {
    if (runningRef.current || !level) return;
    runningRef.current = true;
    setRunning(mode);
    setResult(null);
    setRunError(null);
    setTab('results'); // on phones, jump to the results tab
    try {
      if (mode === 'examples') {
        const res = await api<ExampleRunResult>(`/api/levels/${levelId}/run`, {
          method: 'POST',
          body: { sourceCode: code },
        });
        setResult(res);
        return;
      }
      const res = await api<SubmitResult>(`/api/levels/${levelId}/submit`, {
        method: 'POST',
        body: { sourceCode: code },
      });
      setResult(res);
      invalidate('/api/'); // XP, streak, mastery and roadmap may all have changed
      const update = res.mastery;
      if (update) setLevel((l) => (l ? { ...l, mastery: update.after } : l));
      if (res.total > 0 && res.passed === res.total) setShowReward(true);
    } catch (err) {
      setRunError(runProblemMessage(err));
    } finally {
      runningRef.current = false;
      setRunning(null);
    }
  }

  // Unlock the next hint on the server (it costs XP), then show it.
  async function revealHint() {
    if (revealing) return;
    setRevealing(true);
    setHintError(null);
    try {
      const res = await api<HintResult>(`/api/levels/${levelId}/hint`, { method: 'POST' });
      setLevel((l) => (l ? { ...l, hints: [...l.hints, res.hint], hintCount: res.hintCount } : l));
      invalidate('/api/'); // XP changed (top bar, dashboard, leaderboard)
    } catch {
      setHintError('Could not unlock the hint. Check your connection and try again.');
    } finally {
      setRevealing(false);
    }
  }

  // The keyboard shortcut (Run examples) always calls the latest runCode.
  const runRef = useRef(() => runCode('examples'));
  runRef.current = () => runCode('examples');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void runRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!level) {
    return (
      <div className="relative grid h-[100dvh] place-items-center p-6">
        <AmbientBackground intensity={0.5} />
        {loadError ? (
          <div className="text-center">
            <p role="alert" className="font-display text-2xl font-semibold">
              {loadError}
            </p>
            <Button variant="ghost" className="mt-6" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden /> Back to map
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" role="status">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-ion/20 border-t-ion" aria-hidden />
            <p className="text-sm text-content-muted">Loading level…</p>
          </div>
        )}
      </div>
    );
  }

  // The last graded submission, if the console is showing one (an examples run
  // has no XP, badges, mastery or next level).
  const graded = result && !('mode' in result) ? result : null;
  // Where "Next level" goes after a pass (never back to this same level).
  const nextLevelId = graded?.nextLevelId && graded.nextLevelId !== levelId ? graded.nextLevelId : null;

  const difficulty = Math.max(1, Math.min(3, level.difficulty));
  const difficultyLabel = difficulty === 1 ? 'Easy' : difficulty === 2 ? 'Medium' : 'Hard';

  // The two run buttons. On a wide screen they sit at the right of the mission
  // bar; on a phone they move to a bar at the bottom — within thumb reach, and
  // leaving the narrow mission bar room for the level's title.
  const runButtons = (
    <>
      {/* Run examples: the visible tests, as often as you like, recorded nowhere. */}
      <Button
        variant="ghost"
        onClick={() => void runCode('examples')}
        disabled={running !== null}
        title="Run the visible examples — nothing is recorded"
        aria-keyshortcuts={IS_MAC ? 'Meta+Enter' : 'Control+Enter'}
        className={isPhone ? 'flex-1' : undefined}
      >
        {running === 'examples' ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-content/30 border-t-content" aria-hidden />
        ) : (
          <Play size={15} aria-hidden className="fill-current" />
        )}
        Run examples
        {/* The shortcut is announced by aria-keyshortcuts, so keep it out of the name. */}
        <kbd aria-hidden className="ml-1 hidden rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] lg:inline">
          {IS_MAC ? '⌘↵' : 'Ctrl ↵'}
        </kbd>
      </Button>

      {/* Submit: every test, hidden ones too. This is what counts. */}
      <Button
        onClick={() => void runCode('submit')}
        disabled={running !== null}
        title="Run every test, hidden ones too. Your first submit on a level is what the tutor learns from."
        className={isPhone ? 'flex-1' : 'min-w-[112px]'}
      >
        {running === 'submit' ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" aria-hidden />
        ) : (
          <Send size={15} aria-hidden />
        )}
        Submit
      </Button>
    </>
  );

  return (
    <div className="relative flex h-[100dvh] flex-col">
      <AmbientBackground intensity={0.55} />

      {/* ---- Mission bar ---- */}
      <header aria-hidden={showReward || undefined} className="relative z-20 flex items-center gap-3 border-b border-white/[0.05] bg-base/60 px-3 py-2.5 backdrop-blur-xl sm:px-5">
        <Button variant="subtle" size="sm" onClick={onBack} aria-label="Back to map">
          <ArrowLeft size={16} aria-hidden />
          <span className="hidden sm:inline">Map</span>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {level.skillTitle && (
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ion sm:inline">
                {level.skillTitle}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5" title={`Difficulty: ${difficultyLabel}`}>
              <span className="flex gap-0.5" aria-hidden>
                {[1, 2, 3].map((i) => (
                  <span key={i} className={cn('h-1.5 w-3 rounded-full', i <= difficulty ? 'bg-ember' : 'bg-surface-3')} />
                ))}
              </span>
              <span className="font-mono text-[11px] text-content-muted">{difficultyLabel}</span>
            </span>
          </div>
          <p className="truncate font-display text-[15px] font-semibold tracking-tight sm:text-[16px]">{level.title}</p>
        </div>

        {level.lessonAvailable && onOpenLesson && (
          <Button variant="subtle" size="sm" onClick={() => onOpenLesson(level.skillId)} title="Replay this topic’s lesson">
            <BookOpen size={15} aria-hidden />
            <span className="hidden md:inline">Lesson</span>
          </Button>
        )}

        <Chip tone="gold" className="hidden sm:inline-flex">
          <Zap size={12} aria-hidden />
          {level.xpReward} XP
        </Chip>

        {!isPhone && runButtons}
      </header>

      {/* ---- Phone tabs ---- */}
      <div
        aria-hidden={showReward || undefined}
        role="tablist"
        aria-label="Play panels"
        className="relative z-10 flex border-b border-white/[0.05] bg-base/40 md:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('relative min-h-[46px] flex-1 text-sm capitalize', tab === t ? 'text-content' : 'text-content-muted')}
          >
            {t}
            {tab === t && (
              <motion.span layoutId="play-tab" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-ion" />
            )}
          </button>
        ))}
      </div>

      {/* ---- Workspace ---- */}
      <div aria-hidden={showReward || undefined} className="relative z-10 min-h-0 flex-1 md:grid md:grid-cols-[minmax(340px,0.9fr)_1.1fr]">
        <section
          aria-label="Problem"
          className={cn(
            tab === 'problem' ? 'block' : 'hidden',
            'h-full overflow-y-auto p-4 sm:p-6 md:block md:border-r md:border-white/[0.05]',
          )}
        >
          <ProblemPanel
            level={level}
            onRevealHint={() => void revealHint()}
            revealing={revealing}
            hintError={hintError}
          />
        </section>

        <div className={cn(tab === 'problem' ? 'hidden' : 'flex', 'h-full min-h-0 flex-col gap-3 p-3 sm:p-4 md:flex')}>
          {/* Editor window */}
          <section
            aria-label="Code editor"
            className={cn(tab === 'code' ? 'flex' : 'hidden', 'min-h-[320px] flex-1 flex-col md:flex')}
          >
            <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
              <div className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                </span>
                <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs text-content">
                  Main.java
                </span>
                <span className="ml-auto font-mono text-[11px] text-content-muted">Java</span>
                <button
                  type="button"
                  onClick={() => updateCode(level.starterCode)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-3 hover:text-content"
                  aria-label="Reset to starter code"
                  title="Reset to starter code"
                >
                  <RotateCcw size={14} aria-hidden />
                </button>
              </div>
              {/* Absolute fill gives Monaco a definite height to lay out in. */}
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0">
                  <Editor
                    height="100%"
                    defaultLanguage="java"
                    theme="skillquest-night"
                    value={code}
                    onChange={(v) => updateCode(v ?? '')}
                    beforeMount={(monaco) => monaco.editor.defineTheme('skillquest-night', EDITOR_THEME)}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void runRef.current());
                    }}
                    loading={<Skeleton className="m-4 h-40" />}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
                      fontLigatures: true,
                      lineHeight: 22,
                      padding: { top: 16, bottom: 16 },
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      cursorBlinking: 'smooth',
                      cursorSmoothCaretAnimation: 'on',
                      renderLineHighlight: 'all',
                      bracketPairColorization: { enabled: true },
                      automaticLayout: true,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Console */}
          <section
            aria-label="Test results"
            className={cn(
              tab === 'results' ? 'block' : 'hidden',
              'overflow-y-auto md:block md:max-h-[42%] md:shrink-0',
            )}
          >
            <ResultsPanel result={result} running={running} error={runError} />
          </section>
        </div>
      </div>

      {/* ---- Phone action bar ---- */}
      {isPhone && (
        <div
          aria-hidden={showReward || undefined}
          className="relative z-20 flex gap-3 border-t border-white/[0.05] bg-base/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
        >
          {runButtons}
        </div>
      )}

      {/* The vault opens when every test passes. */}
      <AnimatePresence>
        {showReward && graded && (
          <QuestReward
            xp={graded.xpAwarded}
            badges={graded.newBadges ?? []}
            mastery={graded.mastery}
            onContinue={() => setShowReward(false)}
            onBackToMap={onBack}
            onNextLevel={nextLevelId && onOpenLevel ? () => onOpenLevel(nextLevelId) : undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
