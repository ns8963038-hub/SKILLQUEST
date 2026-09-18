# M5 — "Neural Night" UI/UX Redesign

**Status:** done, browser-verified in demo mode (2026-09). Backend mastery data
(M4) is still to be wired once the database is restored — the UI already reads it.

---

## 1. Why we redesigned

Two pieces of feedback, both correct:

1. **It looked like a LeetCode + Duolingo replica.** The most visible parts (a
   problem-and-tests screen, XP/streak/badges) are the most-copied patterns in
   ed-tech.
2. **The UI felt cheap.** Flat default cards, generic colours, no motion, emoji
   badges — nothing said "AI product".

The fix was not "more game art". It was to **make the AI visible**: the screens
now show the tutor's model of the student (mastery estimates, a live briefing,
a knowledge map that changes as you learn), and the craft level was raised to
match.

## 2. What was built

| Piece | Where | What it does |
|---|---|---|
| Design system | `tailwind.config.js`, `src/index.css` | Palette, fonts, glass panels, grain, motion rules (see UI doc §2–4) |
| UI kit | `src/ui/` | `GlassCard`, `Button`, `Chip`, `Skeleton`, `PageHeader`, `ErrorState`, `MasteryRing`, `AnimatedNumber`, `Typewriter`, `AmbientBackground`, `BrandMark`, `AppShell` |
| **Knowledge Constellation** | `src/features/constellation/` | The roadmap as a star map of all 19 skills. Glow and ring = the tutor's mastery estimate; lines = prerequisites; pulses flow into what you're learning |
| Tutor briefing | `src/features/tutor/briefing.ts` | Plain-English summary built only from the student's own numbers |
| The vault | `src/features/quest/QuestChest.tsx`, `QuestReward.tsx` | A crystal that splits open on a full pass; the reward shows the BKT update (e.g. 58% → 88%) |
| Redesigned screens | `src/screens/*` | Auth, Onboarding ("calibrating your tutor"), Dashboard, Constellation, Play, Placement, DSA Prep |
| **Demo mode** | `src/lib/demo.ts` | Add `?demo` to the URL: the whole app runs on an in-browser fake API — no backend, no database |

## 3. How the key pieces work

**Constellation layout.** Each skill's *depth* is the length of its longest
prerequisite chain (memoised DFS). Skills are placed in columns by depth, so
every skill sits to the right of everything it depends on — the graph reads
left-to-right like a journey. A deterministic hash jitter (FNV-1a) makes it look
organic but identical on every render. Tested in `skillGraph.test.ts`.

**Honest numbers.** The UI never invents a percentage. If the API sends a
mastery estimate, it's shown; if not, the star is drawn from its status and the
tooltip shows status only. The briefing is deterministic — every sentence maps
to a number (tested in `briefing.test.ts`).

**Demo mode.** `api()` checks one flag and, if set, answers from `demoApi()`
instead of the network. The demo student is mid-journey (4 skills mastered,
Methods at 58%). Solving a level runs the same BKT update as the backend, so
mastery, XP, streak, badges and the roadmap all react — useful for the Phase 2
review and whenever the free Supabase project is paused.

## 4. Accessibility and performance (not traded away for looks)

- Every colour pairing was **measured**: all body text ≥ 6.75:1, the primary
  button 8.43:1. One candidate (white on bright blue, 3.72:1) failed and was
  rejected.
- Pass/fail and status always carry **text or an icon**, never colour alone.
- Visible focus rings; skip link; focus moves to each page's `<h1>` after
  navigation; the reward dialog traps focus, closes on Esc, and hides the page
  behind it from assistive tech.
- `prefers-reduced-motion` is honoured twice: Motion's `reducedMotion="user"`
  and a global CSS rule. The canvas background becomes a still frame.
- The canvas renders at 60% resolution, capped at ~30fps, paused when the tab
  is hidden. Fonts are self-hosted (no CDN).

## 5. Verification

