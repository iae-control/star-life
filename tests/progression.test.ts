import { describe, expect, it } from 'vitest';

import { DATA } from '../src/data';
import {
  armorStats,
  awardStageClear,
  catalogItem,
  catalogItemsForSlot,
  coolerStats,
  cumulativePriceThroughTier,
  createDefaultProgression,
  defineCatalogPrimaryWeapon,
  definePrimaryWeapon,
  engineStats,
  EQUIPMENT_CATALOG,
  equipItem,
  equippedStats,
  grantCredits,
  isOwned,
  isUnlocked,
  itemTier,
  loadProgression,
  MAX_CREDITS,
  parseProgression,
  priceForTier,
  PROGRESSION_BACKUP_KEY,
  PROGRESSION_STORAGE_KEY,
  purchaseItem,
  saveProgression,
  secondaryStats,
  SELL_REFUND_RATIO,
  sellItem,
  sellRefundForItem,
  stageClearReward,
  unlockCatalogThroughStage,
  unlockItem,
  updateProgression,
  upgradeItem,
  type ProgressionStorage,
} from '../src/game/progression';

class MemoryStorage implements ProgressionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('equipment catalog', () => {
  it('ships the requested engine, cooler, armor and secondary breadth with unique ids', () => {
    expect(EQUIPMENT_CATALOG.engines).toHaveLength(6);
    expect(EQUIPMENT_CATALOG.coolers).toHaveLength(6);
    expect(EQUIPMENT_CATALOG.armors).toHaveLength(6);
    expect(EQUIPMENT_CATALOG.secondaries).toHaveLength(8);

    const items = [
      ...EQUIPMENT_CATALOG.engines,
      ...EQUIPMENT_CATALOG.coolers,
      ...EQUIPMENT_CATALOG.armors,
      ...EQUIPMENT_CATALOG.secondaries,
    ];
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const slot of ['secondary', 'engine', 'cooler', 'armor'] as const) {
      const id = EQUIPMENT_CATALOG.defaults[slot];
      expect(catalogItem(id)?.slot).toBe(slot);
      expect(catalogItemsForSlot(slot).every((item) => item.slot === slot)).toBe(true);
    }
  });

  it('uses rounded exponential prices for successive upgrade tiers', () => {
    const item = catalogItem('engine-vector-twin');
    expect(item).toBeDefined();
    if (!item) return;
    expect(priceForTier(item, 1)).toBe(1600);
    expect(priceForTier(item, 2)).toBe(750);
    const upgrades = [2, 3, 4, 5].map((tier) => priceForTier(item, tier) ?? 0);
    expect(upgrades).toEqual([...upgrades].sort((a, b) => a - b));
    expect(priceForTier(item, 6)).toBeNull();
  });
});

