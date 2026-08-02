// 웨이브 스크립트 빌더 — waves.json의 그룹 정의를 해석하는 순수 로직 (vitest 대상).
import { GAME_WIDTH } from '../../config';
import { DATA } from '../../data';

export type SpawnEvent =
  | { t: number; kind: 'boss' }
  | {
      t: number;
      kind: 'enemy';
      type: string;
      x: number;
      opt: { amp?: number; vx?: number; y?: number };
    };

const rnd = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

export function buildWave(n: number, rng: () => number = Math.random): SpawnEvent[] {
  const W = DATA.waves;
  const q: SpawnEvent[] = [];
  let t = 1.0;
  if (n % W.bossEvery === 0) {
    q.push({ t: t + W.bossDelay, kind: 'boss' });
    return q;
  }
  const reps = Math.min(W.reps.max, W.reps.base + Math.floor(n / 2) * W.reps.per2Waves);
  for (let r = 0; r < reps; r++) {
    const g = W.groups[(r + n) % W.groups.length];
    if (!g) continue;
    if (g.kind === 'column') {
      const bx = rnd(rng, g.xMin, g.xMax);
      const amp = rnd(rng, g.ampMin, g.ampMax);
      for (let i = 0; i < g.count; i++) {
        q.push({ t: t + i * g.interval, kind: 'enemy', type: g.enemy, x: bx, opt: { amp } });
      }
      t += g.duration;
    } else if (g.kind === 'sideRush') {
      const side = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < g.count; i++) {
        q.push({
          t: t + i * g.interval,
          kind: 'enemy',
          type: g.enemy,
          x: side < 0 ? -18 : GAME_WIDTH + 18,
          opt: { vx: -side * rnd(rng, g.vxMin, g.vxMax), y: g.rowYBase + i * g.rowYStep },
        });
      }
      t += g.duration;
    } else {
      q.push({ t, kind: 'enemy', type: g.enemy, x: rnd(rng, g.xMin, g.xMax), opt: {} });
      if (n > g.secondFromWave - 1) {
        q.push({
          t: t + g.secondDelay,
          kind: 'enemy',
          type: g.enemy,
          x: rnd(rng, g.xMin, g.xMax),
          opt: {},
        });
      }
      t += g.duration;
    }
  }
  return q;
}
