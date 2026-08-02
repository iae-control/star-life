import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';

export class TitleScene extends Phaser.Scene {
  private starting = false;

  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    // 씬 인스턴스는 재사용되므로(Game에서 ESC로 복귀 등) 매번 리셋.
    this.starting = false;

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35, '별의 일생', {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: '#e8f4ff',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, '터치 또는 스페이스로 시작', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#7f9ab8',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.25,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.input.once('pointerdown', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  private startGame(): void {
    // 터치와 스페이스가 같은 프레임에 들어오면 두 once 리스너가 모두 발화하므로 가드.
    if (this.starting) {
      return;
    }
    this.starting = true;
    this.scene.start(SceneKeys.Game);
  }
}
