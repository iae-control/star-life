// 웨이브 스크립트 빌더 — 순수 로직 (vitest 대상). 데모 buildWave() 이식.
import { GAME_WIDTH } from '../../config';
import { WAVE } from './balance';

export type SpawnEvent =
  | { t: number; kind: 'boss' }
  | { t: number; kind: 'e1'; x: number; amp: number }
  | { t: number; kind: 'e2'; x: number }
  | { t: number; kind: 'e3'; x: number; vx: number; y: number };

const rnd = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

export function buildWave(n: number, rng: () => number = Math.random): SpawnEvent[] {
  const q: SpawnEvent[] = [];
  let t = 1.0;
  if (n % WAVE.bossEvery === 0) {
    q.push({ t: t + 1.2, kind: 'boss' });
    return q;
  }
  const reps = WAVE.reps(n);
  for (let r = 0; r < reps; r++) {
    const kind = (r + n) % 3;
    if (kind === 0) {
      // e1 5기 사인 종대 (bx rnd(50, LW-50) → 56~304 스케일 반영)
      const bx = rnd(rng, 56, GAME_WIDTH - 56);
      const amp = rnd(rng, 34, 68); // (30~60) ×SX
      for (let i = 0; i < 5; i++) q.push({ t: t + i * 0.28, kind: 'e1', x: bx, amp });
      t += 2.6;
    } else if (kind === 1) {
      // e3 4기 측면 돌입
      const side = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        q.push({
          t: t + i * 0.22,
          kind: 'e3',
          x: side < 0 ? -18 : GAME_WIDTH + 18,
          vx: -side * rnd(rng, 135, 180),
          y: 40 + i * 35,
        });
      }
      t += 2.2;
    } else {
      // e2 터릿 1~2기
      q.push({ t, kind: 'e2', x: rnd(rng, 68, GAME_WIDTH - 68) });
      if (n > 2) q.push({ t: t + 0.5, kind: 'e2', x: rnd(rng, 68, GAME_WIDTH - 68) });
      t += 3.0;
    }
  }
  return q;
}
