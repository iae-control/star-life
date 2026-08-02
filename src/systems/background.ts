// 다층 패럴랙스 우주 배경 — 성운 + 원경/근경 별 레이어.
// Game/Title/Shop 씬이 공유. 텍스처는 textures.ts에서 세로 무한 타일로 생성된다.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export class SpaceBackground {
  private nebula: Phaser.GameObjects.TileSprite;
  private far: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene, baseDepth = 0) {
    this.nebula = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-nebula')
      .setOrigin(0, 0)
      .setDepth(baseDepth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.85);
    this.far = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-stars-far')
      .setOrigin(0, 0)
      .setDepth(baseDepth + 0.1);
    this.near = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-stars-near')
      .setOrigin(0, 0)
      .setDepth(baseDepth + 0.2);
  }

  /** speed: 논리 스크롤 속도(px/s) — 레이어별 시차 배율 적용 */
  update(dt: number, speed: number): void {
    this.nebula.tilePositionY -= speed * 0.12 * dt;
    this.far.tilePositionY -= speed * 0.35 * dt;
    this.near.tilePositionY -= speed * 0.85 * dt;
  }
}
