// 상점 — 보스 격파 후 진입. 무기 행에서 구매→장착→파워업 통합 (피드백 2).
// FRONT / REAR / SIDEKICK / SUPPLY 4섹션. 로직은 game/logic/shop.ts.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, MAX_WEAPON_LEVEL, t } from '../data';
import {
  equipAction,
  itemAction,
  powerPrice,
  SHOP_WEAPON_KEYS,
  UPGRADE_ITEMS,
  weaponAction,
} from '../game/logic/shop';
import type { GameSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { audioResume, SFX } from '../systems/Sfx';
import { uiText } from '../ui/text';

const ROW_H = 29;
const REAR_KEYS = Object.keys(DATA.equipment.rear);
const SIDE_KEYS = Object.keys(DATA.equipment.sidekick);
const N_WPN = SHOP_WEAPON_KEYS.length;
const N_REAR = REAR_KEYS.length;
const N_SIDE = SIDE_KEYS.length;
const N_ROWS = N_WPN + N_REAR + N_SIDE + UPGRADE_ITEMS.length + 1;

const wpnY = (i: number) => 122 + i * ROW_H;
const rearY = (i: number) => wpnY(N_WPN) + 22 + i * ROW_H;
const sideY = (i: number) => rearY(N_REAR) + 22 + i * ROW_H;
const supY = (i: number) => sideY(N_SIDE) + 22 + i * ROW_H;
const GO_Y = 566;

interface Row {
  name: Phaser.GameObjects.Text;
  right: Phaser.GameObjects.Text;
}

export class ShopScene extends Phaser.Scene {
  private session!: GameSession;
  private sel = 0;
  private selBox!: Phaser.GameObjects.Rectangle;
  private selAccent!: Phaser.GameObjects.Rectangle;
  private goBox!: Phaser.GameObjects.Rectangle;
  private goText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
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
    this.rows = [];
    this.session.shield = this.session.shieldMax;

    this.spaceBg = new SpaceBackground(this, -10);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x060a18, 0.92).setOrigin(0, 0).setDepth(-5);
    const frame = this.add.graphics();
    frame.lineStyle(1, 0x8caaff, 0.35);
    frame.strokeRoundedRect(9, 34, GAME_WIDTH - 18, GAME_HEIGHT - 64, 8);

    uiText(this, GAME_WIDTH / 2, 58, t('shop.title'), 18, '#e8ecff', 'center');
    this.creditsText = uiText(this, GAME_WIDTH / 2, 84, '', 13, '#ffd76a', 'center');

    this.selBox = this.add
      .rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH - 32, ROW_H - 3, 0x5a78dc, 0.32)
      .setVisible(false);
    this.selAccent = this.add.rectangle(19, 0, 3, ROW_H - 3, 0x8fd3ff).setVisible(false);

    const section = (label: string, y: number): void => {
      uiText(this, 20, y, label, 8, '#8fa0c8');
    };
    const makeRow = (y: number, color: number | null, idx: number): void => {
      if (color !== null) this.add.rectangle(30, y + 6, 9, 9, color).setStrokeStyle(1, 0x0a1226, 1);
      this.rows.push({
        name: uiText(this, 44, y + 6, '', 9, '#dfe8ff'),
        right: uiText(this, GAME_WIDTH - 24, y + 6, '', 9, '#ffd76a', 'right'),
      });
      this.hitZone(22, y - 5, GAME_WIDTH - 44, ROW_H - 1, () => this.act(idx));
    };

    section(t('shop.front'), 110);
    SHOP_WEAPON_KEYS.forEach((key, i) => {
      const def = DATA.weapons.weapons[key];
      makeRow(wpnY(i), def ? parseInt(def.color.slice(1), 16) : null, i);
    });
    section(t('shop.rear'), rearY(0) - 12);
    REAR_KEYS.forEach((key, i) => {
      const def = DATA.equipment.rear[key];
      makeRow(rearY(i), def ? parseInt(def.color.slice(1), 16) : null, N_WPN + i);
    });
    section(t('shop.sidekick'), sideY(0) - 12);
    SIDE_KEYS.forEach((key, i) => {
      const def = DATA.equipment.sidekick[key];
      makeRow(sideY(i), def ? parseInt(def.color.slice(1), 16) : null, N_WPN + N_REAR + i);
    });
    section(t('shop.supply'), supY(0) - 12);
    UPGRADE_ITEMS.forEach((_it, i) => {
      makeRow(supY(i), null, N_WPN + N_REAR + N_SIDE + i);
    });

    this.detailText = uiText(this, GAME_WIDTH / 2, GO_Y - 22, '', 8, '#9aa6c8', 'center');

    this.goBox = this.add.rectangle(
      GAME_WIDTH / 2,
      GO_Y + 10,
      GAME_WIDTH - 140,
      32,
      0x3c5a46,
      0.25,
    );
    const goStroke = this.add.graphics();
    goStroke.lineStyle(1, 0x7fd2a8, 1);
    goStroke.strokeRoundedRect(70, GO_Y - 6, GAME_WIDTH - 140, 32, 6);
    this.goText = uiText(this, GAME_WIDTH / 2, GO_Y + 10, '', 11, '#c8ffd8', 'center');
    this.hitZone(70, GO_Y - 6, GAME_WIDTH - 140, 32, () => this.act(N_ROWS - 1));

    uiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 16, t('shop.help'), 8, '#8fa0c8', 'center');

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

  private rowY(idx: number): number {
    if (idx < N_WPN) return wpnY(idx);
    if (idx < N_WPN + N_REAR) return rearY(idx - N_WPN);
    if (idx < N_WPN + N_REAR + N_SIDE) return sideY(idx - N_WPN - N_REAR);
    return supY(idx - N_WPN - N_REAR - N_SIDE);
  }

  private act(sel: number): void {
    this.sel = sel;
    const s = this.session;
    let r: string = 'noop';
    if (sel < N_WPN) {
      const key = SHOP_WEAPON_KEYS[sel];
      if (key) r = weaponAction(s, key);
    } else if (sel < N_WPN + N_REAR) {
      const key = REAR_KEYS[sel - N_WPN];
      if (key) r = equipAction(s, 'rear', key);
    } else if (sel < N_WPN + N_REAR + N_SIDE) {
      const key = SIDE_KEYS[sel - N_WPN - N_REAR];
      if (key) r = equipAction(s, 'sidekick', key);
    } else if (sel < N_ROWS - 1) {
      const it = UPGRADE_ITEMS[sel - N_WPN - N_REAR - N_SIDE];
      if (it) r = itemAction(s, it);
    } else {
      this.scene.start(SceneKeys.StageIntro, { session: s });
      return;
    }
    if (r === 'bought') SFX.buy();
    else if (r === 'equipped') SFX.pow();
    else if (r === 'denied') SFX.deny();
    this.refresh();
  }

  private refresh(): void {
    const s = this.session;
    this.creditsText.setText(t('hud.credits', s.credits));
    this.selBox.setVisible(true).setY(this.sel < N_ROWS - 1 ? this.rowY(this.sel) + 8 : -50);
    this.selAccent.setVisible(this.sel < N_ROWS - 1).setY(this.selBox.y);
    this.goBox.setFillStyle(0x3c5a46, this.sel === N_ROWS - 1 ? 0.45 : 0.25);

    let detail = '';
    SHOP_WEAPON_KEYS.forEach((key, i) => {
      const def = DATA.weapons.weapons[key];
      const row = this.rows[i];
      if (!def || !row) return;
      const owned = s.weapons[key] !== undefined;
      const equipped = s.cur === key;
      const lv = s.weapons[key] ?? 0;
      let rightText: string;
      let rightColor: string;
      if (!owned) {
        rightText = t('shop.price', def.price);
        rightColor = s.credits >= def.price ? '#ffd76a' : '#8b6a3a';
      } else if (!equipped) {
        rightText = `Lv${lv} · ${t('shop.equip')}`;
        rightColor = '#7ecbff';
      } else if (lv >= MAX_WEAPON_LEVEL) {
        rightText = `Lv${lv} ${t('shop.maxLevel')}`;
        rightColor = '#8aff8a';
      } else {
        const price = powerPrice(s, key);
        rightText = `Lv${lv} ▶ ${t('shop.price', price)}`;
        rightColor = s.credits >= price ? '#8aff8a' : '#8b6a3a';
      }
      row.name
        .setText((equipped ? '▶ ' : '') + def.name)
        .setColor(equipped ? '#8aff8a' : owned ? '#dfe8ff' : '#aeb8d8');
      row.right.setText(rightText).setColor(rightColor);
      if (this.sel === i)
        detail = `${t(def.descKey)}${
          equipped && lv < MAX_WEAPON_LEVEL ? ` · ${t('shop.upgradeTo', lv + 1)}` : ''
        }`;
    });
    REAR_KEYS.forEach((key, i) => {
      const def = DATA.equipment.rear[key];
      const row = this.rows[N_WPN + i];
      if (!def || !row) return;
      const equipped = s.rear === key;
      row.name
        .setText((equipped ? '▶ ' : '') + def.name)
        .setColor(equipped ? '#8aff8a' : '#dfe8ff');
      row.right
        .setText(equipped ? t('shop.equipped') : t('shop.price', def.price))
        .setColor(equipped ? '#8aff8a' : s.credits >= def.price ? '#ffd76a' : '#8b6a3a');
      if (this.sel === N_WPN + i) detail = t(def.descKey);
    });
    SIDE_KEYS.forEach((key, i) => {
      const def = DATA.equipment.sidekick[key];
      const row = this.rows[N_WPN + N_REAR + i];
      if (!def || !row) return;
      const equipped = s.sidekick === key;
      row.name
        .setText((equipped ? '▶ ' : '') + def.name)
        .setColor(equipped ? '#8aff8a' : '#dfe8ff');
      row.right
        .setText(equipped ? t('shop.equipped') : t('shop.price', def.price))
        .setColor(equipped ? '#8aff8a' : s.credits >= def.price ? '#ffd76a' : '#8b6a3a');
      if (this.sel === N_WPN + N_REAR + i) detail = t(def.descKey);
    });
    UPGRADE_ITEMS.forEach((it, i) => {
      const row = this.rows[N_WPN + N_REAR + N_SIDE + i];
      if (!row) return;
      const can = it.can(s);
      const afford = can && s.credits >= it.price(s);
      row.name
        .setText(`${t(`shop.item.${it.id}`)}  (${it.stat(s)})`)
        .setColor(can ? (afford ? '#dfe8ff' : '#8b93ad') : '#5a6178');
      row.right
        .setText(can ? t('shop.price', it.price(s)) : t('shop.max'))
        .setColor(can ? (afford ? '#ffd76a' : '#8b6a3a') : '#5a6178');
    });
    this.detailText.setText(detail);
    this.goText.setText(t('shop.go.level', s.level));
  }
}
