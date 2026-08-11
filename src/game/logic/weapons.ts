// Pure, data-driven primary-weapon logic. Runtime scenes may progressively opt in to the
// mechanic metadata below while legacy equipment shots keep using the shared ShotSpec shape.
import { DATA } from '../../data';

export const WEAPON_KINDS = [
  'pulse',
  'pulse_overdrive',
  'pulse_lattice',
  'vulcan',
  'vulcan_gatling',
  'vulcan_needle',
  'missile',
  'missile_swarm',
  'missile_torpedo',
  'proton',
  'proton_nova',
  'proton_comet',
  'laser',
  'laser_prism',
  'laser_cutter',
  'light',
  'light_storm',
  'light_judgment',
  'rail',
  'rail_splitter',
  'rail_siege',
  'scatter',
  'scatter_shredder',
  'scatter_slug',
] as const;

export type WeaponKind = (typeof WEAPON_KINDS)[number];
export type DamageType = 'kinetic' | 'energy' | 'plasma' | 'electric' | 'explosive';
export type ImpactFx = 'spark' | 'pulse' | 'plasma' | 'arc' | 'scorch' | 'blast';
export type WeaponMechanic =
  | 'capacitor-burst'
  | 'rotary-spin'
  | 'lock-cluster'
  | 'expanding-plasma'
  | 'sustained-beam'
  | 'chain-lightning'
  | 'charged-rail'
  | 'close-scatter';

export type WeaponArchetype =
  'pulse' | 'vulcan' | 'missile' | 'proton' | 'laser' | 'light' | 'rail' | 'scatter';

export type ScreenOccupancy =
  | 'rhythmic-burst'
  | 'dense-stream'
  | 'sparse-homing'
  | 'growing-orbs'
  | 'continuous-lane'
  | 'single-flash'
  | 'single-lance'
  | 'close-cone';

export interface WeaponProfile {
  archetype: WeaponArchetype;
  variant: string;
  mechanic: WeaponMechanic;
  bossRole: string;
  mobRole: string;
  screenOccupancy: ScreenOccupancy;
  heat: HeatSpec;
}

export interface HeatSpec {
  perTrigger: number;
  coolPerSecond: number;
  softCap: number;
  hardCap: 1;
  lockout: number;
  hotOutputMultiplier: number;
  hotSpreadMultiplier: number;
}

const heat = (
  perTrigger: number,
  coolPerSecond: number,
  softCap: number,
  lockout: number,
  hotOutputMultiplier: number,
  hotSpreadMultiplier: number,
): HeatSpec => ({
  perTrigger,
  coolPerSecond,
  softCap,
  hardCap: 1,
  lockout,
  hotOutputMultiplier,
  hotSpreadMultiplier,
});

