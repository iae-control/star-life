import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA } from '../data';
import type { EquipmentCatalogItem, WeaponData } from '../data/schemas';
import {
  armorStats,
  awardStageClear,
  catalogItemsForSlot,
  coolerStats,
  defineCatalogPrimaryWeapon,
  engineStats,
  EQUIPMENT_CATALOG,
  equipItem,
  isOwned,
  isUnlocked,
  itemTier,
  loadProgression,
  MAX_CREDITS,
  priceForTier,
  purchaseItem,
  saveProgression,
  secondaryStats,
  sellItem,
  sellRefundForItem,
  unlockCatalogThroughStage,
  unlockItem,
  upgradeItem,
  type LoadoutSlot,
  type ProgressionState,
  type StoreItemDefinition,
  type TransactionReason,
} from '../game/progression';
import { cooldownFor, firePattern, type WeaponShotSpec } from '../game/logic/weapons';
import { setSessionWeapon, type GameSession } from '../game/session';
import { playMusic } from '../systems/Music';
import { audioResume, SFX } from '../systems/Sfx';
import { uiText } from '../ui/text';

interface ShopSceneData {
  session: GameSession;
  clearedLevel?: number;
  rewardGranted?: boolean;
  returnToTitle?: boolean;
}

interface ShopEntry {
  id: string;
  slot: LoadoutSlot;
  name: string;
  description: string;
  unlockStage: number;
  color: number;
  definition: StoreItemDefinition | EquipmentCatalogItem;
  weapon?: WeaponData;
  catalog?: EquipmentCatalogItem;
}

interface ShopTab {
  label: string;
  slot: LoadoutSlot;
  color: number;
  entries: ShopEntry[];
}

interface StatRow {
  label: string;
  value: string;
}

interface PreviewProjectile {
  shot: WeaponShotSpec;
  x: number;
  y: number;
  delay: number;
  initialDelay: number;
  age: number;
  maxAge: number;
  seed: number;
}

type RewardRegistry = WeakMap<GameSession, Set<string>>;

const REWARD_REGISTRY_KEY = 'shop.rewarded-session-stages';
const TAB_LABELS = ['PRIMARY', 'SECONDARY', 'ENGINE', 'COOLER', 'ARMOR'] as const;
const TAB_COLORS = [0x57d8ff, 0xff6ed8, 0xffb85c, 0x6fb9ff, 0x85eea8] as const;
const FOCUS_CAROUSEL = 5;
const FOCUS_BUY = 6;
const FOCUS_EQUIP = 7;
const FOCUS_SELL = 8;
const FOCUS_CONTINUE = 9;
const PREVIEW_LEFT = 78;
const PREVIEW_RIGHT = GAME_WIDTH - 78;
const PREVIEW_TOP = 151;
const PREVIEW_BOTTOM = 236;
const PREVIEW_EMITTER_Y = 226;

const REASON_TEXT: Record<TransactionReason, string> = {
  ok: 'TRANSACTION COMPLETE',
  'unknown-item': 'CATALOG LINK ERROR',
  locked: 'ITEM REMAINS LOCKED',
  'already-owned': 'ITEM ALREADY OWNED',
  'not-owned': 'PURCHASE REQUIRED',
  'max-tier': 'MAXIMUM GRADE REACHED',
  'insufficient-credits': 'INSUFFICIENT CREDITS',
  'not-sellable': 'STARTER GRADE HAS NO RESALE VALUE',
  'credit-cap': 'CREDIT RESERVE IS FULL',
  'slot-mismatch': 'INCOMPATIBLE HARDPOINT',
};

function toColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function formatNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatCredits(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

function readable(value: string): string {
  return value.replace(/[-_]/g, ' ').toUpperCase();
}

export class ShopScene extends Phaser.Scene {
  private session!: GameSession;
  private progression!: ProgressionState;
  private tabs: ShopTab[] = [];
  private itemIndices: number[] = [];
  private tabIndex = 0;
  private focus = FOCUS_CAROUSEL;
  private leaving = false;
  private feedback = '';
  private feedbackColor = '#8fe8ff';
  private elapsed = 0;
  private returnToTitle = false;

  private tabRects: Phaser.GameObjects.Rectangle[] = [];
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private card!: Phaser.GameObjects.Rectangle;
  private itemCounter!: Phaser.GameObjects.Text;
  private itemName!: Phaser.GameObjects.Text;
  private itemDescription!: Phaser.GameObjects.Text;
  private gradeText!: Phaser.GameObjects.Text;
  private lockText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private rewardText!: Phaser.GameObjects.Text;
  private equipmentArt!: Phaser.GameObjects.Image;
  private statLabels: Phaser.GameObjects.Text[] = [];
  private statValues: Phaser.GameObjects.Text[] = [];
  private tierPips: Phaser.GameObjects.Rectangle[] = [];
  private buyRect!: Phaser.GameObjects.Rectangle;
  private buyText!: Phaser.GameObjects.Text;
  private equipRect!: Phaser.GameObjects.Rectangle;
  private equipText!: Phaser.GameObjects.Text;
  private sellRect!: Phaser.GameObjects.Rectangle;
  private sellText!: Phaser.GameObjects.Text;
  private continueRect!: Phaser.GameObjects.Rectangle;
  private continueText!: Phaser.GameObjects.Text;
  private previewPanel!: Phaser.GameObjects.Rectangle;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private previewLabel!: Phaser.GameObjects.Text;
  private previewProjectiles: PreviewProjectile[] = [];
  private previewTimer = 0;
  private previewSequence = 0;
  private previewKey = '';

  constructor() {
    super(SceneKeys.Shop);
  }

  create(data: ShopSceneData): void {
    this.session = data.session;
    this.progression = loadProgression();
    this.tabs = this.buildTabs();
    this.itemIndices = this.tabs.map(() => 0);
    this.tabIndex = 0;
    this.focus = FOCUS_CAROUSEL;
    this.leaving = false;
    this.feedback = '';
    this.elapsed = 0;
    this.returnToTitle = data.returnToTitle === true;
    this.tabRects = [];
    this.tabTexts = [];
    this.statLabels = [];
    this.statValues = [];
    this.tierPips = [];
    this.previewProjectiles = [];
    this.previewTimer = 0;
    this.previewSequence = 0;
    this.previewKey = '';

    const reward = this.grantClearReward(data);
    const accessStage = Math.max(
      1,
      this.session.level,
      data.clearedLevel === undefined ? 1 : data.clearedLevel + 1,
    );
    this.unlockAvailableCatalog(accessStage);
    this.createBackdrop();
    this.createInterface();
    this.bindInput();

    this.rewardText.setText(
      reward
        ? `${reward.firstClear ? 'FIRST CLEAR' : 'STAGE CLEAR'}  +${formatCredits(reward.amount)} CR${
            reward.unlocked > 0 ? `  //  ${reward.unlocked} NEW` : ''
          }`
        : 'LOADOUT CONFIGURATION // STARBASE ONLINE',
    );
    this.refresh();
    playMusic('title');
  }

  update(_time: number, deltaMs: number): void {
    const delta = Math.min(0.05, Math.max(0, deltaMs / 1000));
    this.elapsed += delta;
    const artPulse = 1 + Math.sin(this.elapsed * 2.8) * 0.018;
    if (this.equipmentArt.visible) {
      const entry = this.currentEntry();
      const size = entry.weapon ? 118 : 126;
      this.equipmentArt.setDisplaySize(size * artPulse, size * artPulse);
    }
    this.continueRect.setAlpha(0.88 + Math.sin(this.elapsed * 3.4) * 0.08);
    this.updateWeaponPreview(delta);
  }

  private buildTabs(): ShopTab[] {
    const primaries: ShopEntry[] = Object.entries(DATA.weapons.weapons).map(
      ([id, weapon], index) => ({
        id,
        slot: 'primary',
        name: weapon.name,
        description: `${readable(weapon.mechanic)} // ${readable(weapon.roles.boss)} / ${readable(
          weapon.roles.mob,
        )}`,
        unlockStage: Math.min(6, 1 + Math.floor(index / 4)),
        color: toColor(weapon.color),
        definition: defineCatalogPrimaryWeapon(id, weapon.price, index),
        weapon,
      }),
    );

    const catalogEntries = (slot: Exclude<LoadoutSlot, 'primary'>, color: number): ShopEntry[] =>
      catalogItemsForSlot(slot).map((item) => ({
        id: item.id,
        slot,
        name: item.name,
        description: item.description,
        unlockStage: item.unlockStage,
        color,
        definition: item,
        catalog: item,
      }));

    return [
      { label: TAB_LABELS[0], slot: 'primary', color: TAB_COLORS[0], entries: primaries },
      {
        label: TAB_LABELS[1],
        slot: 'secondary',
        color: TAB_COLORS[1],
        entries: catalogEntries('secondary', TAB_COLORS[1]),
      },
      {
        label: TAB_LABELS[2],
        slot: 'engine',
        color: TAB_COLORS[2],
        entries: catalogEntries('engine', TAB_COLORS[2]),
      },
      {
        label: TAB_LABELS[3],
        slot: 'cooler',
        color: TAB_COLORS[3],
        entries: catalogEntries('cooler', TAB_COLORS[3]),
      },
      {
        label: TAB_LABELS[4],
        slot: 'armor',
        color: TAB_COLORS[4],
        entries: catalogEntries('armor', TAB_COLORS[4]),
      },
    ];
  }

  private grantClearReward(
    data: ShopSceneData,
  ): { amount: number; firstClear: boolean; unlocked: number } | undefined {
    if (data.clearedLevel === undefined) return undefined;
    const stageNumber = Math.max(1, Math.floor(data.clearedLevel));
    const stageId = `stage-${stageNumber}`;
    let registry = this.registry.get(REWARD_REGISTRY_KEY) as RewardRegistry | undefined;
    if (!registry) {
      registry = new WeakMap<GameSession, Set<string>>();
      this.registry.set(REWARD_REGISTRY_KEY, registry);
    }
    let rewardedStages = registry.get(this.session);
    if (!rewardedStages) {
      rewardedStages = new Set<string>();
      registry.set(this.session, rewardedStages);
    }
    if (data.rewardGranted) {
      rewardedStages.add(stageId);
      return undefined;
    }
    if (rewardedStages.has(stageId)) return undefined;

    const award = awardStageClear(this.progression, {
      stageId,
      stageNumber,
      difficulty: this.session.difficulty,
    });
    rewardedStages.add(stageId);
    this.progression = award.state;
    saveProgression(this.progression);
    return {
      amount: award.reward,
      firstClear: award.firstClear,
      unlocked: award.newlyUnlocked.length,
    };
  }

  private unlockAvailableCatalog(stageNumber: number): void {
    let next = unlockCatalogThroughStage(this.progression, stageNumber);
    const primary = this.tabs[0];
    for (const entry of primary?.entries ?? []) {
      if (entry.unlockStage <= stageNumber) next = unlockItem(next, entry.id);
    }
    this.progression = next;
    saveProgression(this.progression);
  }

  private createBackdrop(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020611, 1).setOrigin(0, 0);
    const backdrop = this.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y += 40) {
      backdrop.fillStyle(y % 80 === 0 ? 0x0a1930 : 0x071225, 0.62);
      backdrop.fillRect(0, y, GAME_WIDTH, 40);
    }
    backdrop.fillStyle(0xa9d8ff, 0.65);
    for (let i = 0; i < 54; i++) {
      const x = (i * 73 + 19) % GAME_WIDTH;
      const y = (i * 47 + 31) % GAME_HEIGHT;
      const radius = i % 11 === 0 ? 1.3 : 0.65;
      backdrop.fillCircle(x, y, radius);
    }
    backdrop.lineStyle(1, 0x4b7aa7, 0.12);
    for (let y = 16; y < GAME_HEIGHT; y += 16) backdrop.lineBetween(0, y, GAME_WIDTH, y);

    this.add.rectangle(GAME_WIDTH / 2, 32, GAME_WIDTH, 64, 0x06101f, 0.96);
    this.add.rectangle(GAME_WIDTH / 2, 63, GAME_WIDTH - 18, 1, 0x62c8ff, 0.58);
    uiText(this, 14, 22, 'STARBASE // ARMORY', 15, '#dff5ff');
    uiText(this, 14, 43, 'TYRIAN LOADOUT TERMINAL', 7, '#6384a6');
    uiText(this, GAME_WIDTH - 14, 18, 'CREDITS', 7, '#7b96b2', 'right');
    this.creditsText = uiText(this, GAME_WIDTH - 14, 39, '', 15, '#ffe184', 'right');
    this.rewardText = uiText(this, GAME_WIDTH / 2, 67, '', 8, '#8fe8ff', 'center');
  }

  private createInterface(): void {
    const tabWidth = 64;
    const tabGap = 4;
    const tabStart = 12;
    this.tabs.forEach((tab, index) => {
      const x = tabStart + tabWidth / 2 + index * (tabWidth + tabGap);
      const rect = this.add.rectangle(x, 94, tabWidth, 32, 0x10223b, 0.92);
      rect.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        audioResume();
        this.focus = index;
        this.setTab(index);
      });
      const text = uiText(this, x, 94, tab.label, 7, '#8aa0b8', 'center');
      this.tabRects.push(rect);
      this.tabTexts.push(text);
    });

    this.card = this.add.rectangle(GAME_WIDTH / 2, 286, 336, 326, 0x071426, 0.96);
    this.card.setStrokeStyle(1, 0x4f769b, 0.85);
    this.add
      .zone(12, 123, 336, 326)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.focus = FOCUS_CAROUSEL;
        this.refresh();
      });

    const left = uiText(this, 31, 205, '‹', 34, '#7acfff', 'center');
    const right = uiText(this, GAME_WIDTH - 31, 205, '›', 34, '#7acfff', 'center');
    for (const [x, direction, text] of [
      [13, -1, left],
      [GAME_WIDTH - 49, 1, right],
    ] as const) {
      this.add
        .zone(x, 163, 36, 86)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          audioResume();
          this.focus = FOCUS_CAROUSEL;
          this.cycleItem(direction);
        })
        .on('pointerover', () => text.setColor('#ffffff'))
        .on('pointerout', () => text.setColor('#7acfff'));
    }

    this.itemCounter = uiText(this, GAME_WIDTH / 2, 139, '', 8, '#6686a8', 'center');
    this.previewPanel = this.add.rectangle(
      222,
      (PREVIEW_TOP + PREVIEW_BOTTOM) / 2,
      206,
      PREVIEW_BOTTOM - PREVIEW_TOP,
      0x030a14,
      0.9,
    );
    this.previewPanel.setStrokeStyle(1, 0x57d8ff, 0.45);
    this.previewGraphics = this.add.graphics();
    this.previewLabel = uiText(this, 125, PREVIEW_TOP + 6, 'LIVE FIRE', 6, '#6686a8');
    this.equipmentArt = this.add.image(69, 196, 'equipment-primary-pulse').setDisplaySize(92, 92);
    this.lockText = uiText(this, GAME_WIDTH / 2, 236, '', 8, '#ff8b92', 'center');
    this.itemName = uiText(this, GAME_WIDTH / 2, 263, '', 16, '#f2f7ff', 'center');
    this.gradeText = uiText(this, GAME_WIDTH / 2, 282, '', 8, '#90b2d2', 'center');
    this.itemDescription = uiText(this, GAME_WIDTH / 2, 311, '', 8, '#9bb0c6', 'center');
    this.itemDescription.setWordWrapWidth(292, true).setAlign('center');

    const statXs = [61, 141, 221, 301];
    statXs.forEach((x) => {
      this.statLabels.push(uiText(this, x, 354, '', 7, '#6485a5', 'center'));
      this.statValues.push(uiText(this, x, 373, '', 11, '#dceeff', 'center'));
    });

    const pipStart = 117;
    for (let i = 0; i < 10; i++) {
      this.tierPips.push(
        this.add.rectangle(pipStart + i * 14, 398, 10, 4, 0x20354a, 1).setOrigin(0, 0.5),
      );
    }
    this.statusText = uiText(this, GAME_WIDTH / 2, 427, '', 8, '#8fe8ff', 'center');

    // Three 104x44 touch targets fit the 360px mobile canvas with 12px gutters.
    this.buyRect = this.add.rectangle(64, 480, 104, 44, 0x173f55, 0.95);
    this.buyText = uiText(this, 64, 480, '', 8, '#bff4ff', 'center');
    this.add
      .zone(12, 458, 104, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_BUY;
        this.buyOrUpgrade();
      });

    this.equipRect = this.add.rectangle(180, 480, 104, 44, 0x244b38, 0.95);
    this.equipText = uiText(this, 180, 480, '', 8, '#caffda', 'center');
    this.add
      .zone(128, 458, 104, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_EQUIP;
        this.equipSelected();
      });

    this.sellRect = this.add.rectangle(296, 480, 104, 44, 0x523641, 0.95);
    this.sellText = uiText(this, 296, 480, '', 8, '#ffd4df', 'center');
    this.add
      .zone(244, 458, 104, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_SELL;
        this.sellSelected();
      });

    this.continueRect = this.add.rectangle(GAME_WIDTH / 2, 548, 226, 44, 0x2c5478, 0.94);
    this.continueText = uiText(this, GAME_WIDTH / 2, 548, 'CONTINUE  ›', 13, '#f2fbff', 'center');
    this.add
      .zone(67, 526, 226, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_CONTINUE;
        this.continueRun();
      });

    uiText(this, 222, 596, '↑↓ FOCUS   ←→ SELECT   ENTER CONFIRM', 8, '#68829d', 'center');
    uiText(this, GAME_WIDTH / 2, 614, 'ESC CONTINUE', 7, '#4f6983', 'center');
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    keyboard?.removeAllListeners();
    keyboard?.on('keydown-LEFT', () => this.moveHorizontal(-1));
    keyboard?.on('keydown-RIGHT', () => this.moveHorizontal(1));
    keyboard?.on('keydown-UP', () => this.moveVertical(-1));
    keyboard?.on('keydown-DOWN', () => this.moveVertical(1));
    keyboard?.on('keydown-ENTER', (event: KeyboardEvent) => {
      if (!event.repeat) this.confirmFocus();
    });
    keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (!event.repeat) this.confirmFocus();
    });
    keyboard?.on('keydown-ESC', () => this.continueRun());
  }

  private moveHorizontal(direction: number): void {
    SFX.chirp();
    if (this.focus < TAB_LABELS.length) {
      const next = (this.tabIndex + TAB_LABELS.length + direction) % TAB_LABELS.length;
      this.focus = next;
      this.setTab(next);
      return;
    }
    if (this.focus >= FOCUS_BUY && this.focus <= FOCUS_SELL) {
      this.focus = Phaser.Math.Wrap(this.focus + direction, FOCUS_BUY, FOCUS_SELL + 1);
      this.refresh();
    } else if (this.focus === FOCUS_CAROUSEL) {
      this.cycleItem(direction);
    }
  }

  private moveVertical(direction: number): void {
    SFX.chirp();
    if (this.focus < TAB_LABELS.length) {
      this.focus = direction < 0 ? FOCUS_CONTINUE : FOCUS_CAROUSEL;
    } else if (this.focus === FOCUS_CAROUSEL) {
      this.focus = direction < 0 ? this.tabIndex : FOCUS_BUY;
    } else if (this.focus >= FOCUS_BUY && this.focus <= FOCUS_SELL) {
      this.focus = direction < 0 ? FOCUS_CAROUSEL : FOCUS_CONTINUE;
    } else {
      this.focus = direction < 0 ? FOCUS_BUY : this.tabIndex;
    }
    this.refresh();
  }

  private confirmFocus(): void {
    if (this.focus < TAB_LABELS.length) this.setTab(this.focus);
    else if (this.focus === FOCUS_BUY) this.buyOrUpgrade();
    else if (this.focus === FOCUS_EQUIP) this.equipSelected();
    else if (this.focus === FOCUS_SELL) this.sellSelected();
    else if (this.focus === FOCUS_CONTINUE) this.continueRun();
    else {
      this.feedback = 'USE BUY / UPGRADE, EQUIP OR SELL';
      this.feedbackColor = '#8fe8ff';
      this.refresh();
    }
  }

  private setTab(index: number): void {
    this.tabIndex = Phaser.Math.Wrap(index, 0, this.tabs.length);
    this.feedback = '';
    SFX.chirp();
    this.refresh();
  }

  private cycleItem(direction: number): void {
    const tab = this.currentTab();
    const current = this.itemIndices[this.tabIndex] ?? 0;
    this.itemIndices[this.tabIndex] = Phaser.Math.Wrap(current + direction, 0, tab.entries.length);
    this.feedback = '';
    SFX.chirp();
    this.refresh();
  }

  private buyOrUpgrade(): void {
    const entry = this.currentEntry();
    const tier = itemTier(this.progression, entry.id);
    const result =
      tier === 0
        ? purchaseItem(this.progression, entry.definition)
        : upgradeItem(this.progression, entry.definition);
    if (!result.ok) {
      this.feedback = REASON_TEXT[result.reason];
      this.feedbackColor = '#ff8b92';
      SFX.deny();
      this.refresh();
      return;
    }

    this.progression = result.state;
    saveProgression(this.progression);
    const nextTier = itemTier(this.progression, entry.id);
    if (entry.slot === 'primary' && this.progression.loadout.primary === entry.id) {
      setSessionWeapon(this.session, entry.id);
      this.session.weapons[entry.id] = nextTier;
    }
    this.feedback = `${tier === 0 ? 'PURCHASED' : 'UPGRADED'}  -${formatCredits(result.cost)} CR`;
    this.feedbackColor = '#8fffc0';
    SFX.buy();
    this.refresh();
  }

  private equipSelected(): void {
    const entry = this.currentEntry();
    const result = equipItem(this.progression, entry.slot, entry.id, entry.definition);
    if (!result.ok) {
      this.feedback = REASON_TEXT[result.reason];
      this.feedbackColor = '#ff8b92';
      SFX.deny();
      this.refresh();
      return;
    }

    this.progression = result.state;
    saveProgression(this.progression);
    if (entry.slot === 'primary') {
      setSessionWeapon(this.session, entry.id);
      this.session.weapons[entry.id] = itemTier(this.progression, entry.id);
    }
    this.feedback = `${entry.name} EQUIPPED`;
    this.feedbackColor = '#8fffc0';
    SFX.pow();
    this.refresh();
  }

  private sellSelected(): void {
    const entry = this.currentEntry();
    const result = sellItem(this.progression, entry.definition);
    if (!result.ok) {
      this.feedback = REASON_TEXT[result.reason];
      this.feedbackColor = '#ff8b92';
      SFX.deny();
      this.refresh();
      return;
    }

    this.progression = result.state;
    saveProgression(this.progression);
    if (entry.slot === 'primary') {
      delete this.session.weapons[entry.id];
      const activePrimary = this.progression.loadout.primary;
      setSessionWeapon(this.session, activePrimary);
      this.session.weapons[activePrimary] = itemTier(this.progression, activePrimary);
    }
    this.feedback = `SOLD / RESET  +${formatCredits(result.refund)} CR`;
    this.feedbackColor = '#ffd18f';
    SFX.buy();
    this.refresh();
  }

  private continueRun(): void {
    if (this.leaving) return;
    this.leaving = true;
    SFX.chirp();
    if (this.returnToTitle) {
      this.scene.start(SceneKeys.Title);
    } else if (this.session.campaignDone) {
      this.scene.start(SceneKeys.Result, { session: this.session, mode: 'complete' });
    } else {
      this.scene.start(SceneKeys.StageIntro, { session: this.session });
    }
  }

  private currentTab(): ShopTab {
    return this.tabs[this.tabIndex] ?? this.tabs[0]!;
  }

  private currentEntry(): ShopEntry {
    const tab = this.currentTab();
    const index = this.itemIndices[this.tabIndex] ?? 0;
    return tab.entries[index] ?? tab.entries[0]!;
  }

  private ensureWeaponPreview(entry: ShopEntry, tier: number): void {
    const nextKey = entry.weapon ? `${entry.id}:${tier}` : '';
    if (nextKey === this.previewKey) return;
    this.previewKey = nextKey;
    this.previewProjectiles = [];
    this.previewSequence = 0;
    this.previewTimer = 0.08;
    this.previewGraphics.clear();
  }

  private equipmentTexture(entry: ShopEntry): string {
    if (entry.weapon) return `equipment-primary-${entry.weapon.archetype}`;
    const exact = `equipment-${entry.id}`;
    if (this.textures.exists(exact)) return exact;
    const fallback: Record<Exclude<LoadoutSlot, 'primary' | 'secondary'>, string> = {
      engine: 'equipment-primary-missile',
      cooler: 'equipment-primary-light',
      armor: 'equipment-primary-proton',
    };
    return entry.slot === 'secondary'
      ? 'equipment-secondary-microgun'
      : fallback[entry.slot as Exclude<LoadoutSlot, 'primary' | 'secondary'>];
  }

  private emitPreviewVolley(entry: ShopEntry, tier: number): void {
    if (!entry.weapon) return;
    let randomState = ((this.previewSequence + 1) * 2_654_435_761) >>> 0;
    const rng = (): number => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      return randomState / 4_294_967_296;
    };
    const volley = firePattern(
      entry.id,
      tier,
      GAME_WIDTH / 2,
      PREVIEW_EMITTER_Y + 16,
      this.previewSequence % 3,
      rng,
    );
    for (const [index, shot] of volley.entries()) {
      const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
      let maxAge = Phaser.Math.Clamp(105 / (speed * 0.22), 0.3, 1.25);
      if (shot.beam || shot.chain) maxAge = 0.22;
      else if (shot.expansion) maxAge = Math.max(0.82, maxAge);
      this.previewProjectiles.push({
        shot,
        x: shot.x,
        y: shot.y,
        delay: Math.max(0, shot.spawnDelay ?? 0),
        initialDelay: Math.max(0, shot.spawnDelay ?? 0),
        age: 0,
        maxAge,
        seed: (this.previewSequence * 31 + index * 17) * 0.73,
      });
    }
    this.previewSequence++;
  }

  private updateWeaponPreview(delta: number): void {
    if (!this.previewGraphics.visible || delta <= 0) return;
    const entry = this.currentEntry();
    if (!entry.weapon) return;
    const tier = Math.max(1, itemTier(this.progression, entry.id));
    this.ensureWeaponPreview(entry, tier);

    this.previewTimer -= delta;
    if (this.previewTimer <= 0) {
      this.emitPreviewVolley(entry, tier);
      this.previewTimer += Phaser.Math.Clamp(cooldownFor(entry.id, tier), 0.14, 1.15);
    }

    const velocityScale = 0.22;
    for (const projectile of this.previewProjectiles) {
      if (projectile.delay > 0) {
        projectile.delay = Math.max(0, projectile.delay - delta);
        continue;
      }
      projectile.age += delta;
      projectile.x += projectile.shot.vx * velocityScale * delta;
      projectile.y += projectile.shot.vy * velocityScale * delta;
      if (projectile.shot.guidance) {
        projectile.x += Math.sin(projectile.age * 8 + projectile.seed) * 13 * delta;
      } else if (projectile.shot.ph !== undefined) {
        projectile.x += Math.sin(projectile.age * 11 + projectile.seed) * 9 * delta;
      }
    }
    this.previewProjectiles = this.previewProjectiles.filter(
      (projectile) =>
        projectile.age < projectile.maxAge &&
        projectile.y > PREVIEW_TOP - 16 &&
        projectile.x > PREVIEW_LEFT - 20 &&
        projectile.x < PREVIEW_RIGHT + 20,
    );
    this.drawWeaponPreview(isUnlocked(this.progression, entry.id) ? entry.color : 0x526070);
  }

  private drawWeaponPreview(color: number): void {
    const graphics = this.previewGraphics;
    graphics.clear();
    graphics.lineStyle(1, color, 0.08);
    for (let x = PREVIEW_LEFT + 20; x < PREVIEW_RIGHT; x += 20) {
      graphics.lineBetween(x, PREVIEW_TOP, x, PREVIEW_BOTTOM);
    }
    for (let y = PREVIEW_TOP + 18; y < PREVIEW_BOTTOM; y += 18) {
      graphics.lineBetween(PREVIEW_LEFT, y, PREVIEW_RIGHT, y);
    }

    graphics.fillStyle(color, 0.18);
    const previewX = 222;
    graphics.fillCircle(previewX, PREVIEW_EMITTER_Y, 10);
    graphics.lineStyle(1, color, 0.9);
    graphics.strokeCircle(previewX, PREVIEW_EMITTER_Y, 8);
    graphics.fillStyle(0xe8fbff, 0.94);
    graphics.fillTriangle(
      previewX,
      PREVIEW_EMITTER_Y - 7,
      previewX - 5,
      PREVIEW_EMITTER_Y + 5,
      previewX + 5,
      PREVIEW_EMITTER_Y + 5,
    );

    for (const projectile of this.previewProjectiles) {
      const shot = projectile.shot;
      if (projectile.delay > 0) {
        if (shot.charge && projectile.initialDelay > 0) {
          const progress = 1 - projectile.delay / projectile.initialDelay;
          graphics.lineStyle(1.5, color, 0.35 + progress * 0.6);
          graphics.strokeCircle(222, PREVIEW_EMITTER_Y, 11 - progress * 6);
        }
        continue;
      }
      const life = Math.max(0, 1 - projectile.age / projectile.maxAge);
      if (projectile.y < PREVIEW_TOP || projectile.y > PREVIEW_BOTTOM) continue;

      if (shot.beam) {
        const travel = (PREVIEW_TOP - projectile.y) / Math.min(-1, shot.vy);
        const endX = Phaser.Math.Clamp(
          projectile.x + shot.vx * travel,
          PREVIEW_LEFT + 2,
          PREVIEW_RIGHT - 2,
        );
        const width = Phaser.Math.Clamp(shot.beam.width * 0.48, 2, 7);
        graphics.lineStyle(width + 2, color, life * 0.26);
        graphics.lineBetween(projectile.x, projectile.y, endX, PREVIEW_TOP + 1);
        graphics.lineStyle(width, color, life * 0.92);
        graphics.lineBetween(projectile.x, projectile.y, endX, PREVIEW_TOP + 1);
        graphics.lineStyle(1, 0xffffff, life * 0.9);
        graphics.lineBetween(projectile.x, projectile.y, endX, PREVIEW_TOP + 1);
        continue;
      }

      if (shot.chain) {
        let lastX = projectile.x;
        let lastY = projectile.y;
        const hops = Math.min(5, shot.chain.maxTargets);
        graphics.lineStyle(2, color, life * 0.88);
        for (let hop = 0; hop < hops; hop++) {
          const nextX = Phaser.Math.Clamp(
            projectile.x + Math.sin(projectile.seed + hop * 2.1) * (18 + hop * 5),
            PREVIEW_LEFT + 8,
            PREVIEW_RIGHT - 8,
          );
          const nextY = Math.max(PREVIEW_TOP + 2, projectile.y - ((hop + 1) * 66) / hops);
          graphics.lineBetween(lastX, lastY, nextX, nextY);
          graphics.fillStyle(0xf7ffff, life);
          graphics.fillCircle(nextX, nextY, 1.6);
          lastX = nextX;
          lastY = nextY;
        }
        continue;
      }

      const speed = Math.max(1, Math.hypot(shot.vx, shot.vy));
      const nx = shot.vx / speed;
      const ny = shot.vy / speed;
      if (shot.trail || shot.stretch) {
        const trailLength = shot.trail ? 13 * shot.trail.scale : 9;
        graphics.lineStyle(Math.max(1, shot.w * 0.22), color, life * 0.38);
        graphics.lineBetween(
          projectile.x,
          projectile.y,
          projectile.x - nx * trailLength,
          projectile.y - ny * trailLength,
        );
      }

      if (shot.expansion) {
        if (projectile.y < PREVIEW_TOP + 13) continue;
        const progress = projectile.age / projectile.maxAge;
        const scale = Phaser.Math.Linear(
          shot.expansion.startScale,
          shot.expansion.endScale,
          progress,
        );
        const radius = Phaser.Math.Clamp((shot.w * scale) / 2, 3, 13);
        graphics.fillStyle(color, life * 0.28);
        graphics.fillCircle(projectile.x, projectile.y, radius + 3);
        graphics.fillStyle(color, life * 0.88);
        graphics.fillCircle(projectile.x, projectile.y, radius);
        graphics.fillStyle(0xffffff, life * 0.75);
        graphics.fillCircle(
          projectile.x - radius * 0.2,
          projectile.y - radius * 0.25,
          radius * 0.28,
        );
      } else if (shot.rotateToVelocity || shot.guidance) {
        if (projectile.y < PREVIEW_TOP + 7) continue;
        const sideX = -ny;
        const sideY = nx;
        graphics.fillStyle(color, life);
        graphics.fillTriangle(
          projectile.x + nx * 6,
          projectile.y + ny * 6,
          projectile.x - nx * 4 + sideX * 3.5,
          projectile.y - ny * 4 + sideY * 3.5,
          projectile.x - nx * 4 - sideX * 3.5,
          projectile.y - ny * 4 - sideY * 3.5,
        );
      } else {
        if (projectile.y < PREVIEW_TOP + 7) continue;
        graphics.fillStyle(color, life);
        graphics.fillRect(
          projectile.x - Phaser.Math.Clamp(shot.w * 0.28, 1, 4),
          projectile.y - Phaser.Math.Clamp(shot.h * 0.22, 2, 7),
          Phaser.Math.Clamp(shot.w * 0.56, 2, 8),
          Phaser.Math.Clamp(shot.h * 0.44, 4, 14),
        );
      }
    }
  }

  private refresh(): void {
    const tab = this.currentTab();
    const entry = this.currentEntry();
    const index = this.itemIndices[this.tabIndex] ?? 0;
    const unlocked = isUnlocked(this.progression, entry.id);
    const owned = isOwned(this.progression, entry.id);
    const tier = itemTier(this.progression, entry.id);
    const equipped = this.progression.loadout[entry.slot] === entry.id;

    this.creditsText.setText(formatCredits(this.progression.credits));
    this.tabs.forEach((candidate, tabIndex) => {
      const selected = tabIndex === this.tabIndex;
      const focused = tabIndex === this.focus;
      const rect = this.tabRects[tabIndex];
      const text = this.tabTexts[tabIndex];
      rect
        ?.setFillStyle(candidate.color, selected ? 0.3 : 0.08)
        .setStrokeStyle(focused ? 2 : 1, candidate.color, focused ? 1 : selected ? 0.75 : 0.3);
      text?.setColor(selected ? '#ffffff' : focused ? '#dff5ff' : '#7890a8');
    });

    this.card.setStrokeStyle(
      this.focus === FOCUS_CAROUSEL ? 2 : 1,
      tab.color,
      this.focus === FOCUS_CAROUSEL ? 1 : 0.56,
    );
    this.itemCounter.setText(`${String(index + 1).padStart(2, '0')} / ${tab.entries.length}`);
    this.itemName.setText(entry.name).setColor(unlocked ? '#f2f7ff' : '#7a8798');
    this.itemDescription.setText(entry.description).setColor(unlocked ? '#9bb0c6' : '#647180');
    this.gradeText.setText(
      tier > 0
        ? `GRADE ${String(tier).padStart(2, '0')} / ${String(entry.definition.maxTier).padStart(2, '0')}`
        : `GRADE -- / ${String(entry.definition.maxTier).padStart(2, '0')}  //  T1 PREVIEW`,
    );
    this.lockText.setText(unlocked ? '' : `LOCKED // CLEAR STAGE ${entry.unlockStage}`);
    const livePreview = entry.weapon !== undefined;
    this.previewPanel
      .setVisible(livePreview)
      .setStrokeStyle(1, unlocked ? entry.color : 0x526070, unlocked ? 0.58 : 0.3);
    this.previewGraphics.setVisible(livePreview);
    this.previewLabel
      .setVisible(livePreview)
      .setText(`LIVE FIRE // GRADE ${Math.max(1, tier)}`)
      .setColor(unlocked ? '#6686a8' : '#4f5a68');
    const texture = this.equipmentTexture(entry);
    this.equipmentArt
      .setTexture(texture)
      .setVisible(true)
      .setAlpha(unlocked ? 1 : 0.34)
      .clearTint()
      .setAngle(
        entry.weapon?.variant === 'overdrive' ? -4 : entry.weapon?.variant === 'lattice' ? 4 : 0,
      )
      .setDisplaySize(livePreview ? 118 : 126, livePreview ? 118 : 126);
    if (entry.weapon?.variant === 'overdrive') this.equipmentArt.setTint(entry.color);
    this.ensureWeaponPreview(entry, Math.max(1, tier));

    const stats = this.statsFor(entry, Math.max(1, tier));
    for (let i = 0; i < 4; i++) {
      const stat = stats[i];
      this.statLabels[i]?.setText(stat?.label ?? '');
      this.statValues[i]?.setText(stat?.value ?? '');
    }
    this.tierPips.forEach((pip, pipIndex) => {
      const visible = pipIndex < entry.definition.maxTier;
      pip.setVisible(visible);
      if (visible) pip.setFillStyle(pipIndex < tier ? entry.color : 0x20354a, 1);
    });

    const targetTier = tier === 0 ? 1 : tier + 1;
    const cost = priceForTier(entry.definition, targetTier);
    const atMax = tier >= entry.definition.maxTier;
    const buyLabel = !unlocked
      ? `LOCKED  //  STAGE ${entry.unlockStage}`
      : atMax
        ? 'MAXIMUM GRADE'
        : `${tier === 0 ? 'BUY' : 'UPGRADE'}  ${formatCredits(cost ?? 0)} CR`;
    this.buyText.setText(buyLabel);
    this.buyRect
      .setFillStyle(!unlocked || atMax ? 0x2b3240 : 0x17475e, 0.95)
      .setStrokeStyle(
        this.focus === FOCUS_BUY ? 2 : 1,
        0x65d9ff,
        this.focus === FOCUS_BUY ? 1 : 0.5,
      );
    this.buyText.setColor(!unlocked || atMax ? '#778493' : '#c7f5ff');

    this.equipText.setText(
      !unlocked ? 'LOCKED' : !owned ? 'NOT OWNED' : equipped ? 'EQUIPPED' : 'EQUIP',
    );
    this.equipRect
      .setFillStyle(!unlocked || !owned ? 0x2b3240 : equipped ? 0x315d49 : 0x24523c, 0.95)
      .setStrokeStyle(
        this.focus === FOCUS_EQUIP ? 2 : 1,
        0x8fffc0,
        this.focus === FOCUS_EQUIP ? 1 : 0.5,
      );
    this.equipText.setColor(!unlocked || !owned ? '#778493' : '#d4ffe2');

    const refund = sellRefundForItem(this.progression, entry.definition);
    const starter = EQUIPMENT_CATALOG.defaults[entry.slot] === entry.id;
    const canSell = owned && refund > 0 && this.progression.credits <= MAX_CREDITS - refund;
    this.sellText.setText(
      !owned
        ? 'NO ASSET'
        : refund <= 0
          ? 'BASE UNIT'
          : `${starter ? 'RESET' : 'SELL'} +${formatCredits(refund)}`,
    );
    this.sellRect
      .setFillStyle(canSell ? 0x5a3341 : 0x2b3240, 0.95)
      .setStrokeStyle(
        this.focus === FOCUS_SELL ? 2 : 1,
        0xffa0ba,
        this.focus === FOCUS_SELL ? 1 : 0.5,
      );
    this.sellText.setColor(canSell ? '#ffd4df' : '#778493');
    this.continueRect.setStrokeStyle(
      this.focus === FOCUS_CONTINUE ? 2 : 1,
      0x9de5ff,
      this.focus === FOCUS_CONTINUE ? 1 : 0.55,
    );
    this.continueText.setColor(this.focus === FOCUS_CONTINUE ? '#ffffff' : '#d9f2ff');

    if (this.feedback) {
      this.statusText.setText(this.feedback).setColor(this.feedbackColor);
    } else if (!unlocked) {
      this.statusText.setText('RESEARCH LOCK ACTIVE').setColor('#ff8b92');
    } else if (equipped) {
      this.statusText.setText('ONLINE // EQUIPPED').setColor('#8fffc0');
    } else if (owned) {
      this.statusText.setText('OWNED // READY TO EQUIP').setColor('#8fe8ff');
    } else {
      this.statusText.setText('AVAILABLE // PURCHASE REQUIRED').setColor('#ffe184');
    }
  }

  private statsFor(entry: ShopEntry, tier: number): StatRow[] {
    if (entry.weapon) return this.primaryStats(entry.weapon, tier);
    const item = entry.catalog;
    if (!item) return [];

    if (item.slot === 'secondary') {
      const stats = secondaryStats(item.id, tier);
      return stats
        ? [
            { label: 'DAMAGE', value: formatNumber(stats.damage) },
            { label: 'RATE', value: `${formatNumber(stats.fireRate, 2)}/s` },
            { label: 'HEAT', value: formatNumber(stats.heat) },
            { label: 'SPEED', value: formatNumber(stats.projectileSpeed) },
          ]
        : [];
    }
    if (item.slot === 'engine') {
      const stats = engineStats(item.id, tier);
      return stats
        ? [
            { label: 'THRUST', value: formatNumber(stats.speed) },
            { label: 'GAIN/T', value: `+${formatNumber(item.stats.speedPerTier)}` },
            { label: 'GRADE', value: `${tier}/${item.maxTier}` },
            { label: 'CLASS', value: 'ENGINE' },
          ]
        : [];
    }
    if (item.slot === 'cooler') {
      const stats = coolerStats(item.id, tier);
      return stats
        ? [
            { label: 'COOLING', value: formatNumber(stats.cooling) },
            { label: 'CAPACITY', value: formatNumber(stats.heatCapacity) },
            { label: 'GRADE', value: `${tier}/${item.maxTier}` },
            { label: 'CLASS', value: 'COOLER' },
          ]
        : [];
    }
    const stats = armorStats(item.id, tier);
    return stats
      ? [
          { label: 'HULL', value: formatNumber(stats.hp) },
          { label: 'REGEN', value: `${formatNumber(stats.regen, 2)}/s` },
          { label: 'GRADE', value: `${tier}/${item.maxTier}` },
          { label: 'CLASS', value: 'ARMOR' },
        ]
      : [];
  }

  private primaryStats(weapon: WeaponData, tier: number): StatRow[] {
    const level = Phaser.Math.Clamp(Math.floor(tier), 1, 10);
    const pattern = weapon.pattern;
    let output = 0;
    if (pattern.type === 'table') {
      output = (pattern.shots[level - 1] ?? []).reduce((sum, shot) => sum + shot[4], 0);
    } else if (pattern.type === 'fan') {
      output = (pattern.counts[level - 1] ?? 1) * pattern.dmg;
    } else if (pattern.type === 'stream') {
      output =
        (pattern.streams[level - 1] ?? 1) * (pattern.dmgBase + pattern.dmgPerLevel * (level - 1));
    } else {
      output =
        (pattern.counts[level - 1] ?? 1) * (pattern.dmgBase + pattern.dmgPerLevel * (level - 1));
    }
    const cooldown = Math.max(weapon.cd.min, weapon.cd.base + weapon.cd.perLevel * (level - 1));
    return [
      { label: 'OUTPUT', value: formatNumber(output) },
      { label: 'RATE', value: `${formatNumber(1 / cooldown, 2)}/s` },
      { label: 'HEAT', value: `${Math.round(weapon.heat.perTrigger * 100)}%` },
      { label: 'TYPE', value: weapon.bullet.damageType.toUpperCase() },
    ];
  }
}
