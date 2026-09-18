import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';

type RingTone = 'ion' | 'gold' | 'mint';

// Gradient stops and glow colour per tone.
const TONES: Record<RingTone, { from: string; to: string; glow: string }> = {
  ion: { from: '#A9C4FF', to: '#4D7CFF', glow: 'rgba(77,124,255,0.55)' },
  gold: { from: '#FFE08A', to: '#FFB020', glow: 'rgba(255,197,61,0.5)' },
  mint: { from: '#9BF5CD', to: '#2FBF86', glow: 'rgba(69,224,160,0.5)' },
};

// A circular progress ring that sweeps to `value` (0..1) with a soft glow. Used
// for level progress, placement coverage and skill mastery. Whatever is passed as
// children sits in the centre.
export function MasteryRing({
  value,
  size = 120,
  stroke = 8,
  tone = 'ion',
  delay = 0.15,
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: RingTone;
  delay?: number;
  className?: string;
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, ''); // useId contains ':' which breaks url(#id)
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const t = TONES[tone];

  return (
    <div className={cn('relative grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.from} />
            <stop offset="100%" stopColor={t.to} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1E2742" strokeWidth={stroke} />
        {/* Progress arc — sweeps in from empty */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay }}
          style={{ filter: `drop-shadow(0 0 ${Math.max(3, stroke * 0.8)}px ${t.glow})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
