// 설정 오버레이 — 음악/효과음 볼륨·언어·난이도·진동. SaveSystem 연동 (M5).
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { getLang, setLang, t } from '../data';
import { setMusicVolume } from '../systems/Music';
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
import { setSfxVolume, SFX } from '../systems/Sfx';
import { uiText } from '../ui/text';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

interface RowDef {
  label: () => string;
  value: () => string;
  change: (d: number) => void;
}

export class SettingsScene extends Phaser.Scene {
  private from: string = SceneKeys.Title;
  private rows: RowDef[] = [];
  private texts: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[] = [];
  private sel = 0;
  private selBox!: Phaser.GameObjects.Rectangle;
  private langChanged = false;

  constructor() {
    super(SceneKeys.Settings);
  }

  create(data?: { from?: string }): void {
    this.from = data?.from ?? SceneKeys.Title;
    this.sel = 0;
    this.texts = [];
    this.langChanged = false;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x04060f, 0.92).setOrigin(0, 0);
    const frame = this.add.graphics();
    frame.lineStyle(1, 0x8caaff, 0.4);
    frame.strokeRoundedRect(24, 130, GAME_WIDTH - 48, 320, 8);
    uiText(this, GAME_WIDTH / 2, 160, t('settings.title'), 20, '#e8ecff', 'center');

    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.rows = [
      {
        label: () => t('settings.music'),
        value: () => pct(loadSave().settings.musicVol),
        change: (d) => {
          updateSave((s) => {
            s.settings.musicVol = Phaser.Math.Clamp(
              Math.round((s.settings.musicVol + d * 0.1) * 10) / 10,
              0,
              1,
            );
            setMusicVolume(s.settings.musicVol);
          });
        },
      },
      {
        label: () => t('settings.sfx'),
        value: () => pct(loadSave().settings.sfxVol),
        change: (d) => {
          updateSave((s) => {
            s.settings.sfxVol = Phaser.Math.Clamp(
              Math.round((s.settings.sfxVol + d * 0.1) * 10) / 10,
              0,
              1,
            );
            setSfxVolume(s.settings.sfxVol);
          });
          SFX.pow();
        },
      },
      {
        label: () => t('settings.lang'),
        value: () => (getLang() === 'ko' ? '한국어' : 'English'),
        change: () => {
          setLang(getLang() === 'ko' ? 'en' : 'ko');
          updateSave((s) => {
            s.settings.lang = getLang();
          });
          this.langChanged = true;
        },
      },
      {
        label: () => t('settings.difficulty'),
        value: () => t(`diff.${loadSave().settings.difficulty}`),
        change: (d) => {
          updateSave((s) => {
            const i = DIFFS.indexOf(s.settings.difficulty);
            s.settings.difficulty = DIFFS[(i + DIFFS.length + d) % DIFFS.length] ?? 'normal';
          });
        },
      },
      {
        label: () => t('settings.vibration'),
        value: () => (loadSave().settings.vibration ? t('settings.on') : t('settings.off')),
        change: () => {
          updateSave((s) => {
            s.settings.vibration = !s.settings.vibration;
          });
        },
      },
    ];

    this.selBox = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH - 64, 30, 0x5a78dc, 0.3);
    this.rows.forEach((row, i) => {
      const y = 206 + i * 40;
      this.texts.push({
        label: uiText(this, 44, y, '', 10, '#dfe8ff'),
        value: uiText(this, GAME_WIDTH - 44, y, '', 10, '#ffd76a', 'right'),
      });
      this.add
        .zone(32, y - 16, GAME_WIDTH - 64, 34)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (this.sel === i) row.change(pointer.worldX < GAME_WIDTH / 2 ? -1 : 1);
          else this.sel = i;
          this.refresh();
        });
    });

    const closeY = 206 + this.rows.length * 40 + 10;
    const closeBox = this.add.rectangle(GAME_WIDTH / 2, closeY, 150, 32, 0x3c5a46, 0.35);
    closeBox.setStrokeStyle(1, 0x7fd2a8, 1);
    uiText(this, GAME_WIDTH / 2, closeY, t('settings.close'), 11, '#c8ffd8', 'center');
    this.add
      .zone(GAME_WIDTH / 2 - 75, closeY - 16, 150, 32)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.close());

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    kb?.on('keydown-UP', () => {
      this.sel = (this.sel + this.rows.length - 1) % this.rows.length;
      this.refresh();
    });
    kb?.on('keydown-DOWN', () => {
      this.sel = (this.sel + 1) % this.rows.length;
      this.refresh();
    });
    kb?.on('keydown-LEFT', () => {
      this.rows[this.sel]?.change(-1);
      this.refresh();
    });
    kb?.on('keydown-RIGHT', () => {
      this.rows[this.sel]?.change(1);
      this.refresh();
    });
    kb?.on('keydown-ESC', () => this.close());
    kb?.on('keydown-ENTER', () => this.close());

    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const tx = this.texts[i];
      if (!tx) return;
      tx.label.setText(row.label()).setColor(i === this.sel ? '#fff2b0' : '#dfe8ff');
      tx.value.setText(`◀ ${row.value()} ▶`);
      if (i === this.sel) this.selBox.setY(tx.label.y);
    });
  }

  private close(): void {
    this.scene.stop();
    if (this.from === SceneKeys.Pause) {
      // 일시정지로 복귀
      this.scene.launch(SceneKeys.Pause);
    } else if (this.langChanged) {
      // 언어 변경 시 타이틀 텍스트 재생성
      this.scene.stop(SceneKeys.Title);
      this.scene.start(SceneKeys.Title);
    } else {
      this.scene.resume(SceneKeys.Title);
    }
  }
}
