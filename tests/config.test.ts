import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../src/config';

describe('logical resolution', () => {
  it('is 360x640 (9:16 portrait) per PLAN.md art spec', () => {
    expect(GAME_WIDTH).toBe(360);
    expect(GAME_HEIGHT).toBe(640);
    expect(GAME_WIDTH / GAME_HEIGHT).toBeCloseTo(9 / 16, 5);
  });
});

describe('scene keys', () => {
  it('are unique', () => {
    const keys = Object.values(SceneKeys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
