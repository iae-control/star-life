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

/** 사망 시 파생 스폰 (분열체 등) — 모든 적 타입에 선택적으로 부여 가능 */
const onDeathSchema = z
  .object({ spawn: z.object({ type: z.string(), count: z.number().int().min(1).max(6) }) })
  .optional();

const behaviorCommon = {
  sprite: z.string(),
  score: z.number().int(),
  hp: hpCurve,
  onDeath: onDeathSchema,
  /** 스프라이트 틴트(팔레트 변형) 및 표시 배율 — ansimuz 애니 시트 공용화용 */
  tint: hex.optional(),
  scale: z.number().positive().optional(),
};

const enemyTypeSchema = z.discriminatedUnion('behavior', [
  z.object({
    ...behaviorCommon,
    behavior: z.literal('sineDescend'),
    params: z.object({
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
      fireMode: z.enum(['aimed', 'spread3']).default('aimed'),
    }),
  }),
  z.object({
    ...behaviorCommon,
    behavior: z.literal('turret'),
    params: z.object({
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
  }),
  z.object({
    ...behaviorCommon,
    behavior: z.literal('diver'),
    params: z.object({
      spdBase: z.number(),
      spdPerWave: z.number(),
      homingClamp: z.number(),
      homingGain: z.number(),
    }),
  }),
  z.object({
    ...behaviorCommon,
    behavior: z.literal('strafer'),
    params: z.object({
      speedX: z.number(),
      yMin: z.number(),
      yMax: z.number(),
      fireEvery: z.number(),
      bulletSpeed: z.number(),
      swayAmp: z.number(),
      swayFreq: z.number(),
    }),
  }),
  z.object({
    ...behaviorCommon,
    behavior: z.literal('orbiter'),
    params: z.object({
      descendSpd: z.number(),
      holdYMin: z.number(),
      holdYMax: z.number(),
      orbitRadius: z.number(),
      orbitSpeed: z.number(),
      centerDriftY: z.number(),
      fireEvery: z.number(),
      ringCount: z.number().int().min(3),
      bulletSpeed: z.number(),
      life: z.number(),
    }),
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
    cool: z.number().optional(),
  }),
  z.object({
    type: z.literal('aimed'),
    speed: z.number(),
    offsetX: z.number(),
    big: z.boolean(),
    cool: z.number().optional(),
  }),
  z.object({
    type: z.literal('ring'),
    count: z.number().int().min(4),
    speed: z.number(),
    cool: z.number().optional(),
  }),
  z.object({
    type: z.literal('spiral'),
    arms: z.number().int().min(1),
    speed: z.number(),
    rotStep: z.number(),
    cool: z.number().optional(),
  }),
  z.object({
    type: z.literal('spawn'),
    enemy: z.string(),
    count: z.number().int().min(1).max(4),
    cool: z.number().optional(),
  }),
]);

export const bossesSchema = z.object({
  bosses: z.record(
    z.string(),
    z.object({
      sprite: z.string(),
      nameKey: z.string(),
      hp: hpCurve,
      hitbox: z.object({ w: z.number(), h: z.number() }),
      entryY: z.number(),
      entrySpd: z.number(),
      movement: z.discriminatedUnion('type', [
        z.object({
          type: z.literal('patrol'),
          base: z.number(),
          perWave: z.number(),
          minX: z.number(),
          maxX: z.number(),
        }),
        z.object({
          type: z.literal('wander'),
          speed: z.number(),
          minX: z.number(),
          maxX: z.number(),
          minY: z.number(),
          maxY: z.number(),
        }),
        z.object({
          type: z.literal('sway'),
          amp: z.number(),
          freq: z.number(),
          bobAmp: z.number(),
          bobFreq: z.number(),
        }),
      ]),
      cool: waveCurve,
      fireOffsetY: z.number(),
      phases: z.array(bossPhaseSchema).min(1),
      /** 파괴 가능한 부위 — shield=true 부위가 하나라도 살아 있으면 코어 무적 */
      parts: z
        .array(
          z.object({
            id: z.string(),
            sprite: z.string(),
            dx: z.number(),
            dy: z.number(),
            hp: hpCurve,
            hitbox: z.object({ w: z.number(), h: z.number() }),
            shield: z.boolean(),
            phase: bossPhaseSchema.optional(),
            fireEvery: z.number().optional(),
          }),
        )
        .optional(),
      /** 블랙홀 기믹: 플레이어 탄·기체를 끌어당기는 중력 */
      gravity: z
        .object({ radius: z.number(), pull: z.number(), playerPull: z.number() })
        .optional(),
      killScore: z.number().int(),
      shopDelay: z.number(),
      hitCooldown: z.number(),
      touchDamage: z.number(),
    }),
  ),
});

/** 레벨 웨이브를 구성하는 스폰 그룹 (순차 실행, duration 후 다음 그룹) */
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
    kind: z.literal('drop'),
    enemy: z.string(),
    count: z.number().int().min(1).max(4),
    interval: z.number(),
    xMin: z.number(),
    xMax: z.number(),
    duration: z.number(),
  }),
  z.object({
    kind: z.literal('row'),
    enemy: z.string(),
    count: z.number().int().min(2),
    xMargin: z.number(),
    duration: z.number(),
  }),
  z.object({
    kind: z.literal('single'),
    enemy: z.string(),
    x: z.number(),
    duration: z.number(),
  }),
  z.object({
    kind: z.literal('vee'),
    enemy: z.string(),
    count: z.number().int().min(3),
    spacing: z.number(),
    interval: z.number(),
    xMin: z.number(),
    xMax: z.number(),
    duration: z.number(),
  }),
]);