describe('persistent economy and loadout', () => {
  it('starts with five equipped starter slots and no credits', () => {
    const state = createDefaultProgression();
    expect(state.credits).toBe(0);
    expect(state.loadout).toEqual(EQUIPMENT_CATALOG.defaults);
    for (const id of Object.values(state.loadout)) {
      expect(isUnlocked(state, id), id).toBe(true);
      expect(itemTier(state, id), id).toBe(1);
    }
  });

  it('keeps unlock, purchase and equip checks separate', () => {
    const item = catalogItem('engine-solar-ramjet');
    expect(item).toBeDefined();
    if (!item) return;

    let state = grantCredits(createDefaultProgression(), 10_000);
    expect(purchaseItem(state, item).reason).toBe('locked');
    state = unlockItem(state, item.id);
    expect(isUnlocked(state, item.id)).toBe(true);
    expect(isOwned(state, item.id)).toBe(false);

    const purchase = purchaseItem(state, item);
    expect(purchase.ok).toBe(true);
    expect(purchase.cost).toBe(item.price.purchase);
    expect(purchase.state.credits).toBe(10_000 - purchase.cost);
    expect(itemTier(purchase.state, item.id)).toBe(1);
    expect(purchase.state.spent[item.id]).toBe(purchase.cost);

    const equipped = equipItem(purchase.state, 'engine', item.id);
    expect(equipped.ok).toBe(true);
    expect(equipped.state.loadout.engine).toBe(item.id);
    expect(equipItem(equipped.state, 'armor', item.id).reason).toBe('slot-mismatch');
  });

  it('rejects unaffordable transactions and caps upgrades at max tier', () => {
    const item = catalogItem(EQUIPMENT_CATALOG.defaults.engine);
    expect(item).toBeDefined();
    if (!item) return;

    const poor = createDefaultProgression();
    const failed = upgradeItem(poor, item);
    expect(failed.reason).toBe('insufficient-credits');
    expect(failed.state).toBe(poor);

    let state = grantCredits(poor, 1_000_000);
    for (let target = 2; target <= item.maxTier; target++) {
      const upgraded = upgradeItem(state, item);
      expect(upgraded.ok, `tier ${target}`).toBe(true);
      expect(upgraded.cost).toBe(priceForTier(item, target));
      state = upgraded.state;
    }
    expect(itemTier(state, item.id)).toBe(item.maxTier);
    expect(upgradeItem(state, item).reason).toBe('max-tier');
  });

  it('supports future primary weapon string ids without importing a weapon-key union', () => {
    const weapon = definePrimaryWeapon('rail.future-lance', 2400, {
      maxTier: 3,
      upgradeBase: 1000,
      growth: 1.5,
    });
    let state = grantCredits(createDefaultProgression(), 20_000);
    expect(purchaseItem(state, weapon).reason).toBe('locked');
    state = unlockItem(state, weapon.id);
    const bought = purchaseItem(state, weapon);
    expect(bought.ok).toBe(true);
    const equipped = equipItem(bought.state, 'primary', weapon.id, weapon);
    expect(equipped.ok).toBe(true);
    expect(equipped.state.loadout.primary).toBe('rail.future-lance');
    expect(upgradeItem(equipped.state, weapon).state.owned['rail.future-lance']).toBe(2);
  });

  it('tracks real spend and refunds 60% when selling an equipped purchased item', () => {
    const item = catalogItem('engine-vector-twin');
    expect(item).toBeDefined();
    if (!item) return;

    let state = grantCredits(createDefaultProgression(), 20_000);
    state = purchaseItem(state, item).state;
    state = upgradeItem(state, item).state;
    state = equipItem(state, 'engine', item.id).state;
    const paid = (priceForTier(item, 1) ?? 0) + (priceForTier(item, 2) ?? 0);
    const expectedRefund =
      Math.floor((paid * SELL_REFUND_RATIO) / item.price.roundTo) * item.price.roundTo;
    expect(state.spent[item.id]).toBe(paid);
    expect(sellRefundForItem(state, item)).toBe(expectedRefund);

    const capped = grantCredits(state, MAX_CREDITS);
    const blockedAtCap = sellItem(capped, item);
    expect(blockedAtCap.reason).toBe('credit-cap');
    expect(blockedAtCap.state).toBe(capped);

    const creditsBefore = state.credits;
    const sold = sellItem(state, item);
    expect(sold.ok).toBe(true);
    expect(sold.refund).toBe(expectedRefund);
    expect(sold.state.credits).toBe(creditsBefore + expectedRefund);
    expect(sold.state.owned[item.id]).toBeUndefined();
    expect(sold.state.spent[item.id]).toBeUndefined();
    expect(sold.state.loadout.engine).toBe(EQUIPMENT_CATALOG.defaults.engine);
    expect(itemTier(sold.state, EQUIPMENT_CATALOG.defaults.engine)).toBeGreaterThanOrEqual(1);
  });

  it('resets upgraded starter gear but never sells its free grade-one chassis', () => {
    const starterId = EQUIPMENT_CATALOG.defaults.cooler;
    const starter = catalogItem(starterId);
    expect(starter).toBeDefined();
    if (!starter) return;

    let state = grantCredits(createDefaultProgression(), 10_000);
    state = upgradeItem(state, starter).state;
    const expectedRefund = sellRefundForItem(state, starter);
    expect(expectedRefund).toBeGreaterThan(0);

    const sold = sellItem(state, starter);
    expect(sold.ok).toBe(true);
    expect(sold.refund).toBe(expectedRefund);
    expect(itemTier(sold.state, starterId)).toBe(1);
    expect(sold.state.loadout.cooler).toBe(starterId);
    expect(sold.state.spent[starterId]).toBeUndefined();
    expect(sellItem(sold.state, starter).reason).toBe('not-sellable');
  });

  it('reconstructs cumulative spend for sellable legacy saves without a spend ledger', () => {
    const item = catalogItem('armor-titanium-weave');
    expect(item).toBeDefined();
    if (!item) return;
    const legacy = parseProgression(
      JSON.stringify({
        v: 1,
        credits: 0,
        owned: { [item.id]: 2 },
        unlocked: [item.id],
        loadout: { armor: item.id },
      }),
    );
    expect(legacy).not.toBeNull();
    if (!legacy) return;
    expect(legacy.spent[item.id]).toBeUndefined();
    const historicalSpend = cumulativePriceThroughTier(item, 2) ?? 0;
    expect(sellRefundForItem(legacy, item)).toBe(
      Math.floor((historicalSpend * SELL_REFUND_RATIO) / item.price.roundTo) * item.price.roundTo,
    );
    expect(sellItem(legacy, item).state.loadout.armor).toBe(EQUIPMENT_CATALOG.defaults.armor);
  });

  it('clamps credit grants and ignores invalid or negative amounts', () => {
    const initial = createDefaultProgression();
    expect(grantCredits(initial, -100)).toBe(initial);
    expect(grantCredits(initial, Number.NaN)).toBe(initial);
    expect(grantCredits(initial, MAX_CREDITS + 100).credits).toBe(MAX_CREDITS);
  });
});

