import { Award, Brain, Flame, Trophy, type LucideIcon } from 'lucide-react';

// Badges are drawn as gold medallions with a line icon, not emoji — emoji render
// inconsistently across devices and read as cheap. Unknown badges fall back to Award.
const ICONS: Record<string, LucideIcon> = {
  first_quest: Trophy,
  code_master: Brain,
  week_warrior: Flame,
};

export function badgeIcon(id: string): LucideIcon {
  return ICONS[id] ?? Award;
}
