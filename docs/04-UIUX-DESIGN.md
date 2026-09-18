# SkillQuest — UI/UX Design

| | |
|---|---|
| **Version** | 2.0 — "Neural Night" redesign: new measured palette, self-hosted display/body/mono fonts, glass + motion system, Knowledge Constellation, demo mode. (1.1: two-token violet palette, target sizes, form errors, focus management, live regions) |
| **Depends on** | [03-APP-FLOW.md](03-APP-FLOW.md) (screens & journeys) |
| **Purpose** | The design system + screen layouts the frontend is built from. Tailwind-first, so every token here maps to a class. |

---

## 1. Design Principles

1. **Game-feel, not childish.** The users are 20–22 year olds anxious about jobs. Playful energy (XP bursts, streak flames, badges) but a clean, credible product — think Duolingo's motivation with LeetCode's seriousness. Never cartoonish.
2. **The next action is always obvious.** Every screen has exactly one primary CTA. A stressed student should never wonder "what do I do now?"
3. **Progress is always visible.** XP, streak, and placement score are persistent — the student should feel momentum on every screen.
4. **Reward effort, soften failure.** Passing tests = celebration. Failing tests = helpful, never punishing (see App Flow §5, §6). Colors and copy follow this.
5. **Fast, then rich.** Free-tier hosting + Indian mobile networks: no hero videos, a capped canvas background, reduced motion respected everywhere. Motion is used deliberately to make the AI legible (see §4) — never at the cost of perceived speed.
6. **Make the AI visible.** The tutor’s model of the student (mastery estimates, the briefing, the constellation) is shown, not hidden — that is what separates SkillQuest from a problem bank or a streak app.

## 2. Color System — "Neural Night" (v2)

Dark-first and deliberately single-theme: a deep-space ground, glass panels lit from the top edge, **one** signature accent (ion blue = "the AI is doing something here"), and solar gold reserved for rewards. Tokens live in `frontend/tailwind.config.js`; the v1 token names are kept and re-pointed, so every screen inherits the palette.

| Token | Hex | Use |
|---|---|---|
| `base` | `#05070D` | App ground (deep space) |
| `surface` / `surface-2` / `surface-3` | `#0B1020` / `#121829` / `#182038` | Panels, raised elements, hover |
| `line` / `line-strong` | `#1E2742` / `#2A3350` | Hairlines, input borders |
| `content` | `#EEF2FF` | Headings, body ("starlight") |
| `content-muted` | `#93A0BF` | Secondary text |
| `content-faint` | `#66728F` | Large text / decoration only |
| `ion` (= `primary-fg`) | `#7FA8FF` | The accent: links, icons, focus ring, AI signals |
| `ink` | `#060A14` | Text on light fills (the primary button) |
| `accent` (solar gold) | `#FFC53D` | XP, badges, streak — "you earned this" |
| `ember` | `#FF9F4A` | Difficulty, learning in progress |
| `success` (mint) | `#45E0A0` | Passed tests, mastered skills |
| `danger` (rose) | `#FF7A93` | Failed tests (softened, never harsh) |

**Measured contrast (WCAG AA).** Worst case is the lightest surface, `#121829`:

| Pairing | Ratio | Verdict |
|---|---|---|
| `content` on surface | 15.80:1 | ✅ |
| `content-muted` on surface | 6.75:1 | ✅ |
| `ion` on surface | 7.53:1 | ✅ |
| `success` / `danger` / `accent` on surface | 10.45 / 7.12 / 11.20:1 | ✅ |
| `ink` on the ion button | 8.43:1 | ✅ |
| `content` on legacy `primary-bg` `#3457D5` | 5.41:1 | ✅ |
| `content-faint` on surface | 3.68:1 | large text / decoration only |
| ~~white on `#4D7CFF`~~ | 3.72:1 | ❌ rejected — why the primary button is ink-on-ion |

**Naming gotcha.** Because a colour is named `base`, Tailwind's `text-base` sets *both* the font size and a near-black colour. Never use `text-base`; write `text-[16px]`.

**Usage discipline:** ion = "you can act / the AI is working", gold = "you earned this", mint = "you succeeded", rose = "something failed" — and only that. Measure every new pairing before it ships.

