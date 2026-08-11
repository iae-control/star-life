import Phaser from 'phaser';

import { BACKGROUND_COLOR, GAME_HEIGHT, GAME_WIDTH } from './config';
import { setLang } from './data';
import { setMusicVolume } from './systems/Music';
import { loadSave } from './systems/Save';
import { installAudioUnlock, setMuted, setSfxVolume } from './systems/Sfx';
import { BootScene } from './scenes/BootScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { StageIntroScene } from './scenes/StageIntroScene';
import { TitleScene } from './scenes/TitleScene';

declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}

function boot(): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: BACKGROUND_COLOR,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: false,
      antialias: true,
      antialiasGL: true,
      roundPixels: false,
    },
    input: {
      // 멀티터치: 드래그 이동 중 다른 손가락으로 슈퍼 버튼을 눌러야 한다
      activePointers: 3,
    },
    scene: [
      BootScene,
      PreloadScene,
      TitleScene,
      StageIntroScene,
      GameScene,
      ResultScene,
      PauseScene,
      SettingsScene,
      CreditsScene,
    ],
  });

  installAudioUnlock();
  const sv = loadSave().settings;
  setMuted(sv.muted);
  setMusicVolume(sv.musicVol);
  setSfxVolume(sv.sfxVol);
  setLang(sv.lang);

  // 개발·디버그 도구(?debug HUD 포함)에서 접근할 수 있게 노출.
  window.__game = game;
}

boot();
