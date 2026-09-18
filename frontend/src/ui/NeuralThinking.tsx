import { cn } from '../lib/cn';

// A tiny neural network "thinking": signals stream from layer to layer and each
// neuron flashes as the wave reaches it. Shown whenever the tutor is working —
// running your tests, building your roadmap. Decorative, so aria-hidden.

const LAYERS = [3, 4, 4, 2]; // neurons per layer, input -> output
const W = 176;
const H = 92;
const PAD = 10;

// Neuron positions, laid out like a textbook network diagram: one column per
// layer, the biggest layer spanning the full height, smaller layers centred.
const SPACING = (H - PAD * 2) / (Math.max(...LAYERS) - 1);
const COLUMNS = LAYERS.map((count, layer) =>
  Array.from({ length: count }, (_, i) => ({
    x: PAD + (layer / (LAYERS.length - 1)) * (W - PAD * 2),
    y: H / 2 + (i - (count - 1) / 2) * SPACING,
  })),
);

// Fully connect each layer to the next.
const EDGES = COLUMNS.slice(0, -1).flatMap((column, layer) =>
  column.flatMap((a, ai) =>
    (COLUMNS[layer + 1] ?? []).map((b, bi) => ({ a, b, layer, jitter: (ai + bi) % 3 })),
  ),
);

export function NeuralThinking({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={cn('shrink-0', className)} aria-hidden>
      {/* Resting wiring */}
      {EDGES.map((e, i) => (
        <line key={`base-${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="#1E2742" strokeWidth={1} />
      ))}
      {/* Signals flowing forward, staggered by layer so they ripple left to right */}
      {EDGES.map((e, i) => (
        <line
          key={`flow-${i}`}
          x1={e.a.x}
          y1={e.a.y}
          x2={e.b.x}
          y2={e.b.y}
          className="nn-flow"
          style={{ animationDelay: `${e.layer * 0.22 + e.jitter * 0.09}s` }}
        />
      ))}
      {/* Neurons firing as the wave arrives */}
      {COLUMNS.flatMap((column, layer) =>
        column.map((n, i) => (
          <circle
            key={`n-${layer}-${i}`}
            cx={n.x}
            cy={n.y}
            r={3.8}
            className="nn-node"
            style={{ animationDelay: `${layer * 0.22 + i * 0.05}s` }}
          />
        )),
      )}
    </svg>
  );
}
