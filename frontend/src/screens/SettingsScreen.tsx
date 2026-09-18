import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Check, Lock, Target, User } from 'lucide-react';
import { api } from '../lib/api';
import { invalidate, useApi } from '../lib/useApi';
import { cn } from '../lib/cn';
import { Nova } from '../ui/Nova';
import { Button, ErrorState, GlassCard, PageHeader, Skeleton, Switch, rise, stagger } from '../ui/primitives';

// The shape of GET/PUT /api/settings.
interface Settings {
  email: string;
  displayName: string | null;
  hoursPerWeek: number;
  goalText: string;
  goalCategory: string | null;
  targetCompanies: string[];
  leaderboardOptOut: boolean;
  researchParticipating: boolean;
  companies: { id: string; name: string }[];
}

interface SaveResult extends Settings {
  replanned: boolean;
  weeks: number | null;
  plannedSkills: number | null;
}

const inputClass =
  'w-full min-h-[46px] rounded-xl border border-line-strong bg-base/60 px-4 text-[15px] text-content placeholder:text-content-muted ' +
  'transition-[border-color,box-shadow] duration-200 focus:border-ion/60 focus:shadow-[0_0_0_4px_rgba(127,168,255,0.14)] focus:outline-none focus-visible:outline-none';

// The editable part of the settings, for "has anything changed?".
function editable(s: Settings) {
  return {
    displayName: s.displayName ?? '',
    hoursPerWeek: s.hoursPerWeek,
    goalText: s.goalText,
    targetCompanies: [...s.targetCompanies].sort(),
    leaderboardOptOut: s.leaderboardOptOut,
    researchParticipating: s.researchParticipating,
  };
}

