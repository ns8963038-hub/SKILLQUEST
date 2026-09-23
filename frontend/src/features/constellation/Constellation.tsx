import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn';
import type { RoadmapNode, SkillStatus } from '../roadmap/types';
import { SKILL_GRAPH, ancestorsOf, computeDepths, dependentsOf, layoutGraph, type PositionedSkill } from './skillGraph';
import { MASTERY_THRESHOLD } from '../tutor/bkt';

// =============================================================================
// THE KNOWLEDGE CONSTELLATION
// The adaptive tutor's model of the student, drawn as a star map. Every skill is a
// star; prerequisite links are the lines between them. A star's glow and its
// mastery ring show how confident the tutor is that the skill is mastered — so the
// roadmap literally looks like the AI's picture of what you know.
//
// Hover (or focus) a star and its SYNAPSES fire: the whole prerequisite chain that
// feeds into it lights up with knowledge flowing in, and the rest of the map dims.
// =============================================================================

type StarKind = 'done' | 'frontier' | 'open' | 'locked';
type StarStatus = SkillStatus | 'tested-out' | 'optional';

interface Star extends PositionedSkill {
  kind: StarKind;
  status: StarStatus;
  mastery: number; // 0..1, used for drawing
  masteryKnown: boolean; // true only when the API sent a real BKT estimate
}

const STATUS_TEXT: Record<StarStatus, string> = {
  completed: 'Completed — every level passed',
  current: 'Your frontier — learning now',
  available: 'Unlocked',
  locked: 'Locked — finish its prerequisites first',
  'tested-out': 'Tested out in the placement quiz',
  optional: 'Not in your plan — optional for your goal',
};

// Drawing-only fallback when the API hasn't sent a mastery estimate. It shapes the
// rings but is NEVER shown to the student as a percentage.
const VISUAL_FALLBACK: Record<SkillStatus, number> = {
  completed: 1,
  current: 0.4,
  available: 0.15,
  locked: 0,
};

const W = 1000; // viewBox width

// On-screen width comes from the number of prerequisite columns: a deeper course
// scrolls a little further sideways instead of squeezing its stars together
// (the course-order edges in M10 took it from 9 columns to 12). The aspect
// ratio is fixed, so a wider map is also taller and its columns spread out too.
const COLUMNS = Math.max(...computeDepths(SKILL_GRAPH).values()) + 1;
const MIN_WIDTH_PX = { compact: Math.max(640, COLUMNS * 64), full: Math.max(880, COLUMNS * 84) };

// Merge the static skill graph with the student's plan. A graph skill missing
// from the plan was either tested out in the quiz (drawn as known) or dropped
// because the student's goal doesn't need it (drawn dim, labelled optional).
// `testedOut` is the list the API sends; without it (the sign-in preview), every
// missing skill is taken to be tested out.
export function buildStars(nodes: RoadmapNode[], height: number, testedOut?: string[]): Star[] {
  const plan = new Map(nodes.map((n) => [n.skillId, n]));
  const known = testedOut ? new Set(testedOut) : null;
  return layoutGraph(SKILL_GRAPH, W, height).map((s): Star => {
    const node = plan.get(s.id);
    if (!node && known && !known.has(s.id)) return { ...s, kind: 'locked', status: 'optional', mastery: 0, masteryKnown: false };
    if (!node) return { ...s, kind: 'done', status: 'tested-out', mastery: 1, masteryKnown: false };
    const kind: StarKind =
      node.status === 'completed'
        ? 'done'
        : node.status === 'current'
          ? 'frontier'
          : node.status === 'available'
            ? 'open'
            : 'locked';
    return {
      ...s,
      kind,
      status: node.status,
      mastery: typeof node.mastery === 'number' ? node.mastery : VISUAL_FALLBACK[node.status],
      masteryKnown: typeof node.mastery === 'number',
    };
  });
}

// Can the student open this skill from the map?
function isPlayable(s: Star): boolean {
  return s.kind === 'frontier' || s.kind === 'open' || (s.kind === 'done' && s.status !== 'tested-out');
}

// Should the tutor's percentage be shown for this star? Only for a real estimate,
// and never for a locked skill (a "0%" there is noise, not information).
function showsMastery(s: Star): boolean {
  return s.masteryKnown && s.kind !== 'locked';
}

// A star's dot and ring radius, by kind (also used to place its label).
const starRadius = (s: Star) => (s.kind === 'frontier' ? 8 : s.kind === 'done' ? 6.2 : s.kind === 'open' ? 5.2 : 3.4);

