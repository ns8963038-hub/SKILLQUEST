/** @type {import('tailwindcss').Config} */
// The SkillQuest palette from docs/04-UIUX-DESIGN.md sec 2.
// Note the TWO violet tokens: one for text/icons on dark, one for button
// backgrounds. A single violet cannot pass WCAG AA in both directions
// (see the measured contrast table in the UI doc).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0F1117', // app background
        surface: {
          DEFAULT: '#1A1D27', // cards, panels
          2: '#242836', // raised elements, editor chrome, hover
        },
        line: '#2E3342', // "border-subtle" — dividers, card borders
        content: {
          DEFAULT: '#F2F4F8', // headings, body
          muted: '#9AA3B2', // secondary text, labels
        },
        primary: {
          fg: '#9B85FF', // violet TEXT/icons/links/rings on dark — 6.47:1 ✓
          bg: '#6A4AF0', // violet BUTTON background, with content text — 4.95:1 ✓
          'bg-hover': '#5A3AE0',
        },
        accent: '#FFC53D', // XP gold
        success: '#3DD68C',
        danger: '#F2555A',
        info: '#4CA5FF',
        risk: {
          atrisk: '#F2555A',
          watch: '#FFC53D',
          healthy: '#3DD68C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