// SETTINGS: display name, weekly hours + goal (changing either RE-PLANS the
// roadmap — PRD F2), target companies, leaderboard visibility, and research
// participation (withdraw at any time — Backend Schema §5.1).
export function SettingsScreen() {
  const { data, error, reload } = useApi<Settings>('/api/settings');
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'mint' | 'rose'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
      setSaved(data);
    }
  }, [data]);

  if (error) return <ErrorState message="Could not load your settings." onRetry={reload} />;
  if (!form || !saved) return <Skeleton className="h-[520px] rounded-3xl" />;

  const dirty = JSON.stringify(editable(form)) !== JSON.stringify(editable(saved));
  const planChanged = form.hoursPerWeek !== saved.hoursPerWeek || form.goalText.trim() !== saved.goalText.trim();
  const update = (patch: Partial<Settings>) => setForm({ ...form, ...patch });

  async function save() {
    if (!form) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await api<SaveResult>('/api/settings', {
        method: 'PUT',
        body: {
          displayName: form.displayName?.trim() || null,
          hoursPerWeek: form.hoursPerWeek,
          goalText: form.goalText,
          targetCompanies: form.targetCompanies,
          leaderboardOptOut: form.leaderboardOptOut,
          researchParticipation: form.researchParticipating,
        },
      });
      setForm(res);
      setSaved(res);
      invalidate('/api/'); // roadmap, dashboard and placement may all have changed
      setNotice({
        tone: 'mint',
        text: res.replanned
          ? `Saved. Your roadmap was re-planned: ${res.plannedSkills} skills over ${res.weeks} weeks. Everything you've completed is kept.`
          : 'Saved.',
      });
    } catch {
      setNotice({ tone: 'rose', text: 'Could not save. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  const toggleCompany = (id: string) =>
    update({
      targetCompanies: form.targetCompanies.includes(id)
        ? form.targetCompanies.filter((c) => c !== id)
        : [...form.targetCompanies, id],
    });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Settings" title="Your preferences" description={`Signed in as ${form.email}`} />

      <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-5">
        {/* ---- Profile ---- */}
        <motion.div variants={rise}>
          <GlassCard className="p-6">
            <SectionTitle icon={User} title="Profile" />
            <label htmlFor="display-name" className="mb-2 mt-5 block text-sm font-medium">
              Display name
            </label>
            <input
              id="display-name"
              className={inputClass}
              maxLength={40}
              value={form.displayName ?? ''}
              onChange={(e) => update({ displayName: e.target.value })}
              placeholder="Shown on the leaderboard — leave blank to stay anonymous"
            />
          </GlassCard>
        </motion.div>

        {/* ---- Study plan ---- */}
        <motion.div variants={rise}>
          <GlassCard className="p-6">
            <SectionTitle icon={CalendarClock} title="Study plan" />
            <p className="mt-1.5 text-sm text-content-muted">
              Changing your weekly time or goal re-plans your roadmap. Progress you’ve made is always kept.
            </p>
            <div className="mt-5 flex items-end gap-3">
              <span className="text-gradient-ion font-display text-5xl font-semibold leading-none">{form.hoursPerWeek}</span>
              <span className="pb-1 text-content-muted">hours / week</span>
            </div>
            <label htmlFor="hours" className="sr-only">
              Hours per week
            </label>
            <input
              id="hours"
              type="range"
              min={1}
              max={40}
              value={form.hoursPerWeek}
              onChange={(e) => update({ hoursPerWeek: Number(e.target.value) })}
              className="mt-4 w-full"
            />
            <label htmlFor="goal" className="mb-2 mt-6 block text-sm font-medium">
              Your goal
            </label>
            <textarea
              id="goal"
              rows={3}
              className={cn(inputClass, 'min-h-[96px] py-3 leading-relaxed')}
              value={form.goalText}
              onChange={(e) => update({ goalText: e.target.value })}
              placeholder="e.g. Crack the Infosys and TCS coding rounds"
            />
            {planChanged && (
              <p className="mt-3 text-xs text-ember">Saving will re-plan your roadmap.</p>
            )}
          </GlassCard>
        </motion.div>

        {/* ---- Target companies ---- */}
        <motion.div variants={rise}>
          <GlassCard className="p-6">
            <SectionTitle icon={Target} title="Target companies" />
            <p className="mt-1.5 text-sm text-content-muted">Placement readiness tracks your coverage for these.</p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Target companies">
              {form.companies.map((c) => {
                const on = form.targetCompanies.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCompany(c.id)}
                    className={cn(
                      'inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-sm transition-colors',
                      on
                        ? 'border-ion/50 bg-ion-tint text-content'
                        : 'border-line bg-surface-2/60 text-content-muted hover:border-ion/30 hover:text-content',
                    )}
                  >
                    {on && <Check size={14} className="text-ion" aria-hidden />}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>

        {/* ---- Privacy ---- */}
        <motion.div variants={rise}>
          <GlassCard className="space-y-6 p-6">
            <SectionTitle icon={Lock} title="Privacy" />
            <Switch
              id="leaderboard"
              checked={!form.leaderboardOptOut}
              onChange={(on) => update({ leaderboardOptOut: !on })}
              label="Show me on the leaderboard"
              description="Others see your display name (or an anonymous handle) and XP. You always see your own rank."
            />
            <Switch
              id="research"
              checked={form.researchParticipating}
              onChange={(on) => update({ researchParticipating: on })}
              label="Take part in the research"
              description={
                form.researchParticipating
                  ? 'Your anonymised activity helps our final-year report. Turn this off to withdraw at any time.'
                  : "You've withdrawn: your data is excluded from every analysis and export. Every feature still works."
              }
            />
          </GlassCard>
        </motion.div>

        {/* ---- Save ---- */}
        <motion.div variants={rise} className="flex flex-wrap items-center gap-4 pb-4">
          <Button size="lg" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <AnimatePresence>
            {notice && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'flex max-w-xl items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm',
                  notice.tone === 'mint'
                    ? 'border-success/25 bg-success-tint text-success'
                    : 'border-danger/25 bg-danger-tint text-danger',
                )}
              >
                <Nova mood={notice.tone === 'mint' ? 'happy' : 'concerned'} size={30} />
                {notice.text}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof User; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
      <Icon size={18} className="text-ion" aria-hidden />
      {title}
    </h2>
  );
}