/** Deliberately unique combat jobs: no two weapons solve the same boss and crowd problem. */
export const WEAPON_PROFILES: Readonly<Record<WeaponKind, WeaponProfile>> = {
  pulse: {
    archetype: 'pulse',
    variant: 'capacitor',
    mechanic: 'capacitor-burst',
    bossRole: 'reliable-window-burst',
    mobRole: 'formation-pick',
    screenOccupancy: 'rhythmic-burst',
    heat: heat(0.14, 0.32, 0.66, 0.55, 1.12, 1),
  },
  pulse_overdrive: {
    archetype: 'pulse',
    variant: 'overdrive',
    mechanic: 'capacitor-burst',
    bossRole: 'rapid-exposure-burst',
    mobRole: 'rush-punctuation',
    screenOccupancy: 'rhythmic-burst',
    heat: heat(0.22, 0.26, 0.58, 0.82, 1.22, 1.12),
  },
  pulse_lattice: {
    archetype: 'pulse',
    variant: 'lattice',
    mechanic: 'capacitor-burst',
    bossRole: 'moving-part-track',
    mobRole: 'weave-lane-cover',
    screenOccupancy: 'rhythmic-burst',
    heat: heat(0.09, 0.38, 0.74, 0.38, 1.06, 0.94),
  },
  vulcan: {
    archetype: 'vulcan',
    variant: 'rotary',
    mechanic: 'rotary-spin',
    bossRole: 'sustained-contact',
    mobRole: 'suppression',
    screenOccupancy: 'dense-stream',
    heat: heat(0.032, 0.24, 0.7, 0.62, 1.1, 1.08),
  },
  vulcan_gatling: {
    archetype: 'vulcan',
    variant: 'cyclone',
    mechanic: 'rotary-spin',
    bossRole: 'heat-ramp-dps',
    mobRole: 'dense-curtain',
    screenOccupancy: 'dense-stream',
    heat: heat(0.041, 0.21, 0.58, 0.9, 1.25, 1.22),
  },
  vulcan_needle: {
    archetype: 'vulcan',
    variant: 'needle',
    mechanic: 'rotary-spin',
    bossRole: 'weakpoint-drill',
    mobRole: 'armored-column',
    screenOccupancy: 'dense-stream',
    heat: heat(0.05, 0.3, 0.76, 0.48, 1.14, 0.96),
  },
  missile: {
    archetype: 'missile',
    variant: 'cluster',
    mechanic: 'lock-cluster',
    bossRole: 'mobile-core-lock',
    mobRole: 'cluster-clear',
    screenOccupancy: 'sparse-homing',
    heat: heat(0.24, 0.28, 0.68, 0.6, 1.13, 1),
  },
  missile_swarm: {
    archetype: 'missile',
    variant: 'wasp-swarm',
    mechanic: 'lock-cluster',
    bossRole: 'multi-part-tag',
    mobRole: 'distributed-hunt',
    screenOccupancy: 'sparse-homing',
    heat: heat(0.31, 0.24, 0.6, 0.84, 1.2, 1),
  },
  missile_torpedo: {
    archetype: 'missile',
    variant: 'siege-torpedo',
    mechanic: 'lock-cluster',
    bossRole: 'core-demolition',
    mobRole: 'heavy-pack-blast',
    screenOccupancy: 'sparse-homing',
    heat: heat(0.38, 0.34, 0.72, 0.72, 1.28, 1),
  },
  proton: {
    archetype: 'proton',
    variant: 'expander',
    mechanic: 'expanding-plasma',
    bossRole: 'shield-pressure',
    mobRole: 'zone-growth',
    screenOccupancy: 'growing-orbs',
    heat: heat(0.16, 0.3, 0.68, 0.54, 1.14, 1.04),
  },
  proton_nova: {
    archetype: 'proton',
    variant: 'nova-bloom',
    mechanic: 'expanding-plasma',
    bossRole: 'large-hull-blanket',
    mobRole: 'wide-zone-denial',
    screenOccupancy: 'growing-orbs',
    heat: heat(0.29, 0.22, 0.59, 0.88, 1.23, 1.18),
  },
  proton_comet: {
    archetype: 'proton',
    variant: 'comet-core',
    mechanic: 'expanding-plasma',
    bossRole: 'piercing-plasma-track',
    mobRole: 'serpentine-lane',
    screenOccupancy: 'growing-orbs',
    heat: heat(0.2, 0.36, 0.75, 0.46, 1.17, 0.98),
  },
  laser: {
    archetype: 'laser',
    variant: 'sustained',
    mechanic: 'sustained-beam',
    bossRole: 'lane-burn',
    mobRole: 'line-clear',
    screenOccupancy: 'continuous-lane',
    heat: heat(0.026, 0.25, 0.67, 0.64, 1.12, 1),
  },
  laser_prism: {
    archetype: 'laser',
    variant: 'prism',
    mechanic: 'sustained-beam',
    bossRole: 'wide-surface-rake',
    mobRole: 'three-lane-sweep',
    screenOccupancy: 'continuous-lane',
    heat: heat(0.074, 0.27, 0.64, 0.74, 1.18, 1.08),
  },
  laser_cutter: {
    archetype: 'laser',
    variant: 'cutter',
    mechanic: 'sustained-beam',
    bossRole: 'deep-core-cut',
    mobRole: 'single-lane-erasure',
    screenOccupancy: 'continuous-lane',
    heat: heat(0.055, 0.31, 0.73, 0.52, 1.2, 0.94),
  },
  light: {
    archetype: 'light',
    variant: 'chain',
    mechanic: 'chain-lightning',
    bossRole: 'add-transfer',
    mobRole: 'chain-sweep',
    screenOccupancy: 'single-flash',
    heat: heat(0.2, 0.34, 0.72, 0.46, 1.12, 1),
  },
  light_storm: {
    archetype: 'light',
    variant: 'storm',
    mechanic: 'chain-lightning',
    bossRole: 'part-network-overload',
    mobRole: 'dual-seed-storm',
    screenOccupancy: 'single-flash',
    heat: heat(0.34, 0.23, 0.58, 0.9, 1.22, 1),
  },
  light_judgment: {
    archetype: 'light',
    variant: 'judgment',
    mechanic: 'chain-lightning',
    bossRole: 'single-target-surge',
    mobRole: 'elite-chain-execute',
    screenOccupancy: 'single-flash',
    heat: heat(0.42, 0.4, 0.78, 0.62, 1.3, 1),
  },
  rail: {
    archetype: 'rail',
    variant: 'charged',
    mechanic: 'charged-rail',
    bossRole: 'part-break',
    mobRole: 'elite-delete',
    screenOccupancy: 'single-lance',
    heat: heat(0.34, 0.32, 0.72, 0.64, 1.22, 1),
  },
  rail_splitter: {
    archetype: 'rail',
    variant: 'splitter',
    mechanic: 'charged-rail',
    bossRole: 'multi-part-skewer',
    mobRole: 'fan-elite-break',
    screenOccupancy: 'single-lance',
    heat: heat(0.43, 0.28, 0.64, 0.86, 1.28, 1.06),
  },
  rail_siege: {
    archetype: 'rail',
    variant: 'siege',
    mechanic: 'charged-rail',
    bossRole: 'siege-core-break',
    mobRole: 'heavy-unit-delete',
    screenOccupancy: 'single-lance',
    heat: heat(0.62, 0.43, 0.8, 0.78, 1.4, 1),
  },
  scatter: {
    archetype: 'scatter',
    variant: 'nova',
    mechanic: 'close-scatter',
    bossRole: 'point-blank-risk',
    mobRole: 'rush-stop',
    screenOccupancy: 'close-cone',
    heat: heat(0.2, 0.34, 0.69, 0.5, 1.16, 1.1),
  },
  scatter_shredder: {
    archetype: 'scatter',
    variant: 'shredder',
    mechanic: 'close-scatter',
    bossRole: 'large-hull-pointblank',
    mobRole: 'wide-rush-wall',
    screenOccupancy: 'close-cone',
    heat: heat(0.36, 0.22, 0.57, 0.92, 1.24, 1.28),
  },
  scatter_slug: {
    archetype: 'scatter',
    variant: 'slug',
    mechanic: 'close-scatter',
    bossRole: 'weakpoint-shotgun',
    mobRole: 'midrange-stagger',
    screenOccupancy: 'close-cone',
    heat: heat(0.28, 0.39, 0.76, 0.42, 1.26, 0.92),
  },
};

