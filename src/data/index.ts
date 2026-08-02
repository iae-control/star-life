// 콘텐츠 데이터 레지스트리 — JSON이 단일 출처(PLAN 3장). zod 검증 + 개발 핫리로드.
import rawBosses from './bosses.json';
import rawEnemies from './enemies.json';
import rawEn from './i18n/en.json';
import rawKo from './i18n/ko.json';
import rawLevels from './levels.json';
import {
  bossesSchema,
  enemiesSchema,
  i18nSchema,
  levelsSchema,
  shopSchema,
  wavesSchema,
  weaponsSchema,
  type BossesData,
  type EnemiesData,
  type I18nData,
  type LevelsData,
  type ShopData,
  type WavesData,
  type WeaponsData,
} from './schemas';
import rawShop from './shop.json';
import rawWaves from './waves.json';
import rawWeapons from './weapons.json';

export interface GameData {
  weapons: WeaponsData;
  enemies: EnemiesData;
  bosses: BossesData;
  waves: WavesData;
  levels: LevelsData;
  shop: ShopData;
  i18n: { ko: I18nData; en: I18nData };
}

function parseAll(): GameData {
  return {
    weapons: weaponsSchema.parse(rawWeapons),
    enemies: enemiesSchema.parse(rawEnemies),
    bosses: bossesSchema.parse(rawBosses),
    waves: wavesSchema.parse(rawWaves),
    levels: levelsSchema.parse(rawLevels),
    shop: shopSchema.parse(rawShop),
    i18n: { ko: i18nSchema.parse(rawKo), en: i18nSchema.parse(rawEn) },
  };
}

// 모듈 로드 시점에 즉시 검증 — 실패하면 ZodError가 명확한 경로와 함께 던져진다.
export const DATA: GameData = parseAll();

export const WEAPON_KEYS = Object.keys(DATA.weapons.weapons);
export const MAX_WEAPON_LEVEL = DATA.weapons.maxLevel;

/* ---------- i18n ---------- */
export type Lang = 'ko' | 'en';
const LANG_KEY = 'starlife.lang';
let lang: Lang = 'ko';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'ko') lang = saved;
} catch {
  /* localStorage 불가 환경 */
}

export function getLang(): Lang {
  return lang;
}
export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* 무시 */
  }
}

/** i18n 키 조회 — {0} 자리 치환 지원. 키 누락 시 키 자체를 반환해 눈에 띄게 한다. */
export function t(key: string, ...args: (string | number)[]): string {
  const table = DATA.i18n[lang];
  let s = table[key] ?? DATA.i18n.ko[key] ?? key;
  args.forEach((a, i) => {
    s = s.replace(`{${i}}`, String(a));
  });
  return s;
}

/* ---------- 핫리로드 (개발 서버) ---------- */
// JSON 편집 → 재검증 → DATA 제자리 갱신 → 'data-reloaded' 이벤트로 활성 씬 재시작(세션 유지).
// 검증 실패 시 이전 데이터를 유지하고 콘솔에 명확한 에러를 남긴다.
if (import.meta.hot) {
  import.meta.hot.accept(
    [
      './weapons.json',
      './enemies.json',
      './bosses.json',
      './waves.json',
      './levels.json',
      './shop.json',
      './i18n/ko.json',
      './i18n/en.json',
    ],
    (mods) => {
      const [w, e, b, wv, lv, sh, ko, en] = mods;
      try {
        if (w) DATA.weapons = weaponsSchema.parse(w.default);
        if (e) DATA.enemies = enemiesSchema.parse(e.default);
        if (b) DATA.bosses = bossesSchema.parse(b.default);
        if (wv) DATA.waves = wavesSchema.parse(wv.default);
        if (lv) DATA.levels = levelsSchema.parse(lv.default);
        if (sh) DATA.shop = shopSchema.parse(sh.default);
        if (ko) DATA.i18n.ko = i18nSchema.parse(ko.default);
        if (en) DATA.i18n.en = i18nSchema.parse(en.default);
        WEAPON_KEYS.length = 0;
        WEAPON_KEYS.push(...Object.keys(DATA.weapons.weapons));
        window.__game?.events.emit('data-reloaded');
        console.info('[data] 핫리로드 적용 완료');
      } catch (err) {
        console.error('[data] 검증 실패 — 이전 데이터 유지\n', err);
      }
    },
  );
}
