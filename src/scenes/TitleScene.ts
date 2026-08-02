// 타이틀 — 데모 drawTitle() 이식 (Tyrian 크레딧 제거, 자체 에셋).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { t } from '../data';
import { loadBest, newSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { audioResume } from '../systems/Sfx';
import { uiText } from '../ui/text';

export class TitleScene extends Phaser.Scene {
  private starting = false;
  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private orb!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private spaceBg!: SpaceBackground;
  private t = 0;

  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    this.starting = false;
    this.t = 0;

    this.spaceBg = new SpaceBackground(this, -10);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020410, 0.28).setOrigin(0, 0).setDepth(-5);

    const glow = this.add.image(GAME_WIDTH / 2, 262, 'super-aura');
    glow.setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0.7);
    this.tweens.add({
      targets: glow,
      alpha: 0.35,
      scale: 3.4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.flame = this.add
      .image(GAME_WIDTH / 2, 262 + 52, 'engine-flame')
      .setScale(3)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.ship = this.add.image(GAME_WIDTH / 2, 262, 'ship-player').setScale(3);
    this.orb = this.add.image(GAME_WIDTH / 2 + 92, 262, 'orb-P').setScale(1.4);

    uiText(this, GAME_WIDTH / 2, 144, '별의 일생', 40, '#dfe8ff', 'center');
    uiText(this, GAME_WIDTH / 2, 186, t('title.subtitle'), 10, '#8a93b0', 'center');

    const best = loadBest();
    this.prompt = uiText(
      this,
      GAME_WIDTH / 2,
      384,
      best ? t('title.restart') : t('title.start'),
      13,
      '#fff2b0',
      'center',
    );
    uiText(this, GAME_WIDTH / 2, 420, t('title.help1'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 438, t('title.help2'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 456, t('title.help3'), 8, '#9aa6c8', 'center');
    if (best) uiText(this, GAME_WIDTH / 2, 492, t('title.best', best), 12, '#ffd76a', 'center');

    this.input.keyboard?.removeAllListeners();
    this.input.once('pointerdown', () => this.startGame());
    // e.repeat 가드: 발사키를 누른 채 사망→타이틀로 온 경우 자동반복으로 즉시 재시작되는 것 방지
    const onKey = (e: KeyboardEvent): void => {
      if (!e.repeat) this.startGame();
    };
    this.input.keyboard?.on('keydown-ENTER', onKey);
    this.input.keyboard?.on('keydown-SPACE', onKey);
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.spaceBg.update(dt, 45);
    const bob = Math.sin(this.t * 2) * 5;
    this.ship.setY(262 + bob);
    this.flame.setY(262 + bob + 52);
    this.flame.setScale(3, 3 + Math.sin(this.t * 40) * 0.7);
    this.orb.setPosition(
      GAME_WIDTH / 2 + Math.cos(this.t * 1.6) * 92,
      262 + bob + Math.sin(this.t * 1.6) * 44,
    );
    this.prompt.setVisible(Math.floor(this.t * 1.4) % 2 === 0);
  }

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;
    audioResume();
    // 새 세션을 명시적으로 전달 — data 없이 start하면 Phaser가 이전 settings.data(죽은 세션)를 재사용한다
    this.scene.start(SceneKeys.StageIntro, { session: newSession() });
  }
}
