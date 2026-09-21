import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  motion,
  useAnimate,
  useMotionValue,
  useSpring,
  useTransform,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';
import { cn } from '../lib/cn';
import { useMotionOff } from '../lib/motionPref';

// =============================================================================
// NOVA — the tutor's face.
//
// A living star-orb that gives the AI a personality. Its eyes follow your cursor,
// it blinks and breathes, and it reacts to what's happening:
//   idle      breathing, watching your cursor
//   talking   a gentle bob while the briefing is being "spoken"
//   thinking  eyes up, dots orbiting — while tests run or a roadmap is built
//   happy     ^ ^ eyes, a bounce, blush and sparkles — when you pass
//   concerned worried brows and a head tilt — when a test fails (kind, not harsh)
//   shy       eyes closed and turned away — while you type a password
//   peek      one eye sneaks open — when you reveal the password
//   sleepy    eyes shut, floating z's — while loading or the server naps
//   turned    turned right around, whistling — while you type a password
//   glance    half turned back, one eye peeking — when you reveal the password
//   annoyed   squinting, flat brows — poked three times in a row
//   angry     scowling, red glow, a popping anger vein, shaking — poked five
//
// Two extras: `lookAt` makes the eyes follow a point on screen instead of the
// cursor (the sign-in screen passes the email field's text cursor, so Nova reads
// along as you type), and `pokeable` lets you click Nova — do it too often and
// it gets annoyed, then angry, and calms down a couple of seconds after you stop.
//
// Purely decorative: the text beside Nova always carries the meaning, so it is
// hidden from screen readers and never takes keyboard focus (poking is a toy,
// not a control — nothing is lost without it). With animations off (the device
// setting, or Settings -> Animations) it stays still and centred.
// =============================================================================

export type NovaMood =
  | 'idle'
  | 'talking'
  | 'thinking'
  | 'happy'
  | 'concerned'
  | 'shy'
  | 'peek'
  | 'sleepy'
  | 'turned'
  | 'glance'
  | 'annoyed'
  | 'angry';

type EyeShape = 'open' | 'worried' | 'happy' | 'closed' | 'sleep' | 'squint' | 'angry';

// Poking: how fast counts as "again", and how many pokes it takes.
const POKE_STREAK_MS = 1200; // a poke within this time of the last one adds to the streak
const ANNOYED_AT = 3;
const ANGRY_AT = 5;
const CALM_AFTER_MS = 2600; // quiet time before an angry Nova starts to calm down

const INK = '#0B1236'; // eye colour: deep navy, softer than pure black

// Where Nova looks when a mood overrides the cursor (fractions of its reach).
const GAZE: Partial<Record<NovaMood, [number, number]>> = {
  thinking: [0.75, -0.85], // up and to the right: "let me think…"
  shy: [-0.7, 0.55], // looks away and down
  peek: [0.7, 0.65], // sneaks a look toward the password field
  sleepy: [0, 0.5],
  glance: [-0.6, 0.6], // over its shoulder, down toward the form
};

// The eye shapes for each mood: [left, right].
function eyesFor(mood: NovaMood): [EyeShape, EyeShape] {
  switch (mood) {
    case 'happy':
      return ['happy', 'happy'];
    case 'shy':
      return ['closed', 'closed'];
    case 'peek':
    case 'glance':
      return ['closed', 'open'];
    case 'turned':
      return ['closed', 'closed']; // hidden behind its back anyway
    case 'annoyed':
      return ['squint', 'squint'];
    case 'angry':
      return ['angry', 'angry'];
    case 'sleepy':
      return ['sleep', 'sleep'];
    case 'concerned':
      return ['worried', 'worried'];
    default:
      return ['open', 'open'];
  }
}

