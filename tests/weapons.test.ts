import { describe, expect, it } from 'vitest';

import { DATA, MAX_WEAPON_LEVEL, WEAPON_KEYS } from '../src/data';
import {
  WEAPON_KINDS,
  WEAPON_PROFILES,
  clampWeaponLevel,
  cooldownFor,
  firePattern,
  isWeaponKind,
  weaponMetrics,
  type WeaponArchetype,
  type WeaponKind,
} from '../src/game/logic/weapons';

const rng = () => 0.5;
const BASE_WEAPONS = [
  'pulse',
  'vulcan',
  'missile',
  'proton',
  'laser',
  'light',
  'rail',
  'scatter',
] as const;

const BENCHMARK_COUNTS: Readonly<Record<WeaponKind, readonly [number, number, number]>> = {
  pulse: [3, 5, 6],
  pulse_overdrive: [4, 6, 8],
  pulse_lattice: [2, 3, 5],
  vulcan: [1, 2, 3],
  vulcan_gatling: [2, 3, 4],
  vulcan_needle: [1, 2, 2],
  missile: [1, 2, 3],
  missile_swarm: [2, 3, 5],
  missile_torpedo: [1, 1, 1],
  proton: [1, 3, 5],
  proton_nova: [3, 5, 9],
  proton_comet: [1, 2, 3],
  laser: [1, 1, 2],
  laser_prism: [3, 4, 5],
  laser_cutter: [1, 1, 1],
  light: [1, 1, 1],
  light_storm: [2, 2, 3],
  light_judgment: [1, 1, 1],
  rail: [1, 1, 1],
  rail_splitter: [3, 3, 5],
  rail_siege: [1, 1, 1],
  scatter: [5, 7, 10],
  scatter_shredder: [9, 11, 15],
  scatter_slug: [3, 4, 5],
};

describe('24-weapon catalogue', () => {
  it('keeps three authored variants for each of eight archetypes', () => {
    expect(MAX_WEAPON_LEVEL).toBe(10);
    expect(WEAPON_KEYS).toEqual([...WEAPON_KINDS]);
    expect(WEAPON_KINDS).toHaveLength(24);

    const counts = new Map<WeaponArchetype, number>();
    for (const key of WEAPON_KINDS) {
      const archetype = WEAPON_PROFILES[key].archetype;
      counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
      expect(isWeaponKind(key)).toBe(true);
    }
    expect([...counts.values()]).toEqual(Array(8).fill(3));
    expect(isWeaponKind('not-a-weapon')).toBe(false);
  });

  it('keeps JSON identity, roles, and heat tuning data in sync with runtime profiles', () => {
    const bossRoles = new Set<string>();
    const mobRoles = new Set<string>();

    for (const key of WEAPON_KINDS) {
      const definition = DATA.weapons.weapons[key];
      const profile = WEAPON_PROFILES[key];
      expect(definition).toBeDefined();
      expect(profile.archetype).toBe(definition?.archetype);
      expect(profile.variant).toBe(definition?.variant);
      expect(profile.mechanic).toBe(definition?.mechanic);
      expect(profile.bossRole).toBe(definition?.roles.boss);
      expect(profile.mobRole).toBe(definition?.roles.mob);
      expect(profile.screenOccupancy).toBe(definition?.roles.screen);
      expect(profile.heat).toEqual(definition?.heat);
      expect(profile.heat.softCap).toBeLessThan(profile.heat.hardCap);
      expect(profile.heat.coolPerSecond).toBeGreaterThan(0);
      bossRoles.add(profile.bossRole);
      mobRoles.add(profile.mobRole);
    }

    // Every variant owns a combat role, instead of being a recoloured damage clone.
    expect(bossRoles.size).toBe(24);
    expect(mobRoles.size).toBe(24);
  });

  it('prices every non-starter primary and keeps variants in distinct economy bands', () => {
    expect(DATA.weapons.weapons.pulse?.price).toBe(0);
    for (const key of WEAPON_KINDS.filter((candidate) => candidate !== 'pulse')) {
      expect(DATA.weapons.weapons[key]?.price, key).toBeGreaterThan(0);
    }
    for (const archetype of BASE_WEAPONS) {
      const familyPrices = WEAPON_KINDS.filter(
        (key) => WEAPON_PROFILES[key].archetype === archetype,
      ).map((key) => DATA.weapons.weapons[key]!.price);
      expect(new Set(familyPrices).size, archetype).toBe(3);
    }
  });

  it('gives the eight core systems non-overlapping boss, mob, and screen jobs', () => {
    const profiles = BASE_WEAPONS.map((key) => WEAPON_PROFILES[key]);
    expect(new Set(profiles.map((profile) => profile.mechanic)).size).toBe(8);
    expect(new Set(profiles.map((profile) => profile.bossRole)).size).toBe(8);
    expect(new Set(profiles.map((profile) => profile.mobRole)).size).toBe(8);
    expect(new Set(profiles.map((profile) => profile.screenOccupancy)).size).toBe(8);
  });

  it('uses a distinct authored output, heat, and pattern signature within each family', () => {
    for (const archetype of BASE_WEAPONS) {
      const family = WEAPON_KINDS.filter((key) => WEAPON_PROFILES[key].archetype === archetype);
      const signatures = family.map((key) => {
        const def = DATA.weapons.weapons[key]!;
        const counts = [1, 5, 10].map((level) => firePattern(key, level, 0, 0, 0, rng).length);
        return `${def.pattern.type}:${counts.join('/')}:${def.cd.base}:${def.heat.perTrigger}`;
      });
      expect(new Set(signatures).size, archetype).toBe(3);
    }
  });
});

