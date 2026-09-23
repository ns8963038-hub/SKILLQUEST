import { beforeEach, describe, expect, it } from 'vitest';
import { authStorage, isSharedComputer, setSharedComputer } from './authStorage';

const KEY = 'sb-project-auth-token';

describe('authStorage (where the sign-in is kept)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('keeps the sign-in across visits on a personal device (localStorage)', () => {
    authStorage.setItem(KEY, 'session');
    expect(window.localStorage.getItem(KEY)).toBe('session');
    expect(authStorage.getItem(KEY)).toBe('session');
  });

  it('on a shared computer keeps it only for this tab (sessionStorage), so closing the tab signs out', () => {
    setSharedComputer(true);
    authStorage.setItem(KEY, 'session');
    expect(window.sessionStorage.getItem(KEY)).toBe('session');
    expect(window.localStorage.getItem(KEY)).toBeNull(); // nothing left for the next student
    window.sessionStorage.clear(); // the tab is closed
    expect(authStorage.getItem(KEY)).toBeNull();
  });

  it('remembers the shared-computer choice on that computer, and signing out clears both stores', () => {
    setSharedComputer(true);
    expect(isSharedComputer()).toBe(true);
    window.localStorage.setItem(KEY, 'old');
    window.sessionStorage.setItem(KEY, 'new');
    authStorage.removeItem(KEY);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    setSharedComputer(false);
    expect(isSharedComputer()).toBe(false);
  });
});
