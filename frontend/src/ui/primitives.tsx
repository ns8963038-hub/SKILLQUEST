import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import { cn } from '../lib/cn';

// The shared building blocks of the "Neural Night" UI. Every screen composes
// these, so spacing, radius, glow and motion stay consistent app-wide.

// ---- Motion presets ----------------------------------------------------------

// A confident deceleration curve used for all entrances.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// Children of a `stagger` parent rise into place one after another.
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_OUT } },
};

// ---- GlassCard ---------------------------------------------------------------

// A translucent glass panel. `edge` adds the light-catching gradient border used
// on hero panels; `interactive` adds a hover lift for clickable cards.
export function GlassCard({
  className,
  edge,
  interactive,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { edge?: boolean; interactive?: boolean }) {
  return (
    <div
      className={cn(
        'glass rounded-3xl',
        edge && 'edge',
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-ion/25 hover:shadow-glow-ion',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---- Button ------------------------------------------------------------------

type ButtonVariant = 'primary' | 'gold' | 'ghost' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // Ink on luminous ion: 8.4:1+. The inset highlight makes it feel lit from above.
  primary:
    'bg-gradient-to-b from-ion-soft to-ion text-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_12px_30px_-12px_rgba(77,124,255,0.9)] hover:shadow-glow-ion',
  // Reserved for reward moments ("you earned this").
  gold: 'bg-gradient-to-b from-[#FFDD85] to-accent text-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),0_12px_30px_-12px_rgba(255,197,61,0.8)] hover:shadow-glow-gold',
  ghost:
    'border border-line-strong bg-surface-2/60 text-content hover:border-ion/40 hover:bg-surface-3',
  subtle: 'text-content-muted hover:bg-surface-3 hover:text-content',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] gap-1.5 rounded-xl px-3.5 text-sm',
  md: 'min-h-[44px] gap-2 rounded-xl px-5 text-sm', // 44px = WCAG target size
  lg: 'min-h-[52px] gap-2.5 rounded-2xl px-6 text-[15px]',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

// A button with a springy press, a hover lift, and — on filled variants — a
// light sweep across the surface on hover.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, ...rest },
  ref,
) {
  const filled = variant === 'primary' || variant === 'gold';
  return (
    <motion.button
      ref={ref}
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'group relative inline-flex select-none items-center justify-center overflow-hidden font-medium tracking-tight transition-[box-shadow,background-color,border-color,color] duration-200 disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...rest}
    >
      {filled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/50 opacity-0 blur-md transition-[left,opacity] duration-700 ease-out group-hover:left-[130%] group-hover:opacity-100"
        />
      )}
      <span className="relative inline-flex items-center gap-[inherit]">{children}</span>
    </motion.button>
  );
});

// ---- Chip --------------------------------------------------------------------

export type Tone = 'ion' | 'gold' | 'mint' | 'rose' | 'ember' | 'neutral';

const CHIP_TONE: Record<Tone, string> = {
  ion: 'border-ion/20 bg-ion-tint text-ion',
  gold: 'border-accent/25 bg-accent-tint text-accent',
  mint: 'border-success/20 bg-success-tint text-success',
  rose: 'border-danger/20 bg-danger-tint text-danger',
  ember: 'border-ember/20 bg-ember-tint text-ember',
  neutral: 'border-line bg-surface-2 text-content-muted',
};

// A small status pill. Meaning is always carried by its text, never colour alone.
export function Chip({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- Switch ------------------------------------------------------------------

// An accessible on/off switch (role="switch" + aria-checked), labelled by its
// visible text so screen readers announce "Show me on the leaderboard, on".
export function Switch({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-content">
          {label}
        </p>
        {description && (
          <p id={`${id}-desc`} className="mt-1 text-sm text-content-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-ion/60 bg-ion' : 'border-line-strong bg-surface-3',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn(
            'absolute top-[2px] h-[22px] w-[22px] rounded-full shadow',
            checked ? 'right-[2px] bg-ink' : 'left-[2px] bg-content-muted',
          )}
        />
      </button>
    </div>
  );
}

// ---- Skeleton ----------------------------------------------------------------

// A shimmering placeholder block (loading states use skeletons, not spinners).
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

// ---- Page header -------------------------------------------------------------

// The consistent top-of-page block: eyebrow, headline, supporting line, actions.
// The h1 takes focus after navigation so screen readers announce the new page.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <motion.header
      initial="hidden"
      animate="show"
      variants={stagger}
      className="mb-8 flex flex-wrap items-end justify-between gap-6"
    >
      <div className="max-w-2xl">
        <motion.p variants={rise} className="eyebrow">
          {eyebrow}
        </motion.p>
        <motion.h1
          variants={rise}
          tabIndex={-1}
          className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight outline-none sm:text-5xl"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p variants={rise} className="mt-3 text-[15px] leading-relaxed text-content-muted">
            {description}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div variants={rise} className="flex flex-wrap items-center gap-3">
          {actions}
        </motion.div>
      )}
    </motion.header>
  );
}

// ---- Error state -------------------------------------------------------------

// A calm, specific error with one recovery action (UI doc §8: never a blank screen).
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <GlassCard className="mx-auto max-w-md p-8 text-center">
      <p role="alert" className="font-display text-xl font-semibold">
        {message}
      </p>
      <p className="mt-2 text-sm text-content-muted">
        The server may be waking up. Your progress is safe.
      </p>
      {onRetry && (
        <Button variant="ghost" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </GlassCard>
  );
}
