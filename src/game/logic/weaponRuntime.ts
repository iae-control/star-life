import type { HeatSpec, WeaponProfile } from './weapons';

export type WeaponRuntimeStatus = 'READY' | 'SPIN' | 'CHARGE' | 'HOT' | 'LOCKED';

export interface WeaponCooler {
  /** Multiplier applied to the weapon's authored cooling rate. */
  cooling: number;
  /** Heat units available before hard-cap lockout. The baseline capacity is 1. */
  heatCapacity: number;
}

export interface WeaponRuntimeState {
  /** Absolute heat units. Divide by the active cooler capacity for the HUD ratio. */
  heat: number;
  locked: boolean;
  lockoutRemaining: number;
  /** Normalized rotary spool, from stopped (0) to full speed (1). */
  spool: number;
  /** Normalized rail charge, from empty (0) to auto-release (1). */
  charge: number;
}

export interface WeaponRuntimeFrame {
  state: WeaponRuntimeState;
  canTrigger: boolean;
  /** True only on the frame a charged rail crosses its release threshold. */
  autoRelease: boolean;
  /** Multiplier for the authored cadence. Rotary weapons include their spool ramp. */
  cadenceScale: number;
  /** Multiplier for the authored projectile spread. */
  spreadScale: number;
  heatRatio: number;
  status: WeaponRuntimeStatus;
}

export type RuntimeWeaponProfile = Pick<WeaponProfile, 'mechanic' | 'variant' | 'heat'>;

const DEFAULT_COOLER: Readonly<WeaponCooler> = { cooling: 1, heatCapacity: 1 };
const EPSILON = 1e-9;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: number, fallback = 0): number {
  return Math.max(0, finiteOr(value, fallback));
}

function positive(value: number, fallback: number): number {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
}

function normalizeState(state: WeaponRuntimeState): WeaponRuntimeState {
  return {
    heat: nonNegative(state.heat),
    locked: state.locked === true,
    lockoutRemaining: nonNegative(state.lockoutRemaining),
    spool: clamp(finiteOr(state.spool, 0), 0, 1),
    charge: clamp(finiteOr(state.charge, 0), 0, 1),
  };
}

function normalizeCooler(cooler: WeaponCooler): WeaponCooler {
  return {
    cooling: nonNegative(cooler.cooling, DEFAULT_COOLER.cooling),
    heatCapacity: positive(cooler.heatCapacity, DEFAULT_COOLER.heatCapacity),
  };
}

function hardCap(heat: HeatSpec): number {
  return positive(heat.hardCap, 1);
}

function softCap(heat: HeatSpec): number {
  return clamp(finiteOr(heat.softCap, 0.7), 0, hardCap(heat));
}

function spinWarmup(profile: RuntimeWeaponProfile): number {
  if (profile.variant === 'cyclone') return 0.52;
  if (profile.variant === 'needle') return 0.28;
  return 0.42;
}

export function railChargeSeconds(profile: RuntimeWeaponProfile): number {
  if (profile.mechanic !== 'charged-rail') return 0;
  if (profile.variant === 'splitter') return 0.5;
  if (profile.variant === 'siege') return 1.25;
  return 0.72;
}

export function createWeaponRuntimeState(
  initial: Partial<WeaponRuntimeState> = {},
): WeaponRuntimeState {
  return normalizeState({
    heat: initial.heat ?? 0,
    locked: initial.locked ?? false,
    lockoutRemaining: initial.lockoutRemaining ?? 0,
    spool: initial.spool ?? 0,
    charge: initial.charge ?? 0,
  });
}

export function heatRatioFor(
  state: WeaponRuntimeState,
  cooler: WeaponCooler = DEFAULT_COOLER,
): number {
  const normalized = normalizeState(state);
  const capacity = normalizeCooler(cooler).heatCapacity;
  return clamp(normalized.heat / capacity, 0, 1);
}

/**
 * Adds heat for exactly one accepted trigger. Time progression never adds heat, so callers can
 * use their own cadence without making thermal behavior frame-rate dependent.
 */
export function triggerHeat(
  state: WeaponRuntimeState,
  profile: RuntimeWeaponProfile,
  cooler: WeaponCooler = DEFAULT_COOLER,
): WeaponRuntimeState {
  const current = normalizeState(state);
  if (current.locked) return current;

  const normalizedCooler = normalizeCooler(cooler);
  const capHeat = normalizedCooler.heatCapacity * hardCap(profile.heat);
  const nextHeat = Math.min(capHeat, current.heat + nonNegative(profile.heat.perTrigger));
  const reachedHardCap = nextHeat >= capHeat - EPSILON;

  return {
    ...current,
    heat: nextHeat,
    locked: reachedHardCap,
    lockoutRemaining: reachedHardCap
      ? Math.max(current.lockoutRemaining, nonNegative(profile.heat.lockout))
      : current.lockoutRemaining,
    // Firing the charged shot consumes the stored rail charge.
    charge: profile.mechanic === 'charged-rail' ? 0 : current.charge,
  };
}

