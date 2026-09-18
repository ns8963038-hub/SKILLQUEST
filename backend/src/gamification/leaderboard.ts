// Leaderboard logic (PRD F7). Pure functions: the route fetches rows, these rank
// them — so ranking, ties, privacy and weekly-XP maths are all unit-tested.

export interface LeaderboardEntry {
  userId: string;
  name: string | null; // the student's chosen display name, if any
  xp: number;
  optOut: boolean; // hidden from everyone else's leaderboard
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  xp: number;
  isYou: boolean;
}

// A friendly, stable pseudonym for students without a display name. Never an
// email or real name — the leaderboard is visible to every student.
export function anonymousName(userId: string): string {
  const tag = userId.replace(/-/g, '').slice(-4).toUpperCase();
  return `Quester ${tag}`;
}

/**
 * Rank students by XP. Ties share a rank ("1, 2, 2, 4"). Opted-out students are
 * hidden from others but always see themselves; students with no XP are left
 * off (except the viewer, so they can see where they stand).
 */
export function rankLeaderboard(
  entries: LeaderboardEntry[],
  viewerId: string,
  limit = 20,
): { top: LeaderboardRow[]; you: LeaderboardRow | null } {
  const visible = entries.filter(
    (e) => e.userId === viewerId || (!e.optOut && e.xp > 0),
  );
  // Highest XP first; a stable tiebreak so the order never flickers.
  const sorted = [...visible].sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));

  let rank = 0;
  let previousXp: number | null = null;
  const rows = sorted.map((e, i) => {
    if (e.xp !== previousXp) {
      rank = i + 1;
      previousXp = e.xp;
    }
    return {
      rank,
      name: e.name?.trim() || anonymousName(e.userId),
      xp: e.xp,
      isYou: e.userId === viewerId,
    };
  });

  return { top: rows.slice(0, limit), you: rows.find((r) => r.isYou) ?? null };
}

// One XP-relevant event from the events log.
export interface XpEvent {
  userId: string;
  type: string;
  payload: unknown;
}

/**
 * XP earned in a period, rebuilt from the events log: + the level's XP for each
 * first-time completion, − the XP actually deducted for each hint. Never below 0.
 */
export function xpFromEvents(events: XpEvent[], xpByLevel: Map<string, number>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) {
    const payload = (e.payload ?? {}) as { levelId?: unknown; xpCost?: unknown };
    let delta = 0;
    if (e.type === 'level_complete' && typeof payload.levelId === 'string') {
      delta = xpByLevel.get(payload.levelId) ?? 0;
    } else if (e.type === 'hint_used' && typeof payload.xpCost === 'number') {
      delta = -payload.xpCost;
    }
    totals.set(e.userId, (totals.get(e.userId) ?? 0) + delta);
  }
  for (const [id, xp] of totals) totals.set(id, Math.max(0, xp));
  return totals;
}