## 3. Typography

Self-hosted variable fonts via `@fontsource-variable/*` — bundled with the app, so CSP-safe and offline-resilient:

- **Display:** Bricolage Grotesque — headlines only, used with restraint.
- **Body / UI:** Geist.
- **Code, data, labels:** JetBrains Mono (also Monaco's editor font). Small uppercase mono "eyebrow" labels introduce each section.
- Headings use `text-wrap: balance`; numbers that line up use tabular figures.

## 4. Spacing, Radius, Elevation, Motion

- **Spacing:** 4px grid via the Tailwind scale; page gutters `px-4` / `sm:px-8`; sibling groups use `gap`, not margins.
- **Radius:** `rounded-xl` controls, `rounded-2xl` inner panels, `rounded-3xl` glass cards.
- **Elevation:** `.glass` panels (translucent gradient, 1px ion-tinted border, top-edge highlight, deep soft shadow); `.edge` adds a light-catching gradient border to hero panels. Glows (`shadow-glow-*`) only on interactive or reward elements.
- **Texture:** a 4% film-grain overlay, plus a canvas "neural field" background (aurora light and drifting linked points) rendered at 60% resolution, ~30fps, paused when the tab is hidden, and drawn as one still frame under reduced motion.
- **Motion** (`motion/react`): entrances rise and un-blur in a staggered cascade; buttons spring on press and sweep light on hover; nav pills glide between items; rings sweep and numbers count up; the reward is choreographed (seal breaks → confetti → XP → tutor update → badges). `MotionConfig reducedMotion="user"` plus a global CSS rule honour `prefers-reduced-motion` everywhere.

*Revision note:* v1 said "no heavy animation libraries". v2 adds Motion (tree-shaken) because orchestrated motion is now part of how the product makes its AI legible; the budget is protected by capping the canvas and keeping Monaco on its CDN loader.

## 5. Core Components (build these once, reuse everywhere)

| Component | Notes |
|---|---|
| `Button` | Variants: primary (`primary-bg` + `text-primary`), secondary (surface-2 + border), ghost, danger. Sizes sm/md/lg, all ≥ 44×44 px hit area. Loading state = spinner + disabled + `aria-busy`. |
| `Card` | `bg-surface`, `rounded-xl`, `border-subtle`, `p-6`. The workhorse. |
| `XPBadge` | Gold pill with ⚡ icon + number; animates on increase (count-up). |
| `StreakFlame` | 🔥 + day count; three states (lit / amber-pulse / grey) per App Flow §6. |
| `ProgressRing` | Circular %; used for placement score and node completion. |
| `SkillNode` | Roadmap tree node: states = locked (grey, 🔒), current (violet, pulsing), completed (green, ✓). |
| `TestResultRow` | Green ✓ / red ✗ + test name; expandable for input/expected/actual (visible tests only). |
| `BadgePopup` | Center-screen modal, badge art + name + "Nice!" dismiss; confetti (canvas-confetti, lightweight). |
| `NudgeCard` | Warm-toned dashboard card for at-risk intervention (App Flow §5). |
| `Toast` | Bottom-right; success/info/error. Auto-dismiss 4s. |
| `EmptyState` | Illustration + one line + one CTA. Used per App Flow §8. |

Component states are non-negotiable: every interactive component must define default / hover / focus-visible / active / disabled / loading. Focus-visible = 2px `primary-fg` ring with a 2px offset (keyboard accessibility).

Add two more components implied by the corrected flows:
| Component | Notes |
|---|---|
| `GapRow` | Placement gap item. Two modes: **available** (normal, "Train this →") and **external** (muted, "future track" tag, **no button**). |
| `ConsentScreen` | Pre-onboarding research consent (Backend Schema §5.1): plain-language disclosure, explicit opt-in, link to full text. |

## 6. Layout System

- **Desktop (≥1024px):** fixed left sidebar (240px) — logo, nav (Dashboard, Roadmap, Placement, Leaderboard, Profile), XP+streak pinned at top. Content area max-width `1200px`, centered.
- **Tablet (768–1023px):** collapsible sidebar (icon-only rail).
- **Mobile (<768px):** bottom tab bar (5 icons); XP+streak in a compact top bar. **The play screen (S6) is the hard one** — see §7.6.

## 7. Screen Layouts

### 7.1 Landing (S1)
Hero: headline "Level up from student to placement-ready" + subhead + primary CTA "Start your quest". Below: 3 feature cards (Personalized roadmap / Learn by doing / Know you're placement-ready), a "how it works" 5-step strip, footer. Keep it one-scroll; this is the pitch, not a marketing site.

### 7.2 Auth (S2)
Centered card on `bg-base`. Google button (primary path) + email/password. Toggle sign-up/login. Minimal — get them through fast.

### 7.3 Onboarding Wizard (S3)
Preceded by the **consent screen** (`ConsentScreen`) — plain-language, explicit opt-in, before any data is collected.

Full-screen, one question per step, progress bar at top (Step 2 of 5). Big friendly inputs with **visible labels**, and **Back + Save & exit** on every step. Each step animates in from the right; progress persists server-side so a drop-off resumes where it left off. **Step 5 → "Building your quest…" loader** (App Flow §2): themed animation (skill nodes assembling), 2–4s. This screen sets the emotional tone — invest design polish here.

### 7.4 Dashboard (S4) — the home base
```
┌─────────────────────────────────────────────┐
│  Top: ⚡ 1,240 XP    🔥 6-day streak   [avatar]│
├─────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌────────────────┐ │
│  │ CONTINUE YOUR QUEST │  │ Placement      │ │
│  │ Level: Recursion #3 │  │ Readiness      │ │
│  │ [ Resume → ]        │  │  ◐ 62% covered │ │
│  │                     │  │  ▲ +4 this wk  │ │
│  └─────────────────────┘  └────────────────┘ │
│  ┌─────────────────────┐  ┌────────────────┐ │
│  │ This week's progress│  │ Recent badges  │ │
│  │ ▓▓▓▓▓░░ 5/8 levels   │  │ 🏅 🏅 🏅        │ │
│  └─────────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────┘
```
The "Continue your quest" card is the single primary CTA. **When the dropout model flags At Risk, the NudgeCard replaces this card** (App Flow §5) — same slot, so the intervention is unmissable. New users see the zero-state (one big "Start your first quest").

### 7.5 Roadmap (S5)
Vertical skill-tree (top = start, down = advanced), branches where prerequisites fork. Nodes use `SkillNode` states. Current node pulses. Tap a node → side panel: concept description, levels inside it, XP available, "Start" CTA. Supports `?focus=<skillId>` deep-link from the placement tracker (auto-scroll + highlight). On mobile: the tree becomes a vertical stepper (avoid pan/zoom pain).

### 7.6 Play Screen (S6) — the core, and the responsive challenge
**Desktop:** split view — left 40% problem panel (statement, examples, constraints, in `leading-relaxed`), right 60% Monaco (JetBrains Mono, dark). Bottom drawer: "Run Tests" (primary) + results. Silent timer (analytics only — never shown).

**Mobile:** tabs — [ Problem | Code | Results ] — because a split view is unusable on a phone. Code tab is default once the student has read the problem. This is explicitly called out because it's the highest-risk layout in the app.

Results drawer uses `TestResultRow`; failed *visible* tests expand to input/expected/actual; hidden tests show pass/fail only (never leak hidden cases). Compile errors render in the drawer in mono, `danger`-tinted. "Stuck? Get a hint (−10 XP)" is `info`-styled and clearly optional.

### 7.7 Placement Tracker (S7)
Per-role cards, each a `ProgressRing` + coverage % + trend, headed **"Placement Readiness — 62% tracked-skill coverage"** with the permanent subtitle *"Based on published requirements currently represented in SkillQuest. Not a hiring prediction."* and a link to the JD source + collection date.

Tap → full gap list in two visually distinct groups:
- **Available now** — normal styling, "Train this →" deep-links to `/roadmap?focus=<skillId>`.
- **External / future track** — muted styling, an "on our roadmap" tag, **no button**.

**Copy rule:** never write "You're 62% ready for Infosys" anywhere in the product, report or presentation. It implies a hiring probability the model does not measure.

### 7.8 Profile (S8)
Avatar, stats (total XP, levels, best streak), full badge shelf (earned bright, locked greyed with unlock hints), and **settings**: hours/week (re-triggers roadmap re-pack with a confirm dialog per App Flow §8), target companies. No full re-onboarding in v1.

### 7.9 Leaderboard (S9, P1)
Weekly XP ranking, current user's row pinned + highlighted. `<5 users` → "Early adopter" empty framing (App Flow §8).

### 7.10 Admin (S10, internal)
Function over form — plain table, risk tiers color-coded (`risk-*` tokens), sortable by risk. Level publish toggles. "Run weekly scoring now" / "Recompute placement" buttons for live demos. No design polish budget here.

## 8. Loading, Empty & Error States (design each, don't leave blank)

| State | Treatment |
|---|---|
| Data loading | Skeleton screens (grey shimmer blocks), not spinners, for dashboard/roadmap |
| Running tests | Button spinner + "Running tests…"; editor locked |
| Judge0 down | Inline error in results drawer, retry button, reassuring copy; submission not counted |
| AI service down (onboarding) | Silent default roadmap; user sees a normal reveal |
| Empty roadmap complete | Celebration illustration + leaderboard/stretch pointer |
| Network offline | Toast + code preserved in `localStorage` |
| First-time zero states | `EmptyState` component, one CTA |

## 9. Accessibility (bake in, don't retrofit)

**Color & contrast**
- Every pairing measured, not assumed — see the §2 table. AA (4.5:1) for normal text, 3:1 for large text and UI boundaries.
- Never encode meaning in color alone — pair with icons (✓/✗, 🔒) so pass/fail is distinguishable for colorblind users.

**Touch & pointer targets**
- Minimum **44×44 px** for every interactive target (WCAG 2.5.5). Applies especially to the mobile results drawer, roadmap nodes and bottom tab bar.
- Minimum **8 px spacing** between adjacent targets — mis-taps in the play screen are the most damaging (a wrong tap can discard code).
- Bottom tab bar respects `env(safe-area-inset-bottom)` so it clears the home indicator on notched phones.

**Forms** (onboarding is the highest-stakes form in the app)
- **Visible labels always** — never placeholder-only; placeholders vanish on focus and fail for screen readers.
- Inline errors adjacent to the field, tied via `aria-describedby`, announced with `role="alert"`. Never color-only error state.
- Every onboarding step needs **Back** and **Cancel/Save & exit** — a wizard with no way backwards traps users and inflates abandonment (which then pollutes our own engagement data).
- Inputs typed correctly (`inputmode="numeric"` for hours) so mobile keyboards match.

**Focus & announcements**
- Visible focus ring on everything keyboard-reachable; never `outline: none` without a replacement.
- **Route changes move focus** to the new page's `<h1>` and announce the page title — SPAs are silent on navigation otherwise.
- **Modals trap focus** (badge popups, confirm dialogs), restore it to the trigger on close, and close on `Esc`.
- **`aria-live="polite"`** on the test-results drawer and toasts, so a screen-reader user hears "3 of 5 tests passed" without hunting for it. XP counters use `aria-live="polite"` too; celebrations are `aria-hidden` decoration.
- A **skip-to-content link** as the first focusable element on every page.
- Monaco ships its own a11y support — verify the full Run Tests flow is completable with keyboard only.

**Motion**
- `prefers-reduced-motion` honored for all celebrations (confetti, XP count-up degrade to a static state change).

**Icons**
- **Lucide for all navigation and controls** (they carry accessible labels and scale predictably). Emoji (🔥⚡🏅) stay **decorative only**, marked `aria-hidden`, never the sole carrier of meaning — screen readers announce emoji inconsistently.

## 10. Assets & Deliverables (for the report + build)

- Design in **Figma** (free): a color/type style sheet, the core components from §5, and hi-fi mockups of the 6 P0 screens. Export screenshots for the project report.
- Icons: **Lucide** (React, tree-shakeable, no external calls). Emoji for playful accents (🔥⚡🏅) — zero asset weight.
- Badge art: simple flat SVGs (can be AI-generated then hand-cleaned); keep a consistent style.
- No external font/icon CDNs — self-host everything (matches the Artifact-style CSP discipline and keeps the app fast on college wifi).