export function shouldAutoReleaseRail(
  previous: WeaponRuntimeState,
  next: WeaponRuntimeState,
  profile: RuntimeWeaponProfile,
): boolean {
  if (profile.mechanic !== 'charged-rail') return false;
  const before = normalizeState(previous);
  const after = normalizeState(next);
  return (
    !after.locked && after.charge >= 1 - EPSILON && (before.charge < 1 - EPSILON || before.locked)
  );
}

/** Advance cooling, lockout, spool, and charge by a fixed input duration without mutation. */
export function stepWeaponRuntime(
  state: WeaponRuntimeState,
  profile: RuntimeWeaponProfile,
  dt: number,
  firing: boolean,
  cooler: WeaponCooler = DEFAULT_COOLER,
): WeaponRuntimeFrame {
  const current = normalizeState(state);
  const normalizedCooler = normalizeCooler(cooler);
  const delta = nonNegative(dt);
  const isFiring = firing === true;
  const capRatio = hardCap(profile.heat);
  const capacity = normalizedCooler.heatCapacity;
  const capHeat = capacity * capRatio;

  let locked = current.locked;
  let lockoutRemaining = current.lockoutRemaining;
  if (!locked && current.heat >= capHeat - EPSILON) {
    locked = true;
    lockoutRemaining = Math.max(lockoutRemaining, nonNegative(profile.heat.lockout));
  }

  const coolingPerSecond = nonNegative(profile.heat.coolPerSecond) * normalizedCooler.cooling;
  const heat = Math.max(0, Math.min(capHeat, current.heat) - coolingPerSecond * delta);
  lockoutRemaining = Math.max(0, lockoutRemaining - delta);
  const heatRatio = clamp(heat / capacity, 0, capRatio);

  if (locked && lockoutRemaining <= EPSILON && heatRatio <= softCap(profile.heat) + EPSILON) {
    locked = false;
    lockoutRemaining = 0;
  }

  let spool = current.spool;
  if (profile.mechanic === 'rotary-spin') {
    const warmup = spinWarmup(profile);
    const spinDown = warmup * 0.65;
    spool = clamp(spool + (isFiring ? delta / warmup : -delta / positive(spinDown, warmup)), 0, 1);
  } else {
    spool = 0;
  }

  let charge = current.charge;
  if (profile.mechanic === 'charged-rail') {
    const chargeSeconds = positive(railChargeSeconds(profile), 0.72);
    const decaySeconds = chargeSeconds * 0.55;
    charge = clamp(
      charge + (isFiring ? delta / chargeSeconds : -delta / positive(decaySeconds, chargeSeconds)),
      0,
      1,
    );
  } else {
    charge = 0;
  }

  const nextState: WeaponRuntimeState = {
    heat,
    locked,
    lockoutRemaining,
    spool,
    charge,
  };
  const autoRelease = shouldAutoReleaseRail(current, nextState, profile);

  const thermalRange = Math.max(EPSILON, capRatio - softCap(profile.heat));
  const thermalLoad = clamp((heatRatio - softCap(profile.heat)) / thermalRange, 0, 1);
  const hotOutput = positive(profile.heat.hotOutputMultiplier, 1);
  const hotSpread = positive(profile.heat.hotSpreadMultiplier, 1);
  const thermalCadence = 1 + (hotOutput - 1) * thermalLoad;
  const cadenceScale =
    profile.mechanic === 'rotary-spin' ? thermalCadence * (0.45 + spool * 0.55) : thermalCadence;
  const spreadScale = 1 + (hotSpread - 1) * thermalLoad;

  let canTrigger = !locked;
  if (profile.mechanic === 'rotary-spin') canTrigger = canTrigger && spool >= 0.2 - EPSILON;
  if (profile.mechanic === 'charged-rail') canTrigger = canTrigger && charge >= 1 - EPSILON;

  let status: WeaponRuntimeStatus = 'READY';
  if (locked) status = 'LOCKED';
  else if (heatRatio >= softCap(profile.heat) - EPSILON && heatRatio > EPSILON) status = 'HOT';
  else if (profile.mechanic === 'rotary-spin' && isFiring && spool < 1 - EPSILON) status = 'SPIN';
  else if (
    profile.mechanic === 'charged-rail' &&
    (isFiring || charge > EPSILON) &&
    charge < 1 - EPSILON
  )
    status = 'CHARGE';

  return {
    state: nextState,
    canTrigger,
    autoRelease,
    cadenceScale: nonNegative(cadenceScale),
    spreadScale: nonNegative(spreadScale),
    heatRatio,
    status,
  };
}