describe('stage rewards and unlock pacing', () => {
  it('awards a larger first-clear payout, persists clears and unlocks the next stage catalog', () => {
    const initial = createDefaultProgression();
    const first = awardStageClear(initial, {
      stageId: 'nebula',
      stageNumber: 1,
      difficulty: 'normal',
    });
    expect(first.firstClear).toBe(true);
    expect(first.reward).toBe(
      stageClearReward({ stageNumber: 1, difficulty: 'normal', firstClear: true }),
    );
    expect(first.state.credits).toBe(first.reward);
    expect(first.state.stageClears.nebula).toBe(1);
    expect(first.newlyUnlocked).toContain('engine-solar-ramjet');

    const repeat = awardStageClear(first.state, {
      stageId: 'nebula',
      stageNumber: 1,
      difficulty: 'normal',
    });
    expect(repeat.firstClear).toBe(false);
    expect(repeat.reward).toBeLessThan(first.reward);
    expect(repeat.state.stageClears.nebula).toBe(2);
  });

  it('applies difficulty and flawless multipliers deterministically', () => {
    const normal = stageClearReward({ stageNumber: 3, difficulty: 'normal' });
    const hardFlawless = stageClearReward({
      stageNumber: 3,
      difficulty: 'hard',
      flawless: true,
    });
    expect(hardFlawless).toBeGreaterThan(normal);
    expect(hardFlawless % EQUIPMENT_CATALOG.stageRewards.roundTo).toBe(0);
  });

  it('can unlock built-in gear by stage without affecting unknown primary ids', () => {
    const initial = unlockItem(createDefaultProgression(), 'scatter.future-burst');
    const unlocked = unlockCatalogThroughStage(initial, 6);
    expect(catalogItemsForSlot('armor').every((item) => isUnlocked(unlocked, item.id))).toBe(true);
    expect(isUnlocked(unlocked, 'scatter.future-burst')).toBe(true);
  });

  it('funds a maxed primary plus several equipment purchases across the campaign', () => {
    const starterWeapon = DATA.weapons.weapons.pulse!;
    const primary = defineCatalogPrimaryWeapon('pulse', starterWeapon.price, 0);
    const maxPrimarySpend = cumulativePriceThroughTier(primary, primary.maxTier) ?? Infinity;
    const supportIds = [
      'engine-vector-twin',
      'cooler-cryo-loop',
      'armor-titanium-weave',
      'secondary-tail-cannon',
    ];
    const supportSpend = supportIds.reduce((total, id) => {
      const item = catalogItem(id);
      return total + (item ? (priceForTier(item, 1) ?? 0) : Infinity);
    }, 0);
    const stages = DATA.levels.levels.length;
    const easyCampaignIncome = Array.from({ length: stages }, (_, index) =>
      stageClearReward({ stageNumber: index + 1, difficulty: 'easy', firstClear: true }),
    ).reduce((sum, reward) => sum + reward, 0);

    expect(stages).toBeGreaterThanOrEqual(6);
    expect(maxPrimarySpend).toBeGreaterThan(20_000);
    expect(easyCampaignIncome).toBeGreaterThanOrEqual(maxPrimarySpend + supportSpend);
  });
});

