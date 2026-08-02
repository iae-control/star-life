// 게임오버 오버레이 — 데모 drawOver() 이식. 멈춘 게임 화면 위에 얹힌다.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { t } from '../data';
import { loadBest, type GameSession } from '../game/session';
import { playMusic } from '../systems/Music';
import { loadSave } from '../systems/Save';
import { uiText } from '../ui/text';

export class ResultScene extends Phaser.Scene {
  private restarting = false;
  private wasComplete = false;
  private t = 0;
  private prompt!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Result);
  }

  create(data: { session: GameSession; mode?: 'gameover' | 'complete' }): void {
    this.restarting = false;
    this.t = 0;
    const s = data.session;
    const complete = data.mode === 'complete';
    this.wasComplete = complete;
    playMusic('title');

    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x06020a, complete ? 0.8 : 0.62)
      .setOrigin(0, 0);
    if (complete) {
      // 캠페인 엔딩 — 별의 일생 완주
      uiText(this, GAME_WIDTH / 2, 180, t('ending.title'), 30, '#dfe8ff', 'center');
      uiText(this, GAME_WIDTH / 2, 226, t('ending.line1'), 10, '#9aa6c8', 'center');
      uiText(this, GAME_WIDTH / 2, 244, t('ending.line2'), 10, '#9aa6c8', 'center');
      uiText(this, GAME_WIDTH / 2, 274, t('ending.thanks'), 9, '#7ef7ff', 'center');
    } else {
      uiText(this, GAME_WIDTH / 2, 253, t('result.title'), 28, '#ff8a8a', 'center');
      if (data.session.endless)
        uiText(
          this,
          GAME_WIDTH / 2,
          279,
          `${t('result.endless')}  ${loadSave().endlessBest}`,
          9,
          '#b48aff',
          'center',
        );
    }
    uiText(this, GAME_WIDTH / 2, 301, t('result.score', s.score), 15, '#fff2b0', 'center');
    uiText(this, GAME_WIDTH / 2, 328, t('result.wave', s.wave), 12, '#cfd8ff', 'center');
    if (s.score > 0 && s.score >= loadBest())
      uiText(this, GAME_WIDTH / 2, 357, t('result.newRecord'), 12, '#8aff8a', 'center');
    this.prompt = uiText(this, GAME_WIDTH / 2, 427, t('result.retry'), 12, '#e8ecff', 'center');

    // 즉시 재시작 오입력 방지: 짧은 지연 + e.repeat 가드(발사키 홀드 자동반복 차단)
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', () => this.restart());
      const onKey = (e: KeyboardEvent): void => {
        if (!e.repeat) this.restart();
      };
      this.input.keyboard?.on('keydown-ENTER', onKey);
      this.input.keyboard?.on('keydown-SPACE', onKey);
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
    // 완주 엔딩이면 크레딧을 거쳐 타이틀로
    this.scene.start(this.wasComplete ? SceneKeys.Credits : SceneKeys.Title);
  }
}
