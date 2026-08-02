import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 레벨 클리어/게임오버 결과 화면. M1에서 구현.
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Result);
  }
}
