// 게임 세션 상태 — Game/Shop/Result 씬이 공유하는 런 단위 상태 (데모의 G/P 전역 대응).
// 영속 저장(진행도)은 M4에서 SaveSystem으로 정식 도입. 지금은 BEST만 localStorage.
import { PLAYER, type WeaponKey } from './logic/balance';

export interface GameSession {
  score: number;
  credits: number;
  wave: number;
  kills: number;
  orbCount: number;
  weapons: Partial<Record<WeaponKey, number>>;
  cur: WeaponKey;
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
