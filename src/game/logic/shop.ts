// 상점 로직 — shop.json 가격 곡선 기반 순수 로직 (vitest 대상). 표시 문자열은 씬에서 i18n.
import { DATA, MAX_WEAPON_LEVEL, WEAPON_KEYS } from '../../data';

export interface ShopPlayerState {
  credits: number;
  weapons: Partial<Record<string, number>>;
  cur: string;
  rear: string | null;
  sidekick: string | null;
  shieldMax: number;
  armorMax: number;
  shield: number;
  armor: number;
  superN: number;
}

export interface UpgradeItem {
  id: 'shield' | 'armor' | 'super';
  price: (s: ShopPlayerState) => number;
  can: (s: ShopPlayerState) => boolean;
  stat: (s: ShopPlayerState) => string;
  apply: (s: ShopPlayerState) => void;
}

export const curLevel = (s: ShopPlayerState): number => s.weapons[s.cur] ?? 1;

export const UPGRADE_ITEMS: UpgradeItem[] = [
  {
    id: 'shield',
    price: (s) =>
      DATA.shop.shield.base + (s.shieldMax - DATA.shop.shield.baseStat) * DATA.shop.shield.perOver,
    can: (s) => s.shieldMax < DATA.shop.shield.cap,
    stat: (s) => `SHD ${s.shieldMax}`,
    apply: (s) => {
      s.shieldMax += DATA.shop.shield.step;
      s.shield = s.shieldMax;
    },
  },
  {
    id: 'armor',
    price: (s) =>
      DATA.shop.armor.base + (s.armorMax - DATA.shop.armor.baseStat) * DATA.shop.armor.perOver,
    can: (s) => s.armorMax < DATA.shop.armor.cap,
    stat: (s) => `ARM ${s.armorMax}`,
    apply: (s) => {
      s.armorMax += DATA.shop.armor.step;
      s.armor = s.armorMax;
    },
  },
  {
    id: 'super',
    price: () => DATA.shop.super.price,
    can: (s) => s.superN < DATA.shop.super.cap,
    stat: (s) => `S x${s.superN}`,
    apply: (s) => {
      s.superN++;
    },
  },
];

export type ShopActionResult = 'bought' | 'equipped' | 'denied' | 'noop';

export function powerPrice(s: ShopPlayerState, key: string): number {
  const lv = s.weapons[key] ?? 1;
  return DATA.shop.power.base + lv * DATA.shop.power.perLevel;
}

/** 무기 행 통합 액션: 미보유=구매+장착, 보유·미장착=장착, 장착중=파워업 (피드백 2) */
export function weaponAction(s: ShopPlayerState, key: string): ShopActionResult {
  const def = DATA.weapons.weapons[key];
  if (!def) return 'noop';
  if (s.weapons[key] === undefined) {
    if (s.credits < def.price) return 'denied';
    s.credits -= def.price;
    s.weapons[key] = 1;
    s.cur = key;
    return 'bought';
  }
  if (s.cur !== key) {
    s.cur = key;
    return 'equipped';
  }
  const lv = s.weapons[key] ?? 1;
  if (lv >= MAX_WEAPON_LEVEL) return 'noop';
  const price = powerPrice(s, key);
  if (s.credits < price) return 'denied';
  s.credits -= price;
  s.weapons[key] = lv + 1;
  return 'bought';
}

/** 장비(후방/사이드킥) 행 액션: 미보유=구매+장착, 보유=탈부착 토글 */
export function equipAction(
  s: ShopPlayerState,
  slot: 'rear' | 'sidekick',
  key: string,
): ShopActionResult {
  const def = DATA.equipment[slot][key];
  if (!def) return 'noop';
  // 보유=장착 단일 모델: 구매 시 즉시 장착, 같은 행을 다시 누르면 탈착(환불 없음),
  // 다른 장비를 사면 교체(이전 장비 소멸)
  if (s[slot] === key) {
    s[slot] = null;
    return 'equipped';
  }
  if (s.credits < def.price) return 'denied';
  s.credits -= def.price;
  s[slot] = key;
  return 'bought';
}

export function itemAction(s: ShopPlayerState, item: UpgradeItem): ShopActionResult {
  if (!item.can(s) || s.credits < item.price(s)) return 'denied';
  s.credits -= item.price(s);
  item.apply(s);
  return 'bought';
}

export const SHOP_WEAPON_KEYS = WEAPON_KEYS;