describe('tier-scaled equipment stats', () => {
  it('scales engine speed, cooler recovery/capacity, armor hp/regen and secondary output', () => {
    const engine1 = engineStats('engine-ion-sparrow', 1);
    const engine5 = engineStats('engine-ion-sparrow', 5);
    expect(engine5?.speed).toBeGreaterThan(engine1?.speed ?? 0);

    const cooler1 = coolerStats('cooler-cryo-loop', 1);
    const cooler5 = coolerStats('cooler-cryo-loop', 5);
    expect(cooler5?.cooling).toBeGreaterThan(cooler1?.cooling ?? 0);
    expect(cooler5?.heatCapacity).toBeGreaterThan(cooler1?.heatCapacity ?? 0);

    const armor1 = armorStats('armor-titanium-weave', 1);
    const armor5 = armorStats('armor-titanium-weave', 5);
    expect(armor5?.hp).toBeGreaterThan(armor1?.hp ?? 0);
    expect(armor5?.regen).toBeGreaterThan(armor1?.regen ?? 0);

    const secondary1 = secondaryStats('secondary-seeker-rack', 1);
    const secondary5 = secondaryStats('secondary-seeker-rack', 5);
    expect(secondary5?.damage).toBeGreaterThan(secondary1?.damage ?? 0);
    expect(secondary5?.fireRate).toBeGreaterThan(secondary1?.fireRate ?? 0);
    expect(secondary5?.heat).toBeLessThan(secondary1?.heat ?? Infinity);
    expect(secondary5?.projectileSpeed).toBeGreaterThan(secondary1?.projectileSpeed ?? 0);
  });

  it('returns all four active equipment profiles for the current loadout', () => {
    const stats = equippedStats(createDefaultProgression());
    expect(stats.engine?.speed).toBeGreaterThan(0);
    expect(stats.cooler?.cooling).toBeGreaterThan(0);
    expect(stats.armor?.hp).toBeGreaterThan(0);
    expect(stats.secondary?.damage).toBeGreaterThan(0);
  });
});

describe('safe progression persistence', () => {
  it('rejects malformed or incompatible versions and sanitises partial v1 saves', () => {
    expect(parseProgression('{broken')).toBeNull();
    expect(parseProgression(JSON.stringify({ v: 2, credits: 999 }))).toBeNull();

    const parsed = parseProgression(
      JSON.stringify({
        v: 1,
        credits: -50,
        owned: { 'laser.future-beam': 3, bad: -2 },
        spent: { 'laser.future-beam': 900, orphan: 400, bad: -10 },
        unlocked: ['laser.future-beam', '', '__proto__'],
        loadout: {
          primary: 'laser.future-beam',
          secondary: 'engine-ion-sparrow',
          engine: 'missing-engine',
        },
        stageClears: { nebula: 2, broken: -1 },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.credits).toBe(0);
    expect(parsed?.loadout.primary).toBe('laser.future-beam');
    expect(parsed?.loadout.secondary).toBe(EQUIPMENT_CATALOG.defaults.secondary);
    expect(parsed?.loadout.engine).toBe(EQUIPMENT_CATALOG.defaults.engine);
    expect(parsed?.owned['laser.future-beam']).toBe(3);
    expect(parsed?.spent).toEqual({ 'laser.future-beam': 900 });
    expect(parsed?.owned.bad).toBeUndefined();
    expect(parsed?.stageClears).toEqual({ nebula: 2 });
  });

  it('round-trips primary and backup storage and restores from a corrupt primary', () => {
    const storage = new MemoryStorage();
    const state = grantCredits(createDefaultProgression(), 4321);
    expect(saveProgression(state, storage)).toBe(true);
    expect(storage.getItem(PROGRESSION_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(PROGRESSION_BACKUP_KEY)).not.toBeNull();
    expect(loadProgression(storage).credits).toBe(4321);

    storage.setItem(PROGRESSION_STORAGE_KEY, '{corrupt');
    expect(loadProgression(storage).credits).toBe(4321);
  });

  it('survives unavailable storage and supports an atomic load-update-save helper', () => {
    const unavailable: ProgressionStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadProgression(unavailable)).toEqual(createDefaultProgression());
    expect(saveProgression(createDefaultProgression(), unavailable)).toBe(false);

    const storage = new MemoryStorage();
    const updated = updateProgression((state) => grantCredits(state, 250), storage);
    expect(updated.credits).toBe(250);
    expect(loadProgression(storage).credits).toBe(250);
  });
});
