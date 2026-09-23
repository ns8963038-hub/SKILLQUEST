import { beforeEach, describe, expect, it } from 'vitest';
import { clearDrafts, loadDraft, saveDraft } from './drafts';

describe('code drafts on a shared computer', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps each student’s draft to themselves', () => {
    saveDraft('asha', 'loops-01', 'asha’s solution');
    expect(loadDraft('asha', 'loops-01')).toBe('asha’s solution');
    expect(loadDraft('ravi', 'loops-01')).toBeNull(); // the next student sees the starter code
  });

  it('never shows a draft saved under the old shared key, and deletes it', () => {
    window.localStorage.setItem('sq-code:loops-01', 'someone’s old solution');
    expect(loadDraft('ravi', 'loops-01')).toBeNull();
    expect(window.localStorage.getItem('sq-code:loops-01')).toBeNull();
  });

  it('clears every draft on sign-out, and nothing else', () => {
    saveDraft('asha', 'loops-01', 'a');
    saveDraft('asha', 'arrays-02', 'b');
    window.localStorage.setItem('sq-motion', 'off'); // a setting, not a draft
    clearDrafts();
    expect(loadDraft('asha', 'loops-01')).toBeNull();
    expect(loadDraft('asha', 'arrays-02')).toBeNull();
    expect(window.localStorage.getItem('sq-motion')).toBe('off');
  });
});
