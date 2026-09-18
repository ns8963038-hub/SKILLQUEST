import { describe, it, expect } from 'vitest';
import { HINT_COST, applyHintCost } from './hints';
import { earnsPlacementReady, PLACEMENT_READY_THRESHOLD } from './badges';
import { anonymousName, rankLeaderboard, xpFromEvents } from './leaderboard';

describe('hint cost', () => {
  it('deducts the hint cost from XP', () => {
    expect(applyHintCost(100)).toEqual({ newXp: 100 - HINT_COST, deducted: HINT_COST });
  });
  it('never takes XP below zero', () => {
    expect(applyHintCost(3)).toEqual({ newXp: 0, deducted: 3 });
    expect(applyHintCost(0)).toEqual({ newXp: 0, deducted: 0 });
  });
});

describe('Placement Ready badge rule', () => {
  it('needs one role at or above the threshold', () => {
    expect(earnsPlacementReady([40, PLACEMENT_READY_THRESHOLD])).toBe(true);
    expect(earnsPlacementReady([74, 60])).toBe(false);
    expect(earnsPlacementReady([])).toBe(false);
  });
});

describe('leaderboard ranking', () => {
  const e = (userId: string, xp: number, extra: Partial<{ name: string; optOut: boolean }> = {}) => ({
    userId,
    xp,
    name: extra.name ?? null,
    optOut: extra.optOut ?? false,
  });

  it('ranks by XP with shared ranks for ties', () => {
    const { top } = rankLeaderboard([e('a', 50), e('b', 120), e('c', 50), e('d', 10)], 'x');
    expect(top.map((r) => [r.rank, r.xp])).toEqual([
      [1, 120],
      [2, 50],
      [2, 50],
      [4, 10],
    ]);
  });

  it('hides opted-out students from others but shows them to themselves', () => {
    const entries = [e('a', 90, { optOut: true }), e('b', 40)];
    expect(rankLeaderboard(entries, 'b').top.map((r) => r.xp)).toEqual([40]);
    const mine = rankLeaderboard(entries, 'a');
    expect(mine.you?.xp).toBe(90);
    expect(mine.you?.isYou).toBe(true);
  });

  it('uses display names, else an anonymous handle — never an email', () => {
    const { top } = rankLeaderboard([e('11111111-2222-3333-4444-5555abcd', 10), e('b', 5, { name: 'Anu' })], 'x');
    expect(top[0]?.name).toBe('Quester ABCD');
    expect(top[1]?.name).toBe('Anu');
    expect(anonymousName('00000000-0000-0000-0000-00000000beef')).toBe('Quester BEEF');
  });

  it('keeps a zero-XP viewer on the board so they see where they stand', () => {
    const { you } = rankLeaderboard([e('a', 20), e('me', 0)], 'me');
    expect(you).toMatchObject({ rank: 2, xp: 0 });
  });
});

describe('weekly XP from the events log', () => {
  it('adds completions and subtracts what hints actually cost', () => {
    const xp = xpFromEvents(
      [
        { userId: 'a', type: 'level_complete', payload: { levelId: 'loops-01' } },
        { userId: 'a', type: 'hint_used', payload: { levelId: 'loops-02', xpCost: 5 } },
        { userId: 'b', type: 'hint_used', payload: { xpCost: 5 } },
        { userId: 'a', type: 'level_submit', payload: {} },
      ],
      new Map([['loops-01', 50]]),
    );
    expect(xp.get('a')).toBe(45);
    expect(xp.get('b')).toBe(0); // clamped: no negative weekly XP
  });
});
