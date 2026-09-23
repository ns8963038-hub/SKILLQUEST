// Where the browser keeps the student's sign-in (Supabase's session).
//
// By default it stays in localStorage, so a student stays signed in on their own
// phone or laptop. On a SHARED computer (a college lab) that is a problem: if a
// student closes the tab without signing out, the next student opens SkillQuest
// already signed in as them. So the sign-in screen has a "This is a shared
// computer" box: with it ticked, the sign-in is kept in sessionStorage instead,
// which the browser throws away when the tab is closed.
//
// The choice itself is remembered on the computer (so the next student on the
// lab PC sees the box already ticked). Free of imports, so tests can use it.

const SHARED_FLAG = 'sq-shared-device';

// Every storage call is guarded: storage can be blocked (private mode, policy).
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function isSharedComputer(): boolean {
  return attempt(() => window.localStorage.getItem(SHARED_FLAG) === '1', false);
}

export function setSharedComputer(shared: boolean): void {
  attempt(() => {
    if (shared) window.localStorage.setItem(SHARED_FLAG, '1');
    else window.localStorage.removeItem(SHARED_FLAG);
  }, undefined);
}

const store = () => (isSharedComputer() ? window.sessionStorage : window.localStorage);

// The storage adapter handed to the Supabase client.
export const authStorage = {
  getItem: (key: string): string | null => attempt(() => store().getItem(key), null),
  setItem: (key: string, value: string): void => attempt(() => store().setItem(key, value), undefined),
  // Remove from both, so switching modes never leaves a copy behind.
  removeItem: (key: string): void =>
    attempt(() => {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }, undefined),
};
