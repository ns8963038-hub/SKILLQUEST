# M11 — Nova on the sign-in screen: reading along, turning away, getting cross

**Status:** BUILT (2026-09-21). Suggested by the team after using the live site.

## What Nova does now

Nova is the tutor's face: the orb that sits on the sign-in card. Before this, it
followed the mouse and closed its eyes for the password. Now:

| When | Nova | Why it helps |
|---|---|---|
| You type your **email** | its eyes follow the text cursor, moving right as the address grows | it visibly "reads along", and on a phone (no mouse) it still has something to watch |
| You type your **password** | turns right round, face hidden, whistling ♪ | the clearest possible "I'm not looking" — a privacy cue, not just a joke |
| You press **show password** | turns half back and peeks with one eye | playful, and it matches what you just chose to do |
| You **poke** it 3 times fast | annoyed: slit eyes, flat brows, a "hmph" shake | a small reward for curiosity |
| You poke it **5 times** | angry: scowl, red glow, a popping anger vein, trembling | … and it calms down a couple of seconds after you stop |

## How it works

- **Reading along.** `frontend/src/lib/caret.ts` works out where the text cursor
  sits on screen: the input's left edge, plus its padding, plus the width of the
  text typed so far (measured in the input's own font on a hidden canvas), less
  any scrolling, kept inside the box. Email inputs don't report a cursor
  position, so it is taken to be at the end of the text, which is where it is while
  typing. Nova gets that point as `lookAt` and points its eyes at it instead of
  at the mouse. It is re-measured after each keystroke, and on scroll, resize or
  a phone's keyboard opening.
- **Turning round.** The body turns 180° in 3D (`rotateY`) and the face is drawn
  on the front only (`backface-visibility: hidden`), so the face disappears. The
  orb stays visible, and its highlight swaps sides, so it reads as the back of a
  head. Every other mood states `rotateY: 0`, which turns it back when you leave
  the field.
- **Poking.** A click within 1.2 s of the last one adds to a streak: 3 means
  annoyed, 5 means angry. After 2.6 s of quiet an angry Nova drops to annoyed,
  then back to its normal mood 1.2 s later. Double-tap zoom is switched off on
  Nova, so quick taps on a phone count as pokes.
- **Animations off** (the phone's setting, or Settings → Animations): Nova still
  changes state (turned, angry) but nothing moves. The eyes stay centred and
  there's no shaking, whistling or pulsing.

Nova stays decorative: it is hidden from screen readers and never takes keyboard
focus. Poking is a toy, not a control, so a keyboard or screen-reader user loses
nothing.

## Found along the way

The animated background checked only the **phone's** reduce-motion setting and
ignored the app's own **Settings → Animations** switch (M9). So a student who
turned animations off to save a slow phone still had the heaviest thing on
screen running. It now follows the same switch as everything else.

## Verified

6 unit tests for Nova (escalation, calming down, only rapid pokes count, not
pokeable unless allowed, the face hidden when turned, whistling only with
animations on), 5 for the caret position, 3 for the sign-in screen's wiring. All
of it was checked in a real browser at phone size. Screenshots showed the
turned, peeking, annoyed and angry faces. With animations on, the eyes'
horizontal offset went −6.8 → −6.3 → −5.4 → −3.1 → −0.7 px as an email address
was typed, following the text to the right.

## Viva questions

**Q: Why does Nova turn around for the password, rather than just closing its eyes?**
It's the clearest signal of "I'm not watching", which is what a password field
should feel like. The face is on the front of a 3D-rotated body, so turning 180°
hides it completely, and the moving highlight shows it's the back.

**Q: How do the eyes know where you're typing?**
They're given a point on screen: where the text cursor sits, computed from the
input's position, its padding and the measured width of the text so far. Email
inputs don't expose a cursor position, so it's assumed to be at the end, which is
where it is while typing.

**Q: Isn't a clickable face an accessibility problem?**
It would be if it did anything. Poking only changes Nova's expression, so it's
hidden from screen readers and kept out of the tab order, and nobody misses a
function by not poking it.
