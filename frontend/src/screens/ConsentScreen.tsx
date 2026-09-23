import { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Cpu, Database, Eye, HandHeart, ShieldCheck, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { AmbientBackground } from '../ui/AmbientBackground';
import { Nova } from '../ui/Nova';
import { Button, GlassCard, rise, stagger } from '../ui/primitives';

// The plain-language disclosure (Backend Schema §5.1): what, why, who, how long,
// and that it's a free choice. One short screen — not a legal wall.
const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Database,
    title: 'What we collect',
    body: 'Your activity in SkillQuest (which levels you try and when you practise), the code you submit, your quiz answers, and any feedback you choose to give.',
  },
  {
    icon: Eye,
    title: 'Why',
    body: 'To personalise your learning path, and for our final-year research report on how students learn Java and DSA.',
  },
  {
    icon: ShieldCheck,
    title: 'Who sees it',
    body: 'Only the project team and our guide. In the report you appear as a code like P07 — never your name, email or USN.',
  },
  {
    // Not a research matter: every run of your code goes here, whatever you choose below.
    icon: Cpu,
    title: 'Where your code runs',
    body: 'To run your Java, SkillQuest sends the code (and the test inputs) to Paiza.IO, an outside code-running service. It gets the code only — not your name or email — and its own privacy policy applies. This happens whether or not you take part in the research, so keep personal details out of your code.',
  },
  {
    icon: Clock,
    title: 'How long we keep it',
    body: 'Deleted within 6 months of our project submission. Old code submissions are pruned sooner.',
  },
  {
    icon: HandHeart,
    title: 'Your choice',
    body: 'Taking part is voluntary. Every feature works either way, and you can withdraw at any time in Settings.',
  },
];

// Shown once, before onboarding, until the student answers the current version.
export function ConsentScreen({ version, onDone }: { version?: string; onDone: () => void }) {
  const [busy, setBusy] = useState<'agree' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(decision: 'agree' | 'decline') {
    setBusy(decision);
    setError(null);
    try {
      await api('/api/consent', { method: 'POST', body: { decision } });
      onDone();
    } catch {
      setError('Could not save your answer. Check your connection and try again.');
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <motion.main
        initial="hidden"
        animate="show"
        variants={stagger}
        className="relative mx-auto max-w-2xl px-4 py-10 sm:py-16"
      >
        <motion.div variants={rise} className="flex items-center gap-5">
          <Nova mood="idle" size={68} />
          <div>
            <p className="eyebrow text-ion">Before we begin</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Help us study how students learn
            </h1>
          </div>
        </motion.div>

        <motion.p variants={rise} className="mt-6 text-[15px] leading-relaxed text-content-muted">
          SkillQuest is a final-year project in the Department of AI &amp; DS, S.E.A College of Engineering &amp;
          Technology. Please read this short note, then choose whether to take part in the research.
        </motion.p>

        <motion.div variants={rise}>
          <GlassCard className="mt-6 p-6 sm:p-7">
            <ul className="space-y-5">
              {POINTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion-tint text-ion">
                    <Icon size={17} aria-hidden />
                  </span>
                  <div>
                    <p className="font-medium text-content">{title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-content-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </GlassCard>
        </motion.div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <motion.div variants={rise} className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => void answer('agree')} disabled={busy !== null}>
            {busy === 'agree' ? 'Saving…' : 'I agree to take part'}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => void answer('decline')} disabled={busy !== null}>
            {busy === 'decline' ? 'Saving…' : 'Use SkillQuest without taking part'}
          </Button>
        </motion.div>
        <motion.p variants={rise} className="mt-4 text-xs text-content-muted">
          Consent text version {version ?? 'v1'}. Questions? Ask the project team or our guide.
        </motion.p>
      </motion.main>
    </div>
  );
}
