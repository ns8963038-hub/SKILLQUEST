import { useMemo } from 'react';
import { SkillNodeCard } from './SkillNodeCard';
import type { RoadmapNode } from './types';

// Group a flat list of nodes into weeks, each week's nodes sorted by position.
// Returned newest-first-free: weeks ascending, so the plan reads top to bottom.
function groupByWeek(nodes: RoadmapNode[]): { week: number; items: RoadmapNode[] }[] {
  const byWeek = new Map<number, RoadmapNode[]>();
  for (const node of nodes) {
    const bucket = byWeek.get(node.weekNumber) ?? [];
    bucket.push(node);
    byWeek.set(node.weekNumber, bucket);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b) // weeks in order
    .map(([week, items]) => ({
      week,
      items: items.sort((a, b) => a.position - b.position), // within a week, by position
    }));
}

// The roadmap screen (S5): the plan as a vertical, week-by-week list of skills.
// A simple stepper works on both desktop and mobile (UI/UX doc sec 7.5).
export function RoadmapView({
  nodes,
  onSelectSkill,
}: {
  nodes: RoadmapNode[];
  onSelectSkill?: (skillId: string) => void;
}) {
  // Recompute the grouping only when the nodes change.
  const weeks = useMemo(() => groupByWeek(nodes), [nodes]);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold">Your Roadmap</h1>
      <ol className="space-y-8">
        {weeks.map(({ week, items }) => (
          <li key={week}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-content-muted">
              Week {week}
            </h2>
            <div className="space-y-2">
              {items.map((node) => (
                <SkillNodeCard key={node.skillId} node={node} onSelect={onSelectSkill} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
