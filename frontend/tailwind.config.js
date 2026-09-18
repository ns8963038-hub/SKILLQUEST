/** @type {import('tailwindcss').Config} */
// SkillQuest "Neural Night" design system (see docs/04-UIUX-DESIGN.md).
//
// The legacy token names (surface, content, primary, accent, success, danger,
// info, line) are KEPT and re-pointed at the new palette, so every screen picks
// up the new look automatically. Every text pairing below was measured for WCAG
// AA before shipping — e.g. muted text is 6.75:1 on the lightest surface, ion is
// 7.53:1, and ink on the ion button is 8.43:1.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#05070D', // the deepest ground (deep space)
        ink: '#060A14', // text placed ON light fills such as the primary button
        surface: {
          DEFAULT: '#0B1020', // panels
          2: '#121829', // raised elements
          3: '#182038', // hover / pressed
        },
        line: {
          DEFAULT: '#1E2742', // hairline borders
          strong: '#2A3350', // stronger dividers, input borders
        },
        content: {
          DEFAULT: '#EEF2FF', // "starlight" — headings and body (15.8:1)
          muted: '#93A0BF', // secondary text (6.75:1)
          faint: '#66728F', // large text / decoration only (3.68:1)
        },
        // Ion blue — the one signature accent: "the AI is doing something here".
        ion: {
          DEFAULT: '#7FA8FF',
          soft: '#A9C4FF',
          glow: '#4D7CFF', // decorative glows only, never text
          deep: '#3457D5',
          tint: '#151E3A', // chip backgrounds
        },
        // Legacy aliases, re-pointed (starlight text on primary-bg = 5.41:1).
        primary: { fg: '#7FA8FF', bg: '#3457D5', 'bg-hover': '#2C4BC2' },
        accent: { DEFAULT: '#FFC53D', tint: '#2A2214' }, // solar gold = "you earned this"
        ember: { DEFAULT: '#FF9F4A', tint: '#2A1B14' }, // "learning in progress"
        success: { DEFAULT: '#45E0A0', tint: '#0F2A27' }, // mint = passed / mastered
        danger: { DEFAULT: '#FF7A93', tint: '#2A1623' }, // rose = failed (softened, never harsh)
        info: '#7FA8FF',
        aurora: { teal: '#2DD4BF', violet: '#8B7CFF' }, // background atmosphere only
        risk: { atrisk: '#FF7A93', watch: '#FFC53D', healthy: '#45E0A0' },
      },
      fontFamily: {
        // Display: characterful grotesque for headlines, used with restraint.
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Body: precise, technical, highly legible.
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Code, data and labels.
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 30px 80px -40px rgba(0,0,0,0.9)',
        'glow-ion': '0 0 0 1px rgba(127,168,255,0.35), 0 10px 40px -10px rgba(77,124,255,0.65)',
        'glow-gold': '0 0 0 1px rgba(255,197,61,0.45), 0 10px 40px -8px rgba(255,197,61,0.55)',
        'glow-mint': '0 0 0 1px rgba(69,224,160,0.35), 0 10px 40px -10px rgba(69,224,160,0.5)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'pulse-dot': {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.8)' },
        },
        scan: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        'spin-slow': 'spin-slow 24s linear infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        scan: 'scan 1.4s ease-in-out infinite',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)', // confident deceleration
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // playful overshoot
      },
    },
  },
  plugins: [],
};
