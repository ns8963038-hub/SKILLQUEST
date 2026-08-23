// A treasure chest drawn in inline SVG (no external art, so it's self-contained
// and theme-safe). The lid rotates open when `open` is true; when open, a golden
// glow and coins appear inside. This is the visual payoff of a quest: solve the
// coding problem, the chest opens.
export function QuestChest({ open, size = 200 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 200 180"
      role="img"
      aria-label={open ? 'Treasure chest, open' : 'Treasure chest, locked'}
    >
      {/* Soft glow behind the chest once it's open. */}
      {open && (
        <ellipse cx="100" cy="120" rx="80" ry="30" fill="#FFC53D" opacity="0.35">
          <animate attributeName="opacity" values="0;0.35;0.2" dur="0.9s" fill="freeze" />
        </ellipse>
      )}

      {/* Coins/treasure inside — revealed as the lid lifts. */}
      {open && (
        <g>
          <circle cx="80" cy="108" r="10" fill="#FFC53D" stroke="#C9962A" strokeWidth="2" />
          <circle cx="100" cy="102" r="11" fill="#FFD65C" stroke="#C9962A" strokeWidth="2" />
          <circle cx="120" cy="108" r="10" fill="#FFC53D" stroke="#C9962A" strokeWidth="2" />
          <circle cx="92" cy="116" r="8" fill="#FFD65C" stroke="#C9962A" strokeWidth="2" />
          <circle cx="112" cy="116" r="8" fill="#FFC53D" stroke="#C9962A" strokeWidth="2" />
        </g>
      )}

      {/* Chest base (the box that holds the treasure). */}
      <g>
        <rect x="40" y="95" width="120" height="60" rx="8" fill="#6B4A2B" stroke="#4A3218" strokeWidth="3" />
        {/* Metal bands */}
        <rect x="55" y="95" width="10" height="60" fill="#8A6a3f" />
        <rect x="135" y="95" width="10" height="60" fill="#8A6a3f" />
        {/* Gold trim along the top edge of the base */}
        <rect x="40" y="118" width="120" height="6" fill="#FFC53D" opacity="0.9" />
      </g>

      {/* Lid — a rounded top that rotates open around its bottom-back edge.
          transformBox and transformOrigin make the pivot the lid's lower edge. */}
      <g
        style={{
          transformBox: 'fill-box',
          transformOrigin: '50% 100%',
          transform: open ? 'rotate(-135deg)' : 'rotate(0deg)',
          transition: 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Lid body: a rounded-top arch sitting on the base. */}
        <path
          d="M40 100 L40 78 Q40 55 100 55 Q160 55 160 78 L160 100 Z"
          fill="#7A5430"
          stroke="#4A3218"
          strokeWidth="3"
        />
        {/* Gold band across the lid */}
        <path d="M40 92 L160 92" stroke="#FFC53D" strokeWidth="5" opacity="0.9" />
        {/* Lock plate on the front of the lid */}
        <rect x="90" y="86" width="20" height="22" rx="3" fill="#FFC53D" stroke="#C9962A" strokeWidth="2" />
        <circle cx="100" cy="95" r="3.5" fill="#4A3218" />
      </g>
    </svg>
  );
}
