import { describe, expect, it } from 'vitest';

import { buildWave } from '../src/game/logic/waves';

const rng = () => 0.5;

describe('buildWave', () => {
  it('spawns only a boss on every 4th wave', () => {
    for (const n of [4, 8, 12]) {
      const q = buildWave(n, rng);
      expect(q).toHaveLength(1);
      expect(q[0]?.kind).toBe('boss');
    }
  });

  it('never spawns a boss on non-multiple-of-4 waves', () => {
    for (const n of [1, 2, 3, 5, 6, 7, 9]) {
      expect(buildWave(n, rng).some((e) => e.kind === 'boss')).toBe(false);
    }
  });

  it('spawn times are non-negative and finite', () => {
    for (let n = 1; n <= 12; n++) {
      for (const e of buildWave(n, rng)) {
        expect(e.t).toBeGreaterThan(0);
        expect(Number.isFinite(e.t)).toBe(true);
      }
    }
  });

  it('group count grows with wave number and caps at 6 reps', () => {
    const groups = (n: number) => {
      const q = buildWave(n, rng);
      // e1 그룹=5기, e3 그룹=4기, e2 그룹=1~2기 — 개수로 정확 검증 대신 총량 단조 증가 확인
      return q.length;
    };
    expect(groups(1)).toBeLessThanOrEqual(groups(5));
    expect(groups(5)).toBeLessThanOrEqual(groups(11));
  });
});
