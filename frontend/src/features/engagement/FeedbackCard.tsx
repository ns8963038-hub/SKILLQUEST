import { motion } from 'motion/react';
import { ArrowRight, MessageSquareHeart } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { Button } from '../../ui/primitives';

// GET /api/survey
export interface SurveyStatus {
  submitted: boolean;
  eligible: boolean; // has completed enough levels to judge the app
  completedLevels: number;
  minLevels: number;
}

// Invites the student to the UAT questionnaire (SUS + engagement) once they have
// used SkillQuest enough to judge it, and disappears after they answer.
export function FeedbackCard({ onOpen }: { onOpen: () => void }) {
  const { data } = useApi<SurveyStatus>('/api/survey');
  if (!data || data.submitted || !data.eligible) return null;

  return (
    <motion.section
      aria-label="Share your feedback"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 sm:flex-row sm:items-center sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-tint text-accent">
        <MessageSquareHeart size={22} aria-hidden />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="font-display text-lg font-semibold tracking-tight">How is SkillQuest working for you?</p>
        <p className="mt-0.5 text-sm text-content-muted">
          You’ve completed {data.completedLevels} levels — enough to judge it. Twelve quick questions, about two
          minutes. It shapes our final report.
        </p>
      </div>
      <Button variant="ghost" className="relative shrink-0" onClick={onOpen}>
        Give feedback <ArrowRight size={16} aria-hidden />
      </Button>
    </motion.section>
  );
}
