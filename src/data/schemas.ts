// 콘텐츠 JSON 스키마 — zod 검증 (PLAN 3장: 로드 실패 시 명확한 에러).
import { z } from 'zod';

const curve = z.object({ base: z.number(), perLevel: z.number(), min: z.number() });
const waveCurve = z.object({ base: z.number(), perWave: z.number(), min: z.number() });
const hpCurve = z.object({ base: z.number(), perWave: z.number() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const levels6 = <T extends z.ZodTypeAny>(item: T) => z.array(item).length(6);

/** [dx, dy, vx, vy, dmg] */
const shotTuple = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);

const patternSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('table'), shots: levels6(z.array(shotTuple).min(1)) }),
  z.object({
    type: z.literal('stream'),
    streams: levels6(z.number().int().min(1)),
    offsetX: z.number(),
    jitterVx: z.number(),
    vy: z.number(),
    dmgBase: z.number(),
    dmgPerLevel: z.number(),
    seqOffset: z.number(),
  }),
  z.object({
    type: z.literal('fan'),
    counts: levels6(z.number().int().min(1)),
    spreadBase: z.number(),
    spreadPerLevel: z.number(),
    speedBase: z.number(),
    speedPerLevel: z.number(),
    dmg: z.number(),
    scaleX: z.number(),
    scaleY: z.number(),
  }),
  z.object({
    type: z.literal('sine'),
    counts: levels6(z.number().int().min(1)),
    offsetX: z.number(),
    vy: z.number(),
    dmgBase: z.number(),
    dmgPerLevel: z.number(),
  }),
  z.object({
    type: z.literal('line'),
    counts: levels6(z.number().int().min(1)),
    offsetX: z.number(),
    vy: z.number(),
    dmgBase: z.number(),
    dmgPerLevel: z.number(),
    yOff: z.number(),
  }),
]);

export const weaponsSchema = z.object({
  maxLevel: z.literal(6),
  weapons: z.record(
    z.string(),
    z.object({
      name: z.string(),
      short: z.string().max(6),
      price: z.number().int().min(0),
      descKey: z.string(),
      color: hex,
      cd: curve,
      bullet: z.object({
        w: z.number().positive(),
        h: z.number().positive(),
        pierce: z.number().int().min(0),
        sprite: z.string(),
        stretch: z.boolean(),
      }),
      pattern: patternSchema,
    }),
  ),
});

const behaviorParams = {
  sineDescend: z.object({
    spdMin: z.number(),
    spdMax: z.number(),
    spdPerWave: z.number(),
    ampMin: z.number(),
    ampMax: z.number(),
    freqMin: z.number(),
    freqMax: z.number(),
    fireFromWave: z.number().int(),
    fireChancePerSec: z.number(),
    bulletSpeed: z.number(),
  }),
  turret: z.object({
    spd: z.number(),
    holdYMin: z.number(),
    holdYMax: z.number(),
    coolMin: z.number(),
    coolMax: z.number(),
    fireCoolMin: z.number(),
    fireCoolMax: z.number(),
    coolReducePerWave: z.number(),
    coolReduceMax: z.number(),
    life: z.number(),
    driftMax: z.number(),
    driftBoundX: z.number(),
    leaveSpd: z.number(),
    bulletSpeedBase: z.number(),
    bulletSpeedPerWave: z.number(),
  }),
  diver: z.object({
    spdBase: z.number(),
    spdPerWave: z.number(),
    homingClamp: z.number(),
    homingGain: z.number(),
  }),
};

const enemyTypeSchema = z.discriminatedUnion('behavior', [
  z.object({
    behavior: z.literal('sineDescend'),
    sprite: z.string(),
    score: z.number().int(),
    hp: hpCurve,
    params: behaviorParams.sineDescend,
  }),
  z.object({
    behavior: z.literal('turret'),
    sprite: z.string(),
    score: z.number().int(),
    hp: hpCurve,
    params: behaviorParams.turret,
  }),
  z.object({
    behavior: z.literal('diver'),
    sprite: z.string(),
    score: z.number().int(),
    hp: hpCurve,
    params: behaviorParams.diver,
  }),
]);

