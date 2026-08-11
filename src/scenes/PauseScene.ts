// 일시정지 오버레이 — Game 씬 위에 얹혀 P/ESC/탭으로 복귀.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { t } from '../data';
import { uiText } from '../ui/text';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Pause);
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x00000a, 0.6).setOrigin(0, 0);
    uiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, t('pause.title'), 24, '#e8ecff', 'center');
    uiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, t('pause.help'), 11, '#9aa6c8', 'center');
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 66, 170, 30, 0x183553, 0.7)
      .setStrokeStyle(1, 0x79c9ff, 0.75);
    uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 66,
      t('pause.settings'),
      10,
      '#9fefff',
      'center',
    );

    const resume = (): void => {
      this.scene.stop();
      this.scene.resume(SceneKeys.Game);
    };
    this.input.keyboard?.removeAllListeners();
    this.input.keyboard?.on('keydown-S', () => {
      this.scene.stop();
      this.scene.launch(SceneKeys.Settings, { from: SceneKeys.Pause });
    });
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const inSettings =
        Math.abs(ptr.worldX - GAME_WIDTH / 2) < 85 &&
        ptr.worldY > GAME_HEIGHT / 2 + 52 &&
        ptr.worldY < GAME_HEIGHT / 2 + 81;
      if (inSettings) {
        this.scene.stop();
        this.scene.launch(SceneKeys.Settings, { from: SceneKeys.Pause });
      } else resume();
    });
    this.input.keyboard?.once('keydown-P', resume);
    this.input.keyboard?.once('keydown-ESC', resume);
  }
}
