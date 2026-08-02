// 상점 로직 — 순수 (vitest 대상). 데모 ITEMS/shopAct() 이식.
import { MAX_WEAPON_LEVEL, PLAYER, SHOP, WEAPON_KEYS, WEAPONS, type WeaponKey } from './balance';

export interface ShopPlayerState {
  credits: number;
  weapons: Partial<Record<WeaponKey, number>>;
  cur: WeaponKey;
  shieldMax: number;
  armorMax: number;
  shield: number;
  armor: number;
  superN: number;
}

export interface UpgradeItem {
  id: 'power' | 'shield' | 'armor' | 'super';
  name: (s: ShopPlayerState) => string;
  price: (s: ShopPlayerState) => number;
  can: (s: ShopPlayerState) => boolean;
  stat: (s: ShopPlayerState) => string;
  apply: (s: ShopPlayerState) => void;
}

export const curLevel = (s: ShopPlayerState): number => s.weapons[s.cur] ?? 1;

export const UPGRADE_ITEMS: UpgradeItem[] = [
  {
    id: 'power',
    name: (s) => `${WEAPONS[s.cur].name} 파워 +1`,
    price: (s) => SHOP.powerPrice(curLevel(s)),
    can: (s) => curLevel(s) < MAX_WEAPON_LEVEL,
    stat: (s) => `Lv ${curLevel(s)}/${MAX_WEAPON_LEVEL}`,
    apply: (s) => {
      s.weapons[s.cur] = curLevel(s) + 1;
    },
  },
  {
    id: 'shield',
    name: () => 'SHIELD 최대치 +20 · 완충',
    price: (s) => SHOP.shieldPrice(s.shieldMax),
    can: (s) => s.shieldMax < SHOP.shieldCap,
    stat: (s) => `SHD ${s.shieldMax}`,
    apply: (s) => {
      s.shieldMax += SHOP.shieldStep;
      s.shield = s.shieldMax;
    },
  },
  {
    id: 'armor',
    name: () => 'ARMOR 최대치 +20 · 수리',
    price: (s) => SHOP.armorPrice(s.armorMax),
    can: (s) => s.armorMax < SHOP.armorCap,
    stat: (s) => `ARM ${s.armorMax}`,
    apply: (s) => {
      s.armorMax += SHOP.armorStep;
      s.armor = s.armorMax;
    },
  },
  {
    id: 'super',
    name: () => 'SUPER "Jungjioo" +1',
    price: () => SHOP.superPrice,
    can: (s) => s.superN < PLAYER.superMax,
    stat: (s) => `S x${s.superN}`,
    apply: (s) => {
      s.superN++;
    },
  },
];

export type ShopActionResult = 'bought' | 'equipped' | 'denied' | 'noop';

/** 무기 행 액션: 미보유면 구매+장착, 보유면 장착 전환. */
export function weaponAction(s: ShopPlayerState, key: WeaponKey): ShopActionResult {
  if (s.weapons[key] === undefined) {
    const price = WEAPONS[key].price;
    if (s.credits < price) return 'denied';
    s.credits -= price;
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
