import { describe, expect, it } from 'vitest';

import { MAX_WEAPON_LEVEL, WEAPON_KEYS, WEAPONS } from '../src/game/logic/balance';
import { firePattern } from '../src/game/logic/weapons';

const rng = () => 0.5;

describe('firePattern', () => {
  it('pulse shot counts per level match the demo (1,2,3,4,5,7)', () => {
    const counts = [1, 2, 3, 4, 5, 7];
    for (let l = 1; l <= 6; l++) {
      expect(firePattern('pulse', l, 180, 500, 0, rng)).toHaveLength(counts[l - 1] ?? -1);
    }
  });

  it('vulcan stream counts follow [1,1,2,2,3,3]', () => {
    const counts = [1, 1, 2, 2, 3, 3];
    for (let l = 1; l <= 6; l++) {
      expect(firePattern('vulcan', l, 180, 500, 0, rng)).toHaveLength(counts[l - 1] ?? -1);
    }
  });

  it('proton spread counts follow [2,3,3,4,5,6]', () => {
    const counts = [2, 3, 3, 4, 5, 6];
    for (let l = 1; l <= 6; l++) {
      expect(firePattern('proton', l, 180, 500, 0, rng)).toHaveLength(counts[l - 1] ?? -1);
    }
  });

  it('laser pierces (999), light pierces once, pulse does not', () => {
    expect(firePattern('laser', 6, 180, 500, 0, rng).every((s) => s.pierce === 999)).toBe(true);
    expect(firePattern('light', 6, 180, 500, 0, rng).every((s) => s.pierce === 1)).toBe(true);
    expect(firePattern('pulse', 6, 180, 500, 0, rng).every((s) => s.pierce === 0)).toBe(true);
  });

  it('all shots travel upward (vy < 0)', () => {
    for (const key of WEAPON_KEYS) {
      for (let l = 1; l <= MAX_WEAPON_LEVEL; l++) {
        expect(firePattern(key, l, 180, 500, 0, rng).every((s) => s.vy < 0)).toBe(true);
      }
    }
  });
});

describe('weapon cooldowns', () => {
  it('remain positive at max level', () => {
    for (const key of WEAPON_KEYS) {
      expect(WEAPONS[key].cd(MAX_WEAPON_LEVEL)).toBeGreaterThan(0.01);
    }
  });
});
