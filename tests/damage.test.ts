import { describe, expect, it } from 'vitest';

import { aabb, applyDamage } from '../src/game/logic/damage';

describe('applyDamage', () => {
  it('drains shield first', () => {
    const r = applyDamage({ shield: 60, armor: 50 }, 8);
    expect(r).toMatchObject({ shield: 52, armor: 50, dead: false });
  });

  it('overflows excess into armor (demo behavior)', () => {
    const r = applyDamage({ shield: 5, armor: 50 }, 14);
    expect(r).toMatchObject({ shield: 0, armor: 41, dead: false });
  });

  it('hits armor directly when shield is empty', () => {
    const r = applyDamage({ shield: 0, armor: 50 }, 13);
    expect(r).toMatchObject({ shield: 0, armor: 37, dead: false });
  });

  it('reports death when armor reaches 0', () => {
    const r = applyDamage({ shield: 0, armor: 10 }, 14);
    expect(r.dead).toBe(true);
    expect(r.armor).toBe(0);
  });
});

describe('aabb', () => {
  it('matches demo center-based overlap', () => {
    expect(aabb(0, 0, 10, 10, 9, 0, 10, 10)).toBe(true);
    expect(aabb(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
    expect(aabb(0, 0, 10, 10, 0, 9.9, 10, 10)).toBe(true);
  });
});
