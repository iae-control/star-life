// 타이틀 — 메뉴(처음부터/이어하기/엔들리스) + 난이도 선택 + 타이틀 BGM.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, t } from '../data';
import { loadBest, newSession, type GameSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { playMusic } from '../systems/Music';
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
import { audioResume } from '../systems/Sfx';
import { uiText } from '../ui/text';

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

interface MenuEntry {
  label: string;
  action: () => GameSession;
  /** 보정 크레딧을 바로 쓸 수 있게 상점을 먼저 연다 */
  viaShop?: boolean;
}

export class TitleScene extends Phaser.Scene {
  private starting = false;
  private ship!: Phaser.GameObjects.Image;
  private orb!: Phaser.GameObjects.Image;
  private spaceBg!: SpaceBackground;
  private t = 0;
  private menu: MenuEntry[] = [];
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private sel = 0;
  private diffText!: Phaser.GameObjects.Text;
  private pilotText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    this.starting = false;
    this.t = 0;
    this.sel = 0;
    this.menu = [];
    this.menuTexts = [];
    const save = loadSave();

    this.spaceBg = new SpaceBackground(this, -10);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020410, 0.28).setOrigin(0, 0).setDepth(-5);

    const glow = this.add.image(GAME_WIDTH / 2, 246, 'super-aura');
    glow.setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0.7);
    this.tweens.add({
      targets: glow,
      alpha: 0.35,
      scale: 3.4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.ship = this.add
      .image(
        GAME_WIDTH / 2,
        246,
        { parksulhee: 'az-ship-ps', youngjioo: 'az-ship-jw' }[save.settings.pilot as string] ??
          'az-ship',
        0,
      )
      .setScale(4);
    this.orb = this.add.image(GAME_WIDTH / 2 + 92, 246, 'orb-P').setScale(1.4);

    uiText(this, GAME_WIDTH / 2, 132, '별의 일생', 40, '#dfe8ff', 'center');
    uiText(this, GAME_WIDTH / 2, 172, t('title.subtitle'), 10, '#8a93b0', 'center');

    // 메뉴 구성 (진행 저장 기반 — SaveSystem)
    this.menu.push({ label: t('title.menu.start'), action: () => newSession() });
    if (save.progress.unlockedLevel > 1) {
      const lv = Math.min(save.progress.unlockedLevel, DATA.levels.levels.length);
      this.menu.push({
        label: t('title.menu.continue', lv),
        viaShop: true,
        action: () => {
          const s = newSession();
          s.level = lv;
          // 후반 시작 보정: 전 레벨 분량의 기본 자금
          s.credits = (lv - 1) * 1600;
          return s;
        },
      });
    }
    if (save.progress.endlessUnlocked) {
      this.menu.push({
        label: t('title.menu.endless'),
        viaShop: true,
        action: () => {
          const s = newSession();
          s.endless = true;
          s.level = 1 + Math.floor(Math.random() * DATA.levels.levels.length);
          s.credits = 2000;
          return s;
        },
      });
    }

    const menuY = 356;
    this.menu.forEach((entry, i) => {
      const txt = uiText(
        this,
        GAME_WIDTH / 2,
        menuY + i * 30,
        entry.label,
        13,
        '#fff2b0',
        'center',
      );
      this.menuTexts.push(txt);
      this.add
        .zone(60, menuY + i * 30 - 13, GAME_WIDTH - 120, 26)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          audioResume();
          if (this.sel === i) this.startGame(i);
          else {
            this.sel = i;
            this.refreshMenu();
          }
        });
    });

    // 난이도 선택 (피드백 6)
    this.diffText = uiText(
      this,
      GAME_WIDTH / 2,
      menuY + this.menu.length * 30 + 14,
      '',
      10,
      '#9aa6c8',
      'center',
    );
    this.add
      .zone(90, menuY + this.menu.length * 30 + 1, GAME_WIDTH - 180, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cycleDiff(1));
    // 조종사 선택 (정지우 / 박슬희)
    this.pilotText = uiText(
      this,
      GAME_WIDTH / 2,
      menuY + this.menu.length * 30 + 38,
      '',
      10,
      '#9aa6c8',
      'center',
    );
    this.add
      .zone(90, menuY + this.menu.length * 30 + 25, GAME_WIDTH - 180, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cyclePilot());
    this.refreshMenu();

    uiText(this, GAME_WIDTH / 2, 508, t('title.help1'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 524, t('title.help2'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 540, t('title.help3'), 8, '#9aa6c8', 'center');
    const best = loadBest();
    if (best) uiText(this, GAME_WIDTH / 2, 570, t('title.best', best), 11, '#ffd76a', 'center');

    // 설정 · 크레딧 진입
    uiText(this, GAME_WIDTH / 2 - 60, 600, `⚙ ${t('settings.title')}`, 10, '#8fa0c8', 'center');
    this.add
      .zone(GAME_WIDTH / 2 - 120, 588, 120, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openSettings());
    uiText(this, GAME_WIDTH / 2 + 60, 600, 'CREDITS', 10, '#8fa0c8', 'center');
    this.add
      .zone(GAME_WIDTH / 2 + 10, 588, 120, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.starting) this.scene.start(SceneKeys.Credits);
      });

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    kb?.on('keydown-UP', () => {
      this.sel = (this.sel + this.menu.length - 1) % this.menu.length;
      this.refreshMenu();
    });
    kb?.on('keydown-DOWN', () => {
      this.sel = (this.sel + 1) % this.menu.length;
      this.refreshMenu();
    });
    kb?.on('keydown-LEFT', () => this.cycleDiff(-1));
    kb?.on('keydown-RIGHT', () => this.cycleDiff(1));
    const onKey = (e: KeyboardEvent): void => {
      if (!e.repeat) this.startGame(this.sel);
    };
    kb?.on('keydown-ENTER', onKey);
    kb?.on('keydown-SPACE', onKey);
    kb?.on('keydown-S', () => this.openSettings());

    playMusic('title');
  }

  private cyclePilot(): void {
    const order = ['jungjioo', 'parksulhee', 'youngjioo'] as const;
    updateSave((s) => {
      const i = order.indexOf(s.settings.pilot as (typeof order)[number]);
      s.settings.pilot = order[(i + 1) % order.length] ?? 'jungjioo';
    });
    const pilot = loadSave().settings.pilot as string;
    this.ship.setTexture(
      { parksulhee: 'az-ship-ps', youngjioo: 'az-ship-jw' }[pilot] ?? 'az-ship',
      this.ship.frame.name,
    );
    this.refreshMenu();
  }

  private cycleDiff(d: number): void {
    const save = loadSave();
    const idx = DIFF_ORDER.indexOf(save.settings.difficulty);
    const next = DIFF_ORDER[(idx + DIFF_ORDER.length + d) % DIFF_ORDER.length] ?? 'normal';
    updateSave((s) => {
      s.settings.difficulty = next;
    });
    this.refreshMenu();
  }

  private refreshMenu(): void {
    this.menuTexts.forEach((txt, i) => {
      txt.setColor(i === this.sel ? '#fff2b0' : '#8a93b0');
      const entry = this.menu[i];
      if (entry) txt.setText((i === this.sel ? '▶ ' : '') + entry.label);
    });
    const save = loadSave();
    this.diffText.setText(`${t('title.diff')}  ◀ ${t(`diff.${save.settings.difficulty}`)} ▶`);
    this.pilotText.setText(`${t('title.pilot')}  ◀ ${t(`pilot.${save.settings.pilot}`)} ▶`);
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.spaceBg.update(dt, 45);
    const bob = Math.sin(this.t * 2) * 5;
    this.ship.setY(246 + bob);
    // 엔진 플리커 — 시트 행 전환
    this.ship.setFrame(2 + (Math.floor(this.t * 12) % 2) * 5);
    this.orb.setPosition(
      GAME_WIDTH / 2 + Math.cos(this.t * 1.6) * 92,
      246 + bob + Math.sin(this.t * 1.6) * 44,
    );
    const selTxt = this.menuTexts[this.sel];
    if (selTxt) selTxt.setAlpha(0.75 + Math.sin(this.t * 6) * 0.25);
  }

  private openSettings(): void {
    if (this.starting) return;
    this.scene.pause();
    this.scene.launch(SceneKeys.Settings, { from: SceneKeys.Title });
  }

  private startGame(idx: number): void {
    if (this.starting) return;
    const entry = this.menu[idx];
    if (!entry) return;
    this.starting = true;
    audioResume();
    const session = entry.action();
    this.scene.start(entry.viaShop ? SceneKeys.Shop : SceneKeys.StageIntro, { session });
  }
}
