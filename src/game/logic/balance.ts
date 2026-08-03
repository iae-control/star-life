// 엔진 상수 — 플레이어 조작감·슈퍼 연출 등 "콘텐츠가 아닌" 값만 남긴다.
// 무기·적·보스·웨이브·상점·레벨 수치는 전부 src/data/*.json (M2 데이터 주도화).
// 주석의 괄호 숫자는 v4 데모(320x480) 원본 값. 변환: x ×1.125, y ×4/3, 방사형 ×1.2247.
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
  shieldMax: 50, // (60) 피드백: 몸빵 너프
  armorMax: 40, // (50)
  shieldRegenDelay: 3.0, // (2.5)
  shieldRegenRate: 4.5, // (7)
  invulnAfterHit: 0.9,
  collideDamage: 13,
  superStart: 2,
  superMax: 5,
} as const;

// 가상 아날로그 스틱 (좌측하단 고정 + 화면 전체 플로팅) — 상대 조작
export const STICK = {
  homeX: 62,
  homeY: GAME_HEIGHT - 74,
  radius: 42, // 노브 최대 이동 반경
  grabRadius: 78, // 고정 스틱 잡기 판정
  deadzone: 0.08,
  curve: 1.4, // 미세 조작 곡선 (mag^curve)
  speed: 322, // maxSpeed(257)보다 빠르게 — 터치 기동성 보정
} as const;

// 난이도 배수 (Easy/Normal/Hard) — 적 체력·적 공격력·크레딧 수입
export interface DiffMods {
  hp: number;
  dmg: number;
  credit: number;
}
export const DIFficulty: Record<'easy' | 'normal' | 'hard', DiffMods> = {
  easy: { hp: 0.75, dmg: 0.7, credit: 1.15 },
  normal: { hp: 1, dmg: 1, credit: 1 },
  hard: { hp: 1.3, dmg: 1.35, credit: 0.85 },
};

// 슈퍼무기 "Jungjioo" — 대사 표기는 정본, 변경 금지 (PLAN 0장)
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
