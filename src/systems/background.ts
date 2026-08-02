// 다층 패럴랙스 우주 배경 — levels.json의 배경 테마를 해석한다.
// 'space': 성운 + 원경/근경 별. 'asteroids': 성운 + 원경 별 + 소행성 지형 레이어(전속 스크롤).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface BackgroundConfig {
  theme: 'space' | 'asteroids';
  nebulaAlpha: number;
}

export class SpaceBackground {
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    baseDepth = 0,
    config: BackgroundConfig = { theme: 'space', nebulaAlpha: 0.85 },
  ) {
    const add = (key: string, depth: number, speed: number, alpha = 1, blend = false) => {
      const sprite = scene.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setAlpha(alpha);
      if (blend) sprite.setBlendMode(Phaser.BlendModes.ADD);
      this.layers.push({ sprite, speed });
    };
    add('bg-nebula', baseDepth, 0.12, config.nebulaAlpha, true);
    add('bg-stars-far', baseDepth + 0.1, 0.35);
    if (config.theme === 'asteroids') {
      add('bg-stars-near', baseDepth + 0.2, 0.6, 0.7);
      add('bg-asteroids', baseDepth + 0.3, 1.0);
    } else {
      add('bg-stars-near', baseDepth + 0.2, 0.85);
    }
  }

  /** speed: 논리 스크롤 속도(px/s) — 레이어별 시차 배율 적용 */
  update(dt: number, speed: number): void {
    for (const l of this.layers) l.sprite.tilePositionY -= speed * l.speed * dt;
  }

  destroy(): void {
    for (const l of this.layers) l.sprite.destroy();
    this.layers = [];
  }
}
