import { describe, expect, it } from 'vitest';

import { DATA, MAX_WEAPON_LEVEL, WEAPON_KEYS } from '../src/data';
import { cooldownFor, firePattern } from '../src/game/logic/weapons';

const rng = () => 0.5;
const ACTIVE_WEAPONS = ['pulse', 'missile', 'proton', 'laser'] as const;

function rawDps(kind: string, level: number): number {
  const volley = firePattern(kind, level, 180, 500, 0, rng).reduce(
    (total, shot) => total + shot.dmg,
    0,
  );
  return volley / cooldownFor(kind, level);
}

describe('firePattern', () => {
  it('preserves all six weapon keys and ten upgrade levels', () => {
    expect(MAX_WEAPON_LEVEL).toBe(10);
    expect(WEAPON_KEYS).toEqual(['pulse', 'vulcan', 'proton', 'light', 'laser', 'missile']);
  });

  it('pulse shot counts grow to 7 at Lv10', () => {
    const counts = [1, 2, 3, 4, 5, 5, 5, 6, 6, 7];
    for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
      expect(firePattern('pulse', level, 180, 500, 0, rng)).toHaveLength(counts[level - 1] ?? -1);
    }
  });

  it('missile keeps its salvo counts and splash profile', () => {
    const counts = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
    for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
      const shots = firePattern('missile', level, 180, 500, 0, rng);
      expect(shots).toHaveLength(counts[level - 1] ?? -1);
      expect(shots.every((shot) => shot.splash && shot.splash.radius > 0)).toBe(true);
    }
    expect(cooldownFor('missile', 10)).toBeGreaterThan(cooldownFor('pulse', 10));
  });

  it('proton spread keeps [1,2,3,3,4,5,5,6,7,8] pellets', () => {
    const counts = [1, 2, 3, 3, 4, 5, 5, 6, 7, 8];
    for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
      expect(firePattern('proton', level, 180, 500, 0, rng)).toHaveLength(counts[level - 1] ?? -1);
    }
  });

  it('uses bounded penetration values', () => {
    expect(firePattern('laser', 10, 180, 500, 0, rng).every((shot) => shot.pierce === 3)).toBe(
      true,
    );
    expect(firePattern('light', 10, 180, 500, 0, rng).every((shot) => shot.pierce === 1)).toBe(
      true,
    );
    expect(firePattern('pulse', 10, 180, 500, 0, rng).every((shot) => shot.pierce === 0)).toBe(
      true,
    );
    expect(firePattern('missile', 10, 180, 500, 0, rng).every((shot) => shot.pierce === 0)).toBe(
      true,
    );
  });

  it('all shots travel upward', () => {
    for (const key of WEAPON_KEYS) {
      for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
        expect(firePattern(key, level, 180, 500, 0, rng).every((shot) => shot.vy < 0)).toBe(true);
      }
    }
  });
});

describe('weapon level semantics', () => {
  it('clamps fire patterns and cooldowns to Lv1..Lv10', () => {
    for (const key of WEAPON_KEYS) {
      expect(firePattern(key, -20, 180, 500, 0, rng)).toEqual(
        firePattern(key, 1, 180, 500, 0, rng),
      );
      expect(firePattern(key, 99, 180, 500, 0, rng)).toEqual(
        firePattern(key, MAX_WEAPON_LEVEL, 180, 500, 0, rng),
      );
      expect(cooldownFor(key, -20)).toBe(cooldownFor(key, 1));
      expect(cooldownFor(key, 99)).toBe(cooldownFor(key, MAX_WEAPON_LEVEL));
    }
  });

  it('treats cooldown base as the Lv1 value and stays positive', () => {
    for (const key of WEAPON_KEYS) {
      expect(cooldownFor(key, 1)).toBe(DATA.weapons.weapons[key]?.cd.base);
      for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
        expect(cooldownFor(key, level)).toBeGreaterThan(0);
      }
    }
  });
});

describe('projectile metadata', () => {
  it('copies a distinct validated profile onto every weapon shot', () => {
    const profiles = new Set<string>();
    for (const key of WEAPON_KEYS) {
      const definition = DATA.weapons.weapons[key];
      const shots = firePattern(key, 5, 180, 500, 0, rng);
      expect(definition).toBeDefined();
      expect(shots.length).toBeGreaterThan(0);
      for (const shot of shots) {
        expect(shot.damageType).toBe(definition?.bullet.damageType);
        expect(shot.impactFx).toBe(definition?.bullet.impactFx);
        expect(shot.rotateToVelocity).toBe(definition?.bullet.rotateToVelocity);
      }
      profiles.add(
        `${definition?.bullet.damageType}:${definition?.bullet.impactFx}:${definition?.bullet.rotateToVelocity}`,
      );
    }
    expect(profiles.size).toBe(6);
  });

  it('gives every missile guidance and an exhaust trail', () => {
    const shots = firePattern('missile', 10, 180, 500, 0, rng);
    for (const shot of shots) {
      expect(shot.guidance).toMatchObject({
        speed: expect.any(Number),
        turnRate: expect.any(Number),
        acquireRadius: expect.any(Number),
        armingTime: expect.any(Number),
      });
      expect(shot.guidance?.speed).toBeGreaterThan(0);
      expect(shot.guidance?.turnRate).toBeGreaterThan(0);
      expect(shot.trail).toMatchObject({ texture: 'engine-flame' });
      expect(shot.trail?.interval).toBeGreaterThan(0);
      expect(shot.trail?.scale).toBeGreaterThan(0);
    }
  });
});

describe('aggregate raw weapon balance', () => {
  it.each([
    [1, 9, 25],
    [10, 90, 230],
  ] as const)('keeps active weapon Lv%i DPS within %i..%i', (level, min, max) => {
    const values = ACTIVE_WEAPONS.map((key) => rawDps(key, level));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    }
    expect(Math.max(...values) / Math.min(...values)).toBeLessThanOrEqual(2.5);
  });
});
