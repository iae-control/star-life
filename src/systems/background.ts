// 다층 패럴랙스 우주 배경 — levels.json의 배경 테마를 해석한다.
// 테마: nebula(성운+별), protostar(웜 성운+파편), mainseq(코로나 광선), asteroids(소행성 지형).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export interface BackgroundConfig {
  theme: 'nebula' | 'protostar' | 'mainseq' | 'asteroids';
  nebulaAlpha: number;
}

export class SpaceBackground {
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    baseDepth = 0,
    config: BackgroundConfig = { theme: 'nebula', nebulaAlpha: 0.85 },
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
    if (config.theme === 'protostar') {
      add('bg-nebula-warm', baseDepth, 0.12, config.nebulaAlpha, true);
      add('bg-stars-far', baseDepth + 0.1, 0.35);
      add('bg-debris', baseDepth + 0.2, 1.0, 0.85);
    } else if (config.theme === 'mainseq') {
      add('bg-nebula-warm', baseDepth, 0.1, config.nebulaAlpha * 0.8, true);
      add('bg-sunstreaks', baseDepth + 0.05, 0.4, 1, true);
      add('bg-stars-far', baseDepth + 0.1, 0.35);
      add('bg-stars-near', baseDepth + 0.2, 0.85, 0.8);
    } else if (config.theme === 'asteroids') {
      add('bg-nebula', baseDepth, 0.12, config.nebulaAlpha, true);
      add('bg-stars-far', baseDepth + 0.1, 0.35);
      add('bg-stars-near', baseDepth + 0.15, 0.6, 0.7);
      add('bg-asteroids', baseDepth + 0.2, 1.0);
    } else {
      add('bg-nebula', baseDepth, 0.12, config.nebulaAlpha, true);
      add('bg-stars-far', baseDepth + 0.1, 0.35);
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
