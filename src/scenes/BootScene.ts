import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 엔진 초기화 직후 최소 설정만 하고 Preload로 넘어간다.
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    this.scene.start(SceneKeys.Preload);
  }
}
