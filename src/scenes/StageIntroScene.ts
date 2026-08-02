// 스테이지 도입 연출 — 레벨 번호·테마명·태그라인을 보여주고 Game으로 진입.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, t } from '../data';
import type { GameSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { playMusic } from '../systems/Music';
import { uiText } from '../ui/text';

const THEME_COLOR: Record<string, string> = {
  nebula: '#b48aff',
  protostar: '#ff9a5a',
  mainseq: '#ffd75e',
  asteroids: '#c8b49a',
};

export class StageIntroScene extends Phaser.Scene {
  private session!: GameSession;
  private spaceBg!: SpaceBackground;
  private elapsed = 0;
  private started = false;

  constructor() {
    super(SceneKeys.StageIntro);
  }

  create(data: { session: GameSession }): void {
    this.session = data.session;
    this.elapsed = 0;
    this.started = false;
    const level = DATA.levels.levels[this.session.level - 1] ?? DATA.levels.levels[0]!;

    this.spaceBg = new SpaceBackground(this, -10, level.background);
    playMusic(level.background.theme);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020410, 0.5).setOrigin(0, 0).setDepth(-5);

    const color = THEME_COLOR[level.background.theme] ?? '#e8ecff';
    const lv = uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.4,
      t('stage.level', level.id),
      14,
      '#8fa0c8',
      'center',
    );
    const name = uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.47,
      t(level.nameKey),
      33,
      color,
      'center',
    );
    const tag = uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.55,
      t(level.taglineKey),
      11,
      '#9aa6c8',
      'center',
    );

    for (const [obj, delay] of [
      [lv, 0],
      [name, 150],
      [tag, 350],
    ] as const) {
      obj.setAlpha(0);
      this.tweens.add({ targets: obj, alpha: 1, duration: 350, delay, ease: 'Sine.easeOut' });
    }
    name.setScale(1.2);
    this.tweens.add({ targets: name, scale: 1, duration: 420, delay: 150, ease: 'Back.easeOut' });

    // 2.2초 후 자동 진입 (탭/키로 스킵)
    const go = (): void => {
      if (this.started || !this.scene.isActive(SceneKeys.StageIntro)) return;
      this.started = true;
      this.scene.start(SceneKeys.Game, { session: this.session });
    };
    this.time.delayedCall(2200, go);
    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', go);
      this.input.keyboard?.once('keydown-SPACE', go);
      this.input.keyboard?.once('keydown-ENTER', go);
    });
  }

  update(_time: number, deltaMs: number): void {
    this.elapsed += deltaMs / 1000;
    this.spaceBg.update(deltaMs / 1000, 40);
  }
}
