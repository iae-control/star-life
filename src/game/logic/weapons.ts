// 무기 발사 패턴 — weapons.json의 패턴 정의를 해석하는 순수 로직 (vitest 대상).
import { DATA } from '../../data';

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
  /** 착탄 스플래시 (미사일) */
  splash?: { radius: number; ratio: number };
  /** sine 전용: 진동 기준 x */
  x0?: number;
  /** sine 전용: 위상 */
  ph?: number;
}

export function cooldownFor(kind: string, level: number): number {
  const def = DATA.weapons.weapons[kind];
  if (!def) return 0.2;
  return Math.max(def.cd.min, def.cd.base + def.cd.perLevel * level);
}

/** rng는 테스트 주입용 — 기본 Math.random */
export function firePattern(
  kind: string,
  level: number,
  px: number,
  py: number,
  vseq: number,
  rng: () => number = Math.random,
): ShotSpec[] {
  const def = DATA.weapons.weapons[kind];
  if (!def) return [];
  const b = def.bullet;
  const y = py - 16; // (-12) ×SY
  const li = level - 1;
  const shots: ShotSpec[] = [];
  const mk = (
    sx: number,
    sy: number,
    vx: number,
    vy: number,
    dmg: number,
    extra?: Partial<ShotSpec>,
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
      splash: b.splash,
      ...extra,
    });

  const p = def.pattern;
  if (p.type === 'table') {
    for (const [dx, dy, vx, vy, dmg] of p.shots[li] ?? []) mk(px + dx, y + dy, vx, vy, dmg);
  } else if (p.type === 'stream') {
    const streams = p.streams[li] ?? 1;
    for (let s = 0; s < streams; s++) {
      const off = streams === 1 ? 0 : (s - (streams - 1) / 2) * p.offsetX;
      const jit = -p.jitterVx + rng() * p.jitterVx * 2;
      mk(px + off + (vseq - 1) * p.seqOffset, y, jit, p.vy, p.dmgBase + level * p.dmgPerLevel);
    }
  } else if (p.type === 'fan') {
    const n = p.counts[li] ?? 1;
    const spread = p.spreadBase + level * p.spreadPerLevel;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * spread);
      const sp = p.speedBase + level * p.speedPerLevel;
      mk(px, y, Math.cos(a) * sp * p.scaleX, Math.sin(a) * sp * p.scaleY, p.dmg);
    }
  } else if (p.type === 'sine') {
    const n = p.counts[li] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * p.offsetX;
      mk(px + off, y, 0, p.vy, p.dmgBase + level * p.dmgPerLevel, {
        x0: px + off,
        ph: rng() * 6.28,
      });
    }
  } else {
    const n = p.counts[li] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * p.offsetX;
      mk(px + off, y + p.yOff, 0, p.vy, p.dmgBase + level * p.dmgPerLevel);
    }
  }
  return shots;
}