export const levelsSchema = z.object({
  clearDelay: z.number(),
  bossDelay: z.number(),
  levels: z
    .array(
      z.object({
        id: z.number().int().min(1),
        nameKey: z.string(),
        taglineKey: z.string(),
        background: z.object({
          theme: z.enum([
            'nebula',
            'protostar',
            'mainseq',
            'asteroids',
            'redgiant',
            'supernova',
            'blackhole',
            'inside',
          ]),
          nebulaAlpha: z.number().min(0).max(1),
        }),
        scroll: z.object({ base: z.number(), perWave: z.number(), boss: z.number() }),
        waves: z.array(z.array(waveGroupSchema).min(1)).min(1),
        boss: z.string(),
      }),
    )
    .min(1),
});

export const shopSchema = z.object({
  creditRate: z.number().min(0).max(1),
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

const equipBase = {
  name: z.string(),
  descKey: z.string(),
  price: z.number().int().min(0),
  color: hex,
  fireEvery: z.number().positive(),
};
export const equipmentSchema = z.object({
  rear: z.record(z.string(), z.object({ ...equipBase, kind: z.enum(['tail', 'side', 'homing']) })),
  sidekick: z.record(z.string(), z.object({ ...equipBase, kind: z.enum(['pods', 'satellite']) })),
});

export const i18nSchema = z.record(z.string(), z.string());

export type WeaponsData = z.infer<typeof weaponsSchema>;
export type WeaponData = WeaponsData['weapons'][string];
export type EnemiesData = z.infer<typeof enemiesSchema>;
export type EnemyTypeData = z.infer<typeof enemyTypeSchema>;
export type BossesData = z.infer<typeof bossesSchema>;
export type BossData = BossesData['bosses'][string];
export type BossPhase = z.infer<typeof bossPhaseSchema>;
export type WaveGroup = z.infer<typeof waveGroupSchema>;
export type LevelsData = z.infer<typeof levelsSchema>;
export type LevelData = LevelsData['levels'][number];
export type ShopData = z.infer<typeof shopSchema>;
export type EquipmentData = z.infer<typeof equipmentSchema>;
export type EquipItem = EquipmentData['rear'][string];
export type I18nData = z.infer<typeof i18nSchema>;
