// SaveSystem — 버전드 스키마 + 이중 기록(주/백업)으로 손상 방지 (PLAN 3장).
// 웹: localStorage. (앱 패키징 시 Capacitor Preferences로 교체 예정 — M6)
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SaveData {
  v: 1;
  best: number;
  endlessBest: number;
  settings: {
    lang: 'ko' | 'en';
    muted: boolean;
    difficulty: Difficulty;
    musicVol: number;
    sfxVol: number;
    vibration: boolean;
    pilot: 'jungjioo' | 'parksulhee';
  };
  progress: {
    /** 도달한 최고 레벨 (이어하기 시작점) */
    unlockedLevel: number;
    endlessUnlocked: boolean;
    tutorialDone: boolean;
  };
}

const KEY = 'starlife.save.v1';
const BACKUP = 'starlife.save.v1.bak';

function defaults(): SaveData {
  return {
    v: 1,
    best: 0,
    endlessBest: 0,
    settings: {
      lang: 'ko',
      muted: false,
      difficulty: 'normal',
      musicVol: 0.8,
      sfxVol: 1,
      vibration: true,
      pilot: 'jungjioo',
    },
    progress: { unlockedLevel: 1, endlessUnlocked: false, tutorialDone: false },
  };
}

function parse(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (d.v !== 1) return null; // 이후 버전은 여기서 마이그레이션
    const base = defaults();
    return {
      v: 1,
      best: typeof d.best === 'number' ? d.best : base.best,
      endlessBest: typeof d.endlessBest === 'number' ? d.endlessBest : base.endlessBest,
      settings: { ...base.settings, ...d.settings },
      progress: { ...base.progress, ...d.progress },
    };
  } catch {
    return null;
  }
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(KEY)) ?? parse(localStorage.getItem(BACKUP)) ?? defaults();
  } catch {
    cache = defaults();
  }
  return cache;
}

export function updateSave(mutate: (s: SaveData) => void): SaveData {
  const s = loadSave();
  mutate(s);
  try {
    const raw = JSON.stringify(s);
    // 이중 기록: 주 키 먼저, 성공하면 백업 갱신 (중간 크래시에도 한쪽은 온전)
    localStorage.setItem(KEY, raw);
    localStorage.setItem(BACKUP, raw);
  } catch {
    /* 저장 불가 환경 무시 */
  }
  return s;
}
