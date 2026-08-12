import rawCatalog from '../data/equipmentCatalog.json';
import {
  equipmentCatalogSchema,
  type EquipmentCatalogItem,
  type ProgressionPrice,
} from '../data/schemas';

export const PROGRESSION_VERSION = 1 as const;
export const PROGRESSION_STORAGE_KEY = 'starlife.progression.v1';
export const PROGRESSION_BACKUP_KEY = 'starlife.progression.v1.bak';
export const MAX_CREDITS = 999_999_999;
/** Tyrian-style resale keeps experimentation useful without making repeated flips profitable. */
export const SELL_REFUND_RATIO = 0.6;

export const LOADOUT_SLOTS = ['primary', 'secondary', 'engine', 'cooler', 'armor'] as const;
export type LoadoutSlot = (typeof LOADOUT_SLOTS)[number];
export type EquipmentSlot = Exclude<LoadoutSlot, 'primary'>;
export type ProgressionDifficulty = 'easy' | 'normal' | 'hard';

export interface ProgressionLoadout {
  primary: string;
  secondary: string;
  engine: string;
  cooler: string;
  armor: string;
}

export interface ProgressionState {
  v: typeof PROGRESSION_VERSION;
  credits: number;
  /** Item id -> current tier. Primary weapon ids deliberately remain open strings. */
  owned: Record<string, number>;
  /** Item id -> credits actually paid for purchase and upgrades. Missing means a legacy save. */
  spent: Record<string, number>;
  /** Shop visibility/progression is separate from ownership. */
  unlocked: string[];
  loadout: ProgressionLoadout;
  /** Stable stage id -> number of clears. Used to distinguish first-clear rewards. */
  stageClears: Record<string, number>;
}

export interface ProgressionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Minimal store shape also accepted for weapons supplied by the separate weapon catalog. */
export interface StoreItemDefinition {
  id: string;
  slot: LoadoutSlot;
  maxTier: number;
  price: ProgressionPrice;
}

export type TransactionReason =
  | 'ok'
  | 'unknown-item'
  | 'locked'
  | 'already-owned'
  | 'not-owned'
  | 'max-tier'
  | 'insufficient-credits'
  | 'not-sellable'
  | 'credit-cap'
  | 'slot-mismatch';

export interface TransactionResult {
  ok: boolean;
  reason: TransactionReason;
  cost: number;
  state: ProgressionState;
}

export interface SellResult {
  ok: boolean;
  reason: TransactionReason;
  refund: number;
  /** Default item selected when the sold item occupied its slot. */
  replacement: string | null;
  state: ProgressionState;
}

export interface StageClearRewardInput {
  stageNumber: number;
  difficulty?: ProgressionDifficulty;
  flawless?: boolean;
  firstClear?: boolean;
}

export interface AwardStageClearInput extends Omit<StageClearRewardInput, 'firstClear'> {
  stageId: string;
}

export interface StageClearAward {
  state: ProgressionState;
  reward: number;
  firstClear: boolean;
  newlyUnlocked: string[];
}

export interface EngineStats {
  speed: number;
}

export interface CoolerStats {
  cooling: number;
  heatCapacity: number;
}

export interface ArmorStats {
  hp: number;
  regen: number;
}

export interface SecondaryStats {
  damage: number;
  fireRate: number;
  heat: number;
  projectileSpeed: number;
}

export const EQUIPMENT_CATALOG = equipmentCatalogSchema.parse(rawCatalog);

const catalogItems: EquipmentCatalogItem[] = [
  ...EQUIPMENT_CATALOG.engines,
  ...EQUIPMENT_CATALOG.coolers,
  ...EQUIPMENT_CATALOG.armors,
  ...EQUIPMENT_CATALOG.secondaries,
];
const catalogById = new Map(catalogItems.map((item) => [item.id, item]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 96 &&
    !['__proto__', 'constructor', 'prototype'].includes(value) &&
    /^[a-zA-Z0-9._:-]+$/.test(value)
  );
}

function finiteInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function cloneState(state: ProgressionState): ProgressionState {
  return {
    ...state,
    owned: { ...state.owned },
    spent: { ...state.spent },
    unlocked: [...state.unlocked],
    loadout: { ...state.loadout },
    stageClears: { ...state.stageClears },
  };
}

function starterOwned(): Record<string, number> {
  const defaults = EQUIPMENT_CATALOG.defaults;
  return {
    [defaults.primary]: 1,
    [defaults.secondary]: 1,
    [defaults.engine]: 1,
    [defaults.cooler]: 1,
    [defaults.armor]: 1,
  };
}

export function createDefaultProgression(): ProgressionState {
  const defaults = EQUIPMENT_CATALOG.defaults;
  const unlocked = new Set<string>([
    defaults.primary,
    ...catalogItems.filter((item) => item.unlockStage <= 1).map((item) => item.id),
  ]);
  return {
    v: PROGRESSION_VERSION,
    credits: 0,
    owned: starterOwned(),
    spent: {},
    unlocked: [...unlocked],
    loadout: { ...defaults },
    stageClears: {},
  };
}

/** Parses and sanitises a v1 save. Unknown weapon ids survive when they are valid string ids. */
export function parseProgression(raw: string | null): ProgressionState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== PROGRESSION_VERSION) return null;

    const state = createDefaultProgression();
    state.credits = finiteInt(parsed.credits, 0, 0, MAX_CREDITS);

    if (isRecord(parsed.owned)) {
      for (const [id, tier] of Object.entries(parsed.owned)) {
        if (isSafeId(id) && typeof tier === 'number' && Number.isFinite(tier) && tier >= 1) {
          state.owned[id] = finiteInt(tier, 1, 1, 99);
        }
      }
    }

    if (isRecord(parsed.spent)) {
      for (const [id, amount] of Object.entries(parsed.spent)) {
        if (
          isSafeId(id) &&
          state.owned[id] !== undefined &&
          typeof amount === 'number' &&
          Number.isFinite(amount) &&
          amount > 0
        ) {
          state.spent[id] = finiteInt(amount, 0, 1, MAX_CREDITS);
        }
      }
    }

    const unlocked = new Set(state.unlocked);
    if (Array.isArray(parsed.unlocked)) {
      for (const id of parsed.unlocked.slice(0, 512)) if (isSafeId(id)) unlocked.add(id);
    }
    for (const id of Object.keys(state.owned)) unlocked.add(id);
    state.unlocked = [...unlocked];

    if (isRecord(parsed.stageClears)) {
      for (const [stageId, clears] of Object.entries(parsed.stageClears)) {
        if (
          isSafeId(stageId) &&
          typeof clears === 'number' &&
          Number.isFinite(clears) &&
          clears > 0
        ) {
          state.stageClears[stageId] = finiteInt(clears, 1, 1, 9999);
        }
      }
    }

    if (isRecord(parsed.loadout)) {
      const primary = parsed.loadout.primary;
      if (isSafeId(primary) && state.owned[primary] !== undefined && unlocked.has(primary)) {
        state.loadout.primary = primary;
      }
      for (const slot of ['secondary', 'engine', 'cooler', 'armor'] as const) {
        const id = parsed.loadout[slot];
        const item = isSafeId(id) ? catalogById.get(id) : undefined;
        if (item?.slot === slot && state.owned[item.id] !== undefined && unlocked.has(item.id)) {
          state.loadout[slot] = item.id;
        }
      }
    }

    return state;
  } catch {
    return null;
  }
}

