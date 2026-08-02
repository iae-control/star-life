// 상점 — 보스 격파 후 진입. 로직은 game/logic/shop.ts, 여기는 UI만.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { WEAPONS } from '../game/logic/balance';
import { itemAction, SHOP_WEAPON_KEYS, UPGRADE_ITEMS, weaponAction } from '../game/logic/shop';
import type { GameSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { audioResume, SFX } from '../systems/Sfx';
import { uiText } from '../ui/text';

const ROW_H = 34;
const wpnRowY = (i: number) => 148 + i * ROW_H;
const itmRowY = (i: number) => 366 + i * ROW_H;
const GO_Y = 530;
const N_WPN = SHOP_WEAPON_KEYS.length;
const N_ROWS = N_WPN + UPGRADE_ITEMS.length + 1;

export class ShopScene extends Phaser.Scene {
  private session!: GameSession;
  private sel = 0;
  private selBox!: Phaser.GameObjects.Rectangle;
  private goBox!: Phaser.GameObjects.Rectangle;
  private creditsText!: Phaser.GameObjects.Text;
  private wpnTexts: {
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    lv: Phaser.GameObjects.Text;
    right: Phaser.GameObjects.Text;
  }[] = [];
  private selAccent!: Phaser.GameObjects.Rectangle;
  private itmTexts: {
    name: Phaser.GameObjects.Text;
    stat: Phaser.GameObjects.Text;
    right: Phaser.GameObjects.Text;
  }[] = [];
  private goText!: Phaser.GameObjects.Text;
  private spaceBg!: SpaceBackground;

  constructor() {
    super(SceneKeys.Shop);
  }

  update(_time: number, deltaMs: number): void {
    this.spaceBg.update(deltaMs / 1000, 18);
  }

  create(data: { session: GameSession }): void {
    this.session = data.session;
    this.sel = 0;
    this.wpnTexts = [];
    this.itmTexts = [];
    // 상점 진입 시 실드 완충 (데모 enterShop)
    this.session.shield = this.session.shieldMax;

    // 배경은 UI 아래로 (별이 텍스트 위에 비치지 않게)
    this.spaceBg = new SpaceBackground(this, -10);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x060a18, 0.9).setOrigin(0, 0).setDepth(-5);
    const frame = this.add.graphics();
    frame.lineStyle(1, 0x8caaff, 0.35);
    frame.strokeRoundedRect(9, 42, GAME_WIDTH - 18, GAME_HEIGHT - 80, 8);

    uiText(this, GAME_WIDTH / 2, 74, 'WEAPON SHOP', 20, '#e8ecff', 'center');
    this.creditsText = uiText(this, GAME_WIDTH / 2, 102, '', 14, '#ffd76a', 'center');

    this.selBox = this.add
      .rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH - 32, ROW_H - 4, 0x5a78dc, 0.32)
      .setVisible(false);
    this.selAccent = this.add.rectangle(19, 0, 3, ROW_H - 4, 0x8fd3ff).setVisible(false);

    uiText(this, 20, 130, 'FRONT WEAPON — 구매 / 장착', 9, '#8fa0c8');
    for (let i = 0; i < N_WPN; i++) {
      const y = wpnRowY(i);
      const key = SHOP_WEAPON_KEYS[i];
      if (key) {
        // 탄환 색 스와치 — 무기 정체성 시각화
        this.add.rectangle(31, y + 4, 10, 10, WEAPONS[key].color).setStrokeStyle(1, 0x0a1226, 1);
      }
      this.wpnTexts.push({
        name: uiText(this, 42, y + 3, '', 10, '#dfe8ff'),
        desc: uiText(this, 42, y + 17, '', 7, '#6a7a9a'),
        lv: uiText(this, 196, y + 3, '', 9, '#9fe8b8'),
        right: uiText(this, GAME_WIDTH - 25, y + 8, '', 10, '#ffd76a', 'right'),
      });
      this.hitZone(25, y - 6, GAME_WIDTH - 50, ROW_H - 2, () => this.act(i));
    }

    uiText(this, 20, 348, 'UPGRADE / SUPPLY', 9, '#8fa0c8');
    for (let i = 0; i < UPGRADE_ITEMS.length; i++) {
      const y = itmRowY(i);
      this.itmTexts.push({
        name: uiText(this, 25, y + 3, '', 9, '#dfe8ff'),
        stat: uiText(this, 25, y + 16, '', 8, '#7fd2a8'),
        right: uiText(this, GAME_WIDTH - 25, y + 8, '', 10, '#ffd76a', 'right'),
      });
      this.hitZone(25, y - 6, GAME_WIDTH - 50, ROW_H - 2, () => this.act(N_WPN + i));
    }

    this.goBox = this.add.rectangle(
      GAME_WIDTH / 2,
      GO_Y + 14,
      GAME_WIDTH - 130,
      40,
      0x3c5a46,
      0.25,
    );
    const goStroke = this.add.graphics();
    goStroke.lineStyle(1, 0x7fd2a8, 1);
    goStroke.strokeRoundedRect(65, GO_Y - 6, GAME_WIDTH - 130, 40, 6);
    this.goText = uiText(this, GAME_WIDTH / 2, GO_Y + 14, '', 12, '#c8ffd8', 'center');
    this.hitZone(65, GO_Y - 6, GAME_WIDTH - 130, 40, () => this.act(N_ROWS - 1));

    uiText(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 46,
      '↑↓·ENTER 또는 행을 탭: 구매/장착',
      9,
      '#8fa0c8',
      'center',
    );

    // 발사키(SPACE/Z)를 누른 채 상점에 진입한 경우: 자동반복·잔여 입력이
    // 진입 즉시 act()를 발동하지 않도록 250ms 무장 지연 + e.repeat 가드
    const armedAt = this.time.now + 250;
    const guarded =
      (fn: () => void) =>
      (e: KeyboardEvent): void => {
        if (e.repeat || this.time.now < armedAt) return;
        fn();
      };
    const kb = this.input.keyboard;
    if (kb) {
      kb.removeAllListeners();
      kb.on(
        'keydown-UP',
        guarded(() => this.move(-1)),
      );
      kb.on(
        'keydown-DOWN',
        guarded(() => this.move(1)),
      );
      kb.on(
        'keydown-ENTER',
        guarded(() => this.act(this.sel)),
      );
      kb.on(
        'keydown-SPACE',
        guarded(() => this.act(this.sel)),
      );
      kb.on(
        'keydown-Z',
        guarded(() => this.act(this.sel)),
      );
    }
    this.input.on('pointerdown', () => audioResume());

    this.refresh();
  }

  private hitZone(x: number, y: number, w: number, h: number, fn: () => void): void {
    this.add
      .zone(x, y, w, h)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', fn);
  }

  private move(d: number): void {
    this.sel = (this.sel + N_ROWS + d) % N_ROWS;
    this.refresh();
  }

  private act(sel: number): void {
    this.sel = sel;
    if (sel < N_WPN) {
      const key = SHOP_WEAPON_KEYS[sel];
      if (key) {
        const r = weaponAction(this.session, key);
        if (r === 'denied' || r === 'noop') SFX.deny();
        else if (r === 'bought') SFX.buy();
        else SFX.pow();
      }
    } else if (sel < N_WPN + UPGRADE_ITEMS.length) {
      const item = UPGRADE_ITEMS[sel - N_WPN];
      if (item) {
        const r = itemAction(this.session, item);
        if (r === 'denied') SFX.deny();
        else SFX.buy();
      }
    } else {
      this.scene.start(SceneKeys.Game, { session: this.session });
      return;
    }
    this.refresh();
  }

  private refresh(): void {
    const s = this.session;
    this.creditsText.setText(`CR ${s.credits}`);

    if (this.sel < N_WPN) {
      this.selBox.setVisible(true).setY(wpnRowY(this.sel) + 9);
    } else if (this.sel < N_WPN + UPGRADE_ITEMS.length) {
      this.selBox.setVisible(true).setY(itmRowY(this.sel - N_WPN) + 9);
    } else {
      this.selBox.setVisible(false);
    }
    this.selAccent.setVisible(this.selBox.visible).setY(this.selBox.y);
    this.goBox.setFillStyle(0x3c5a46, this.sel === N_ROWS - 1 ? 0.45 : 0.25);

    for (let i = 0; i < N_WPN; i++) {
      const key = SHOP_WEAPON_KEYS[i];
      const row = this.wpnTexts[i];
      if (!key || !row) continue;
      const def = WEAPONS[key];
      const owned = s.weapons[key] !== undefined;
      const equipped = s.cur === key;
      const afford = s.credits >= def.price;
      row.name.setText(def.name).setColor(owned ? '#dfe8ff' : afford ? '#aeb8d8' : '#5a6178');
      row.desc.setText(def.desc);
      row.lv.setText(owned ? `Lv${s.weapons[key]}` : '');
      row.right
        .setText(equipped ? '[장착중]' : owned ? '장착' : `${def.price} CR`)
        .setColor(equipped ? '#8aff8a' : owned ? '#7ecbff' : afford ? '#ffd76a' : '#8b6a3a');
    }
    for (let i = 0; i < UPGRADE_ITEMS.length; i++) {
      const it = UPGRADE_ITEMS[i];
      const row = this.itmTexts[i];
      if (!it || !row) continue;
      const can = it.can(s);
      const afford = can && s.credits >= it.price(s);
      row.name.setText(it.name(s)).setColor(can ? (afford ? '#dfe8ff' : '#8b93ad') : '#5a6178');
      row.stat.setText(it.stat(s));
      row.right
        .setText(can ? `${it.price(s)} CR` : 'MAX')
        .setColor(can ? (afford ? '#ffd76a' : '#8b6a3a') : '#5a6178');
    }
    this.goText.setText(`출격  (WAVE ${s.wave + 1})`);
  }
}
