// 상점 로직 — shop.json 가격 곡선 기반 순수 로직 (vitest 대상). 표시 문자열은 씬에서 i18n.
import { DATA, MAX_WEAPON_LEVEL, WEAPON_KEYS } from '../../data';

export interface ShopPlayerState {
  credits: number;
  weapons: Partial<Record<string, number>>;
  cur: string;
  shieldMax: number;
  armorMax: number;
  shield: number;
  armor: number;
  superN: number;
}

export interface UpgradeItem {
  id: 'power' | 'shield' | 'armor' | 'super';
  price: (s: ShopPlayerState) => number;
  can: (s: ShopPlayerState) => boolean;
  stat: (s: ShopPlayerState) => string;
  apply: (s: ShopPlayerState) => void;
}

export const curLevel = (s: ShopPlayerState): number => s.weapons[s.cur] ?? 1;

export const UPGRADE_ITEMS: UpgradeItem[] = [
  {
    id: 'power',
    price: (s) => DATA.shop.power.base + curLevel(s) * DATA.shop.power.perLevel,
    can: (s) => curLevel(s) < MAX_WEAPON_LEVEL,
    stat: (s) => `Lv ${curLevel(s)}/${MAX_WEAPON_LEVEL}`,
    apply: (s) => {
      s.weapons[s.cur] = curLevel(s) + 1;
    },
  },
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

/** 무기 행 액션: 미보유면 구매+장착, 보유면 장착 전환. */
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
  return 'noop';
}

export function itemAction(s: ShopPlayerState, item: UpgradeItem): ShopActionResult {
  if (!item.can(s) || s.credits < item.price(s)) return 'denied';
  s.credits -= item.price(s);
  item.apply(s);
  return 'bought';
}

export const SHOP_WEAPON_KEYS = WEAPON_KEYS;
