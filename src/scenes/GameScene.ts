import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';

interface Star {
  rect: Phaser.GameObjects.Rectangle;
  speed: number;
}

// M0: 빈 게임 씬. 프레임 페이싱을 눈으로 검증할 수 있도록
// 최소한의 스크롤 별배경과 FPS 표시만 둔다. 실제 게임플레이는 M1에서.
export class GameScene extends Phaser.Scene {
  private stars: Star[] = [];
  private fpsText!: Phaser.GameObjects.Text;
  private fpsTimer = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  create(): void {
    this.stars = [];
    for (let i = 0; i < 60; i += 1) {
      const depth = Math.random();
      const size = depth < 0.6 ? 1 : 2;
      const rect = this.add.rectangle(
        Math.random() * GAME_WIDTH,
        Math.random() * GAME_HEIGHT,
        size,
        size,
        0xffffff,
        0.3 + depth * 0.7,
      );
      this.stars.push({ rect, speed: 30 + depth * 120 });
    }

    this.fpsText = this.add
      .text(4, 4, '', { fontFamily: 'monospace', fontSize: '12px', color: '#6dff9c' })
      .setDepth(100);

    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start(SceneKeys.Title);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const star of this.stars) {
      star.rect.y += star.speed * dt;
      if (star.rect.y > GAME_HEIGHT + 2) {
        star.rect.y = -2;
        star.rect.x = Math.random() * GAME_WIDTH;
      }
    }

    this.fpsTimer += delta;
    if (this.fpsTimer >= 250) {
      this.fpsTimer = 0;
      const fps = this.game.loop.actualFps.toFixed(1);
      this.fpsText.setText(`${fps} fps`);
      if (import.meta.env.DEV) {
        document.title = `별의 일생 — ${fps} fps`;
      }
    }
  }
}
