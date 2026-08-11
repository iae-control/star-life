// 게임 세션 상태 — Game/Shop/Result 씬이 공유하는 런 단위 상태 (데모의 G/P 전역 대응).
// 영속 저장(진행도)은 M4에서 SaveSystem으로 정식 도입. 지금은 BEST만 localStorage.
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
import { PLAYER } from './logic/balance';

export const PILOT_ORDER = ['jungjioo', 'parksulhee', 'youngjioo', 'keunaebi'] as const;
export type Pilot = (typeof PILOT_ORDER)[number];
export type WeaponKey = 'pulse' | 'vulcan' | 'proton' | 'light' | 'laser' | 'missile';

/** 기존 세이브와 선택값이 없는 플레이어가 사용하는 파일럿별 시그니처 무기. */
export const PILOT_WEAPON: Record<Pilot, WeaponKey> = {
  jungjioo: 'pulse',
  parksulhee: 'missile',
  youngjioo: 'proton',
  keunaebi: 'laser',
};

/** 파일럿별 주무기 A/B 옵션 — 기존 시그니처를 첫 항목으로 유지한다. */
export const PILOT_WEAPON_OPTIONS: Record<Pilot, readonly [WeaponKey, WeaponKey]> = {
  jungjioo: ['pulse', 'vulcan'],
  parksulhee: ['missile', 'light'],
  youngjioo: ['proton', 'light'],
  keunaebi: ['laser', 'vulcan'],
};

const WEAPON_SELECTION_KEY = 'starlife.weapon-selection.v1';
const weaponSelections: Partial<Record<Pilot, WeaponKey>> = {};
let weaponSelectionsLoaded = false;

export function resolvePilotWeapon(pilot: Pilot, candidate: unknown): WeaponKey {
  const options = PILOT_WEAPON_OPTIONS[pilot];
  return typeof candidate === 'string' && options.includes(candidate as WeaponKey)
    ? (candidate as WeaponKey)
    : PILOT_WEAPON[pilot];
}

function loadWeaponSelections(): void {
  if (weaponSelectionsLoaded) return;
  weaponSelectionsLoaded = true;
  try {
    const parsed = JSON.parse(localStorage.getItem(WEAPON_SELECTION_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    for (const pilot of PILOT_ORDER) {
      const candidate = parsed[pilot];
      if (
        typeof candidate === 'string' &&
        PILOT_WEAPON_OPTIONS[pilot].includes(candidate as WeaponKey)
      )
        weaponSelections[pilot] = candidate as WeaponKey;
    }
  } catch {
    /* 저장 불가·구버전·손상 데이터는 시그니처 무기로 폴백 */
  }
}

function persistWeaponSelections(): void {
  try {
    localStorage.setItem(WEAPON_SELECTION_KEY, JSON.stringify(weaponSelections));
  } catch {
    /* localStorage가 없는 테스트·격리 환경에서는 런타임 선택만 유지 */
  }
}

export function selectedPilotWeapon(pilot: Pilot): WeaponKey {
  loadWeaponSelections();
  return resolvePilotWeapon(pilot, weaponSelections[pilot]);
}

export function selectPilotWeapon(pilot: Pilot, weapon: unknown): WeaponKey {
  loadWeaponSelections();
  const selected = resolvePilotWeapon(pilot, weapon);
  weaponSelections[pilot] = selected;
  persistWeaponSelections();
  return selected;
}

export function cyclePilotWeapon(pilot: Pilot, direction: number): WeaponKey {
  const options = PILOT_WEAPON_OPTIONS[pilot];
  const current = selectedPilotWeapon(pilot);
  const index = options.indexOf(current);
  const step = direction < 0 ? -1 : 1;
  return selectPilotWeapon(pilot, options[(index + options.length + step) % options.length]);
}

/** 파일럿 시그니처 후방무기 — R오브 획득 시 장착, 이후 R오브마다 강화 */
export const PILOT_REAR: Record<Pilot, string> = {
  jungjioo: 'tailgun',
  parksulhee: 'seeker',
  youngjioo: 'sidecutter',
  keunaebi: 'bone',
};
export const REAR_MAX_LEVEL = 5;

/** 파일럿 시그니처 사이드킥 — W오브 획득 시 장착, 이후 강화 */
export const PILOT_SIDEKICK: Record<Pilot, string> = {
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
  pilot: Pilot;
  /** 엔들리스 모드 여부 (캠페인 완주 후 해금) */
  endless: boolean;
}

export interface NewSessionOptions {
  pilot?: Pilot;
  weapon?: unknown;
}

export function newSession(options: NewSessionOptions = {}): GameSession {
  const save = loadSave();
  const pilot = options.pilot ?? save.settings.pilot;
  const weapon = resolvePilotWeapon(pilot, options.weapon ?? selectedPilotWeapon(pilot));
  return {
    score: 0,
    wave: 0,
    level: 1,
    levelWave: 0,
    campaignDone: false,
    kills: 0,
    orbCount: 0,
    weapons: { [weapon]: 1 },
    cur: weapon,
    shield: PLAYER.shieldMax,
    shieldMax: PLAYER.shieldMax,
    armor: PLAYER.armorMax,
    armorMax: PLAYER.armorMax,
    superN: PLAYER.superStart,
    rear: null,
    rearLv: 1,
    sidekick: null,
    sideLv: 1,
    difficulty: save.settings.difficulty,
    pilot,
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