export const enemiesSchema = z.object({
  hitbox: z.object({ w: z.number(), h: z.number() }),
  spawnY: z.number(),
  orb: z.object({
    chance: z.number().min(0).max(1),
    chanceTurret: z.number().min(0).max(1),
    fallSpeed: z.number(),
    magnetRadius: z.number(),
    magnetPull: z.number(),
    everyNthIsShield: z.number().int().min(1),
    shieldArmorBonus: z.number(),
    maxPowerBonusScore: z.number(),
  }),
  ebullet: z.object({
    smallSize: z.number(),
    bigSize: z.number(),
    fanSize: z.number(),
    smallDamage: z.number(),
    bigDamage: z.number(),
  }),
  types: z.record(z.string(), enemyTypeSchema),
});

const bossPhaseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fan'),
    count: z.number().int().min(1),
    angleStep: z.number(),
    speed: z.number(),
  }),
  z.object({
    type: z.literal('aimed'),
    speed: z.number(),
    offsetX: z.number(),
    big: z.boolean(),
  }),
]);

export const bossesSchema = z.object({
  bosses: z.record(
    z.string(),
    z.object({
      sprite: z.string(),
      hp: hpCurve,
      hitbox: z.object({ w: z.number(), h: z.number() }),
      entryY: z.number(),
      entrySpd: z.number(),
      patrol: z.object({
        base: z.number(),
        perWave: z.number(),
        minX: z.number(),
        maxX: z.number(),
      }),
      cool: waveCurve,
      fireOffsetY: z.number(),
      phases: z.array(bossPhaseSchema).min(1),
      killScore: z.number().int(),
      shopDelay: z.number(),
      hitCooldown: z.number(),
      touchDamage: z.number(),
    }),
  ),
});

const waveGroupSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('column'),
    enemy: z.string(),
    count: z.number().int().min(1),
    interval: z.number(),
    xMin: z.number(),
    xMax: z.number(),
    ampMin: z.number(),
    ampMax: z.number(),
    duration: z.number(),
  }),
  z.object({
    kind: z.literal('sideRush'),
    enemy: z.string(),
    count: z.number().int().min(1),
    interval: z.number(),
    vxMin: z.number(),
    vxMax: z.number(),
    rowYBase: z.number(),
    rowYStep: z.number(),
    duration: z.number(),
  }),
  z.object({
    kind: z.literal('dropPair'),
    enemy: z.string(),
    xMin: z.number(),
    xMax: z.number(),
    secondFromWave: z.number().int(),
    secondDelay: z.number(),
    duration: z.number(),
  }),
]);

export const wavesSchema = z.object({
  bossEvery: z.number().int().min(2),
  bossId: z.string(),
  bossDelay: z.number(),
  clearDelay: z.number(),
  reps: z.object({ base: z.number().int(), per2Waves: z.number().int(), max: z.number().int() }),
  groups: z.array(waveGroupSchema).min(1),
});

export const levelsSchema = z.object({
  levels: z
    .array(
      z.object({
        id: z.number().int().min(1),
        nameKey: z.string(),
        background: z.object({
          theme: z.enum(['space', 'asteroids']),
          nebulaAlpha: z.number().min(0).max(1),
        }),
        scroll: z.object({ base: z.number(), perWave: z.number(), boss: z.number() }),
      }),
    )
    .min(1),
});

export const shopSchema = z.object({
  power: z.object({ base: z.number(), perLevel: z.number() }),
  shield: z.object({
    base: z.number(),
    perOver: z.number(),
    step: z.number(),
    cap: z.number(),
    baseStat: z.number(),
  }),
  armor: z.object({
    base: z.number(),
    perOver: z.number(),
    step: z.number(),
    cap: z.number(),
    baseStat: z.number(),
  }),
  super: z.object({ price: z.number(), cap: z.number().int() }),
});

export const i18nSchema = z.record(z.string(), z.string());

export type WeaponsData = z.infer<typeof weaponsSchema>;
export type WeaponData = WeaponsData['weapons'][string];
export type EnemiesData = z.infer<typeof enemiesSchema>;
export type EnemyTypeData = z.infer<typeof enemyTypeSchema>;
export type BossesData = z.infer<typeof bossesSchema>;
export type BossData = BossesData['bosses'][string];
export type BossPhase = z.infer<typeof bossPhaseSchema>;
export type WavesData = z.infer<typeof wavesSchema>;
export type LevelsData = z.infer<typeof levelsSchema>;
export type LevelData = LevelsData['levels'][number];
export type ShopData = z.infer<typeof shopSchema>;
export type I18nData = z.infer<typeof i18nSchema>;
