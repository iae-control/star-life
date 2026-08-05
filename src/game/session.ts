// 게임 세션 상태 — Game/Shop/Result 씬이 공유하는 런 단위 상태 (데모의 G/P 전역 대응).
// 영속 저장(진행도)은 M4에서 SaveSystem으로 정식 도입. 지금은 BEST만 localStorage.
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
import { PLAYER } from './logic/balance';

/** 파일럿 시그니처 무기 — 무기 구매 폐지, 캐릭터 고정 (P오브로 강화) */
export const PILOT_WEAPON: Record<string, string> = {
  jungjioo: 'pulse',
  parksulhee: 'missile',
  youngjioo: 'proton',
  keunaebi: 'laser',
};

/** 파일럿 시그니처 후방무기 — R오브 획득 시 장착, 이후 R오브마다 강화 */
export const PILOT_REAR: Record<string, string> = {
  jungjioo: 'tailgun',
  parksulhee: 'seeker',
  youngjioo: 'sidecutter',
  keunaebi: 'bone',
};
export const REAR_MAX_LEVEL = 5;

/** 파일럿 시그니처 사이드킥 — W오브 획득 시 장착, 이후 강화 */
export const PILOT_SIDEKICK: Record<string, string> = {
  jungjioo: 'pods',
  parksulhee: 'satellite',
  youngjioo: 'pods',
  keunaebi: 'satellite',
};
export const SIDE_MAX_LEVEL = 3;

export interface GameSession {
  score: number;
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
  /** 후방무기 강화 레벨 (R오브, 1~REAR_MAX_LEVEL) */
  rearLv: number;
  sidekick: string | null;
  /** 사이드킥 강화 레벨 (W오브, 1~SIDE_MAX_LEVEL) */
  sideLv: number;
  difficulty: Difficulty;
  /** 조종사: 정지우(블랙홀 팬텀 러시) / 박슬희(배드민턴 일망타진) */
  pilot: 'jungjioo' | 'parksulhee' | 'youngjioo' | 'keunaebi';
  /** 엔들리스 모드 여부 (캠페인 완주 후 해금) */
  endless: boolean;
}

export function newSession(): GameSession {
  return {
    score: 0,
    wave: 0,
    level: 1,
    levelWave: 0,
    campaignDone: false,
    kills: 0,
    orbCount: 0,
    weapons: { [PILOT_WEAPON[loadSave().settings.pilot] ?? 'pulse']: 1 },
    cur: PILOT_WEAPON[loadSave().settings.pilot] ?? 'pulse',
    shield: PLAYER.shieldMax,
    shieldMax: PLAYER.shieldMax,
    armor: PLAYER.armorMax,
    armorMax: PLAYER.armorMax,
    superN: PLAYER.superStart,
    rear: null,
    rearLv: 1,
    sidekick: null,
    sideLv: 1,
    difficulty: loadSave().settings.difficulty,
    pilot: loadSave().settings.pilot,
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
