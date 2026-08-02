import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 레벨 간 상점. M1에서 데모 패리티로 구현.
export class ShopScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Shop);
  }
}
