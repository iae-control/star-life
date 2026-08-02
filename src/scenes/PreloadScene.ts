import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, isSceneKey, SceneKeys } from '../config';
import { generateTextures } from '../systems/textures';

// 에셋 로딩 담당. M0 시점에는 로딩할 에셋이 없어 진행 바 뼈대만 둔다.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    // Kenney Pixel Shmup (CC0) — 기계형 적기 헐. assets/LICENSES.md 기록.
    for (const n of [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]) {
      this.load.image(`kship_${n}`, `assets/kenney/ships/ship_00${n}.png`);
    }
    const barWidth = 200;
    const barHeight = 6;
    const x = (GAME_WIDTH - barWidth) / 2;
    const y = GAME_HEIGHT / 2;

    const track = this.add.rectangle(x, y, barWidth, barHeight, 0x1a1c2e).setOrigin(0, 0.5);
    const fill = this.add.rectangle(x, y, 0, barHeight, 0x8fd3ff).setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = barWidth * value;
    });
    this.load.on('complete', () => {
      track.destroy();
      fill.destroy();
    });
  }

  create(): void {
    // 임시 에셋(자체 절차 생성) — M3에서 정식 아트로 교체
    generateTextures(this);
    // 개발 전용 씬 점프(?scene=Game) — M2 ?debug 도구의 최소 선행 버전.
    // Boot/Preload로의 점프는 자기 재시작 무한루프가 되므로 제외한다.
    if (import.meta.env.DEV) {
      const jump = new URLSearchParams(window.location.search).get('scene');
      // 세션 없이 시작 가능한 씬만 허용 (Shop/StageIntro/Result는 세션 필요 → 크래시)
      if (isSceneKey(jump) && (jump === SceneKeys.Title || jump === SceneKeys.Game)) {
        this.scene.start(jump);
        return;
      }
    }
    this.scene.start(SceneKeys.Title);
  }
}
