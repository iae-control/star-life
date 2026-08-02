// 일시정지 오버레이 — Game 씬 위에 얹혀 P/ESC/탭으로 복귀.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { uiText } from '../ui/text';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Pause);
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x00000a, 0.6).setOrigin(0, 0);
    uiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PAUSED', 24, '#e8ecff', 'center');
    uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 30,
      'P·ESC·탭으로 계속',
      11,
      '#9aa6c8',
      'center',
    );

    const resume = (): void => {
      this.scene.stop();
      this.scene.resume(SceneKeys.Game);
    };
    this.input.keyboard?.removeAllListeners();
    this.input.once('pointerdown', resume);
    this.input.keyboard?.once('keydown-P', resume);
    this.input.keyboard?.once('keydown-ESC', resume);
  }
}