// How the body moves in each mood. Every mood also states rotateY and x, so
// leaving "turned" turns Nova back round and leaving "angry" stops the shaking
// (a value a mood doesn't mention would otherwise keep its last setting).
function bodyMotion(mood: NovaMood, size: number): { animate: TargetAndTransition; transition: Transition } {
  const m = moodMotion(mood, size);
  return { animate: { rotateY: 0, x: 0, ...m.animate }, transition: m.transition };
}

function moodMotion(mood: NovaMood, size: number): { animate: TargetAndTransition; transition: Transition } {
  switch (mood) {
    case 'turned': // spins round to face away
      return { animate: { rotateY: 180, rotate: 0, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 140, damping: 15 } };
    case 'glance': // turns half back to peek over its shoulder
      return { animate: { rotateY: 48, rotate: 5, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 170, damping: 15 } };
    case 'annoyed': // a short "hmph" shake
      return {
        animate: { x: [0, -size * 0.03, size * 0.03, 0], rotate: -4, scale: 0.97, y: 0 },
        transition: { duration: 0.35, ease: 'easeInOut' },
      };
    case 'angry': // puffed up and trembling with rage
      return {
        animate: { x: [0, -size * 0.05, size * 0.05, -size * 0.05, size * 0.05, 0], rotate: 0, scale: 1.07, y: 0 },
        transition: { duration: 0.42, repeat: Infinity, repeatDelay: 0.35, ease: 'easeInOut' },
      };
    case 'happy': // one joyful bounce
      return {
        animate: { y: [0, -size * 0.18, 0, -size * 0.06, 0], scale: [1, 1.08, 0.96, 1.02, 1], rotate: 0 },
        transition: { duration: 0.9, ease: 'easeOut' },
      };
    case 'talking': // quick bob, like speaking
      return {
        animate: { y: [0, -size * 0.035, 0], scale: 1, rotate: 0 },
        transition: { duration: 0.32, repeat: Infinity, ease: 'easeInOut' },
      };
    case 'thinking': // concentrated pulse
      return {
        animate: { scale: [1, 1.05, 1], y: 0, rotate: 0 },
        transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
      };
    case 'concerned':
      return {
        animate: { rotate: -9, y: size * 0.03, scale: 0.97 },
        transition: { type: 'spring', stiffness: 220, damping: 12 },
      };
    case 'shy':
      return {
        animate: { rotate: 12, y: size * 0.03, scale: 0.95 },
        transition: { type: 'spring', stiffness: 220, damping: 14 },
      };
    case 'peek':
      return { animate: { rotate: 6, y: 0, scale: 1 }, transition: { type: 'spring', stiffness: 220, damping: 14 } };
    case 'sleepy': // slow sleepy breathing
      return {
        animate: { scale: [1, 1.025, 1], y: size * 0.03, rotate: -5 },
        transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
      };
    default: // idle breathing
      return {
        animate: { scale: [1, 1.03, 1], y: 0, rotate: 0 },
        transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' },
      };
  }
}

