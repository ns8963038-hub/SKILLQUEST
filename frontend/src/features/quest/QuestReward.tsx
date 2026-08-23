import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { QuestChest } from './QuestChest';

interface RewardBadge {
  id: string;
  title: string;
  icon: string | null;
}

// The payoff overlay shown when the student's code passes: the chest opens, a
// burst of confetti fires, and the XP + any new badges are announced. This is
// the "treasure opens when you solve it" moment.
export function QuestReward({
  xp,
  badges = [],
  onContinue,
}: {
  xp: number;
  badges?: RewardBadge[];
  onContinue: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Open the chest a beat after the overlay appears, then fire confetti.
    const openTimer = setTimeout(() => setOpen(true), 250);
    const confettiTimer = setTimeout(() => {
      confetti({
        particleCount: 140,
        spread: 75,
        origin: { y: 0.55 },
        colors: ['#FFC53D', '#9B85FF', '#3DD68C'],
      });
    }, 650);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(confettiTimer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Treasure unlocked"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="flex justify-center">
          <QuestChest open={open} size={200} />
        </div>
        <h2 className="mt-2 text-2xl font-bold">Treasure unlocked! 🎉</h2>
        <p className="mt-1 text-sm text-content-muted">Your code opened the chest.</p>
        {xp > 0 && <p className="mt-3 text-xl font-bold text-accent">+{xp} XP ⚡</p>}
        {/* Any badges earned by this solve. */}
        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {badges.map((b) => (
              <span
                key={b.id}
                className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm"
              >
                {b.icon} New badge: {b.title}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 min-h-[44px] rounded-lg bg-primary-bg px-6 py-2 font-medium text-content hover:bg-primary-bg-hover"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
