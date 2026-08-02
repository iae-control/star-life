// 게임 세션 상태 — Game/Shop/Result 씬이 공유하는 런 단위 상태 (데모의 G/P 전역 대응).
// 영속 저장(진행도)은 M4에서 SaveSystem으로 정식 도입. 지금은 BEST만 localStorage.
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
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
  /** 후방무기/사이드킥 (미보유 = null) */
  rear: string | null;
  sidekick: string | null;
  difficulty: Difficulty;
  /** 엔들리스 모드 여부 (캠페인 완주 후 해금) */
  endless: boolean;
}

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
    rear: null,
    sidekick: null,
    difficulty: loadSave().settings.difficulty,
    endless: false,
  };
}

export function loadBest(): number {
  return loadSave().best;
}

export function saveBest(score: number): void {
  updateSave((s) => {
    if (score > s.best) s.best = score;
  });
}

export function weaponLevel(s: GameSession): number {
  return s.weapons[s.cur] ?? 1;
}
