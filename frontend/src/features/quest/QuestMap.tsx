import { useMemo } from 'react';
import { QuestChest } from './QuestChest';
import { QuestHero } from './QuestHero';
import type { RoadmapNode } from '../roadmap/types';

// The roadmap as an ADVENTURE MAP (Version B): a vertical trail of treasure
// chests connected by a dashed path, with the hero standing at the current
// stop. Completed skills show an open chest; locked ones are dimmed. Clicking an
// unlocked chest opens that skill's level. Same data as RoadmapView — just a
// game-flavoured presentation.
export function QuestMap({
  nodes,
  onSelectSkill,
}: {
  nodes: RoadmapNode[];
  onSelectSkill?: (skillId: string) => void;
}) {
  // Walk the plan top-to-bottom (week, then position).
  const ordered = useMemo(
    () => [...nodes].sort((a, b) => a.weekNumber - b.weekNumber || a.position - b.position),
    [nodes],
  );

  return (
    <div className="relative mx-auto max-w-md px-4 py-6">
      {/* The winding trail behind the chests. */}
      <div
        className="absolute left-1/2 top-6 bottom-6 w-0 -translate-x-1/2 border-l-2 border-dashed border-line"
        aria-hidden
      />

      <ol className="relative space-y-6">
        {ordered.map((node) => {
          const locked = node.status === 'locked';
          const completed = node.status === 'completed';
          const current = node.status === 'current';
          return (
            <li key={node.skillId} className="flex flex-col items-center">
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelectSkill?.(node.skillId)}
                aria-label={`${node.title} — ${node.status}`}
                className={`flex flex-col items-center gap-1 rounded-xl p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg ${
                  locked ? 'cursor-not-allowed opacity-45' : ''
                }`}
              >
                {/* The chest (open once completed), with the hero on the current stop. */}
                <div className="relative rounded-full bg-surface p-1">
                  <QuestChest open={completed} size={64} />
                  {current && (
                    <div className="absolute -right-7 -top-3">
                      <QuestHero size={44} />
                    </div>
                  )}
                </div>
                {/* Skill label — highlighted for the current stop. */}
                <span
                  className={`rounded-full px-3 py-1 text-sm ${
                    current ? 'bg-primary-bg font-semibold text-content' : 'bg-surface-2 text-content'
                  }`}
                >
                  {node.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
