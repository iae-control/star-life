import { describe, expect, it } from 'vitest';

import type { HeatSpec, WeaponMechanic } from '../src/game/logic/weapons';
import {
  createWeaponRuntimeState,
  heatRatioFor,
  railChargeSeconds,
  shouldAutoReleaseRail,
  stepWeaponRuntime,
  triggerHeat,
  type RuntimeWeaponProfile,
  type WeaponCooler,
  type WeaponRuntimeState,
} from '../src/game/logic/weaponRuntime';

const COOLER: WeaponCooler = { cooling: 1, heatCapacity: 1 };

const BASE_HEAT: HeatSpec = {
  perTrigger: 0.3,
  coolPerSecond: 0.2,
  softCap: 0.6,
  hardCap: 1,
  lockout: 1,
  hotOutputMultiplier: 1.4,
  hotSpreadMultiplier: 1.6,
};

function profile(
  mechanic: WeaponMechanic,
  variant: string,
  heat: Partial<HeatSpec> = {},
): RuntimeWeaponProfile {
  return { mechanic, variant, heat: { ...BASE_HEAT, ...heat } };
}

const PULSE = profile('capacitor-burst', 'capacitor');
const VULCAN = profile('rotary-spin', 'rotary');
const RAIL = profile('charged-rail', 'charged');

function advance(
  state: WeaponRuntimeState,
  runtimeProfile: RuntimeWeaponProfile,
  seconds: number,
  steps: number,
  firing: boolean,
  cooler = COOLER,
): WeaponRuntimeState {
  let next = state;
  for (let i = 0; i < steps; i++) {
    next = stepWeaponRuntime(next, runtimeProfile, seconds / steps, firing, cooler).state;
  }
  return next;
}

describe('weapon runtime heat state', () => {
  it('starts ready, is deterministic, and never mutates its input', () => {
    const state = createWeaponRuntimeState();
    const snapshot = { ...state };
    const first = stepWeaponRuntime(state, PULSE, 0.25, false, COOLER);
    const second = stepWeaponRuntime(state, PULSE, 0.25, false, COOLER);

    expect(state).toEqual(snapshot);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      canTrigger: true,
      autoRelease: false,
      cadenceScale: 1,
      spreadScale: 1,
      heatRatio: 0,
      status: 'READY',
    });
  });

  it('adds heat only through triggerHeat and honors cooler heat capacity', () => {
    const largeCooler = { cooling: 1, heatCapacity: 2 };
    const initial = createWeaponRuntimeState();
    const stepped = stepWeaponRuntime(initial, PULSE, 1, true, largeCooler);
    expect(stepped.state.heat).toBe(0);

    const triggered = triggerHeat(stepped.state, PULSE, largeCooler);
    expect(triggered.heat).toBeCloseTo(0.3, 10);
    expect(heatRatioFor(triggered, largeCooler)).toBeCloseTo(0.15, 10);
    expect(initial.heat).toBe(0);
  });

  it('locks at hard cap and recovers only after both lockout and soft-cap cooling', () => {
    let state = createWeaponRuntimeState({ heat: 0.8 });
    state = triggerHeat(state, PULSE, COOLER);
    expect(state).toMatchObject({ heat: 1, locked: true, lockoutRemaining: 1 });

    let frame = stepWeaponRuntime(state, PULSE, 0.9, false, COOLER);
    expect(frame.state.locked).toBe(true);
    expect(frame.status).toBe('LOCKED');
    expect(frame.canTrigger).toBe(false);

    frame = stepWeaponRuntime(frame.state, PULSE, 0.2, false, COOLER);
    expect(frame.state.lockoutRemaining).toBe(0);
    expect(frame.heatRatio).toBeGreaterThan(BASE_HEAT.softCap);
    expect(frame.state.locked).toBe(true);

    frame = stepWeaponRuntime(frame.state, PULSE, 1, false, COOLER);
    expect(frame.heatRatio).toBeLessThan(BASE_HEAT.softCap);
    expect(frame.state.locked).toBe(false);
    expect(frame.status).toBe('READY');
    expect(frame.canTrigger).toBe(true);
  });

  it('reports HOT and continuously interpolates cadence and spread above soft cap', () => {
    const frame = stepWeaponRuntime(
      createWeaponRuntimeState({ heat: 0.8 }),
      PULSE,
      0,
      false,
      COOLER,
    );
    expect(frame.status).toBe('HOT');
    expect(frame.heatRatio).toBeCloseTo(0.8, 10);
    expect(frame.cadenceScale).toBeCloseTo(1.2, 10);
    expect(frame.spreadScale).toBeCloseTo(1.3, 10);
    expect(frame.canTrigger).toBe(true);
  });

  it('keeps cooling and lock recovery independent of frame subdivision', () => {
    const initial = createWeaponRuntimeState({ heat: 1, locked: true, lockoutRemaining: 0.5 });
    const oneFrame = advance(initial, PULSE, 2.5, 1, false);
    const manyFrames = advance(initial, PULSE, 2.5, 300, false);

    expect(manyFrames.heat).toBeCloseTo(oneFrame.heat, 10);
    expect(manyFrames.lockoutRemaining).toBeCloseTo(oneFrame.lockoutRemaining, 10);
    expect(manyFrames.locked).toBe(oneFrame.locked);
  });
});

