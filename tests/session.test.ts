import { afterEach, describe, expect, it } from 'vitest';

import { DATA } from '../src/data';
import { WEAPON_KINDS } from '../src/game/logic/weapons';
import {
  cyclePilotWeapon,
  newSession,
  PILOT_ORDER,
  PILOT_WEAPON,
  PILOT_WEAPON_OPTIONS,
  resolveCatalogWeapon,
  resolvePilotWeapon,
  selectPilotWeapon,
  selectedPilotWeapon,
  setSessionWeapon,
} from '../src/game/session';

afterEach(() => {
  for (const pilot of PILOT_ORDER) selectPilotWeapon(pilot, PILOT_WEAPON[pilot]);
});

describe('pilot title-screen weapon options', () => {
  it('provides three valid defaults per pilot and exposes all eight core systems', () => {
    const accessible = new Set<string>();
    for (const pilot of PILOT_ORDER) {
      const options = PILOT_WEAPON_OPTIONS[pilot];
      expect(options).toHaveLength(3);
      expect(options[0]).toBe(PILOT_WEAPON[pilot]);
      expect(new Set(options).size).toBe(3);
      for (const weapon of options) {
        expect(DATA.weapons.weapons[weapon], `${pilot}:${weapon}`).toBeDefined();
        accessible.add(weapon);
      }
    }
    expect(accessible).toEqual(
      new Set(['pulse', 'vulcan', 'missile', 'proton', 'laser', 'light', 'rail', 'scatter']),
    );
  });

  it('falls back to the signature weapon for missing or incompatible title choices', () => {
    for (const pilot of PILOT_ORDER) {
      expect(resolvePilotWeapon(pilot, undefined)).toBe(PILOT_WEAPON[pilot]);
      expect(resolvePilotWeapon(pilot, 'not-a-weapon')).toBe(PILOT_WEAPON[pilot]);
    }
    expect(resolvePilotWeapon('jungjioo', 'light')).toBe('pulse');
  });

  it('cycles both directions and wraps across all three choices', () => {
    selectPilotWeapon('jungjioo', 'pulse');
    expect(cyclePilotWeapon('jungjioo', 1)).toBe('vulcan');
    expect(cyclePilotWeapon('jungjioo', 1)).toBe('rail');
    expect(cyclePilotWeapon('jungjioo', 1)).toBe('pulse');
    expect(cyclePilotWeapon('jungjioo', -1)).toBe('rail');
    expect(selectedPilotWeapon('jungjioo')).toBe('rail');
  });
});

describe('full catalogue loadout compatibility', () => {
  it('validates every catalogue key and rejects stale save keys', () => {
    for (const key of WEAPON_KINDS) expect(resolveCatalogWeapon(key, 'pulse')).toBe(key);
    expect(resolveCatalogWeapon('retired-weapon', 'pulse')).toBe('pulse');
    expect(resolveCatalogWeapon(null, 'rail')).toBe('rail');
  });

  it('starts title-selected and explicit 24-catalogue sessions compatibly', () => {
    selectPilotWeapon('youngjioo', 'light');
    const selected = newSession({ pilot: 'youngjioo' });
    expect(selected.pilot).toBe('youngjioo');
    expect(selected.cur).toBe('light');
    expect(selected.weapons).toEqual({ light: 1 });

    const custom = newSession({ pilot: 'youngjioo', weapon: 'rail_siege' });
    expect(custom.cur).toBe('rail_siege');
    expect(custom.weapons).toEqual({ rail_siege: 1 });

    const stale = newSession({ pilot: 'youngjioo', weapon: 'retired-weapon' });
    expect(stale.cur).toBe(PILOT_WEAPON.youngjioo);
  });

  it('equips any acquired weapon without losing its level and rejects invalid mutation', () => {
    const session = newSession({ pilot: 'jungjioo', weapon: 'pulse' });
    session.weapons.missile_torpedo = 4;

    expect(setSessionWeapon(session, 'missile_torpedo')).toBe('missile_torpedo');
    expect(session.cur).toBe('missile_torpedo');
    expect(session.weapons.missile_torpedo).toBe(4);

    expect(setSessionWeapon(session, 'scatter_shredder')).toBe('scatter_shredder');
    expect(session.weapons.scatter_shredder).toBe(1);

    const snapshot = { cur: session.cur, weapons: { ...session.weapons } };
    expect(setSessionWeapon(session, 'not-a-weapon')).toBeNull();
    expect({ cur: session.cur, weapons: session.weapons }).toEqual(snapshot);
  });

  it('keeps the equipped catalogue weapon through continue-style session mutation', () => {
    const session = newSession({ pilot: 'keunaebi', weapon: 'laser_cutter' });
    session.level = 4;
    session.levelWave = 2;
    expect(session.cur).toBe('laser_cutter');
    expect(session.weapons.laser_cutter).toBe(1);
  });
});
