// v4 데모(320x480)의 밸런스를 논리 해상도 360x640으로 변환한 단일 출처.
// 변환 규칙: x축 ×1.125, y축 ×4/3, 방사형(조준탄 등) 속도 ×1.2247(기하평균).
// 주석의 괄호 숫자는 데모 원본 값. M2에서 JSON으로 이전 예정.
import { GAME_HEIGHT, GAME_WIDTH } from '../../config';

export const SX = 360 / 320;
export const SY = 640 / 480;
export const SR = Math.sqrt(SX * SY);

export const PLAYER = {
  startX: GAME_WIDTH / 2,
  startY: GAME_HEIGHT - 93, // (LH-70)
  hitW: 18, // (16)
  hitH: 27, // (20)
  acc: 1837, // (1500) ×SR
  maxSpeed: 257, // (210) ×SR
  friction: 0.86, // 프레임당(60fps 기준) — pow(0.86, dt*60)로 적용
  touchSpring: 14,
  touchClamp: 3184, // (2600) ×SR
  touchDamp: 0.82, // 프레임당 — pow(0.82, dt*60)
  touchOffsetY: -61, // (-46)
  minX: 14, // (12)
  maxX: GAME_WIDTH - 14,
  minY: 40, // (30)
  maxY: GAME_HEIGHT - 24, // (LH-18)
  shieldMax: 60,
  armorMax: 50,
  shieldRegenDelay: 2.5,
  shieldRegenRate: 7,
  invulnAfterHit: 0.9,
  collideDamage: 13,
  bossTouchDamage: 20,
  superStart: 2,
  superMax: 5,
} as const;

export type WeaponKey = 'pulse' | 'vulcan' | 'proton' | 'light' | 'laser';
export const WEAPON_KEYS: WeaponKey[] = ['pulse', 'vulcan', 'proton', 'light', 'laser'];

export interface WeaponDef {
  name: string;
  short: string;
  price: number;
  cd: (level: number) => number;
}

export const WEAPONS: Record<WeaponKey, WeaponDef> = {
  pulse: {
    name: 'PULSE CANNON',
    short: 'PULSE',
    price: 0,
    cd: (l) => Math.max(0.11, 0.2 - l * 0.012),
  },
  vulcan: { name: 'VULCAN', short: 'VULCN', price: 800, cd: (l) => 0.062 - l * 0.002 },
  proton: { name: 'PROTON SPREAD', short: 'PROTN', price: 1500, cd: (l) => 0.27 - l * 0.008 },
  light: { name: 'LIGHTNING GUN', short: 'LIGHT', price: 2400, cd: (l) => 0.17 - l * 0.005 },
  laser: { name: 'MEGA LASER', short: 'LASER', price: 3600, cd: (l) => 0.13 - l * 0.004 },
};

export const MAX_WEAPON_LEVEL = 6;

export const ENEMY = {
  e1: {
    hp: (wave: number) => 2 + wave * 0.4,
    spdMin: 93, // (70) ×SY
    spdMax: 127, // (95)
    spdPerWave: 4, // (3)
    ampMin: 34, // (30) ×SX
    ampMax: 79, // (70)
    freqMin: 1.6,
    freqMax: 2.6,
    score: 100,
    fireFromWave: 3,
    fireChancePerSec: 0.15,
    bulletSpeed: 147, // (120) ×SR
  },
  e2: {
    hp: (wave: number) => 6 + wave * 1.2,
    spd: 56, // (42) ×SY
    holdYMin: 93, // (70)
    holdYMax: 200, // (150)
    coolMin: 0.8,
    coolMax: 1.6,
    life: 11,
    driftMax: 25, // (22) ×SX
    driftBoundX: 34, // (30)
    leaveSpd: 80, // (60)
    score: 300,
    bulletSpeed: (wave: number) => 159 + wave * 7, // (130 + wave*6) ×SR
    coolReduce: (wave: number) => Math.min(0.6, wave * 0.05),
  },
  e3: {
    hp: (wave: number) => 2 + wave * 0.4,
    spd: (wave: number) => 200 + wave * 11, // (150 + wave*8) ×SY
    vxMin: 135, // (120) ×SX
    vxMax: 180, // (160)
    homingClamp: 337, // (300) ×SX
    homingGain: 1.2,
    score: 150,
    spawnRowY: (i: number) => 40 + i * 35, // (30 + i*26)
  },
  hitW: 20, // (18)
  hitH: 27, // (20)
  spawnY: -27, // (-20)
  orbChance: 0.16,
  orbChanceE2: 0.45,
} as const;

