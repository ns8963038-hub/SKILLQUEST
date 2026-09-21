// The Java + DSA skill graph (mirrors content/skills.json — a test fails if the
// two ever disagree): 20 skills and their prerequisites. The Knowledge Constellation is drawn from this, so every skill
// appears even when a student's personal plan skips it (tested out in the quiz).

export interface SkillDef {
  id: string;
  title: string;
  prereqs: string[];
}

export const SKILL_GRAPH: SkillDef[] = [
  { id: 'java-basics', title: 'Java Basics', prereqs: [] },
  { id: 'operators-expressions', title: 'Operators & Expressions', prereqs: ['java-basics'] },
  { id: 'conditionals', title: 'Conditionals', prereqs: ['operators-expressions'] },
  { id: 'loops', title: 'Loops', prereqs: ['conditionals'] },
  { id: 'methods', title: 'Methods', prereqs: ['loops'] },
  { id: 'arrays', title: 'Arrays', prereqs: ['loops', 'methods'] },
  { id: 'strings', title: 'Strings', prereqs: ['arrays'] },
  { id: 'oop-basics', title: 'OOP Basics', prereqs: ['methods', 'strings'] },
  { id: 'oop-advanced', title: 'OOP Advanced', prereqs: ['oop-basics'] },
  { id: 'exceptions', title: 'Exceptions', prereqs: ['oop-advanced'] },
  { id: 'recursion', title: 'Recursion', prereqs: ['methods', 'arrays'] },
  { id: 'time-complexity', title: 'Time Complexity', prereqs: ['loops', 'arrays'] },
  { id: 'collections', title: 'Collections', prereqs: ['oop-advanced'] },
  { id: 'searching', title: 'Searching', prereqs: ['arrays', 'time-complexity'] },
  { id: 'sorting', title: 'Sorting', prereqs: ['recursion', 'time-complexity'] },
  { id: 'linked-lists', title: 'Linked Lists', prereqs: ['oop-basics', 'recursion'] },
  { id: 'stacks-queues', title: 'Stacks & Queues', prereqs: ['linked-lists', 'collections'] },
  { id: 'hashing', title: 'Hashing', prereqs: ['collections', 'strings'] },
  { id: 'trees-basics', title: 'Trees (Basics)', prereqs: ['recursion', 'linked-lists'] },
  { id: 'interview-patterns', title: 'Interview Patterns', prereqs: ['searching', 'hashing'] },
];

// A skill placed on the canvas.
export interface PositionedSkill extends SkillDef {
  depth: number; // longest prerequisite chain leading here (0 = no prerequisites)
  x: number;
  y: number;
}

// Depth = the length of the LONGEST prerequisite chain leading to a skill. Placing
// skills in columns by depth guarantees every skill sits to the right of all the
// skills it depends on — the graph reads left-to-right like a journey.
export function computeDepths(skills: SkillDef[]): Map<string, number> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map<string, number>();

  const depth = (id: string, visiting: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // defensive: a cycle would be a content bug
    visiting.add(id);
    const skill = byId.get(id);
    const d =
      skill && skill.prereqs.length > 0
        ? 1 + Math.max(...skill.prereqs.map((p) => depth(p, visiting)))
        : 0;
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };

  skills.forEach((s) => depth(s.id, new Set()));
  return memo;
}

// Deterministic per-skill jitter (FNV-1a hash) so the layout feels organic rather
// than a rigid grid, yet is identical on every render — no Math.random.
function jitter(seed: string, amplitude: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 2 * amplitude;
}

// Lay the graph out inside a width x height box: one column per depth, skills in
// a column spread evenly top-to-bottom, then nudged by the deterministic jitter.
export function layoutGraph(
  skills: SkillDef[],
  width: number,
  height: number,
  padX = 70,
  padY = 56,
): PositionedSkill[] {
  const depths = computeDepths(skills);
  const maxDepth = Math.max(1, ...depths.values());

  // Group skills into columns by depth, preserving their order in the list.
  const columns = new Map<number, SkillDef[]>();
  for (const s of skills) {
    const d = depths.get(s.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), s]);
  }

  const placed: PositionedSkill[] = [];
  columns.forEach((column, d) => {
    // Single-skill columns ride a gentle wave so the early chain
    // (Basics -> Operators -> Conditionals -> Loops) doesn't sit on one flat line.
    const wave = column.length === 1 ? Math.sin(d * 1.25) * (height - padY * 2) * 0.2 : 0;
    column.forEach((s, i) => {
      const x = padX + (d / maxDepth) * (width - padX * 2);
      const y = padY + ((i + 1) / (column.length + 1)) * (height - padY * 2) + wave;
      placed.push({
        ...s,
        depth: d,
        x: x + jitter(`${s.id}:x`, 10),
        y: y + jitter(s.id, column.length > 1 ? 16 : 26),
      });
    });
  });
  return placed;
}

// Every skill that must come before `id` — its whole prerequisite chain, found by
// walking the prerequisite links backwards. Powers the constellation's "synapse"
// highlight: hover a skill and everything that feeds into it lights up.
export function ancestorsOf(id: string, skills: SkillDef[] = SKILL_GRAPH): Set<string> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const found = new Set<string>();
  const stack = [...(byId.get(id)?.prereqs ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(byId.get(next)?.prereqs ?? []));
  }
  return found;
}

// The skills that list `id` as a direct prerequisite — what it unlocks next.
export function dependentsOf(id: string, skills: SkillDef[] = SKILL_GRAPH): string[] {
  return skills.filter((s) => s.prereqs.includes(id)).map((s) => s.id);
}
