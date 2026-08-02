// 크레딧 — 에셋 라이선스 대장(assets/LICENSES.md) 반영 (PLAN M6).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { SpaceBackground } from '../systems/background';
import { uiText } from '../ui/text';

const LINES: [string, number, string][] = [
  ['별의 일생', 26, '#dfe8ff'],
  ['', 8, '#8fa0c8'],
  ['기획 · 디렉션', 9, '#8fa0c8'],
  ['JSH', 12, '#fff2b0'],
  ['', 8, '#8fa0c8'],
  ['개발', 9, '#8fa0c8'],
  ['Claude Code', 12, '#fff2b0'],
  ['', 8, '#8fa0c8'],
  ['폰트', 9, '#8fa0c8'],
  ['Galmuri — quiple (OFL-1.1)', 10, '#dfe8ff'],
  ['', 8, '#8fa0c8'],
  ['스프라이트 일부', 9, '#8fa0c8'],
  ['Kenney Pixel Shmup (CC0)', 10, '#dfe8ff'],
  ['kenney.nl', 9, '#8a93b0'],
  ['', 8, '#8fa0c8'],
  ['그 외 그래픽 · 음악 · 효과음', 9, '#8fa0c8'],
  ['절차 생성 (자체 제작)', 10, '#dfe8ff'],
  ['', 8, '#8fa0c8'],
  ['Special Thanks', 9, '#8fa0c8'],
  ['Jungjioo & Parksulhee', 11, '#cfc2ff'],
  ['', 8, '#8fa0c8'],
  ['원작 v4 데모에서 출발한 프로덕션 빌드', 8, '#5a6a92'],
];

export class CreditsScene extends Phaser.Scene {
  private spaceBg!: SpaceBackground;
  private closing = false;

  constructor() {
    super(SceneKeys.Credits);
  }

  create(): void {
    this.closing = false;
    this.spaceBg = new SpaceBackground(this, -10);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020410, 0.55).setOrigin(0, 0).setDepth(-5);

    let y = 120;
    for (const [text, size, color] of LINES) {
      if (text) uiText(this, GAME_WIDTH / 2, y, text, size, color, 'center');
      y += size + 10;
    }
    uiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 40, '탭 / ESC — 돌아가기', 9, '#8fa0c8', 'center');

    const back = (): void => {
      if (this.closing) return;
      this.closing = true;
      this.scene.start(SceneKeys.Title);
    };
    this.time.delayedCall(300, () => {
      this.input.once('pointerdown', back);
      this.input.keyboard?.once('keydown-ESC', back);
      this.input.keyboard?.once('keydown-ENTER', back);
    });
  }

  update(_time: number, deltaMs: number): void {
    this.spaceBg.update(deltaMs / 1000, 30);
  }
}
