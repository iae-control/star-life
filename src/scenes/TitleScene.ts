// 타이틀 — 데모 drawTitle() 이식 (Tyrian 크레딧 제거, 자체 에셋).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { loadBest } from '../game/session';
import { audioResume } from '../systems/Sfx';
import { uiText } from '../ui/text';

export class TitleScene extends Phaser.Scene {
  private starting = false;
  private ship!: Phaser.GameObjects.Image;
  private orb!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.TileSprite;
  private t = 0;

  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    this.starting = false;
    this.t = 0;

    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-tiles')
      .setOrigin(0, 0)
      .setAlpha(0.6);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020410, 0.45).setOrigin(0, 0);

    const glow = this.add.image(GAME_WIDTH / 2, 262, 'super-aura');
    glow.setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0.7);
    this.ship = this.add.image(GAME_WIDTH / 2, 262, 'ship-player').setScale(3);
    this.orb = this.add.image(GAME_WIDTH / 2 + 79, 262, 'orb-P').setScale(1.4);

    uiText(this, GAME_WIDTH / 2, 144, '별의 일생', 40, '#dfe8ff', 'center');
    uiText(this, GAME_WIDTH / 2, 186, '— vertical shooter —', 10, '#8a93b0', 'center');

    const best = loadBest();
    this.prompt = uiText(
      this,
      GAME_WIDTH / 2,
      384,
      best ? '다시 출격: 탭 / ENTER' : '탭 또는 ENTER로 출격',
      13,
      '#fff2b0',
      'center',
    );
    uiText(
      this,
      GAME_WIDTH / 2,
      420,
      '이동: 방향키·WASD·드래그 / 발사: SPACE·Z (터치 자동)',
      8,
      '#9aa6c8',
      'center',
    );
    uiText(
      this,
      GAME_WIDTH / 2,
      438,
      '슈퍼무기: X·B 또는 S버튼 / 상점: 보스 격파 후',
      8,
      '#9aa6c8',
      'center',
    );
    uiText(this, GAME_WIDTH / 2, 456, 'P·ESC 일시정지 · M 음소거', 8, '#9aa6c8', 'center');
    if (best) uiText(this, GAME_WIDTH / 2, 492, `BEST ${best}`, 12, '#ffd76a', 'center');

    this.input.keyboard?.removeAllListeners();
    this.input.once('pointerdown', () => this.startGame());
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.bg.tilePositionY -= 45 * dt;
    const bob = Math.sin(this.t * 2) * 5;
    this.ship.setY(262 + bob);
    this.orb.setPosition(
      GAME_WIDTH / 2 + Math.cos(this.t * 1.6) * 79,
      262 + bob + Math.sin(this.t * 1.6) * 35,
    );
    this.prompt.setVisible(Math.floor(this.t * 1.4) % 2 === 0);
  }

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;
    audioResume();
    this.scene.start(SceneKeys.Game);
  }
}