describe('level and balance semantics', () => {
  it('clamps every pattern and cooldown to Lv1..Lv10', () => {
    expect(clampWeaponLevel(Number.NaN)).toBe(1);
    expect(clampWeaponLevel(4.9)).toBe(4);
    expect(clampWeaponLevel(-20)).toBe(1);
    expect(clampWeaponLevel(99)).toBe(10);

    for (const key of WEAPON_KINDS) {
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

  it('treats cooldown base as Lv1 and remains positive at every level', () => {
    for (const key of WEAPON_KINDS) {
      expect(cooldownFor(key, 1)).toBe(DATA.weapons.weapons[key]?.cd.base);
      for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
        expect(cooldownFor(key, level), `${key}:Lv${level}`).toBeGreaterThan(0);
      }
    }
  });

  it('locks Lv1/Lv5/Lv10 projectile counts and a sane raw-output envelope', () => {
    const levels = [1, 5, 10] as const;
    for (const key of WEAPON_KINDS) {
      const metrics = levels.map((level) => weaponMetrics(key, level));
      expect(
        metrics.map((metric) => metric.shotCount),
        key,
      ).toEqual(BENCHMARK_COUNTS[key]);
      for (const metric of metrics) {
        expect(metric.rawDps, `${key}:Lv${metric.level}`).toBeGreaterThanOrEqual(10);
        expect(metric.rawDps, `${key}:Lv${metric.level}`).toBeLessThanOrEqual(150);
        expect(metric.projectilesPerSecond, `${key}:Lv${metric.level}`).toBeGreaterThan(0);
      }
      expect(metrics[1]!.rawDps, `${key}:Lv5 progression`).toBeGreaterThan(metrics[0]!.rawDps);
      expect(metrics[2]!.rawDps, `${key}:Lv10 progression`).toBeGreaterThan(metrics[1]!.rawDps);
    }
  });
});

describe('mechanic contracts copied to ShotSpec', () => {
  it('copies validated projectile and data-driven identity metadata to every shot', () => {
    for (const key of WEAPON_KINDS) {
      const definition = DATA.weapons.weapons[key]!;
      const shots = firePattern(key, 5, 180, 500, 1, rng);
      expect(shots.length).toBeGreaterThan(0);
      for (const shot of shots) {
        expect(shot.damageType).toBe(definition.bullet.damageType);
        expect(shot.impactFx).toBe(definition.bullet.impactFx);
        expect(shot.rotateToVelocity).toBe(definition.bullet.rotateToVelocity);
        expect(shot.archetype).toBe(definition.archetype);
        expect(shot.variant).toBe(definition.variant);
        expect(shot.mechanic).toBe(definition.mechanic);
        expect(shot.heat).toEqual(definition.heat);
        expect(shot.vy).toBeLessThan(0);
      }
    }
  });

  it('emits one executable metadata contract for each of the eight systems', () => {
    for (const key of WEAPON_KINDS) {
      const profile = WEAPON_PROFILES[key];
      const shots = firePattern(key, 10, 180, 500, 2, rng);
      for (const shot of shots) {
        if (profile.archetype === 'pulse') {
          expect(shot.burst).toMatchObject({ count: shots.length });
          expect(shot.spawnDelay).toBeGreaterThanOrEqual(0);
        } else if (profile.archetype === 'vulcan') {
          expect(shot.spin?.rpm).toBeGreaterThan(0);
          expect(shot.spin?.barrel).toBeGreaterThanOrEqual(0);
        } else if (profile.archetype === 'missile') {
          expect(shot.guidance?.turnRate).toBeGreaterThan(0);
          expect(shot.trail?.texture).toBe('engine-flame');
          expect(shot.lock?.clusterCount).toBeGreaterThan(1);
        } else if (profile.archetype === 'proton') {
          expect(shot.expansion?.endScale).toBeGreaterThan(shot.expansion?.startScale ?? 0);
          expect(shot.expansion?.maxRadius).toBeGreaterThan(0);
        } else if (profile.archetype === 'laser') {
          expect(shot.beam?.duration).toBeGreaterThan(shot.beam?.tickEvery ?? Infinity);
          expect(shot.beam?.dps).toBeGreaterThan(0);
        } else if (profile.archetype === 'light') {
          expect(shot.chain?.instant).toBe(true);
          expect(shot.chain?.maxTargets).toBeGreaterThan(1);
        } else if (profile.archetype === 'rail') {
          expect(shot.charge?.chargeTime).toBeGreaterThan(0);
          expect(shot.charge?.recovery).toBeGreaterThan(0);
          expect(shot.charge?.partMultiplier).toBeGreaterThan(1);
        } else {
          expect(shot.range?.optimal).toBeLessThan(shot.range?.max ?? 0);
          expect(shot.range?.farMultiplier).toBeLessThan(0.5);
        }
      }
    }
  });

  it('preserves the defining tactical extremes', () => {
    expect(weaponMetrics('vulcan_gatling', 10).projectilesPerSecond).toBeGreaterThan(70);
    expect(firePattern('missile_torpedo', 10, 180, 500, 0, rng)[0]?.splash?.radius).toBeGreaterThan(
      80,
    );
    expect(firePattern('laser_cutter', 10, 180, 500, 0, rng)[0]?.pierce).toBeGreaterThanOrEqual(8);
    expect(firePattern('rail_siege', 10, 180, 500, 0, rng)[0]?.charge?.chargeTime).toBeGreaterThan(
      0.8,
    );
    expect(firePattern('scatter_shredder', 10, 180, 500, 0, rng)).toHaveLength(15);
  });
});