// Where each label goes: above or below its star, as the distance from the star
// to the label's baseline (negative = above). Labels are wider than the gap
// between columns, so a simple "alternate by column" rule still let neighbours
// run into each other ("Operators & ExpressionsConditionals"). Instead, place
// them greedily, most important first (frontier, done, open, locked): each takes
// its preferred side (alternating by column) unless that overlaps a label
// already placed or another star, then the other side, then one step further out
// on either side, else whichever overlaps least. Sizes are estimated from the
// text length — the map is SVG, so the estimate is in the same units as the stars.
const KIND_ORDER: Record<StarKind, number> = { frontier: 0, done: 1, open: 2, locked: 3 };

type Box = { x0: number; x1: number; y0: number; y1: number };

// The baseline offsets to try for a star's label, nearest first.
function labelOffsets(s: Star, fontPx: number): { above: number[]; below: number[] } {
  const ringR = starRadius(s) + 7;
  const step = fontPx + 4; // one line further out
  return { above: [-(ringR + 11), -(ringR + 11 + step)], below: [ringR + 21, ringR + 21 + step] };
}

// The space a star's label takes up with its baseline `dy` from the star.
export function labelBox(s: Star, dy: number, fontPx: number): Box {
  const baseline = s.y + dy;
  const half = (s.title.length * fontPx * 0.56) / 2 + 3;
  return { x0: s.x - half, x1: s.x + half, y0: baseline - fontPx, y1: baseline + fontPx * 0.25 };
}

export function placeLabels(stars: Star[], fontPx: number): Map<string, number> {
  const boxOf = (s: Star, dy: number) => labelBox(s, dy, fontPx);
  const overlap = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const dots: Box[] = stars.map((s) => {
    const r = starRadius(s) + 3;
    return { x0: s.x - r, x1: s.x + r, y0: s.y - r, y1: s.y + r };
  });

  const placed: Box[] = [];
  const offsets = new Map<string, number>();
  const order = [...stars].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.x - b.x);
  for (const s of order) {
    const { above, below } = labelOffsets(s, fontPx);
    const [near, other] = s.depth % 2 === 1 ? [above, below] : [below, above];
    // Preferred side, other side, then one line further out on each.
    const candidates = [near[0]!, other[0]!, near[1]!, other[1]!];
    const cost = (dy: number) => {
      const box = boxOf(s, dy);
      return [...placed, ...dots].reduce((sum, o) => sum + overlap(box, o), 0);
    };
    const free = candidates.find((dy) => cost(dy) === 0);
    const choice = free ?? candidates.reduce((best, dy) => (cost(dy) < cost(best) ? dy : best));
    offsets.set(s.id, choice);
    placed.push(boxOf(s, choice));
  }
  return offsets;
}

// Place the tooltip below stars in the upper part of the map and above the rest,
// with extra clearance on whichever side the star's own label sits.
function tooltipPosition(s: Star, height: number, labelAbove: boolean): CSSProperties {
  const below = s.y < height * 0.42;
  const clearance = below !== labelAbove ? 58 : 30;
  return {
    left: `${(s.x / W) * 100}%`,
    top: `${(s.y / height) * 100}%`,
    transform: below ? `translate(-50%, ${clearance}px)` : `translate(-50%, calc(-100% - ${clearance}px))`,
  };
}

