import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { api } from '../lib/api';
import { ProblemPanel } from '../features/play/ProblemPanel';
import { ResultsPanel } from '../features/play/ResultsPanel';
import { QuestChest } from '../features/quest/QuestChest';
import { QuestReward } from '../features/quest/QuestReward';
import type { LevelView, SubmitResult } from '../features/play/types';

type Tab = 'problem' | 'code' | 'results';

// The play screen (S6): problem on the left, Monaco editor + results on the
// right (desktop); a Problem/Code/Results tab switcher on mobile, because a
// split view is unusable on a phone.
export function PlayScreen({ levelId, onBack }: { levelId: string; onBack: () => void }) {
  const [level, setLevel] = useState<LevelView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [tab, setTab] = useState<Tab>('problem');
  // When the code passes, we show the treasure-unlocked overlay.
  const [showReward, setShowReward] = useState(false);

  // Load the level, then seed the editor with its starter code.
  useEffect(() => {
    api<LevelView>(`/api/levels/${levelId}`)
      .then((lv) => {
        setLevel(lv);
        setCode(lv.starterCode);
      })
      .catch(() => setLoadError('This level isn’t ready yet.'));
  }, [levelId]);

  // Submit the current code and show the results.
  async function runTests() {
    setRunning(true);
    setResult(null);
    setTab('results'); // on mobile, jump to the results tab
    try {
      const res = await api<SubmitResult>(`/api/levels/${levelId}/submit`, {
        method: 'POST',
        body: { sourceCode: code },
      });
      setResult(res);
      // All tests passed -> the chest opens.
      if (res.total > 0 && res.passed === res.total) setShowReward(true);
    } catch {
      setResult(null);
      setLoadError('Could not run your code. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  if (loadError && !level) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="mb-4 text-sm text-primary-fg">
          ← Back
        </button>
        <p role="alert" className="text-danger">
          {loadError}
        </p>
      </div>
    );
  }
  if (!level) return <div className="p-8 text-content-muted">Loading level…</div>;

  // Helper: on mobile show a panel only when its tab is active; on desktop the
  // layout is a split so panels are always visible.
  const show = (t: Tab) => (tab === t ? 'block' : 'hidden');

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <button onClick={onBack} className="min-h-[44px] text-sm text-primary-fg">
          ← Back
        </button>
        <button
          type="button"
          onClick={runTests}
          disabled={running}
          className="min-h-[44px] rounded-lg bg-primary-bg px-5 py-2 font-medium text-content hover:bg-primary-bg-hover disabled:opacity-60"
        >
          {running ? 'Running…' : 'Run Tests'}
        </button>
      </header>

      {/* Mobile tab switcher (hidden on desktop where everything is visible). */}
      <div className="flex border-b border-line md:hidden" role="tablist">
        {(['problem', 'code', 'results'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-[44px] flex-1 text-sm capitalize ${
              tab === t ? 'border-b-2 border-primary-fg text-content' : 'text-content-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content: split on desktop, one tab at a time on mobile. */}
      <div className="flex-1 md:grid md:grid-cols-2">
        {/* Problem */}
        <section className={`${show('problem')} overflow-auto p-4 md:block md:border-r md:border-line`}>
          {/* Quest framing: the locked chest the student is trying to open. */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <QuestChest open={false} size={72} />
            <div className="text-sm">
              <p className="font-semibold">Locked Treasure</p>
              <p className="text-content-muted">Solve the puzzle to open the chest.</p>
            </div>
          </div>
          <ProblemPanel level={level} />
        </section>

        {/* Code + results */}
        <div className="md:flex md:flex-col">
          <section className={`${show('code')} md:block`}>
            <Editor
              height="55vh"
              defaultLanguage="java"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
            />
          </section>
          <section className={`${show('results')} p-4 md:block`}>
            <ResultsPanel result={result} running={running} />
          </section>
        </div>
      </div>

      {/* The treasure-unlocked celebration, shown when all tests pass. */}
      {showReward && (
        <QuestReward
          xp={result?.xpAwarded ?? 0}
          badges={result?.newBadges ?? []}
          onContinue={() => setShowReward(false)}
        />
      )}
    </div>
  );
}
