// 무기 발사 패턴 — 렌더와 무관한 순수 로직 (vitest 대상).
// 데모 playerFire()를 ShotSpec 배열 생성기로 이식. 좌표·속도는 360x640 변환값.
import type { WeaponKey } from './balance';

export interface ShotSpec {
  kind: WeaponKey;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  w: number;
  h: number;
  pierce: number;
  /** light 전용: 사인 진동 기준 x */
  x0?: number;
  /** light 전용: 위상 */
  ph?: number;
}

/** rng는 테스트 주입용 — 기본 Math.random */
export function firePattern(
  cur: WeaponKey,
  level: number,
  px: number,
  py: number,
  vseq: number,
  rng: () => number = Math.random,
): ShotSpec[] {
  const shots: ShotSpec[] = [];
  const x = px;
  const y = py - 16; // (-12) ×SY
  const add = (
    kind: WeaponKey,
    sx: number,
    sy: number,
    vx: number,
    vy: number,
    dmg: number,
    w: number,
    h: number,
    pierce = 0,
    extra?: Partial<ShotSpec>,
  ) => shots.push({ kind, x: sx, y: sy, vx, vy, dmg, w, h, pierce, ...extra });

  if (cur === 'pulse') {
    const S = -573; // (-430)
    const W = 5,
      H = 16; // (4x12)
    if (level === 1) add('pulse', x, y, 0, S, 2, W, H);
    else if (level === 2) {
      add('pulse', x - 7, y, 0, S, 2, W, H);
      add('pulse', x + 7, y, 0, S, 2, W, H);
    } else if (level === 3) {
      add('pulse', x, y, 0, S, 2, W, H);
      add('pulse', x - 8, y + 4, -62, S, 1.5, W, H);
      add('pulse', x + 8, y + 4, 62, S, 1.5, W, H);
    } else if (level === 4) {
      add('pulse', x - 6, y, 0, S, 2.2, W, H);
      add('pulse', x + 6, y, 0, S, 2.2, W, H);
      add('pulse', x - 10, y + 4, -90, S, 1.5, W, H);
      add('pulse', x + 10, y + 4, 90, S, 1.5, W, H);
    } else if (level === 5) {
      add('pulse', x, y - 3, 0, S - 53, 2.5, W, H);
      add('pulse', x - 7, y, 0, S, 2, W, H);
      add('pulse', x + 7, y, 0, S, 2, W, H);
      add('pulse', x - 11, y + 4, -124, S + 40, 1.5, W, H);
      add('pulse', x + 11, y + 4, 124, S + 40, 1.5, W, H);
    } else {
      add('pulse', x, y - 3, 0, S - 80, 3, W, H);
      add('pulse', x - 7, y, 0, S - 27, 2.2, W, H);
      add('pulse', x + 7, y, 0, S - 27, 2.2, W, H);
      add('pulse', x - 12, y + 4, -158, S + 40, 1.6, W, H);
      add('pulse', x + 12, y + 4, 158, S + 40, 1.6, W, H);
      add('pulse', x - 15, y + 8, -293, S + 187, 1.2, W, H);
      add('pulse', x + 15, y + 8, 293, S + 187, 1.2, W, H);
    }
  } else if (cur === 'vulcan') {
    const streams = [1, 1, 2, 2, 3, 3][level - 1] ?? 1;
    for (let s = 0; s < streams; s++) {
      const off = streams === 1 ? 0 : (s - (streams - 1) / 2) * 9; // (8)
      const jit = -32 + rng() * 64; // (±28)
      add('vulcan', x + off + (vseq - 1) * 2.25, y, jit, -720, 0.9 + level * 0.05, 3, 12);
    }
  } else if (cur === 'proton') {
    const n = [2, 3, 3, 4, 5, 6][level - 1] ?? 2;
    const spread = 0.28 + level * 0.06;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * spread);
      const sp = 250 + level * 14;
      // 화면 비율 유지: 축별 스케일 (SX/SY)
      add('proton', x, y, Math.cos(a) * sp * 1.125, Math.sin(a) * sp * (4 / 3), 2, 9, 11);
    }
  } else if (cur === 'light') {
    const n = [1, 1, 2, 2, 3, 3][level - 1] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * 13.5; // (12)
      add('light', x + off, y, 0, -747, 2.2 + level * 0.1, 6, 19, 1, {
        x0: x + off,
        ph: rng() * 6.28,
      });
    }
  } else {
    const n = [1, 1, 1, 2, 2, 3][level - 1] ?? 1;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * 10; // (9)
      add('laser', x + off, y - 5, 0, -1040, 1.35 + level * 0.05, 5, 29, 999);
    }
  }
  return shots;
}
