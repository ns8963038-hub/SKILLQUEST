// A little adventurer drawn in inline SVG — the student's avatar on the quest
// map. Stands at the "current" node so the journey has a hero. No external art.
export function QuestHero({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 40 46"
      role="img"
      aria-label="Your hero"
    >
      {/* legs */}
      <rect x="14" y="34" width="5" height="10" rx="2" fill="#3A2E22" />
      <rect x="21" y="34" width="5" height="10" rx="2" fill="#3A2E22" />
      {/* tunic */}
      <rect x="10" y="21" width="20" height="17" rx="6" fill="#3DD68C" stroke="#2AA96A" strokeWidth="1.5" />
      {/* belt */}
      <rect x="10" y="31" width="20" height="3" fill="#8A6A3F" />
      {/* head */}
      <circle cx="20" cy="14" r="8" fill="#F1C27D" stroke="#C99A5B" strokeWidth="1" />
      {/* eyes */}
      <circle cx="17" cy="14" r="1.2" fill="#3A2E22" />
      <circle cx="23" cy="14" r="1.2" fill="#3A2E22" />
      {/* adventurer's hat */}
      <path d="M9 11 Q20 -3 31 11 Z" fill="#7C5CFC" />
      <ellipse cx="20" cy="11" rx="12" ry="2.5" fill="#6A4AF0" />
    </svg>
  );
}
