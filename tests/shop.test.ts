import { describe, expect, it } from 'vitest';

import {
  curLevel,
  equipAction,
  itemAction,
  powerPrice,
  UPGRADE_ITEMS,
  weaponAction,
  type ShopPlayerState,
} from '../src/game/logic/shop';

function state(over: Partial<ShopPlayerState> = {}): ShopPlayerState {
  return {
    credits: 10_000,
    weapons: { pulse: 1 },
    cur: 'pulse',
    shieldMax: 60,
    armorMax: 50,
    shield: 60,
    armor: 50,
    superN: 2,
    rear: null,
    sidekick: null,
    ...over,
  };
}

describe('weaponAction', () => {
  it('buys an unowned weapon at level 1 and equips it', () => {
    const s = state();
    expect(weaponAction(s, 'vulcan')).toBe('bought');
    expect(s.credits).toBe(10_000 - 1500);
    expect(s.weapons.vulcan).toBe(1);
    expect(s.cur).toBe('vulcan');
  });

  it('denies purchase without credits', () => {
    const s = state({ credits: 100 });
    expect(weaponAction(s, 'laser')).toBe('denied');
    expect(s.weapons.laser).toBeUndefined();
  });

  it('equips an owned weapon without charging', () => {
    const s = state({ weapons: { pulse: 3, vulcan: 2 } });
    expect(weaponAction(s, 'vulcan')).toBe('equipped');
    expect(s.credits).toBe(10_000);
    expect(s.cur).toBe('vulcan');
  });
});

describe('upgrade items (demo price curves)', () => {
  const [shield, armor, superItem] = UPGRADE_ITEMS;

  it('equipped weapon row upgrades power: 400 + level*400, caps at 6', () => {
    const s = state({ weapons: { pulse: 3 } });
    expect(powerPrice(s, 'pulse')).toBe(1600);
    expect(weaponAction(s, 'pulse')).toBe('bought');
    expect(curLevel(s)).toBe(4);
    expect(s.credits).toBe(10_000 - 1600);
    const maxed = state({ weapons: { pulse: 6 } });
    expect(weaponAction(maxed, 'pulse')).toBe('noop');
  });

  it('equipment: buy equips, tap again unequips, other purchase replaces', () => {
    const s = state();
    expect(equipAction(s, 'rear', 'tailgun')).toBe('bought');
    expect(s.rear).toBe('tailgun');
    expect(equipAction(s, 'rear', 'tailgun')).toBe('equipped');
    expect(s.rear).toBeNull();
    equipAction(s, 'rear', 'tailgun');
    expect(equipAction(s, 'rear', 'sidecutter')).toBe('bought');
    expect(s.rear).toBe('sidecutter');
  });

  it('shield: 300 + (max-50)*6, refills, caps at 150', () => {
    const s = state({ shieldMax: 100, shield: 10 });
    expect(shield?.price(s)).toBe(600);
    itemAction(s, shield!);
    expect(s.shieldMax).toBe(120);
    expect(s.shield).toBe(120);
    expect(shield?.can(state({ shieldMax: 150 }))).toBe(false);
  });

  it('armor: 300 + (max-40)*6, repairs, caps at 140', () => {
    const s = state({ armorMax: 90, armor: 5 });
    expect(armor?.price(s)).toBe(600);
    itemAction(s, armor!);
    expect(s.armorMax).toBe(110);
    expect(s.armor).toBe(110);
    expect(armor?.can(state({ armorMax: 140 }))).toBe(false);
  });

  it('super: flat 600, caps at 5', () => {
    const s = state({ superN: 4 });
    expect(superItem?.price(s)).toBe(600);
    itemAction(s, superItem!);
    expect(s.superN).toBe(5);
    expect(superItem?.can(s)).toBe(false);
  });
});
