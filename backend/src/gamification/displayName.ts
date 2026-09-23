// Display names on the leaderboard (PRD F7) are free text that everyone in the
// batch sees, so they are checked: a length cap, a plain character set, a small
// list of words that aren't allowed, and names that would pass as the team.
//
// Deliberately simple. Words are matched as WHOLE words after undoing common
// disguises (f*ck -> letters only, 5h1t -> shit), so ordinary names that happen
// to contain a short word ("Hassan", "Ashit") are never blocked. A few long,
// unambiguous words are also caught when spaced out ("f u c k").

export const DISPLAY_NAME_MAX = 24;

// Whole words that aren't allowed (English, Hindi and Kannada abuse).
const BLOCKED_WORDS = new Set([
  'ass', 'asshole', 'bastard', 'bitch', 'cunt', 'dick', 'fuck', 'fucker', 'fucking', 'shit', 'slut', 'whore',
  'sex', 'sexy', 'porn', 'nigger', 'nigga', 'faggot', 'retard',
  'chutiya', 'chutia', 'madarchod', 'bhenchod', 'behenchod', 'bhosdike', 'bsdk', 'gandu', 'lund', 'lavda', 'lauda',
  'harami', 'kutta', 'kamina', 'randi', 'bolimaga', 'sulemaga',
]);
// Long enough to be unambiguous even inside other letters, e.g. "f u c k".
const BLOCKED_ANYWHERE = ['fuck', 'bitch', 'cunt', 'asshole', 'madarchod', 'bhenchod', 'behenchod', 'chutiya', 'bhosdi', 'nigger', 'faggot', 'porn'];
// Names that would pass as the team or the app.
const RESERVED_WORDS = new Set(['admin', 'administrator', 'moderator', 'mod', 'skillquest', 'official', 'staff', 'support']);

// Undo the usual disguises: digits and symbols standing in for letters.
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}\s]/gu, ''); // drop anything that isn't a letter or a space
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

export function checkDisplayName(raw: string): NameCheck {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, reason: `Keep it to ${DISPLAY_NAME_MAX} characters.` };
  if (!/^[\p{L}\p{M}0-9 .'-]+$/u.test(name)) {
    return { ok: false, reason: 'Use letters, numbers, spaces and . \' - only.' };
  }
  if (!/\p{L}/u.test(name)) return { ok: false, reason: 'Include at least one letter.' };

  const words = normalise(name).split(' ').filter(Boolean);
  const squashed = words.join('');
  if (words.some((w) => BLOCKED_WORDS.has(w)) || BLOCKED_ANYWHERE.some((w) => squashed.includes(w))) {
    return { ok: false, reason: 'That name isn’t allowed on the leaderboard. Please choose another.' };
  }
  if (words.some((w) => RESERVED_WORDS.has(w))) {
    return { ok: false, reason: 'That name could be mistaken for the SkillQuest team. Please choose another.' };
  }
  return { ok: true, name };
}