export interface GuidanceSpec {
  speed: number;
  turnRate: number;
  acquireRadius: number;
  armingTime: number;
}

export interface TrailSpec {
  texture: string;
  interval: number;
  scale: number;
}

export interface BurstSpec {
  index: number;
  count: number;
  interval: number;
  capacitorCost: number;
}

export interface SpinSpec {
  phase: number;
  barrel: number;
  warmup: number;
  rpm: number;
  maxSpread: number;
}

export interface LockClusterSpec {
  lockTime: number;
  clusterCount: number;
  clusterRadius: number;
  splitAfter: number;
}

export interface ExpansionSpec {
  startScale: number;
  endScale: number;
  growthPerSecond: number;
  maxRadius: number;
}

export interface BeamSpec {
  duration: number;
  tickEvery: number;
  dps: number;
  width: number;
}

export interface ChainSpec {
  maxTargets: number;
  radius: number;
  falloff: number;
  instant: boolean;
}

export interface ChargeSpec {
  chargeTime: number;
  recovery: number;
  partMultiplier: number;
  perfectWindow: number;
}

export interface RangeSpec {
  optimal: number;
  max: number;
  farMultiplier: number;
}

export interface ShotSpec {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  w: number;
  h: number;
  pierce: number;
  sprite: string;
  stretch: boolean;
  /** Optional on the shared shape so existing equipment shots remain source-compatible. */
  damageType?: DamageType;
  impactFx?: ImpactFx;
  rotateToVelocity?: boolean;
  guidance?: GuidanceSpec;
  trail?: TrailSpec;
  splash?: { radius: number; ratio: number };
  /** Sine-pattern origin and phase. */
  x0?: number;
  ph?: number;
  /** Seconds after the trigger before this member of a multi-shot action becomes live. */
  spawnDelay?: number;
  archetype?: WeaponArchetype;
  variant?: string;
  mechanic?: WeaponMechanic;
  bossRole?: string;
  mobRole?: string;
  screenOccupancy?: ScreenOccupancy;
  heat?: HeatSpec;
  burst?: BurstSpec;
  spin?: SpinSpec;
  lock?: LockClusterSpec;
  expansion?: ExpansionSpec;
  beam?: BeamSpec;
  chain?: ChainSpec;
  charge?: ChargeSpec;
  range?: RangeSpec;
}

