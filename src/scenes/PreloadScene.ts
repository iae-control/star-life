import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, isSceneKey, SceneKeys } from '../config';
import { DATA } from '../data';
import { azSheetVariant, generateTextures } from '../systems/textures';

// 에셋 로딩 담당. M0 시점에는 로딩할 에셋이 없어 진행 바 뼈대만 둔다.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    // ansimuz Spaceship Shooter / Starfighter (자유 라이선스, 크레딧 감사 표기)
    this.load.image('poodle', 'assets/poodle.png');
    this.load.spritesheet('az-ship', 'assets/ansimuz/ship.png', {
      frameWidth: 16,
      frameHeight: 24,
    });
    this.load.spritesheet('az-small', 'assets/ansimuz/enemy-small.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('az-medium', 'assets/ansimuz/enemy-medium.png', {
      frameWidth: 32,
      frameHeight: 16,
    });
    this.load.spritesheet('az-big', 'assets/ansimuz/enemy-big.png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('az-explosion', 'assets/ansimuz/explosion.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    for (const a of ['big-a', 'big-b', 'med-a', 'med-b']) {
      this.load.image(`az-asteroid-${a}`, `assets/ansimuz/asteroid-${a}.png`);
    }
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
    // ansimuz 적 시트 — 데이터 tint를 음영 유지 팔레트 스왑 시트로 사전 생성
    const azFrame: Record<string, [number, number]> = {
      'az-small': [16, 16],
      'az-medium': [32, 16],
      'az-big': [32, 32],
    };
    for (const def of Object.values(DATA.enemies.types)) {
      const fr = azFrame[def.sprite];
      if (fr && def.tint) {
        azSheetVariant(this, def.sprite + def.tint, def.sprite, def.tint, fr[0], fr[1]);
      }
    }
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
