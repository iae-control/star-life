// 무기 발사 패턴 — weapons.json의 패턴 정의를 해석하는 순수 로직 (vitest 대상).
import { DATA } from '../../data';

export type DamageType = 'kinetic' | 'energy' | 'plasma' | 'electric' | 'explosive';
export type ImpactFx = 'spark' | 'pulse' | 'plasma' | 'arc' | 'scorch' | 'blast';

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
  /** 착탄 스플래시 (미사일) */
  splash?: { radius: number; ratio: number };
  /** sine 전용: 진동 기준 x */
  x0?: number;
  /** sine 전용: 위상 */
  ph?: number;
}

/** Primary-weapon shots always carry the validated projectile profile. */
export interface WeaponShotSpec extends ShotSpec {
  damageType: DamageType;
  impactFx: ImpactFx;
  rotateToVelocity: boolean;
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

/** rng는 테스트 주입용 — 기본 Math.random */
export function firePattern(
  kind: string,
  level: number,
  px: number,
  py: number,
  vseq: number,
  rng: () => number = Math.random,
): WeaponShotSpec[] {
  const def = DATA.weapons.weapons[kind];
  if (!def) return [];
  const b = def.bullet;
  const y = py - 16; // (-12) ×SY
  const levelIndex = clampWeaponLevel(level) - 1;
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
        ph: rng() * 6.28,
      });
    }
  } else {
    const n = p.counts[levelIndex] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * p.offsetX;
      mk(px + off, y + p.yOff, 0, p.vy, p.dmgBase + levelIndex * p.dmgPerLevel);
    }
  }
  return shots;
}
