import { afterEach, describe, expect, it } from 'vitest';

import { DATA } from '../src/data';
import {
  cyclePilotWeapon,
  newSession,
  PILOT_ORDER,
  PILOT_WEAPON,
  PILOT_WEAPON_OPTIONS,
  resolvePilotWeapon,
  selectPilotWeapon,
  selectedPilotWeapon,
} from '../src/game/session';

afterEach(() => {
  for (const pilot of PILOT_ORDER) selectPilotWeapon(pilot, PILOT_WEAPON[pilot]);
});

describe('pilot primary weapon options', () => {
  it('provides two valid weapons per pilot and keeps the signature first', () => {
    const accessible = new Set<string>();
    for (const pilot of PILOT_ORDER) {
      const options = PILOT_WEAPON_OPTIONS[pilot];
      expect(options).toHaveLength(2);
      expect(options[0]).toBe(PILOT_WEAPON[pilot]);
      expect(new Set(options).size).toBe(2);
      for (const weapon of options) {
        expect(DATA.weapons.weapons[weapon], `${pilot}:${weapon}`).toBeDefined();
        accessible.add(weapon);
      }
    }
    expect(accessible).toEqual(new Set(['pulse', 'vulcan', 'proton', 'light', 'laser', 'missile']));
  });

  it('falls back to the old signature weapon for missing or incompatible saved choices', () => {
    for (const pilot of PILOT_ORDER) {
      expect(resolvePilotWeapon(pilot, undefined)).toBe(PILOT_WEAPON[pilot]);
      expect(resolvePilotWeapon(pilot, 'not-a-weapon')).toBe(PILOT_WEAPON[pilot]);
    }
    expect(resolvePilotWeapon('jungjioo', 'light')).toBe('pulse');
  });

  it('cycles both directions within the current pilot loadout', () => {
    selectPilotWeapon('jungjioo', 'pulse');
    expect(cyclePilotWeapon('jungjioo', 1)).toBe('vulcan');
    expect(selectedPilotWeapon('jungjioo')).toBe('vulcan');
    expect(cyclePilotWeapon('jungjioo', -1)).toBe('pulse');
  });
});

describe('newSession weapon compatibility', () => {
  it('starts new and continue-style sessions with the selected alternate weapon', () => {
    selectPilotWeapon('youngjioo', 'light');
    const session = newSession({ pilot: 'youngjioo' });
    expect(session.pilot).toBe('youngjioo');
    expect(session.cur).toBe('light');
    expect(session.weapons).toEqual({ light: 1 });

    // TitleScene의 이어하기도 같은 세션을 만든 뒤 level만 조정한다.
    session.level = 4;
    expect(session.cur).toBe('light');
    expect(session.weapons.light).toBe(1);
  });

  it('supports an explicit valid weapon and rejects an incompatible one', () => {
    expect(newSession({ pilot: 'keunaebi', weapon: 'vulcan' }).cur).toBe('vulcan');
    expect(newSession({ pilot: 'keunaebi', weapon: 'light' }).cur).toBe('laser');
  });
});