/** Primary-weapon shots always carry both projectile visuals and a combat identity. */
export interface WeaponShotSpec extends ShotSpec {
  kind: WeaponKind;
  archetype: WeaponArchetype;
  variant: string;
  damageType: DamageType;
  impactFx: ImpactFx;
  rotateToVelocity: boolean;
  mechanic: WeaponMechanic;
  bossRole: string;
  mobRole: string;
  screenOccupancy: ScreenOccupancy;
  heat: HeatSpec;
}

export interface WeaponMetrics extends WeaponProfile {
  level: number;
  shotCount: number;
  cooldown: number;
  volleyDamage: number;
  rawDps: number;
  projectilesPerSecond: number;
}

export function isWeaponKind(kind: string): kind is WeaponKind {
  return (WEAPON_KINDS as readonly string[]).includes(kind);
}

export function clampWeaponLevel(level: number): number {
  const whole = Number.isFinite(level) ? Math.trunc(level) : 1;
  return Math.max(1, Math.min(DATA.weapons.maxLevel, whole));
}

export function cooldownFor(kind: string, level: number): number {
  const def = DATA.weapons.weapons[kind];
  if (!def) return 0.2;
  const levelIndex = clampWeaponLevel(level) - 1;
  return Math.max(def.cd.min, def.cd.base + def.cd.perLevel * levelIndex);
}

