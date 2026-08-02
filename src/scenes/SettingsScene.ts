import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 설정 오버레이(볼륨·진동·조작·언어). M5에서 완성.
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Settings);
  }
}
