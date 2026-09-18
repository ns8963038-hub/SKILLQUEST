import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';
import { cn } from '../lib/cn';

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
//
// Purely decorative: the text beside Nova always carries the meaning, so it is
// hidden from screen readers. With reduced motion it stays still and centred.
// =============================================================================

export type NovaMood = 'idle' | 'talking' | 'thinking' | 'happy' | 'concerned' | 'shy' | 'peek' | 'sleepy';

type EyeShape = 'open' | 'worried' | 'happy' | 'closed' | 'sleep';

const INK = '#0B1236'; // eye colour: deep navy, softer than pure black

// Where Nova looks when a mood overrides the cursor (fractions of its reach).
const GAZE: Partial<Record<NovaMood, [number, number]>> = {
  thinking: [0.75, -0.85], // up and to the right: "let me think…"
  shy: [-0.7, 0.55], // looks away and down
  peek: [0.7, 0.65], // sneaks a look toward the password field
  sleepy: [0, 0.5],
};

// The eye shapes for each mood: [left, right].
function eyesFor(mood: NovaMood): [EyeShape, EyeShape] {
  switch (mood) {
    case 'happy':
      return ['happy', 'happy'];
    case 'shy':
      return ['closed', 'closed'];
    case 'peek':
      return ['closed', 'open'];
    case 'sleepy':
      return ['sleep', 'sleep'];
    case 'concerned':
      return ['worried', 'worried'];
    default:
      return ['open', 'open'];
  }
}

// How the body moves in each mood.
function bodyMotion(mood: NovaMood, size: number): { animate: TargetAndTransition; transition: Transition } {
  switch (mood) {
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
  mood = 'idle',
  size = 64,
  className,
}: {
  mood?: NovaMood;
  size?: number;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion() ?? false;

  // ---- Gaze: the eyes glide toward the cursor, spring-smoothed ----
  const reachX = size * 0.12;
  const reachY = size * 0.09;
  const gazeX = useMotionValue(0);
  const gazeY = useMotionValue(0);
  const eyeX = useSpring(gazeX, { stiffness: 260, damping: 22, mass: 0.5 });
  const eyeY = useSpring(gazeY, { stiffness: 260, damping: 22, mass: 0.5 });
  // The whole orb leans a little toward where it's looking.
  const lean = useTransform(eyeX, [-reachX, reachX], [-7, 7]);

  useEffect(() => {
    const fixed = GAZE[mood];
    if (fixed) {
      gazeX.set(fixed[0] * reachX);
      gazeY.set(fixed[1] * reachY);
      return;
    }
    gazeX.set(0);
    gazeY.set(0);
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 280); // full reach once the cursor is ~280px away
      gazeX.set((dx / dist) * reach * reachX);
      gazeY.set((dy / dist) * reach * reachY);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [mood, reduce, reachX, reachY, gazeX, gazeY]);

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
  const blush = mood === 'shy' || mood === 'peek' || mood === 'happy';

  return (
    <span
      ref={rootRef}
      aria-hidden
      className={cn('relative block shrink-0 select-none', className)}
      style={{ width: size, height: size, '--s': `${size}px` } as CSSProperties}
    >
      {/* Aura — ion normally, gold when happy, rose when worried. */}
      <span
        className="pointer-events-none absolute rounded-full transition-opacity duration-500"
        style={{
          inset: -size * 0.5,
          background: 'radial-gradient(circle, rgba(77,124,255,0.5), transparent 62%)',
          opacity: mood === 'happy' || mood === 'concerned' ? 0 : mood === 'sleepy' ? 0.35 : 1,
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

      {/* The body: leans toward the gaze, then moves per mood. */}
      <motion.span className="absolute inset-0" style={{ rotate: lean }}>
        <motion.span
          key={mood === 'happy' ? `happy-${burst}` : 'body'}
          className="absolute inset-0"
          initial={{ scale: 1, y: 0, rotate: 0 }}
          animate={body.animate}
          transition={body.transition}
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

          {/* The face */}
          <span className="absolute" style={{ left: '50%', top: '55%', transform: 'translate(-50%, -50%)' }}>
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
      </motion.span>

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
