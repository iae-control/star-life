import { describe, expect, it } from 'vitest';

import { DATA } from '../src/data';
import { buildLevelWave } from '../src/game/logic/waves';

const rng = () => 0.5;

describe('buildLevelWave', () => {
  it('returns a boss event when the level waves are exhausted', () => {
    DATA.levels.levels.forEach((level, li) => {
      const q = buildLevelWave(li, level.waves.length, rng);
      expect(q).toHaveLength(1);
      expect(q[0]?.kind).toBe('boss');
    });
  });

  it('content waves contain only enemy events with positive finite times', () => {
    DATA.levels.levels.forEach((level, li) => {
      for (let w = 0; w < level.waves.length; w++) {
        const q = buildLevelWave(li, w, rng);
        expect(q.length).toBeGreaterThan(0);
        for (const e of q) {
          expect(e.kind).toBe('enemy');
          expect(e.t).toBeGreaterThan(0);
          expect(Number.isFinite(e.t)).toBe(true);
        }
      }
    });
  });

  it('unknown level index yields an empty queue', () => {
    expect(buildLevelWave(99, 0, rng)).toHaveLength(0);
  });
});

describe('data integrity (참조 무결성)', () => {
  it('every enemy referenced by level waves exists', () => {
    for (const level of DATA.levels.levels) {
      for (const wave of level.waves) {
        for (const g of wave) {
          expect(DATA.enemies.types[g.enemy], `enemy ${g.enemy}`).toBeDefined();
        }
      }
    }
  });

  it('every level boss exists', () => {
    for (const level of DATA.levels.levels) {
      expect(DATA.bosses.bosses[level.boss], `boss ${level.boss}`).toBeDefined();
    }
  });

  it('onDeath spawn types and boss spawn phases reference real enemies', () => {
    for (const [key, def] of Object.entries(DATA.enemies.types)) {
      if (def.onDeath)
        expect(DATA.enemies.types[def.onDeath.spawn.type], `${key} onDeath`).toBeDefined();
    }
    for (const [key, boss] of Object.entries(DATA.bosses.bosses)) {
      for (const ph of boss.phases) {
        if (ph.type === 'spawn')
          expect(DATA.enemies.types[ph.enemy], `${key} spawn phase`).toBeDefined();
      }
    }
  });

  it('level/boss i18n keys exist in ko table', () => {
    for (const level of DATA.levels.levels) {
      expect(DATA.i18n.ko[level.nameKey], level.nameKey).toBeDefined();
      expect(DATA.i18n.ko[level.taglineKey], level.taglineKey).toBeDefined();
    }
    for (const boss of Object.values(DATA.bosses.bosses)) {
      expect(DATA.i18n.ko[boss.nameKey], boss.nameKey).toBeDefined();
    }
  });
});
