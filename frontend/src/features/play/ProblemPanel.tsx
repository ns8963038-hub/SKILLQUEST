import ReactMarkdown from 'react-markdown';
import type { LevelView } from './types';

// The left/Problem panel: the problem statement (markdown) plus the visible
// example test cases. Read-only — it's what the student is solving.
export function ProblemPanel({ level }: { level: LevelView }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{level.title}</h1>
        <p className="text-xs text-content-muted">
          Difficulty {level.difficulty} · {level.xpReward} XP
        </p>
      </div>

      {/* Markdown statement. leading-relaxed keeps dense problem text readable. */}
      <div className="space-y-2 text-sm leading-relaxed [&_code]:font-mono [&_code]:text-primary-fg [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3">
        <ReactMarkdown>{level.statementMd}</ReactMarkdown>
      </div>

      {level.sampleTests.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-content-muted">Examples</h2>
          <div className="space-y-2">
            {level.sampleTests.map((t, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs">
                <div>
                  <span className="text-content-muted">Input: </span>
                  {t.stdin.trim() || '(none)'}
                </div>
                <div>
                  <span className="text-content-muted">Output: </span>
                  {t.expectedOutput}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
