import { CheckCircle2, Circle, Lock, PlayCircle, type LucideIcon } from 'lucide-react';
import type { RoadmapNode, SkillStatus } from './types';

// Per-status presentation. Meaning is carried by BOTH an icon and a text label,
// never colour alone (accessibility — UI/UX doc sec 9). 'interactive' decides
// whether the card is a real button or a disabled, locked tile.
const STATUS_CONFIG: Record<
  SkillStatus,
  { icon: LucideIcon; iconClass: string; label: string; cardClass: string; interactive: boolean }
> = {
  completed: {
    icon: CheckCircle2,
    iconClass: 'text-success',
    label: 'Completed',
    cardClass: 'border-line bg-surface hover:bg-surface-2',
    interactive: true,
  },
  current: {
    icon: PlayCircle,
    iconClass: 'text-primary-fg',
    label: 'In progress',
    // Pulses to draw the eye — but stops for users who prefer reduced motion.
    cardClass: 'border-primary-fg bg-surface animate-pulse motion-reduce:animate-none',
    interactive: true,
  },
  available: {
    icon: Circle,
    iconClass: 'text-content-muted',
    label: 'Start',
    cardClass: 'border-line bg-surface hover:bg-surface-2',
    interactive: true,
  },
  locked: {
    icon: Lock,
    iconClass: 'text-content-muted',
    label: 'Locked',
    cardClass: 'border-line bg-surface opacity-60',
    interactive: false,
  },
};

// One skill tile in the roadmap. Clickable unless locked.
export function SkillNodeCard({
  node,
  onSelect,
}: {
  node: RoadmapNode;
  onSelect?: (skillId: string) => void;
}) {
  const cfg = STATUS_CONFIG[node.status];
  const Icon = cfg.icon;

  return (
    <button
      type="button"
      disabled={!cfg.interactive}
      onClick={() => onSelect?.(node.skillId)}
      // Screen readers hear the title AND its status ("Loops, Locked").
      aria-label={`${node.title} — ${cfg.label}`}
      className={
        // min-h-[44px]: comfortable touch target (UI/UX doc sec 9).
        // focus-visible ring: keyboard users can see where they are.
        `flex min-h-[44px] w-full items-center gap-3 rounded-xl border p-4 text-left ` +
        `transition-colors focus-visible:outline focus-visible:outline-2 ` +
        `focus-visible:outline-offset-2 focus-visible:outline-primary-fg ` +
        `disabled:cursor-not-allowed ${cfg.cardClass}`
      }
    >
      {/* Icon is decorative here — the label already announces the status. */}
      <Icon className={cfg.iconClass} size={20} aria-hidden />
      <span className="flex-1 font-medium">{node.title}</span>
      <span className="text-xs text-content-muted">{cfg.label}</span>
    </button>
  );
}
