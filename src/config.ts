// 논리 해상도 — PLAN.md 2장 아트 규격의 단일 출처.
// 360x640(9:16) 고정 + Scale.FIT 레터박스. 모든 좌표·레이아웃은 이 값 기준.
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

export const BACKGROUND_COLOR = 0x05060f;

export const SceneKeys = {
  Boot: 'Boot',
  Preload: 'Preload',
  Title: 'Title',
  StageIntro: 'StageIntro',
  Game: 'Game',
  Shop: 'Shop',
  Result: 'Result',
  Pause: 'Pause',
  Settings: 'Settings',
  Credits: 'Credits',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];

export function isSceneKey(value: string | null): value is SceneKey {
  return value !== null && Object.values(SceneKeys).includes(value as SceneKey);
}