export function Nova({
  mood: asked = 'idle',
  size = 64,
  className,
  lookAt = null,
  pokeable = false,
}: {
  mood?: NovaMood;
  size?: number;
  className?: string;
  lookAt?: { x: number; y: number } | null; // a point on screen (viewport px) to watch instead of the cursor
  pokeable?: boolean; // clicking Nova makes it react (annoyed, then angry)
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const reduce = useMotionOff();

  // ---- Poking: count clicks in a streak; enough of them overrides the mood ----
  const [pokes, setPokes] = useState(0);
  const streak = useRef({ count: 0, last: 0 });
  const calm = useRef<number | undefined>(undefined);
  const [boopScope, boopAnimate] = useAnimate();
  useEffect(() => () => window.clearTimeout(calm.current), []);

  function poke() {
    const now = performance.now();
    const s = streak.current;
    s.count = now - s.last < POKE_STREAK_MS ? s.count + 1 : 1;
    s.last = now;
    setPokes(s.count);
    // A squish on every poke, like pressing a jelly.
    if (!reduce && boopScope.current) {
      void boopAnimate(boopScope.current, { scale: [1, 0.84, 1.08, 1] }, { duration: 0.34, ease: 'easeOut' });
    }
    // Calm down once the poking stops: angry -> annoyed -> back to normal.
    window.clearTimeout(calm.current);
    const settle = (count: number) => {
      calm.current = window.setTimeout(
        () => {
          const next = count >= ANGRY_AT ? ANNOYED_AT : 0;
          streak.current.count = next;
          setPokes(next);
          if (next > 0) settle(next);
        },
        count >= ANGRY_AT ? CALM_AFTER_MS : 1200,
      );
    };
    settle(s.count);
  }

  const mood: NovaMood = pokes >= ANGRY_AT ? 'angry' : pokes >= ANNOYED_AT ? 'annoyed' : asked;

  // ---- Gaze: the eyes glide toward the cursor, spring-smoothed ----
  const reachX = size * 0.12;
  const reachY = size * 0.09;
  const gazeX = useMotionValue(0);
  const gazeY = useMotionValue(0);
  const eyeX = useSpring(gazeX, { stiffness: 260, damping: 22, mass: 0.5 });
  const eyeY = useSpring(gazeY, { stiffness: 260, damping: 22, mass: 0.5 });
  // The whole orb leans a little toward where it's looking.
  const lean = useTransform(eyeX, [-reachX, reachX], [-7, 7]);

  // Point the eyes at a spot on screen, reaching fully once it's ~280px away.
  const lookToward = useCallback(
    (x: number, y: number) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 280);
      gazeX.set((dx / dist) * reach * reachX);
      gazeY.set((dy / dist) * reach * reachY);
    },
    [gazeX, gazeY, reachX, reachY],
  );

  const lookX = lookAt?.x;
  const lookY = lookAt?.y;
  useEffect(() => {
    const fixed = GAZE[mood];
    if (fixed && lookX === undefined) {
      gazeX.set(fixed[0] * reachX);
      gazeY.set(fixed[1] * reachY);
      return;
    }
    gazeX.set(0);
    gazeY.set(0);
    if (reduce) return;
    // Watching something specific (e.g. the text you're typing): follow that.
    if (lookX !== undefined && lookY !== undefined) {
      lookToward(lookX, lookY);
      return;
    }
    const onMove = (e: PointerEvent) => lookToward(e.clientX, e.clientY);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [mood, reduce, reachX, reachY, gazeX, gazeY, lookX, lookY, lookToward]);

  // ---- Blink every few seconds, at a slightly random rhythm ----
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduce) return;
    let wait = 0;
    let close = 0;
    const schedule = () => {
      wait = window.setTimeout(() => {
        setBlink(true);
        close = window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(close);
    };
  }, [reduce]);

  // ---- Replay the sparkle burst every time Nova becomes happy ----
  const [burst, setBurst] = useState(0);
  const lastMood = useRef<NovaMood | null>(null);
  useEffect(() => {
    if (mood === 'happy' && lastMood.current !== 'happy') setBurst((b) => b + 1);
    lastMood.current = mood;
  }, [mood]);

  const [leftEye, rightEye] = eyesFor(mood);
  const body = bodyMotion(mood, size);
  const ew = size * 0.105; // eye width
  const eh = size * 0.2; // eye height
  const sw = Math.max(1.5, size * 0.035); // stroke width for arcs and brows
  const blush = mood === 'shy' || mood === 'peek' || mood === 'glance' || mood === 'happy';

  return (
    <span
      ref={rootRef}
      aria-hidden
      data-mood={mood}
      data-watching={lookAt ? 'point' : undefined}
      onPointerDown={pokeable ? poke : undefined}
      className={cn('relative block shrink-0 select-none', pokeable && 'pointer-events-auto cursor-pointer', className)}
      // touch-action: a quick double tap pokes twice instead of zooming the page
      style={{ width: size, height: size, '--s': `${size}px`, touchAction: pokeable ? 'manipulation' : undefined } as CSSProperties}
    >
      {/* Aura — ion normally, gold when happy, rose when worried. */}
      <span
        className="pointer-events-none absolute rounded-full transition-opacity duration-500"
        style={{
          inset: -size * 0.5,
          background: 'radial-gradient(circle, rgba(77,124,255,0.5), transparent 62%)',
          opacity: mood === 'happy' || mood === 'concerned' || mood === 'angry' ? 0 : mood === 'sleepy' ? 0.35 : 1,
        }}
      />
      <span
        className="pointer-events-none absolute rounded-full transition-opacity duration-300"
        style={{
          inset: -size * 0.55,
          background: 'radial-gradient(circle, rgba(255,84,84,0.6), transparent 62%)',
          opacity: mood === 'angry' ? 1 : 0,
        }}
      />
      <span
        className="pointer-events-none absolute rounded-full transition-opacity duration-500"
        style={{
          inset: -size * 0.5,
          background: 'radial-gradient(circle, rgba(255,197,61,0.5), transparent 62%)',
          opacity: mood === 'happy' ? 1 : 0,
        }}
      />
      <span
        className="pointer-events-none absolute rounded-full transition-opacity duration-500"
        style={{
          inset: -size * 0.5,
          background: 'radial-gradient(circle, rgba(255,122,147,0.38), transparent 62%)',
          opacity: mood === 'concerned' ? 1 : 0,
        }}
      />

      {/* Thinking: three dots orbiting on a dashed ring. */}
      {mood === 'thinking' && (
        <span
          className="pointer-events-none absolute animate-[spin_2.4s_linear_infinite] rounded-full border border-dashed border-ion/35"
          style={{ inset: -size * 0.2 }}
        >
          {[0, 120, 240].map((deg) => (
            <span key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
              <span
                className="absolute left-1/2 rounded-full bg-ion-soft shadow-[0_0_8px_rgba(169,196,255,0.9)]"
                style={{
                  width: size * 0.075,
                  height: size * 0.075,
                  top: -size * 0.0375,
                  marginLeft: -size * 0.0375,
                }}
              />
            </span>
          ))}
        </span>
      )}

      {/* The body: leans toward the gaze, squishes when poked, then moves per
          mood. It turns in 3D, so the face can disappear behind it. */}
      <motion.span className="absolute inset-0" style={{ rotate: lean }}>
        <span ref={boopScope} className="absolute inset-0">
          <motion.span
            key={mood === 'happy' ? `happy-${burst}` : 'body'}
            className="absolute inset-0"
            initial={{ scale: 1, y: 0, rotate: 0, rotateY: 0 }}
            animate={body.animate}
            transition={body.transition}
            style={{ transformPerspective: size * 5, transformStyle: 'preserve-3d' }}
          >
            {/* The liquid orb (shape morphs slowly via CSS). */}
            <span className="nova-blob absolute inset-0 overflow-hidden">
              {/* Warm glow from within when happy */}
              <span
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  background: 'radial-gradient(circle at 50% 80%, rgba(255,214,120,0.9), transparent 70%)',
                  opacity: mood === 'happy' ? 0.7 : 0,
                }}
              />
              {/* Dimmed while asleep */}
              <span
                className="absolute inset-0 bg-base transition-opacity duration-700"
                style={{ opacity: mood === 'sleepy' ? 0.35 : 0 }}
              />
              {/* Specular glint */}
              <span
                className="absolute rounded-full bg-white/80"
                style={{ left: '20%', top: '14%', width: '28%', height: '16%', transform: 'rotate(-24deg)', filter: 'blur(0.5px)' }}
              />
            </span>

            {/* The face — drawn on the front only, so turning round hides it. */}
            <span
              className="absolute"
              style={{ left: '50%', top: '55%', transform: 'translate(-50%, -50%)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            >
              <motion.span className="relative flex items-start" style={{ x: eyeX, y: eyeY, gap: size * 0.1 }}>
                {mood === 'concerned' && (
                  <>
                    <span
                      className="absolute rounded-full"
                      style={{ left: ew * 0.05, top: -eh * 0.42, width: ew * 1.3, height: sw, background: INK, transform: 'rotate(-16deg)' }}
                    />
                    <span
                      className="absolute rounded-full"
                      style={{ right: ew * 0.05, top: -eh * 0.42, width: ew * 1.3, height: sw, background: INK, transform: 'rotate(16deg)' }}
                    />
                  </>
                )}
                {(mood === 'angry' || mood === 'annoyed') && (
                  <>
                    {/* Angry brows slope down toward the middle: \ / */}
                    <span
                      className="absolute rounded-full"
                      style={{
                        left: ew * 0.02,
                        top: mood === 'angry' ? -eh * 0.2 : -eh * 0.26,
                        width: ew * 1.4,
                        height: sw * (mood === 'angry' ? 1.35 : 1),
                        background: INK,
                        transform: `rotate(${mood === 'angry' ? 24 : 8}deg)`,
                      }}
                    />
                    <span
                      className="absolute rounded-full"
                      style={{
                        right: ew * 0.02,
                        top: mood === 'angry' ? -eh * 0.2 : -eh * 0.26,
                        width: ew * 1.4,
                        height: sw * (mood === 'angry' ? 1.35 : 1),
                        background: INK,
                        transform: `rotate(${mood === 'angry' ? -24 : -8}deg)`,
                      }}
                    />
                  </>
                )}
                <Eye shape={leftEye} w={ew} h={eh} sw={sw} blink={blink} />
                <Eye shape={rightEye} w={ew} h={eh} sw={sw} blink={blink} />
                {blush && (
                  <>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.6 }}
                      className="absolute rounded-full bg-danger blur-[2px]"
                      style={{ left: -ew * 0.9, top: eh * 0.85, width: ew * 1.3, height: ew * 0.65 }}
                    />
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.6 }}
                      className="absolute rounded-full bg-danger blur-[2px]"
                      style={{ right: -ew * 0.9, top: eh * 0.85, width: ew * 1.3, height: ew * 0.65 }}
                    />
                  </>
                )}
              </motion.span>
            </span>
          </motion.span>
        </span>
      </motion.span>

      {/* Angry: the manga "anger vein" pops at the top corner. */}
      {mood === 'angry' && (
        <motion.svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute"
          style={{ width: size * 0.34, height: size * 0.34, right: -size * 0.1, top: -size * 0.12 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={reduce ? { scale: 1, opacity: 1 } : { scale: [1, 1.22, 1], opacity: 1 }}
          transition={reduce ? { duration: 0 } : { scale: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.15 } }}
        >
          <g fill="none" stroke="#FF4D5E" strokeWidth={2.8} strokeLinecap="round">
            <path d="M9.5 3 Q9.5 9.5 3 9.5" />
            <path d="M14.5 3 Q14.5 9.5 21 9.5" />
            <path d="M9.5 21 Q9.5 14.5 3 14.5" />
            <path d="M14.5 21 Q14.5 14.5 21 14.5" />
          </g>
        </motion.svg>
      )}

      {/* Turned away: whistling innocently — "I'm not looking!" */}
      {mood === 'turned' && !reduce && (
        <span className="pointer-events-none absolute" style={{ left: '78%', top: '2%' }}>
          {['♪', '♫'].map((note, i) => (
            <span
              key={note}
              className="nova-z absolute font-semibold text-ion-soft"
              style={{ fontSize: Math.max(10, size * 0.22), animationDelay: `${i * 1.1}s` }}
            >
              {note}
            </span>
          ))}
        </span>
      )}

      {/* Happy: sparkles burst outward. */}
      {mood === 'happy' && burst > 0 && !reduce && (
        <span key={burst} className="pointer-events-none absolute inset-0">
          {Array.from({ length: 6 }, (_, i) => {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const distance = size * 0.85;
            return (
              <motion.svg
                key={i}
                viewBox="0 0 10 10"
                className="absolute left-1/2 top-1/2"
                style={{ width: size * 0.16, height: size * 0.16, marginLeft: -size * 0.08, marginTop: -size * 0.08 }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                animate={{
                  x: Math.cos(angle) * distance,
                  y: Math.sin(angle) * distance,
                  scale: [0, 1.1, 0],
                  opacity: [0, 1, 0],
                  rotate: 90,
                }}
                transition={{ duration: 0.95, delay: 0.1 + i * 0.03, ease: 'easeOut' }}
              >
                <path d="M5 0 Q5 5 10 5 Q5 5 5 10 Q5 5 0 5 Q5 5 5 0Z" fill={i % 2 ? '#FFE08A' : '#CFE0FF'} />
              </motion.svg>
            );
          })}
        </span>
      )}

      {/* Sleepy: z's drift up and away. */}
      {mood === 'sleepy' && (
        <span className="pointer-events-none absolute" style={{ left: '74%', top: '-4%' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="nova-z absolute font-mono font-semibold text-ion-soft"
              style={{ fontSize: Math.max(9, size * 0.2), animationDelay: `${i * 0.8}s` }}
            >
              z
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// One eye. Open eyes blink and carry a tiny white catchlight; the other shapes are
// drawn with borders: ∩ happy, ∪ closed, — asleep. A new shape pops in with a spring.
function Eye({ shape, w, h, sw, blink }: { shape: EyeShape; w: number; h: number; sw: number; blink: boolean }) {
  let inner: ReactNode;
  if (shape === 'happy') {
    inner = (
      <span
        className="block"
        style={{ width: w * 1.3, height: h * 0.5, marginTop: h * 0.12, border: `${sw}px solid ${INK}`, borderBottom: 'none', borderRadius: `${w}px ${w}px 0 0` }}
      />
    );
  } else if (shape === 'closed') {
    inner = (
      <span
        className="block"
        style={{ width: w * 1.3, height: h * 0.42, marginTop: h * 0.36, border: `${sw}px solid ${INK}`, borderTop: 'none', borderRadius: `0 0 ${w}px ${w}px` }}
      />
    );
  } else if (shape === 'squint') {
    // Annoyed: eyes narrowed to slits.
    inner = <span className="block" style={{ width: w * 1.1, height: h * 0.34, marginTop: h * 0.42, background: INK, borderRadius: w }} />;
  } else if (shape === 'angry') {
    // Angry: a glaring eye with its top cut off by the brow, pupil still shining.
    inner = (
      <span className="relative block" style={{ width: w, height: h * 0.66, marginTop: h * 0.3, background: INK, borderRadius: `${w * 0.15}px ${w * 0.15}px ${w}px ${w}px` }}>
        <span className="absolute rounded-full bg-white" style={{ width: w * 0.36, height: w * 0.36, top: h * 0.1, right: w * 0.12 }} />
      </span>
    );
  } else if (shape === 'sleep') {
    inner = <span className="block" style={{ width: w * 1.25, height: sw, marginTop: h * 0.6, background: INK, borderRadius: sw }} />;
  } else {
    const worried = shape === 'worried';
    inner = (
      <motion.span
        className="relative block"
        style={{ width: w, height: worried ? h * 0.82 : h, marginTop: worried ? h * 0.18 : 0, background: INK, borderRadius: w }}
        animate={{ scaleY: blink ? 0.1 : 1 }}
        transition={{ duration: 0.07 }}
      >
        <span className="absolute rounded-full bg-white" style={{ width: w * 0.42, height: w * 0.42, top: h * 0.12, right: w * 0.1 }} />
      </motion.span>
    );
  }
  return (
    <span className="flex justify-center" style={{ width: w * 1.35, height: h }}>
      <motion.span
        key={shape}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        className="flex justify-center"
      >
        {inner}
      </motion.span>
    </span>
  );
}
