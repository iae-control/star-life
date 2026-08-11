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
  | 'slot-mismatch';

export interface TransactionResult {
  ok: boolean;
  reason: TransactionReason;
  cost: number;
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
  return { ok: true, reason: 'ok', cost, state: next };
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
