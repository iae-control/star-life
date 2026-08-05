import { describe, expect, it } from 'vitest';

import { MAX_WEAPON_LEVEL, WEAPON_KEYS } from '../src/data';
import { cooldownFor, firePattern } from '../src/game/logic/weapons';

const rng = () => 0.5;

describe('firePattern', () => {
  it('max level is 10 (아이템제 강화 확장)', () => {
    expect(MAX_WEAPON_LEVEL).toBe(10);
  });

  it('pulse shot counts grow to 7 at Lv10', () => {
    const counts = [1, 2, 3, 4, 5, 5, 5, 6, 6, 7];
    for (let l = 1; l <= 10; l++) {
      expect(firePattern('pulse', l, 180, 500, 0, rng)).toHaveLength(counts[l - 1] ?? -1);
    }
  });

  it('missile (박설희): slow cooldown, splash on every shot', () => {
    const counts = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
    for (let l = 1; l <= 10; l++) {
      const shots = firePattern('missile', l, 180, 500, 0, rng);
      expect(shots).toHaveLength(counts[l - 1] ?? -1);
      expect(shots.every((s) => s.splash && s.splash.radius > 0 && s.splash.ratio > 0)).toBe(true);
    }
    // 공속이 느린 정체성: 최대 강화에도 펄스보다 느리다
    expect(cooldownFor('missile', 10)).toBeGreaterThan(cooldownFor('pulse', 10));
  });

  it('proton (어린지우) spread counts follow [1,2,3,3,4,5,5,6,7,8]', () => {
    const counts = [1, 2, 3, 3, 4, 5, 5, 6, 7, 8];
    for (let l = 1; l <= 10; l++) {
      expect(firePattern('proton', l, 180, 500, 0, rng)).toHaveLength(counts[l - 1] ?? -1);
    }
  });

  it('laser pierces (999), light pierces once, pulse/missile do not', () => {
    expect(firePattern('laser', 10, 180, 500, 0, rng).every((s) => s.pierce === 999)).toBe(true);
    expect(firePattern('light', 10, 180, 500, 0, rng).every((s) => s.pierce === 1)).toBe(true);
    expect(firePattern('pulse', 10, 180, 500, 0, rng).every((s) => s.pierce === 0)).toBe(true);
    expect(firePattern('missile', 10, 180, 500, 0, rng).every((s) => s.pierce === 0)).toBe(true);
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
      expect(cooldownFor(key, MAX_WEAPON_LEVEL)).toBeGreaterThan(0.009);
    }
  });
});