export const BOSS = {
  hp: (wave: number) => 55 + wave * 22,
  hitW: 50, // (44)
  hitH: 67, // (50)
  entryY: 104, // (78)
  entrySpd: 61, // (46) ×SY
  patrolSpd: (wave: number) => 38 + wave * 2.25, // (34 + wave*2) ×SX
  patrolMinX: 68, // (60)
  patrolMaxX: GAME_WIDTH - 68,
  fanCount: 7, // k=-3..3
  fanAngleStep: 0.24,
  fanSpeed: 135, // (110) ×SR
  aimedSpeed: 202, // (165) ×SR
  aimedOffsetX: 16, // (14)
  fireOffsetY: 24, // (18~20)
  cool: (wave: number) => Math.max(0.7, 1.5 - wave * 0.05),
  killScore: 5000,
  shopDelay: 1.5,
  hitCooldown: 0.05,
} as const;

export const EBULLET = {
  smallSize: 6, // (5)
  bigSize: 9, // (7)
  fanSize: 7, // (6) — 보스 부채꼴 탄은 소형탄보다 의도적으로 큼
  smallDamage: 8,
  bigDamage: 14,
} as const;

export const ORB = {
  fallSpeed: 61, // (46) ×SY
  magnetRadius: 86, // (70) ×SR
  magnetPull: 220, // (180) ×SR
  pickupW: 22, // (14 + 여유, 플레이어 히트박스 +6 포함 반영은 씬에서)
  everyNthIsShield: 4,
  shieldArmorBonus: 18,
  maxPowerBonusScore: 500,
} as const;

export const SUPER = {
  holeMinR: 15, // (13) ×SR
  holeMaxR: 34, // (30)
  holeMarginX: 38, // (34) ×SX
  holeYMin: 67, // (50) ×SY
  holeYMax: 157, // (118)
  holeJitterX: 18, // (16)
  openDelay: 0.25,
  openRate: 2.6,
  spidAt: 1.0,
  rushFrom: 1.0,
  rushTo: 3.0,
  rushPerSec: 26,
  phantomVxMax: 79, // (70) ×SX
  phantomVyMin: 627, // (470) ×SY
  phantomVyMax: 907, // (680)
  phantomHitW: 23, // (20)
  phantomHitH: 32, // (24)
  phantomDamage: 7,
  phantomBossDamage: 6,
  enemyHitCooldown: 0.06,
  endAt: 3.4,
  endInvuln: 0.9,
  bubble1: 'hey! I am Jungjioo!!', // 정본 표기 — 변경 금지
  bubble2: 'Spid!!', // 정본 표기 — 변경 금지
  bubble1Until: 1.0,
  bubble2Until: 2.1,
} as const;

export const SCROLL = {
  base: (wave: number) => 45 + wave * 2.7, // (34 + wave*2) ×SY
  boss: 16, // (12)
} as const;

export const SHOP = {
  powerPrice: (level: number) => 250 + level * 250,
  shieldPrice: (shieldMax: number) => 300 + (shieldMax - 60) * 6,
  shieldStep: 20,
  shieldCap: 160,
  armorPrice: (armorMax: number) => 300 + (armorMax - 50) * 6,
  armorStep: 20,
  armorCap: 150,
  superPrice: 600,
} as const;

export const WAVE = {
  bossEvery: 4,
  clearDelay: 1.6,
  reps: (n: number) => 2 + Math.min(4, Math.floor(n / 2)),
} as const;