function mechanicDetails(
  kind: WeaponKind,
  profile: WeaponProfile,
  levelIndex: number,
  shotIndex: number,
  shotCount: number,
  cooldown: number,
  vseq: number,
  dmg: number,
): Partial<WeaponShotSpec> {
  switch (profile.archetype) {
    case 'pulse': {
      const variantScale = kind === 'pulse_overdrive' ? 0.64 : kind === 'pulse_lattice' ? 1.28 : 1;
      const interval = Math.max(0.018, (0.045 - levelIndex * 0.0015) * variantScale);
      return {
        spawnDelay: shotIndex * interval,
        burst: {
          index: shotIndex,
          count: shotCount,
          interval,
          capacitorCost: 1 / shotCount,
        },
      };
    }
    case 'vulcan': {
      const spreadScale = kind === 'vulcan_gatling' ? 1.35 : kind === 'vulcan_needle' ? 0.55 : 1;
      const maxSpread = Math.max(0.018, (0.09 - levelIndex * 0.006) * spreadScale);
      const warmupScale = kind === 'vulcan_gatling' ? 1.25 : kind === 'vulcan_needle' ? 0.72 : 1;
      return {
        spin: {
          phase: (((vseq % 3) + 3) % 3) / 3,
          barrel: (shotIndex + (((vseq % 3) + 3) % 3)) % 3,
          warmup: Math.max(0.14, (0.42 - levelIndex * 0.02) * warmupScale),
          rpm: Math.round(60 / cooldown),
          maxSpread,
        },
      };
    }
    case 'missile':
      return {
        lock: {
          lockTime: Math.max(
            0.08,
            (0.34 - levelIndex * 0.018) *
              (kind === 'missile_swarm' ? 0.64 : kind === 'missile_torpedo' ? 1.35 : 1),
          ),
          clusterCount:
            kind === 'missile_swarm'
              ? Math.min(8, 4 + Math.floor(levelIndex / 2))
              : kind === 'missile_torpedo'
                ? Math.min(7, 3 + Math.floor(levelIndex / 2))
                : Math.min(5, 2 + Math.floor(levelIndex / 3)),
          clusterRadius:
            (kind === 'missile_swarm' ? 58 : kind === 'missile_torpedo' ? 76 : 42) + levelIndex * 3,
          splitAfter: Math.max(
            0.14,
            (0.42 - levelIndex * 0.016) *
              (kind === 'missile_swarm' ? 0.7 : kind === 'missile_torpedo' ? 1.25 : 1),
          ),
        },
      };
    case 'proton': {
      const sizeScale = kind === 'proton_nova' ? 1.38 : kind === 'proton_comet' ? 0.82 : 1;
      const startScale = (0.78 + levelIndex * 0.025) * sizeScale;
      const endScale = (1.9 + levelIndex * 0.11) * sizeScale;
      return {
        expansion: {
          startScale,
          endScale,
          growthPerSecond:
            (1.15 + levelIndex * 0.08) *
            (kind === 'proton_nova' ? 1.25 : kind === 'proton_comet' ? 0.72 : 1),
          maxRadius: (18 + levelIndex * 2.5) * sizeScale,
        },
      };
    }
    case 'laser': {
      const durationScale = kind === 'laser_prism' ? 0.72 : kind === 'laser_cutter' ? 1.65 : 1;
      const duration = Math.min(0.55, (0.16 + levelIndex * 0.018) * durationScale);
      return {
        beam: {
          duration,
          tickEvery: 0.04,
          dps: dmg / cooldown,
          width:
            (5 + levelIndex * 0.45) *
            (kind === 'laser_prism' ? 0.68 : kind === 'laser_cutter' ? 1.45 : 1),
        },
      };
    }
    case 'light':
      return {
        chain: {
          maxTargets:
            kind === 'light_storm'
              ? Math.min(9, 4 + Math.floor(levelIndex / 2))
              : kind === 'light_judgment'
                ? Math.min(4, 2 + Math.floor(levelIndex / 4))
                : Math.min(6, 2 + Math.floor(levelIndex / 2)),
          radius:
            (kind === 'light_storm' ? 112 : kind === 'light_judgment' ? 72 : 86) + levelIndex * 6,
          falloff: kind === 'light_storm' ? 0.62 : kind === 'light_judgment' ? 0.88 : 0.72,
          instant: true,
        },
      };
    case 'rail': {
      const chargeRatio = kind === 'rail_splitter' ? 0.66 : kind === 'rail_siege' ? 0.86 : 0.78;
      const chargeTime = cooldown * chargeRatio;
      return {
        spawnDelay: chargeTime,
        charge: {
          chargeTime,
          recovery: cooldown - chargeTime,
          partMultiplier:
            (kind === 'rail_splitter' ? 1.18 : kind === 'rail_siege' ? 1.7 : 1.35) +
            levelIndex * 0.025,
          perfectWindow: Math.max(
            0.035,
            (0.1 - levelIndex * 0.005) *
              (kind === 'rail_splitter' ? 1.25 : kind === 'rail_siege' ? 0.7 : 1),
          ),
        },
      };
    }
    case 'scatter':
      return {
        range: {
          optimal:
            (kind === 'scatter_shredder' ? 68 : kind === 'scatter_slug' ? 145 : 92) +
            levelIndex * 3,
          max:
            (kind === 'scatter_shredder' ? 220 : kind === 'scatter_slug' ? 390 : 280) +
            levelIndex * 8,
          farMultiplier: kind === 'scatter_shredder' ? 0.12 : kind === 'scatter_slug' ? 0.38 : 0.2,
        },
      };
  }
}

