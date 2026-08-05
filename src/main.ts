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

// 한글 픽셀 폰트(Galmuri)를 먼저 로드해 첫 텍스트부터 적용되게 한다.
// 실패하거나 2.5초를 넘기면 폴백 폰트로 그냥 시작한다.
async function loadFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('bold 22px Galmuri11'),
        document.fonts.load('22px Galmuri11'),
        document.fonts.load('9px Galmuri9'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* 폰트 로드 실패 시 폴백 */
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
      pixelArt: true,
      antialias: false,
      roundPixels: true,
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

void loadFonts().then(boot);
