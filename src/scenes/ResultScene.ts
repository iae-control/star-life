// 게임오버 오버레이 — 데모 drawOver() 이식. 멈춘 게임 화면 위에 얹힌다.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { loadBest, type GameSession } from '../game/session';
import { uiText } from '../ui/text';

export class ResultScene extends Phaser.Scene {
  private restarting = false;
  private t = 0;
  private prompt!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Result);
  }

  create(data: { session: GameSession }): void {
    this.restarting = false;
    this.t = 0;
    const s = data.session;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x06020a, 0.62).setOrigin(0, 0);
    uiText(this, GAME_WIDTH / 2, 253, 'GAME OVER', 28, '#ff8a8a', 'center');
    uiText(this, GAME_WIDTH / 2, 301, `SCORE  ${s.score}`, 15, '#fff2b0', 'center');
    uiText(this, GAME_WIDTH / 2, 328, `WAVE   ${s.wave}`, 12, '#cfd8ff', 'center');
    if (s.score > 0 && s.score >= loadBest())
      uiText(this, GAME_WIDTH / 2, 357, 'NEW RECORD!', 12, '#8aff8a', 'center');
    this.prompt = uiText(this, GAME_WIDTH / 2, 427, '탭 / ENTER — 재도전', 12, '#e8ecff', 'center');

    // 즉시 재시작 오입력 방지로 짧은 지연 후 입력 활성화
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', () => this.restart());
      this.input.keyboard?.once('keydown-ENTER', () => this.restart());
      this.input.keyboard?.once('keydown-SPACE', () => this.restart());
    });
  }

  update(_time: number, deltaMs: number): void {
    this.t += deltaMs / 1000;
    this.prompt.setVisible(Math.floor(this.t * 1.4) % 2 === 0);
  }

  private restart(): void {
    if (this.restarting) return;
    this.restarting = true;
    this.scene.stop(SceneKeys.Game);
    this.scene.stop();
    this.scene.start(SceneKeys.Title);
  }
}