/** rng is injectable so deterministic balance and pattern tests do not depend on Math.random. */
export function firePattern(
  kind: string,
  level: number,
  px: number,
  py: number,
  vseq: number,
  rng: () => number = Math.random,
): WeaponShotSpec[] {
  if (!isWeaponKind(kind)) return [];
  const def = DATA.weapons.weapons[kind];
  if (!def) return [];
  const profile = WEAPON_PROFILES[kind];
  const b = def.bullet;
  const y = py - 16;
  const normalizedLevel = clampWeaponLevel(level);
  const levelIndex = normalizedLevel - 1;
  const cooldown = cooldownFor(kind, normalizedLevel);
  const shots: WeaponShotSpec[] = [];
  const mk = (
    sx: number,
    sy: number,
    vx: number,
    vy: number,
    dmg: number,
    extra?: Partial<WeaponShotSpec>,
  ) =>
    shots.push({
      kind,
      x: sx,
      y: sy,
      vx,
      vy,
      dmg,
      w: b.w,
      h: b.h,
      pierce: b.pierce,
      sprite: b.sprite,
      stretch: b.stretch,
      damageType: b.damageType,
      impactFx: b.impactFx,
      rotateToVelocity: b.rotateToVelocity,
      guidance: b.guidance,
      trail: b.trail,
      splash: b.splash,
      ...profile,
      ...extra,
    });

  const p = def.pattern;
  if (p.type === 'table') {
    for (const [dx, dy, vx, vy, dmg] of p.shots[levelIndex] ?? []) mk(px + dx, y + dy, vx, vy, dmg);
  } else if (p.type === 'stream') {
    const streams = p.streams[levelIndex] ?? 1;
    for (let s = 0; s < streams; s++) {
      const off = streams === 1 ? 0 : (s - (streams - 1) / 2) * p.offsetX;
      const jit = -p.jitterVx + rng() * p.jitterVx * 2;
      mk(px + off + (vseq - 1) * p.seqOffset, y, jit, p.vy, p.dmgBase + levelIndex * p.dmgPerLevel);
    }
  } else if (p.type === 'fan') {
    const n = p.counts[levelIndex] ?? 1;
    const spread = p.spreadBase + levelIndex * p.spreadPerLevel;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * spread);
      const sp = p.speedBase + levelIndex * p.speedPerLevel;
      mk(px, y, Math.cos(a) * sp * p.scaleX, Math.sin(a) * sp * p.scaleY, p.dmg);
    }
  } else if (p.type === 'sine') {
    const n = p.counts[levelIndex] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * p.offsetX;
      mk(px + off, y, 0, p.vy, p.dmgBase + levelIndex * p.dmgPerLevel, {
        x0: px + off,
        ph: rng() * Math.PI * 2,
      });
    }
  } else {
    const n = p.counts[levelIndex] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * p.offsetX;
      mk(px + off, y + p.yOff, 0, p.vy, p.dmgBase + levelIndex * p.dmgPerLevel);
    }
  }

  const count = shots.length;
  return shots.map((shot, index) => ({
    ...shot,
    ...mechanicDetails(kind, profile, levelIndex, index, count, cooldown, vseq, shot.dmg),
  }));
}

export function weaponMetrics(kind: WeaponKind, level: number): WeaponMetrics {
  const normalizedLevel = clampWeaponLevel(level);
  const shots = firePattern(kind, normalizedLevel, 180, 500, 0, () => 0.5);
  const cooldown = cooldownFor(kind, normalizedLevel);
  const volleyDamage = shots.reduce((total, shot) => total + shot.dmg, 0);
  return {
    ...WEAPON_PROFILES[kind],
    level: normalizedLevel,
    shotCount: shots.length,
    cooldown,
    volleyDamage,
    rawDps: volleyDamage / cooldown,
    projectilesPerSecond: shots.length / cooldown,
  };
}
