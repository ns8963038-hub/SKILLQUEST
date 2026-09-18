import { useId } from 'react';

// The SkillQuest mark: a tiny constellation — three linked stars around a glowing
// core, inside a slowly turning orbit. Decorative, so it's hidden from screen
// readers (the wordmark next to it carries the name).
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-core`}>
          <stop offset="0" stopColor="#EEF2FF" />
          <stop offset=".5" stopColor="#7FA8FF" stopOpacity=".75" />
          <stop offset="1" stopColor="#4D7CFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-link`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A9C4FF" />
          <stop offset="1" stopColor="#45E0A0" />
        </linearGradient>
      </defs>
      {/* Orbit */}
      <circle
        cx="20"
        cy="20"
        r="18.5"
        fill="none"
        stroke="#7FA8FF"
        strokeOpacity=".35"
        strokeWidth="1"
        strokeDasharray="1.5 3.5"
        className="origin-center animate-spin-slow"
      />
      {/* Links between the stars */}
      <path d="M9 26 L20 11 L31 24 Z" fill="none" stroke={`url(#${id}-link)`} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M20 11 L20 20 M9 26 L20 20 L31 24" stroke="#7FA8FF" strokeOpacity=".4" strokeWidth="1" />
      {/* Core + stars */}
      <circle cx="20" cy="20" r="8" fill={`url(#${id}-core)`} />
      <circle cx="20" cy="20" r="2.6" fill="#EEF2FF" />
      <circle cx="20" cy="11" r="2" fill="#CFE0FF" />
      <circle cx="9" cy="26" r="1.8" fill="#A9C4FF" />
      <circle cx="31" cy="24" r="2.1" fill="#45E0A0" />
    </svg>
  );
}