export function Constellation({
  nodes,
  testedOut,
  compact = false,
  fit = false,
  onSelectSkill,
  className,
}: {
  nodes: RoadmapNode[];
  testedOut?: string[]; // skills the placement quiz showed they know (from GET /api/roadmap)
  compact?: boolean; // dashboard preview: shorter, fewer labels
  fit?: boolean; // scale down to the box instead of scrolling (the sign-in screen's decorative preview)
  onSelectSkill?: (skillId: string) => void;
  className?: string;
}) {
  const H = compact ? 380 : 540;
  const uid = useId().replace(/:/g, ''); // useId contains ':' which breaks url(#id)
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);

  const stars = useMemo(() => buildStars(nodes, H, testedOut), [nodes, H, testedOut]);
  const labelDy = useMemo(() => placeLabels(stars, compact ? 15 : 13), [stars, compact]);
  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);

  // One smooth S-curve per prerequisite link. Links between mastered skills are
  // "lit"; links from a mastered skill into what you're learning carry "flow".
  const edges = useMemo(
    () =>
      stars.flatMap((to) =>
        to.prereqs.flatMap((fromId) => {
          const from = byId.get(fromId);
          if (!from) return [];
          const dx = to.x - from.x;
          return [
            {
              key: `${fromId}->${to.id}`,
              from: fromId,
              to: to.id,
              d: `M ${from.x} ${from.y} C ${from.x + dx * 0.5} ${from.y}, ${to.x - dx * 0.5} ${to.y}, ${to.x} ${to.y}`,
              lit: from.kind === 'done' && to.kind === 'done',
              flow: from.kind === 'done' && (to.kind === 'frontier' || to.kind === 'open'),
              depth: to.depth,
            },
          ];
        }),
      ),
    [stars, byId],
  );

  // The synapse focus: the hovered skill, everything that feeds into it, and what
  // it unlocks next.
  const focus = useMemo(() => {
    if (!active) return null;
    const chain = ancestorsOf(active);
    chain.add(active);
    return { chain, next: new Set(dependentsOf(active)) };
  }, [active]);

  // Is this link part of the lit synapse? (inside the chain, or leading onward)
  const isHot = (e: { from: string; to: string }) =>
    focus !== null && ((focus.chain.has(e.from) && focus.chain.has(e.to)) || e.from === active);

  // On a phone the map is wider than the screen and scrolls sideways. Start it
  // with the student's current topic in the middle (it used to open at the left
  // edge, with the frontier off-screen), and fade whichever edge has more map
  // beyond it, so it's clear there is more to see.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  const frontier = stars.find((s) => s.kind === 'frontier');
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && frontier && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = (frontier.x / W) * el.scrollWidth - el.clientWidth / 2; // the browser clamps it
    }
    updateEdges();
    // Only when the frontier changes — never fighting the student's own scrolling.
  }, [frontier?.id]);

  const activeStar = active ? (byId.get(active) ?? null) : null;
  const unlocks = activeStar
    ? dependentsOf(activeStar.id)
        .map((id) => byId.get(id)?.title)
        .filter((t): t is string => Boolean(t))
    : [];

  return (
    <div className={cn('relative w-full', className)}>
      <div ref={scrollerRef} onScroll={updateEdges} className="w-full overflow-x-auto overflow-y-hidden">
        <div
          className="relative"
          style={{ aspectRatio: `${W} / ${H}`, minWidth: fit ? undefined : compact ? MIN_WIDTH_PX.compact : MIN_WIDTH_PX.full }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            role="group"
            aria-label="Knowledge constellation: your skills and how they connect"
          >
            <defs>
              <radialGradient id={`${uid}-halo`}>
                <stop offset="0%" stopColor="#7FA8FF" stopOpacity="0.55" />
                <stop offset="45%" stopColor="#4D7CFF" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#4D7CFF" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${uid}-halo-mint`}>
                <stop offset="0%" stopColor="#45E0A0" stopOpacity="0.42" />
                <stop offset="50%" stopColor="#45E0A0" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#45E0A0" stopOpacity="0" />
              </radialGradient>
              {/* userSpaceOnUse: a horizontal link has a zero-height bounding box,
                  which would make a bounding-box gradient render nothing. */}
              <linearGradient id={`${uid}-lit`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
                <stop offset="0%" stopColor="#45E0A0" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#7FA8FF" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id={`${uid}-flow`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
                <stop offset="0%" stopColor="#7FA8FF" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#CFE0FF" stopOpacity="0.95" />
              </linearGradient>
            </defs>

            {/* ---- Links: drawn in, left to right (dimmed while a synapse is lit) ---- */}
            <g
              fill="none"
              strokeLinecap="round"
              style={{ opacity: focus ? 0.3 : 1, transition: 'opacity 0.3s ease' }}
            >
              {edges.map((e) => (
                <motion.path
                  key={e.key}
                  d={e.d}
                  stroke={e.lit ? `url(#${uid}-lit)` : e.flow ? `url(#${uid}-flow)` : '#1E2742'}
                  strokeWidth={e.lit ? 1.6 : e.flow ? 1.9 : 1.1}
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.15 + e.depth * 0.07, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </g>

            {/* ---- Knowledge pulses travelling into what you're learning ---- */}
            {!reduce && (
              <g style={{ opacity: focus ? 0.25 : 1, transition: 'opacity 0.3s ease' }}>
                {edges
                  .filter((e) => e.flow)
                  .map((e, i) => (
                    <g key={`pulse-${e.key}`}>
                      <path id={`${uid}-path-${i}`} d={e.d} fill="none" stroke="none" />
                      {[0, 1].map((k) => (
                        <circle key={k} r={k === 0 ? 2.8 : 1.7} fill={k === 0 ? '#EEF2FF' : '#A9C4FF'} opacity="0">
                          <animateMotion dur="2.6s" repeatCount="indefinite" begin={`${1.5 + i * 0.45 + k * 1.3}s`}>
                            <mpath href={`#${uid}-path-${i}`} />
                          </animateMotion>
                          <animate
                            attributeName="opacity"
                            values="0;1;1;0"
                            keyTimes="0;0.15;0.85;1"
                            dur="2.6s"
                            repeatCount="indefinite"
                            begin={`${1.5 + i * 0.45 + k * 1.3}s`}
                          />
                        </circle>
                      ))}
                    </g>
                  ))}
              </g>
            )}

            {/* ---- Synapse: the lit chain, with knowledge flowing toward the hovered skill ---- */}
            {focus && (
              <g
                fill="none"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 4px rgba(127,168,255,0.85))' }}
              >
                {edges.filter(isHot).map((e) => (
                  <path
                    key={`hot-${e.key}`}
                    d={e.d}
                    stroke={e.from === active ? '#A9C4FF' : '#CFE0FF'}
                    strokeWidth={2}
                    strokeOpacity={e.from === active ? 0.7 : 1}
                    className="synapse-flow"
                  />
                ))}
              </g>
            )}

            {/* ---- Stars ---- */}
            {stars.map((s) => {
              const playable = Boolean(onSelectSkill) && isPlayable(s);
              const r = starRadius(s);
              const ringR = r + 7;
              const circumference = 2 * Math.PI * ringR;
              const isActive = active === s.id;
              const inFocus = !focus || focus.chain.has(s.id) || focus.next.has(s.id);
              const showLabel =
                !compact || s.kind === 'frontier' || s.kind === 'open' || isActive || (focus?.chain.has(s.id) ?? false);
              const dy = labelDy.get(s.id) ?? -(ringR + 11); // baseline offset from the star
              const pct = Math.round(s.mastery * 100);
              const label = `${s.title} — ${STATUS_TEXT[s.status]}${showsMastery(s) ? `, ${pct}% mastery` : ''}`;
              const select = () => {
                if (playable) onSelectSkill?.(s.id);
              };

              return (
                <g key={s.id} style={{ opacity: inFocus ? 1 : 0.28, transition: 'opacity 0.3s ease' }}>
                  <motion.g
                    initial={reduce ? false : { opacity: 0, scale: 0.3 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + s.depth * 0.08, type: 'spring', stiffness: 240, damping: 18 }}
                    role={playable ? 'button' : 'img'}
                    tabIndex={playable ? 0 : -1}
                    aria-label={label}
                    className={cn('outline-none', playable && 'cursor-pointer')}
                    onMouseEnter={() => setActive(s.id)}
                    onMouseLeave={() => setActive((a) => (a === s.id ? null : a))}
                    onFocus={() => setActive(s.id)}
                    onBlur={() => setActive((a) => (a === s.id ? null : a))}
                    onClick={select}
                    onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                      }
                    }}
                  >
                    {/* Generous invisible hit area (44px-ish target) */}
                    <circle cx={s.x} cy={s.y} r={24} fill="transparent" />

                    {/* Halo — brighter the more the tutor believes you know it */}
                    {s.kind !== 'locked' && (
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={r * (s.kind === 'frontier' ? 6.5 : 4.6)}
                        fill={`url(#${uid}-${s.kind === 'done' ? 'halo-mint' : 'halo'})`}
                        opacity={s.kind === 'open' ? 0.55 : s.kind === 'done' ? 0.7 : 1}
                      />
                    )}

                    {/* Frontier: sonar pulses radiating outward */}
                    {s.kind === 'frontier' &&
                      !reduce &&
                      [0, 1].map((k) => (
                        <motion.circle
                          key={k}
                          cx={s.x}
                          cy={s.y}
                          fill="none"
                          stroke="#7FA8FF"
                          strokeWidth={1.2}
                          initial={{ r: r + 4, opacity: 0.7 }}
                          animate={{ r: r + 32, opacity: 0 }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 + k * 1.2 }}
                        />
                      ))}

                    {/* Mastery ring (track + arc) */}
                    {s.kind !== 'locked' && s.status !== 'tested-out' && (
                      <g transform={`rotate(-90 ${s.x} ${s.y})`}>
                        <circle cx={s.x} cy={s.y} r={ringR} fill="none" stroke="#1E2742" strokeWidth={2} />
                        <motion.circle
                          cx={s.x}
                          cy={s.y}
                          r={ringR}
                          fill="none"
                          stroke={s.kind === 'done' ? '#45E0A0' : '#7FA8FF'}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          initial={reduce ? false : { strokeDashoffset: circumference }}
                          animate={{ strokeDashoffset: circumference * (1 - s.mastery) }}
                          transition={{ duration: 1.2, delay: 0.6 + s.depth * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </g>
                    )}

                    {/* Tested out: a dotted ring, known without practice */}
                    {s.status === 'tested-out' && (
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={ringR}
                        fill="none"
                        stroke="#45E0A0"
                        strokeOpacity={0.5}
                        strokeWidth={1.2}
                        strokeDasharray="2 4"
                      />
                    )}

                    {/* Core */}
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={r}
                      fill={s.kind === 'open' ? '#A9C4FF' : s.kind === 'locked' ? '#2A3350' : '#EEF2FF'}
                      stroke={s.kind === 'frontier' ? '#7FA8FF' : 'none'}
                      strokeWidth={s.kind === 'frontier' ? 2.5 : 0}
                    />
                    {s.kind === 'locked' && (
                      <circle cx={s.x} cy={s.y} r={r + 3.5} fill="none" stroke="#2A3350" strokeWidth={1} />
                    )}

                    {/* Keyboard / hover focus ring */}
                    {isActive && playable && (
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={ringR + 7}
                        fill="none"
                        stroke="#7FA8FF"
                        strokeOpacity={0.7}
                        strokeWidth={1.2}
                        strokeDasharray="3 3"
                      />
                    )}

                    {showLabel && (
                      <text
                        x={s.x}
                        y={s.y + dy}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fill={
                          s.kind === 'frontier'
                            ? '#EEF2FF'
                            : s.kind === 'done'
                              ? '#CFE0FF'
                              : s.kind === 'open'
                                ? '#93A0BF'
                                : '#66728F'
                        }
                        style={{
                          font: `${s.kind === 'frontier' ? 600 : 500} ${compact ? 15 : 13}px "Geist Variable", system-ui, sans-serif`,
                        }}
                      >
                        {s.title}
                      </text>
                    )}
                  </motion.g>
                </g>
              );
            })}
          </svg>

          {/* ---- Tooltip: a solid panel, kept clear of the star's own label ---- */}
          <AnimatePresence>
            {activeStar && (
              <div
                key={activeStar.id}
                className="pointer-events-none absolute z-10"
                style={tooltipPosition(activeStar, H, (labelDy.get(activeStar.id) ?? -1) < 0)}
              >
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="w-max max-w-[250px] rounded-xl border border-line-strong bg-surface-2/95 px-3.5 py-2.5 shadow-panel backdrop-blur-xl"
                >
                  <p className="text-[13px] font-medium text-content">{activeStar.title}</p>
                  <p className="mt-0.5 text-xs text-content-muted">{STATUS_TEXT[activeStar.status]}</p>
                  {showsMastery(activeStar) && (
                    <div className="mt-2">
                      <div className="flex justify-between gap-4 text-[11px] text-content-muted">
                        <span>Tutor&apos;s mastery estimate</span>
                        <span className="font-mono text-content">{Math.round(activeStar.mastery * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1 w-44 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-ion to-success"
                          style={{ width: `${Math.round(activeStar.mastery * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {activeStar.status === 'completed' &&
                    showsMastery(activeStar) &&
                    activeStar.mastery < MASTERY_THRESHOLD && (
                      // Practising a finished topic again can't move the estimate (only a
                      // level's first submit counts), so say how it was judged instead.
                      <p className="mt-1.5 text-[11px] text-content-muted">
                        The tutor judged this topic from your first submits and lesson answers.
                      </p>
                    )}
                  {unlocks.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-content-muted">
                      Unlocks: <span className="text-content">{unlocks.join(', ')}</span>
                    </p>
                  )}
                  {onSelectSkill && isPlayable(activeStar) && (
                    <p className="mt-1.5 text-[11px] font-medium text-ion">Click to practise →</p>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* "There's more this way" fades, on the edges with map beyond them. */}
      {more.left && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-base/80 to-transparent" />
      )}
      {more.right && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-base/80 to-transparent" />
      )}
    </div>
  );
}

// The key for reading the map. Shape and label carry the meaning, not colour alone.
export function ConstellationLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-content-muted', className)}>
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-content shadow-[0_0_10px_2px_rgba(69,224,160,0.55)]" />
        Completed
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border-2 border-ion bg-content shadow-[0_0_12px_3px_rgba(127,168,255,0.65)]" />
        Frontier
      </li>
      <li className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-ion-soft" />
        Unlocked
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border border-dashed border-success/60" />
        Tested out
      </li>
      <li className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong ring-1 ring-line-strong ring-offset-2 ring-offset-surface" />
        Locked
      </li>
    </ul>
  );
}
