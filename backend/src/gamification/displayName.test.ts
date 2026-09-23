import { describe, expect, it } from 'vitest';
import { checkDisplayName } from './displayName';

const ok = (n: string) => checkDisplayName(n).ok;

describe('checkDisplayName', () => {
  it('accepts ordinary names, including ones that contain a short blocked word', () => {
    for (const n of ['Asha R', 'Bhanushree C.V', "D'Souza", 'Ravi-Kumar 2', 'Hassan', 'Ashit', 'Dickson', 'ಅನಿತಾ', 'प्रिया']) {
      expect(ok(n), n).toBe(true);
    }
  });

  it('trims and squeezes spaces', () => {
    expect(checkDisplayName('  Asha    R ')).toEqual({ ok: true, name: 'Asha R' });
  });

  it('refuses abuse, including disguised and spaced-out versions', () => {
    for (const n of ['shit', 'Big Sh1t', 'f u c k', 'FUCK123', 'b1tch please', 'chutiya', 'gandu', '5h1t']) {
      expect(ok(n), n).toBe(false);
    }
  });

  it('refuses names that would pass as the team', () => {
    expect(ok('Admin')).toBe(false);
    expect(ok('SkillQuest Official')).toBe(false);
  });

  it('refuses long names, odd characters and names with no letters', () => {
    expect(ok('A'.repeat(25))).toBe(false);
    expect(ok('<script>')).toBe(false);
    expect(ok('😀😀')).toBe(false);
    expect(ok('12345')).toBe(false);
  });
});
