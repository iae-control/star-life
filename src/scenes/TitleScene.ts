// 타이틀 — 메뉴(처음부터/이어하기/엔들리스) + 난이도 선택 + 타이틀 BGM.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, t } from '../data';
import {
  cyclePilotWeapon,
  loadBest,
  newSession,
  PILOT_ORDER,
  selectedPilotWeapon,
  type GameSession,
  type Pilot,
  type WeaponKey,
} from '../game/session';
import { SpaceBackground } from '../systems/background';
import { playMusic } from '../systems/Music';
import { loadSave, updateSave, type Difficulty } from '../systems/Save';
import { audioResume } from '../systems/Sfx';
import { uiText } from '../ui/text';

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

interface MenuEntry {
  label: string;
  action: () => GameSession;
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
  private weaponText!: Phaser.GameObjects.Text;

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
      .image(GAME_WIDTH / 2, 246, 'hero-fighter-v2')
      .setScale(0.2)
      .setAngle(-2);
    this.orb = this.add.image(GAME_WIDTH / 2 + 92, 246, 'orb-P').setScale(1.4);

    uiText(this, GAME_WIDTH / 2, 132, '별의 일생', 40, '#dfe8ff', 'center');
    uiText(this, GAME_WIDTH / 2, 172, t('title.subtitle'), 10, '#8a93b0', 'center');

    // 메뉴 구성 (진행 저장 기반 — SaveSystem)
    this.menu.push({ label: t('title.menu.start'), action: () => newSession() });
    if (save.progress.unlockedLevel > 1) {
      const lv = Math.min(save.progress.unlockedLevel, DATA.levels.levels.length);
      this.menu.push({
        label: t('title.menu.continue', lv),
        action: () => {
          const s = newSession();
          s.level = lv;
          return s;
        },
      });
    }
    if (save.progress.endlessUnlocked) {
      this.menu.push({
        label: t('title.menu.endless'),
        action: () => {
          const s = newSession();
          s.endless = true;
          s.level = 1 + Math.floor(Math.random() * DATA.levels.levels.length);
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

    const selectorY = menuY + this.menu.length * 30 + 6;
    // 난이도 선택 (피드백 6)
    this.diffText = uiText(this, GAME_WIDTH / 2, selectorY, '', 10, '#9aa6c8', 'center');
    this.add
      .zone(90, selectorY - 13, GAME_WIDTH - 180, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cycleDiff(1));
    // 조종사 선택 (정지우 / 박슬희)
    this.pilotText = uiText(this, GAME_WIDTH / 2, selectorY + 22, '', 10, '#9aa6c8', 'center');
    this.add
      .zone(90, selectorY + 9, GAME_WIDTH - 180, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cyclePilot());

    // 주무기 선택 — 파일럿마다 시그니처/대체 무기 2개, 좌우 터치 지원
    this.weaponText = uiText(this, GAME_WIDTH / 2, selectorY + 44, '', 10, '#8fd3ff', 'center');
    this.add
      .zone(90, selectorY + 31, (GAME_WIDTH - 180) / 2, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cycleWeapon(-1));
    this.add
      .zone(GAME_WIDTH / 2, selectorY + 31, (GAME_WIDTH - 180) / 2, 26)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.cycleWeapon(1));
    this.refreshMenu();

    uiText(this, GAME_WIDTH / 2, 518, t('title.help1'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 534, t('title.help2'), 8, '#9aa6c8', 'center');
    uiText(this, GAME_WIDTH / 2, 550, t('title.help3'), 8, '#9aa6c8', 'center');
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
    kb?.on('keydown-LEFT', () => this.cycleWeapon(-1));
    kb?.on('keydown-RIGHT', () => this.cycleWeapon(1));
    kb?.on('keydown-Q', () => this.cycleDiff(-1));
    kb?.on('keydown-E', () => this.cycleDiff(1));
    const onKey = (e: KeyboardEvent): void => {
      if (!e.repeat) this.startGame(this.sel);
    };
    kb?.on('keydown-ENTER', onKey);
    kb?.on('keydown-SPACE', onKey);
    kb?.on('keydown-S', () => this.openSettings());

    playMusic('title');
  }

  private cyclePilot(): void {
    updateSave((s) => {
      const i = PILOT_ORDER.indexOf(s.settings.pilot);
      s.settings.pilot = PILOT_ORDER[(i + 1) % PILOT_ORDER.length] ?? 'jungjioo';
    });
    this.ship.setAngle(this.ship.angle === -2 ? 2 : -2);
    this.refreshMenu();
  }

  private cycleWeapon(direction: number): void {
    cyclePilotWeapon(loadSave().settings.pilot, direction);
    this.refreshMenu();
  }

  private weaponName(pilot: Pilot, weapon: WeaponKey): string {
    const definition = DATA.weapons.weapons[weapon];
    // nameKey가 추가된 콘텐츠는 즉시 현지화하고, 구 데이터는 기존 영문 이름을 유지한다.
    const nameKey = (definition as { nameKey?: string } | undefined)?.nameKey;
    if (nameKey) return t(nameKey);
    return definition?.name ?? `${pilot}:${weapon}`;
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
    const weapon = selectedPilotWeapon(save.settings.pilot);
    const weaponDef = DATA.weapons.weapons[weapon];
    this.weaponText
      .setText(`WPN  ◀ ${this.weaponName(save.settings.pilot, weapon)} ▶`)
      .setColor(weaponDef?.color ?? '#8fd3ff');
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.spaceBg.update(dt, 45);
    const bob = Math.sin(this.t * 2) * 5;
    this.ship.setY(246 + bob);
    // 엔진 플리커 — 시트 행 전환
    this.ship.setRotation(Math.sin(this.t * 1.4) * 0.025);
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
    // 상점 폐지 — 엔들리스는 인트로 없이 바로 전장으로
    this.scene.start(session.endless ? SceneKeys.Game : SceneKeys.StageIntro, { session });
  }
}