- `tsc` clean, ESLint clean, **20/20 tests** (7 files), production build passes.
- Driven end-to-end in a real browser (Playwright) in demo mode: dashboard →
  constellation (hover) → play → failing run (1/4) → real solve → vault → the
  dashboard updates (streak 6→7, XP 520→580, briefing re-written) → placement →
  DSA prep → sign-in → mobile. **Zero console errors.**

## 6. Gotchas found while building

- **`text-base` is poisoned.** A colour named `base` makes Tailwind's
  `text-base` set *both* the font size and a near-black colour — it made the
  play screen's title invisible. Use `text-[16px]` instead.
- **Screenshot tools stall on infinite CSS animations.** Emulate
  reduced motion before capturing.

## 7. Known limits / next

- The backend doesn't send `mastery` yet (M4 wiring waits on the database). Until
  then live mode shows statuses, not percentages.
- JS bundle is ~825 KB (238 KB gzipped) — code-split the Play screen next.
- Single dark theme by design (coding audience; Monaco is dark).

## 8. Likely viva questions

- *Why does your UI matter for an AI project?* Because the AI's value is
  invisible unless the interface shows it. The constellation, the tutor briefing
  and the reward's mastery update expose the model's state to the student.
- *How is the constellation laid out?* Longest-prerequisite-chain depth decides
  the column (a topological layering), so dependencies always point rightward;
  deterministic jitter keeps it stable across renders.
- *Isn't the briefing just an LLM?* No — it's a deterministic function of the
  student's data (mastery, plan, streak). That makes it testable and it can never
  hallucinate.
- *What is demo mode and is it cheating?* It's an explicit, opt-in flag
  (`?demo`) that swaps the network for an in-memory API with sample data, clearly
  labelled "Demo" in the UI. It exists for presentations and for when the free
  database is paused; real mode is unchanged.
- *How did you make sure it's accessible?* Measured contrast for every pairing,
  meaning never carried by colour alone, keyboard and screen-reader flows, and
  reduced-motion support.

## 9. Nova and the AI micro-animations (added after the redesign)

The tutor was given a face so the AI feels present, not just described.

| Piece | Where | Behaviour |
|---|---|---|
| **Nova** (`src/ui/Nova.tsx`) | Sign-in, dashboard, console, reward, onboarding, loading | A liquid star-orb. Eyes follow the cursor (spring-smoothed), it blinks at a random rhythm, breathes, and leans toward its gaze. Moods: idle, talking, thinking, happy (^ ^ eyes, bounce, blush, sparkles), concerned (worried brows, head tilt), shy (eyes closed while you type a password), peek (one eye opens when you reveal it), sleepy (floating z's while loading or the database naps). |
| **Neural thinking** (`src/ui/NeuralThinking.tsx`) | While tests run; while the roadmap is built | A 3-4-4-2 network whose signals ripple layer by layer and whose neurons flash as the wave arrives. |
| **Cursor neuron** (`AmbientBackground`) | Every screen | Background points link to the cursor and drift toward it. |
| **Synapses** (`Constellation`) | Dashboard + constellation | Hover a skill: its whole prerequisite chain (`ancestorsOf`) lights up with knowledge flowing toward it, what it unlocks (`dependentsOf`) is shown, and the rest dims. |

Budget: Nova is DOM + CSS + Motion springs (no images); the network and synapses
are SVG with CSS dash animations; the canvas background drops itself to ~15fps if
frames slow down. Everything stills under reduced motion, and all of it is
`aria-hidden` — the adjacent text always carries the meaning.

- *Isn't a cartoon face childish for a placement tool?* It's restrained (one small
  orb, no voice, no pop-ups) and it's functional: its mood mirrors real state
  (running, passed, failed, server asleep), so it doubles as a status indicator.
- *How does the synapse highlight work?* `ancestorsOf` walks prerequisite links
  backwards with a stack (DFS) to collect the whole chain; those edges are redrawn
  on top with an animated dash so knowledge visibly flows into the skill.
