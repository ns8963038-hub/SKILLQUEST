// Unsubmitted code, kept in the browser so a refresh or dropped connection never
// loses work (UI doc §8).
//
// Drafts are stored PER STUDENT (`sq-code:<userId>:<levelId>`) and all of them
// are removed on sign-out. College lab computers are shared: with one key per
// level, the next student to open a level saw the previous student's solution.
// Drafts saved under the old shared key (`sq-code:<levelId>`) can't be traced to
// anyone, so they are never shown — only deleted.

const PREFIX = 'sq-code:';
const key = (userId: string, levelId: string) => `${PREFIX}${userId}:${levelId}`;

// Every storage call is guarded: storage can be blocked (private mode, policy).
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadDraft(userId: string, levelId: string): string | null {
  return attempt(() => {
    window.localStorage.removeItem(`${PREFIX}${levelId}`); // an old shared draft: whose, we can't tell
    return window.localStorage.getItem(key(userId, levelId));
  }, null);
}

export function saveDraft(userId: string, levelId: string, code: string): void {
  attempt(() => window.localStorage.setItem(key(userId, levelId), code), undefined);
}

// Remove every draft in this browser (called on sign-out).
export function clearDrafts(): void {
  attempt(() => {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
    for (const k of keys) if (k?.startsWith(PREFIX)) window.localStorage.removeItem(k);
  }, undefined);
}
