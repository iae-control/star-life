import Phaser from 'phaser';

import { SceneKeys } from '../config';

// Game 위에 얹는 일시정지 오버레이. M1에서 구현.
export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Pause);
  }
}