describe('rotary spool', () => {
  it('requires a short spin-up, then reaches full cadence and spins down', () => {
    const initial = createWeaponRuntimeState();
    let frame = stepWeaponRuntime(initial, VULCAN, 0.05, true, COOLER);
    expect(frame.status).toBe('SPIN');
    expect(frame.canTrigger).toBe(false);
    expect(frame.state.spool).toBeGreaterThan(0);
    expect(frame.cadenceScale).toBeLessThan(1);

    frame = stepWeaponRuntime(frame.state, VULCAN, 0.37, true, COOLER);
    expect(frame.state.spool).toBe(1);
    expect(frame.canTrigger).toBe(true);
    expect(frame.cadenceScale).toBe(1);
    expect(frame.status).toBe('READY');

    frame = stepWeaponRuntime(frame.state, VULCAN, 0.42 * 0.65, false, COOLER);
    expect(frame.state.spool).toBe(0);
    expect(frame.canTrigger).toBe(false);
  });

  it('produces the same spool at low and high FPS', () => {
    const initial = createWeaponRuntimeState();
    const oneFrame = advance(initial, VULCAN, 0.31, 1, true);
    const manyFrames = advance(initial, VULCAN, 0.31, 240, true);
    expect(manyFrames.spool).toBeCloseTo(oneFrame.spool, 10);
  });
});

describe('charged rail auto-release', () => {
  it('crosses the release threshold once and consumes charge when heat is triggered', () => {
    const duration = railChargeSeconds(RAIL);
    const initial = createWeaponRuntimeState();
    let frame = stepWeaponRuntime(initial, RAIL, duration - 0.02, true, COOLER);
    expect(frame.status).toBe('CHARGE');
    expect(frame.canTrigger).toBe(false);
    expect(frame.autoRelease).toBe(false);

    const beforeRelease = frame.state;
    frame = stepWeaponRuntime(beforeRelease, RAIL, 0.02, true, COOLER);
    expect(frame.state.charge).toBe(1);
    expect(frame.canTrigger).toBe(true);
    expect(frame.autoRelease).toBe(true);
    expect(shouldAutoReleaseRail(beforeRelease, frame.state, RAIL)).toBe(true);

    const repeated = stepWeaponRuntime(frame.state, RAIL, 0.1, true, COOLER);
    expect(repeated.autoRelease).toBe(false);

    const fired = triggerHeat(frame.state, RAIL, COOLER);
    expect(fired.charge).toBe(0);
    expect(fired.heat).toBeCloseTo(BASE_HEAT.perTrigger, 10);
  });

  it('charges identically across frame rates and decays when released early', () => {
    const initial = createWeaponRuntimeState();
    const oneFrame = advance(initial, RAIL, 0.4, 1, true);
    const manyFrames = advance(initial, RAIL, 0.4, 240, true);
    expect(manyFrames.charge).toBeCloseTo(oneFrame.charge, 10);

    const decayed = stepWeaponRuntime(oneFrame, RAIL, 0.3, false, COOLER);
    expect(decayed.state.charge).toBeLessThan(oneFrame.charge);
    expect(decayed.autoRelease).toBe(false);
  });

  it('auto-releases a full charge once thermal lockout clears', () => {
    const locked = createWeaponRuntimeState({
      heat: 0.6,
      locked: true,
      lockoutRemaining: 0.1,
      charge: 1,
    });
    const frame = stepWeaponRuntime(locked, RAIL, 0.1, true, COOLER);
    expect(frame.state.locked).toBe(false);
    expect(frame.autoRelease).toBe(true);
    expect(frame.canTrigger).toBe(true);
  });
});

describe('defensive normalization', () => {
  it('contains NaN, infinities, negative time, and invalid cooler input', () => {
    const corrupt = {
      heat: Number.NaN,
      locked: false,
      lockoutRemaining: Number.POSITIVE_INFINITY,
      spool: Number.NEGATIVE_INFINITY,
      charge: Number.POSITIVE_INFINITY,
    } satisfies WeaponRuntimeState;
    const corruptProfile = profile('rotary-spin', 'rotary', {
      perTrigger: Number.NaN,
      coolPerSecond: Number.POSITIVE_INFINITY,
      softCap: Number.NaN,
      lockout: Number.NaN,
      hotOutputMultiplier: Number.NaN,
      hotSpreadMultiplier: Number.NEGATIVE_INFINITY,
    });
    const corruptCooler = { cooling: Number.NaN, heatCapacity: 0 };

    const frame = stepWeaponRuntime(corrupt, corruptProfile, Number.NaN, true, corruptCooler);
    for (const value of [
      frame.state.heat,
      frame.state.lockoutRemaining,
      frame.state.spool,
      frame.state.charge,
      frame.cadenceScale,
      frame.spreadScale,
      frame.heatRatio,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    const negativeTime = stepWeaponRuntime(frame.state, PULSE, -10, false, COOLER);
    expect(negativeTime.state.heat).toBe(frame.state.heat);
    expect(triggerHeat(frame.state, corruptProfile, corruptCooler).heat).toBe(frame.state.heat);
  });

  it('prioritizes LOCKED and HOT over spin or charge presentation states', () => {
    const hotSpin = stepWeaponRuntime(
      createWeaponRuntimeState({ heat: 0.8 }),
      VULCAN,
      0.1,
      true,
      COOLER,
    );
    expect(hotSpin.status).toBe('HOT');

    const lockedCharge = stepWeaponRuntime(
      createWeaponRuntimeState({ heat: 1, locked: true, lockoutRemaining: 1 }),
      RAIL,
      0.1,
      true,
      COOLER,
    );
    expect(lockedCharge.status).toBe('LOCKED');
    expect(lockedCharge.canTrigger).toBe(false);
    expect(lockedCharge.autoRelease).toBe(false);
  });
});
