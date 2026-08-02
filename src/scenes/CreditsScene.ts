import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 크레딧 화면 — assets/LICENSES.md 대장을 반영한다. M6에서 완성.
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Credits);
  }
}
