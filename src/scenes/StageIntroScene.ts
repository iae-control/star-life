import Phaser from 'phaser';

import { SceneKeys } from '../config';

// 스테이지 도입 연출(레벨 타이틀·목표 표시). M3에서 구현.
export class StageIntroScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.StageIntro);
  }
}
