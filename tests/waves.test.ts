import { describe, expect, it } from 'vitest';

import { DATA } from '../src/data';
import { SPAWN } from '../src/game/logic/balance';
import { buildLevelWave, contentWaveIndex, levelWaveCount } from '../src/game/logic/waves';

const rng = () => 0.5;

describe('buildLevelWave', () => {
  it('returns a boss event when the level waveRoute is exhausted', () => {
    DATA.levels.levels.forEach((level, li) => {
      const q = buildLevelWave(li, level.waveRoute.length, rng);
      expect(q).toHaveLength(1);
      expect(q[0]?.kind).toBe('boss');
    });
  });

  it('routed content waves contain only enemy events with positive finite times', () => {
    DATA.levels.levels.forEach((level, li) => {
      for (let w = 0; w < level.waveRoute.length; w++) {
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

  it('resolves route positions to reusable content indices', () => {
    DATA.levels.levels.forEach((level, li) => {
      expect(levelWaveCount(li)).toBe(level.waveRoute.length);
      level.waveRoute.forEach((contentIdx, routeIdx) => {
        expect(contentWaveIndex(li, routeIdx)).toBe(contentIdx);
      });
      expect(contentWaveIndex(li, level.waveRoute.length)).toBeNull();
    });
  });

  it('spawns denser formations than the authored counts, scaled by difficulty', () => {
    const seeded = () => {
      let s = 1;
      return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    };
    const enemies = (density: number): number =>
      buildLevelWave(0, 0, seeded(), density).filter((e) => e.kind === 'enemy').length;

    const level0 = DATA.levels.levels[0];
    const authored = (level0?.waves[level0?.waveRoute[0] ?? 0] ?? []).reduce(
      (sum, group) => sum + ('count' in group ? group.count : 1),
      0,
    );
    const normal = enemies(1);
    expect(normal, '기본 밀도가 원본 편성보다 많아야 한다').toBeGreaterThan(authored);
    expect(enemies(1.25), 'hard 는 normal 보다 많아야 한다').toBeGreaterThanOrEqual(normal);
    expect(enemies(0.85), 'easy 는 normal 보다 적어야 한다').toBeLessThanOrEqual(normal);
    // 폭주 방지 상한이 실제로 걸려 있는지
    expect(enemies(6), '밀도 상한').toBeLessThanOrEqual(SPAWN.maxPerGroup * 12);
  });

  it('unknown level index yields an empty queue', () => {
    expect(buildLevelWave(99, 0, rng)).toHaveLength(0);
    expect(levelWaveCount(99)).toBe(0);
    expect(contentWaveIndex(99, 0)).toBeNull();
    expect(buildLevelWave(0, -1, rng)).toHaveLength(0);
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

  it('waveRoute entries and ordered sector boundaries are valid', () => {
    for (const level of DATA.levels.levels) {
      expect(level.waveRoute.length).toBeGreaterThanOrEqual(9);
      expect(level.waveRoute.length).toBeLessThanOrEqual(12);
      expect(new Set(level.waveRoute).size).toBeLessThan(level.waveRoute.length);
      for (const contentIdx of level.waveRoute) {
        expect(level.waves[contentIdx], `L${level.id} waveRoute ${contentIdx}`).toBeDefined();
      }

      expect(level.sectors[0]?.startWave).toBe(0);
      for (let i = 0; i < level.sectors.length; i++) {
        const sector = level.sectors[i];
        expect(sector, `L${level.id} sector ${i}`).toBeDefined();
        if (!sector) continue;
        expect(sector.startWave).toBeLessThan(level.waveRoute.length);
        if (i > 0) expect(sector.startWave).toBeGreaterThan(level.sectors[i - 1]!.startWave);
      }
    }
  });

  it('sector names exist in both languages and referenced meteor enemies exist', () => {
    for (const level of DATA.levels.levels) {
      for (const sector of level.sectors) {
        expect(DATA.i18n.ko[sector.nameKey], sector.nameKey).toBeDefined();
        expect(DATA.i18n.ko[sector.taglineKey], sector.taglineKey).toBeDefined();
        expect(DATA.i18n.en[sector.nameKey], sector.nameKey).toBeDefined();
        expect(DATA.i18n.en[sector.taglineKey], sector.taglineKey).toBeDefined();
        for (const gimmick of sector.gimmicks) {
          if (gimmick.type === 'meteorField') {
            expect(DATA.enemies.types[gimmick.enemy], gimmick.enemy).toBeDefined();
          }
        }
      }
    }
  });

  it('uses unique dry catalog codes for every sector label', () => {
    const catalogNames = new Set<string>();
    for (const level of DATA.levels.levels) {
      for (const sector of level.sectors) {
        expect(sector.nameKey).toMatch(/^sector\.catalog\.[a-z]{2}\d{3}\.name$/);
        expect(sector.taglineKey).toMatch(/^sector\.catalog\.[a-z]{2}\d{3}\.tag$/);
        const koName = DATA.i18n.ko[sector.nameKey];
        const enName = DATA.i18n.en[sector.nameKey];
        expect(koName).toMatch(/^SL-[A-Z]{2}-\d{3}(?: \/ .+)?$/);
        expect(enName).toBe(koName);
        expect(DATA.i18n.ko[sector.taglineKey]).toContain('·');
        expect(DATA.i18n.en[sector.taglineKey]).toContain('·');
        catalogNames.add(koName!);
      }
    }
    expect(catalogNames.size).toBe(20);
    expect(DATA.i18n.ko['sector.card.header']).toBeDefined();
    expect(DATA.i18n.ko['sector.card.safe']).toBeDefined();
    expect(DATA.i18n.en['sector.card.header']).toBeDefined();
    expect(DATA.i18n.en['sector.card.safe']).toBeDefined();
  });

  it('assigns one stable authored-art key to each of the 20 sectors', () => {
    const sectors = DATA.levels.levels.flatMap((level) => level.sectors);
    expect(sectors).toHaveLength(20);

    const artKeys = sectors.map((sector) => {
      expect(sector.background, `${sector.id} background`).toBeDefined();
      expect(sector.background?.artKey, `${sector.id} artKey`).toBe(`bg-sector-${sector.id}`);
      expect(sector.background?.parallaxStrength, `${sector.id} parallax`).toBeGreaterThanOrEqual(
        0,
      );
      expect(sector.background?.landmarkMode, `${sector.id} landmark mode`).toMatch(
        /^(cover|contain|stretch)$/,
      );
      return sector.background?.artKey;
    });

    expect(new Set(artKeys).size).toBe(sectors.length);
  });

  it('uses each chapter opening sector art as its level background reference', () => {
    for (const level of DATA.levels.levels) {
      const opening = level.sectors[0];
      expect(opening, `L${level.id} opening sector`).toBeDefined();
      expect(level.background.artKey, `L${level.id} chapter art`).toBe(opening?.background?.artKey);
    }
  });

  it('ships every long-campaign gimmick and safe bonus sectors', () => {
    const types = new Set(
      DATA.levels.levels.flatMap((level) =>
        level.sectors.flatMap((sector) => sector.gimmicks.map((gimmick) => gimmick.type)),
      ),
    );
    for (const type of [
      'iceStorm',
      'volcanic',
      'desertHeat',
      'prominence',
      'electricStorm',
      'meteorField',
    ] as const) {
      expect(types.has(type), type).toBe(true);
    }
    for (const level of DATA.levels.levels) {
      const bonus = level.sectors.find((sector) => sector.kind === 'bonus');
      expect(bonus, `L${level.id} bonus sector`).toBeDefined();
      expect(bonus?.gimmicks).toHaveLength(0);
      expect(bonus?.bonusMultiplier).toBeGreaterThan(1);
    }
  });

  it('keeps the six legacy level gimmicks valid as a compatibility fallback', () => {
    expect(DATA.levels.levels.map((level) => level.gimmick?.type)).toEqual([
      'fog',
      'vents',
      'wind',
      'heatwave',
      'debris',
      'warp',
    ]);
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
    const chapterCode = /^SL-(NB|PS|MS|RG|SN|BH)-\d{3}$/;
    for (const level of DATA.levels.levels) {
      expect(DATA.i18n.ko[level.nameKey], level.nameKey).toBeDefined();
      expect(DATA.i18n.ko[level.taglineKey], level.taglineKey).toBeDefined();
      expect(DATA.i18n.ko[level.nameKey], `${level.nameKey} ko catalogue code`).toMatch(
        chapterCode,
      );
      expect(DATA.i18n.en[level.nameKey], `${level.nameKey} en catalogue code`).toMatch(
        chapterCode,
      );
    }
    for (const boss of Object.values(DATA.bosses.bosses)) {
      expect(DATA.i18n.ko[boss.nameKey], boss.nameKey).toBeDefined();
    }
  });
});
