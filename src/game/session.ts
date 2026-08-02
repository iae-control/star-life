// 게임 세션 상태 — Game/Shop/Result 씬이 공유하는 런 단위 상태 (데모의 G/P 전역 대응).
// 영속 저장(진행도)은 M4에서 SaveSystem으로 정식 도입. 지금은 BEST만 localStorage.
import { PLAYER } from './logic/balance';

export interface GameSession {
  score: number;
  credits: number;
  /** 전역 웨이브 카운터 — 난이도 스케일링에 사용 (레벨을 넘어 계속 증가) */
  wave: number;
  /** 현재 레벨 (1-based) */
  level: number;
  /** 레벨 내 웨이브 인덱스 (0-based, 소진 후 보스) */
  levelWave: number;
  /** 캠페인(현재 데이터의 마지막 레벨) 완주 여부 */
  campaignDone: boolean;
  kills: number;
  orbCount: number;
  weapons: Partial<Record<string, number>>;
  cur: string;
  shield: number;
  shieldMax: number;
  armor: number;
  armorMax: number;
  superN: number;
}

const BEST_KEY = 'starlife.best.v1';

export function newSession(): GameSession {
  return {
    score: 0,
    credits: 0,
    wave: 0,
    level: 1,
    levelWave: 0,
    campaignDone: false,
    kills: 0,
    orbCount: 0,
    weapons: { pulse: 1 },
    cur: 'pulse',
    shield: PLAYER.shieldMax,
    shieldMax: PLAYER.shieldMax,
    armor: PLAYER.armorMax,
    armorMax: PLAYER.armorMax,
    superN: PLAYER.superStart,
  };
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    if (score > loadBest()) localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* 저장 불가 환경(사파리 프라이빗 등)은 무시 */
  }
}

export function weaponLevel(s: GameSession): number {
  return s.weapons[s.cur] ?? 1;
}