function browserStorage(): ProgressionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeRead(storage: ProgressionStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function loadProgression(
  storage: ProgressionStorage | null = browserStorage(),
): ProgressionState {
  if (!storage) return createDefaultProgression();
  return (
    parseProgression(safeRead(storage, PROGRESSION_STORAGE_KEY)) ??
    parseProgression(safeRead(storage, PROGRESSION_BACKUP_KEY)) ??
    createDefaultProgression()
  );
}

export function saveProgression(
  state: ProgressionState,
  storage: ProgressionStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  const normalised = parseProgression(JSON.stringify(state)) ?? createDefaultProgression();
  const raw = JSON.stringify(normalised);
  let saved = false;
  try {
    storage.setItem(PROGRESSION_STORAGE_KEY, raw);
    saved = true;
  } catch {
    /* Persistent storage may be unavailable in private/test contexts. */
  }
  try {
    storage.setItem(PROGRESSION_BACKUP_KEY, raw);
  } catch {
    /* The primary write still counts as success when backup storage is unavailable. */
  }
  return saved;
}

export function updateProgression(
  mutate: (state: ProgressionState) => ProgressionState,
  storage: ProgressionStorage | null = browserStorage(),
): ProgressionState {
  const mutated = mutate(loadProgression(storage));
  const next = parseProgression(JSON.stringify(mutated)) ?? createDefaultProgression();
  saveProgression(next, storage);
  return next;
}

export function catalogItem(itemId: string): EquipmentCatalogItem | undefined {
  return catalogById.get(itemId);
}

export function catalogItemsForSlot(slot: EquipmentSlot): EquipmentCatalogItem[] {
  return catalogItems.filter((item) => item.slot === slot);
}

/** Adapts any current/future weapon string id to the generic economy contract. */
export function definePrimaryWeapon(
  id: string,
  purchase: number,
  options: {
    maxTier?: number;
    upgradeBase?: number;
    growth?: number;
    roundTo?: number;
  } = {},
): StoreItemDefinition {
  const safePurchase = finiteInt(purchase, 0, 0, MAX_CREDITS);
  return {
    id,
    slot: 'primary',
    maxTier: finiteInt(options.maxTier ?? 10, 10, 1, 99),
    price: {
      purchase: safePurchase,
      upgradeBase: finiteInt(
        options.upgradeBase ?? Math.max(100, Math.round(safePurchase * 0.55)),
        100,
        0,
        MAX_CREDITS,
      ),
      growth: Math.max(1, Math.min(4, options.growth ?? 1.6)),
      roundTo: finiteInt(options.roundTo ?? 25, 25, 1, 1000),
    },
  };
}

/** Shared primary catalogue curve: archetypes get modest price bands, not runaway index inflation. */
export function defineCatalogPrimaryWeapon(
  id: string,
  purchase: number,
  catalogIndex: number,
): StoreItemDefinition {
  const index = finiteInt(catalogIndex, 0, 0, 9999);
  const archetypeBand = Math.floor(index / 3);
  const variantBand = index % 3;
  return definePrimaryWeapon(id, purchase, {
    maxTier: 10,
    upgradeBase: 600 + archetypeBand * 60 + variantBand * 45,
    growth: 1.36,
    roundTo: 25,
  });
}

function resolveItem(
  item: string | StoreItemDefinition | EquipmentCatalogItem,
): StoreItemDefinition | undefined {
  return typeof item === 'string' ? catalogById.get(item) : item;
}

function validItem(item: StoreItemDefinition | undefined): item is StoreItemDefinition {
  return Boolean(
    item &&
    isSafeId(item.id) &&
    LOADOUT_SLOTS.includes(item.slot) &&
    Number.isInteger(item.maxTier) &&
    item.maxTier >= 1 &&
    Number.isFinite(item.price.purchase) &&
    Number.isFinite(item.price.upgradeBase) &&
    Number.isFinite(item.price.growth) &&
    Number.isInteger(item.price.roundTo) &&
    item.price.purchase >= 0 &&
    item.price.upgradeBase >= 0 &&
    item.price.growth >= 1 &&
    item.price.roundTo > 0,
  );
}

function roundCurrency(value: number, increment: number): number {
  return Math.max(0, Math.round(value / increment) * increment);
}

/** Tier 1 is the purchase cost; tier 2+ follows the item's exponential upgrade curve. */
export function priceForTier(item: StoreItemDefinition, targetTier: number): number | null {
  if (
    !validItem(item) ||
    !Number.isInteger(targetTier) ||
    targetTier < 1 ||
    targetTier > item.maxTier
  )
    return null;
  if (targetTier === 1) return roundCurrency(item.price.purchase, item.price.roundTo);
  const raw = item.price.upgradeBase * item.price.growth ** (targetTier - 2);
  return Math.min(MAX_CREDITS, roundCurrency(raw, item.price.roundTo));
}

/** Purchase plus every upgrade through `tier`; useful for legacy saves and economy budgets. */
export function cumulativePriceThroughTier(item: StoreItemDefinition, tier: number): number | null {
  if (!validItem(item) || !Number.isInteger(tier) || tier < 1 || tier > item.maxTier) return null;
  let total = 0;
  for (let target = 1; target <= tier; target++) {
    const price = priceForTier(item, target);
    if (price === null) return null;
    total = Math.min(MAX_CREDITS, total + price);
  }
  return total;
}

export function isUnlocked(state: ProgressionState, itemId: string): boolean {
  return state.unlocked.includes(itemId);
}

export function isOwned(state: ProgressionState, itemId: string): boolean {
  return state.owned[itemId] !== undefined;
}

export function itemTier(state: ProgressionState, itemId: string): number {
  return state.owned[itemId] ?? 0;
}

export function unlockItem(state: ProgressionState, itemId: string): ProgressionState {
  if (!isSafeId(itemId) || isUnlocked(state, itemId)) return state;
  const next = cloneState(state);
  next.unlocked.push(itemId);
  return next;
}

export function unlockCatalogThroughStage(
  state: ProgressionState,
  stageNumber: number,
): ProgressionState {
  const stage = finiteInt(stageNumber, 1, 1, 9999);
  let next = state;
  for (const item of catalogItems) {
    if (item.unlockStage <= stage) next = unlockItem(next, item.id);
  }
  return next;
}

export function grantCredits(state: ProgressionState, amount: number): ProgressionState {
  const grant = finiteInt(amount, 0, 0, MAX_CREDITS);
  if (grant === 0) return state;
  const next = cloneState(state);
  next.credits = Math.min(MAX_CREDITS, next.credits + grant);
  return next;
}

function transactionFailure(
  state: ProgressionState,
  reason: Exclude<TransactionReason, 'ok'>,
  cost = 0,
): TransactionResult {
  return { ok: false, reason, cost, state };
}

export function purchaseItem(
  state: ProgressionState,
  itemInput: string | StoreItemDefinition | EquipmentCatalogItem,
): TransactionResult {
  const item = resolveItem(itemInput);
  if (!validItem(item)) return transactionFailure(state, 'unknown-item');
  if (!isUnlocked(state, item.id)) return transactionFailure(state, 'locked');
  if (isOwned(state, item.id)) return transactionFailure(state, 'already-owned');
  const cost = priceForTier(item, 1) ?? 0;
  if (state.credits < cost) return transactionFailure(state, 'insufficient-credits', cost);

  const next = cloneState(state);
  next.credits -= cost;
  next.owned[item.id] = 1;
  if (cost > 0) next.spent[item.id] = cost;
  return { ok: true, reason: 'ok', cost, state: next };
}

export function upgradeItem(
  state: ProgressionState,
  itemInput: string | StoreItemDefinition | EquipmentCatalogItem,
): TransactionResult {
  const item = resolveItem(itemInput);
  if (!validItem(item)) return transactionFailure(state, 'unknown-item');
  const tier = itemTier(state, item.id);
  if (tier === 0) return transactionFailure(state, 'not-owned');
  if (tier >= item.maxTier) return transactionFailure(state, 'max-tier');
  const cost = priceForTier(item, tier + 1) ?? 0;
  if (state.credits < cost) return transactionFailure(state, 'insufficient-credits', cost);

  const next = cloneState(state);
  next.credits -= cost;
  next.owned[item.id] = tier + 1;
  const legacySpend = cumulativePriceThroughTier(item, tier) ?? 0;
  next.spent[item.id] = Math.min(MAX_CREDITS, (state.spent[item.id] ?? legacySpend) + cost);
  return { ok: true, reason: 'ok', cost, state: next };
}

function isStarterItem(item: StoreItemDefinition): boolean {
  return EQUIPMENT_CATALOG.defaults[item.slot] === item.id;
}

/** Returns tracked real spend, reconstructing the deterministic old price curve for v1 saves. */
export function spentOnItem(state: ProgressionState, itemInput: StoreItemDefinition): number {
  if (!validItem(itemInput)) return 0;
  const tier = itemTier(state, itemInput.id);
  if (tier === 0) return 0;
  const tracked = state.spent[itemInput.id];
  if (tracked !== undefined) return finiteInt(tracked, 0, 0, MAX_CREDITS);
  return cumulativePriceThroughTier(itemInput, tier) ?? 0;
}

function refundCurrency(value: number, increment: number): number {
  return Math.max(0, Math.floor(value / increment) * increment);
}

export function sellRefundForItem(state: ProgressionState, itemInput: StoreItemDefinition): number {
  const spend = spentOnItem(state, itemInput);
  return refundCurrency(spend * SELL_REFUND_RATIO, itemInput.price.roundTo);
}

/**
 * Sells a purchased item and safely falls back to the slot's starter item when equipped.
 * Starter gear is never removed: selling an upgraded starter is a grade reset, while grade 1
 * cannot be sold. This makes the operation reversible without a free-credit starter exploit.
 */
export function sellItem(
  state: ProgressionState,
  itemInput: string | StoreItemDefinition | EquipmentCatalogItem,
): SellResult {
  const item = resolveItem(itemInput);
  if (!validItem(item)) {
    return { ok: false, reason: 'unknown-item', refund: 0, replacement: null, state };
  }
  if (!isOwned(state, item.id)) {
    return { ok: false, reason: 'not-owned', refund: 0, replacement: null, state };
  }

  const refund = sellRefundForItem(state, item);
  if (refund <= 0) {
    return { ok: false, reason: 'not-sellable', refund: 0, replacement: null, state };
  }
  if (state.credits > MAX_CREDITS - refund) {
    return { ok: false, reason: 'credit-cap', refund: 0, replacement: null, state };
  }
  const credited = refund;

  const next = cloneState(state);
  next.credits += credited;
  delete next.spent[item.id];

  if (isStarterItem(item)) {
    next.owned[item.id] = 1;
    return { ok: true, reason: 'ok', refund: credited, replacement: null, state: next };
  }

  delete next.owned[item.id];
  let replacement: string | null = null;
  if (next.loadout[item.slot] === item.id) {
    replacement = EQUIPMENT_CATALOG.defaults[item.slot];
    next.loadout[item.slot] = replacement;
    next.owned[replacement] ??= 1;
    if (!next.unlocked.includes(replacement)) next.unlocked.push(replacement);
  }
  return { ok: true, reason: 'ok', refund: credited, replacement, state: next };
}

export function equipItem(
  state: ProgressionState,
  slot: LoadoutSlot,
  itemId: string,
  definition?: StoreItemDefinition,
): TransactionResult {
  if (!isSafeId(itemId)) return transactionFailure(state, 'unknown-item');
  if (!isUnlocked(state, itemId)) return transactionFailure(state, 'locked');
  if (!isOwned(state, itemId)) return transactionFailure(state, 'not-owned');

  const item = definition ?? catalogById.get(itemId);
  if (item && item.id !== itemId) return transactionFailure(state, 'unknown-item');
  // Unknown catalog ids are valid only in the open-ended primary slot.
  if (item && item.slot !== slot) return transactionFailure(state, 'slot-mismatch');
  if (!item && slot !== 'primary') return transactionFailure(state, 'unknown-item');

  const next = cloneState(state);
  next.loadout[slot] = itemId;
  return { ok: true, reason: 'ok', cost: 0, state: next };
}

export function stageClearReward(input: StageClearRewardInput): number {
  const config = EQUIPMENT_CATALOG.stageRewards;
  const stage = finiteInt(input.stageNumber, 1, 1, 9999);
  const difficulty =
    input.difficulty === 'easy' || input.difficulty === 'hard' ? input.difficulty : 'normal';
  const firstClear = input.firstClear ?? true;
  let reward = (config.base + config.perStage * (stage - 1)) * config.difficulty[difficulty];
  reward *= firstClear ? config.firstClearMultiplier : config.repeatMultiplier;
  if (input.flawless) reward *= 1 + config.flawlessBonus;
  return Math.min(MAX_CREDITS, roundCurrency(reward, config.roundTo));
}

export function awardStageClear(
  state: ProgressionState,
  input: AwardStageClearInput,
): StageClearAward {
  const stage = finiteInt(input.stageNumber, 1, 1, 9999);
  const stageId = isSafeId(input.stageId) ? input.stageId : `stage-${stage}`;
  const firstClear = (state.stageClears[stageId] ?? 0) === 0;
  const reward = stageClearReward({ ...input, stageNumber: stage, firstClear });
  const beforeUnlocks = new Set(state.unlocked);

  let next = grantCredits(state, reward);
  next = cloneState(next);
  next.stageClears[stageId] = (next.stageClears[stageId] ?? 0) + 1;
  next = unlockCatalogThroughStage(next, stage + 1);

  return {
    state: next,
    reward,
    firstClear,
    newlyUnlocked: next.unlocked.filter((id) => !beforeUnlocks.has(id)),
  };
}

function tierForItem(item: EquipmentCatalogItem, tier: number): number {
  return Math.max(1, Math.min(item.maxTier, finiteInt(tier, 1, 1, item.maxTier)));
}

function stat(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function engineStats(itemId: string, tier: number): EngineStats | null {
  const item = catalogById.get(itemId);
  if (item?.slot !== 'engine') return null;
  const step = tierForItem(item, tier) - 1;
  return { speed: stat(item.stats.speed + item.stats.speedPerTier * step) };
}

export function coolerStats(itemId: string, tier: number): CoolerStats | null {
  const item = catalogById.get(itemId);
  if (item?.slot !== 'cooler') return null;
  const step = tierForItem(item, tier) - 1;
  return {
    cooling: stat(item.stats.cooling + item.stats.coolingPerTier * step),
    heatCapacity: stat(item.stats.heatCapacity + item.stats.heatCapacityPerTier * step),
  };
}

export function armorStats(itemId: string, tier: number): ArmorStats | null {
  const item = catalogById.get(itemId);
  if (item?.slot !== 'armor') return null;
  const step = tierForItem(item, tier) - 1;
  return {
    hp: stat(item.stats.hp + item.stats.hpPerTier * step),
    regen: stat(item.stats.regen + item.stats.regenPerTier * step),
  };
}

export function secondaryStats(itemId: string, tier: number): SecondaryStats | null {
  const item = catalogById.get(itemId);
  if (item?.slot !== 'secondary') return null;
  const step = tierForItem(item, tier) - 1;
  return {
    damage: stat(item.stats.damage + item.stats.damagePerTier * step),
    fireRate: stat(item.stats.fireRate + item.stats.fireRatePerTier * step),
    heat: stat(Math.max(0, item.stats.heat + item.stats.heatPerTier * step)),
    projectileSpeed: stat(item.stats.projectileSpeed + item.stats.projectileSpeedPerTier * step),
  };
}

export function equippedStats(state: ProgressionState): {
  engine: EngineStats | null;
  cooler: CoolerStats | null;
  armor: ArmorStats | null;
  secondary: SecondaryStats | null;
} {
  return {
    engine: engineStats(state.loadout.engine, itemTier(state, state.loadout.engine)),
    cooler: coolerStats(state.loadout.cooler, itemTier(state, state.loadout.cooler)),
    armor: armorStats(state.loadout.armor, itemTier(state, state.loadout.armor)),
    secondary: secondaryStats(state.loadout.secondary, itemTier(state, state.loadout.secondary)),
  };
}
