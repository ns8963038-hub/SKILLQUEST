import { useId } from 'react';

// Where the sparks appear when the vault opens (x, y in the 200x200 viewBox).
const SPARKS: [number, number][] = [
  [36, 56],
  [162, 46],
  [28, 142],
  [170, 148],
  [100, 12],
];

// THE VAULT — the reward you're coding toward. A faceted crystal sealed inside a
// turning orbit ring. When `open` becomes true the crystal splits along its seam,
// a golden core blazes out with light rays, and sparks pop around it.
//
// Pure inline SVG: self-contained, crisp at any size, no image assets. (The
// component keeps its original QuestChest name so existing screens need no changes.)
export function QuestChest({ open, size = 200 }: { open: boolean; size?: number }) {
  const id = useId().replace(/:/g, ''); // useId contains ':' which breaks url(#id)
  const spring = 'transform 0.85s cubic-bezier(0.34, 1.56, 0.64, 1)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={open ? 'Vault, unlocked' : 'Vault, sealed'}
      className="shrink-0 overflow-visible"
    >
      <defs>
        <radialGradient id={`${id}-core`}>
          <stop offset="0%" stopColor="#FFF8E1" />
          <stop offset="35%" stopColor="#FFC53D" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FF9F4A" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-aura`}>
          <stop offset="0%" stopColor="#7FA8FF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#7FA8FF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-tl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DCE8FF" />
          <stop offset="100%" stopColor="#5E86F0" />
        </linearGradient>
        <linearGradient id={`${id}-tr`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9DBBFF" />
          <stop offset="100%" stopColor="#3457D5" />
        </linearGradient>
        <linearGradient id={`${id}-bl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4D7CFF" />
          <stop offset="100%" stopColor="#15204A" />
        </linearGradient>
        <linearGradient id={`${id}-br`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2C4BC2" />
          <stop offset="100%" stopColor="#0B1020" />
        </linearGradient>
        <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE08A" stopOpacity="0" />
          <stop offset="100%" stopColor="#FFE08A" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Soft blue aura while sealed; fades as the gold takes over. */}
      <circle cx="100" cy="100" r="96" fill={`url(#${id}-aura)`} style={{ opacity: open ? 0.35 : 1, transition: 'opacity .6s ease' }} />

      {/* Orbit ring with a travelling satellite. */}
      <g className="origin-center animate-spin-slow">
        <circle
          cx="100"
          cy="100"
          r="84"
          fill="none"
          stroke={open ? '#FFC53D' : '#7FA8FF'}
          strokeOpacity={open ? 0.55 : 0.3}
          strokeWidth="1.2"
          strokeDasharray="2 7"
        />
        <circle cx="184" cy="100" r="3" fill={open ? '#FFC53D' : '#7FA8FF'} />
      </g>

      {/* Light rays, revealed on open. */}
      <g style={{ opacity: open ? 1 : 0, transition: 'opacity .5s ease .25s' }}>
        <g className="origin-center animate-spin-slow">
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x="98.5"
              y="6"
              width="3"
              height="64"
              rx="1.5"
              fill={`url(#${id}-ray)`}
              transform={`rotate(${i * 30} 100 100)`}
              opacity={i % 2 ? 0.45 : 0.9}
            />
          ))}
        </g>
      </g>

      {/* The golden core that blazes out between the halves. */}
      <circle
        cx="100"
        cy="97"
        r="46"
        fill={`url(#${id}-core)`}
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: open ? 'scale(1)' : 'scale(0.28)',
          opacity: open ? 1 : 0.4,
          transition: `${spring}, opacity .5s ease`,
        }}
      />

      {/* Idle float while sealed. */}
      <g className={open ? undefined : 'animate-float'}>
        {/* Top half of the crystal — lifts and tilts away. */}
        <g
          style={{
            transformBox: 'fill-box',
            transformOrigin: '50% 100%',
            transform: open ? 'translateY(-30px) rotate(-10deg)' : 'none',
            transition: spring,
          }}
        >
          <polygon points="100,30 52,84 100,98" fill={`url(#${id}-tl)`} />
          <polygon points="100,30 148,84 100,98" fill={`url(#${id}-tr)`} />
          <polyline points="52,84 100,30 148,84" fill="none" stroke="#EEF2FF" strokeOpacity=".7" strokeWidth="1.2" strokeLinejoin="round" />
          <line x1="100" y1="30" x2="100" y2="98" stroke="#EEF2FF" strokeOpacity=".35" strokeWidth="1" />
          <polygon points="100,30 76,57 100,64" fill="#FFFFFF" opacity=".2" />
        </g>

        {/* Bottom half — drops and tilts the other way. */}
        <g
          style={{
            transformBox: 'fill-box',
            transformOrigin: '50% 0%',
            transform: open ? 'translateY(22px) rotate(6deg)' : 'none',
            transition: spring,
          }}
        >
          <polygon points="52,84 100,98 100,170" fill={`url(#${id}-bl)`} />
          <polygon points="148,84 100,98 100,170" fill={`url(#${id}-br)`} />
          <polyline points="52,84 100,170 148,84" fill="none" stroke="#A9C4FF" strokeOpacity=".5" strokeWidth="1.2" strokeLinejoin="round" />
          <line x1="100" y1="98" x2="100" y2="170" stroke="#A9C4FF" strokeOpacity=".25" strokeWidth="1" />
          {/* The seal: a gold keyhole that disappears when opened. */}
          <g style={{ opacity: open ? 0 : 1, transition: 'opacity .3s ease' }}>
            <circle cx="100" cy="119" r="7" fill="#05070D" stroke="#FFC53D" strokeWidth="1.5" />
            <rect x="98.2" y="119" width="3.6" height="11" rx="1.2" fill="#FFC53D" />
          </g>
        </g>

        {/* Gold seam where the halves meet. */}
        <polyline
          points="52,84 100,98 148,84"
          fill="none"
          stroke="#FFC53D"
          strokeWidth="1.5"
          style={{ opacity: open ? 0 : 0.9, transition: 'opacity .2s ease' }}
        />
      </g>

      {/* Sparks pop in, one after another. */}
      {SPARKS.map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x} ${y - 7} Q ${x} ${y} ${x + 7} ${y} Q ${x} ${y} ${x} ${y + 7} Q ${x} ${y} ${x - 7} ${y} Q ${x} ${y} ${x} ${y - 7} Z`}
          fill="#FFE08A"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transform: open ? 'scale(1)' : 'scale(0)',
            opacity: open ? 1 : 0,
            transition: `transform .6s cubic-bezier(.34,1.56,.64,1) ${0.35 + i * 0.07}s, opacity .4s ease ${0.35 + i * 0.07}s`,
          }}
        />
      ))}
    </svg>
  );
}
