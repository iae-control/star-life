import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA } from '../data';
import type { EquipmentCatalogItem, WeaponData } from '../data/schemas';
import {
  armorStats,
  awardStageClear,
  catalogItemsForSlot,
  coolerStats,
  definePrimaryWeapon,
  engineStats,
  equipItem,
  isOwned,
  isUnlocked,
  itemTier,
  loadProgression,
  priceForTier,
  purchaseItem,
  saveProgression,
  secondaryStats,
  unlockCatalogThroughStage,
  unlockItem,
  upgradeItem,
  type LoadoutSlot,
  type ProgressionState,
  type StoreItemDefinition,
  type TransactionReason,
} from '../game/progression';
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

type RewardRegistry = WeakMap<GameSession, Set<string>>;

const REWARD_REGISTRY_KEY = 'shop.rewarded-session-stages';
const TAB_LABELS = ['PRIMARY', 'SECONDARY', 'ENGINE', 'COOLER', 'ARMOR'] as const;
const TAB_COLORS = [0x57d8ff, 0xff6ed8, 0xffb85c, 0x6fb9ff, 0x85eea8] as const;
const FOCUS_CAROUSEL = 5;
const FOCUS_BUY = 6;
const FOCUS_EQUIP = 7;
const FOCUS_CONTINUE = 8;

const REASON_TEXT: Record<TransactionReason, string> = {
  ok: 'TRANSACTION COMPLETE',
  'unknown-item': 'CATALOG LINK ERROR',
  locked: 'ITEM REMAINS LOCKED',
  'already-owned': 'ITEM ALREADY OWNED',
  'not-owned': 'PURCHASE REQUIRED',
  'max-tier': 'MAXIMUM GRADE REACHED',
  'insufficient-credits': 'INSUFFICIENT CREDITS',
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
  private iconCore!: Phaser.GameObjects.Arc;
  private iconRing!: Phaser.GameObjects.Arc;
  private iconGlyph!: Phaser.GameObjects.Text;
  private statLabels: Phaser.GameObjects.Text[] = [];
  private statValues: Phaser.GameObjects.Text[] = [];
  private tierPips: Phaser.GameObjects.Rectangle[] = [];
  private buyRect!: Phaser.GameObjects.Rectangle;
  private buyText!: Phaser.GameObjects.Text;
  private equipRect!: Phaser.GameObjects.Rectangle;
  private equipText!: Phaser.GameObjects.Text;
  private continueRect!: Phaser.GameObjects.Rectangle;
  private continueText!: Phaser.GameObjects.Text;

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
    this.elapsed += deltaMs / 1000;
    const pulse = 1 + Math.sin(this.elapsed * 2.8) * 0.025;
    this.iconRing.setScale(pulse);
    this.continueRect.setAlpha(0.88 + Math.sin(this.elapsed * 3.4) * 0.08);
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
        definition: definePrimaryWeapon(id, 600 + index * 180, { maxTier: 10 }),
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
    this.iconRing = this.add.circle(GAME_WIDTH / 2, 196, 43, 0x081421, 0.55);
    this.iconRing.setStrokeStyle(2, 0x57d8ff, 0.86);
    this.iconCore = this.add.circle(GAME_WIDTH / 2, 196, 29, 0x57d8ff, 0.88);
    this.iconCore.setStrokeStyle(1, 0xffffff, 0.75);
    this.iconGlyph = uiText(this, GAME_WIDTH / 2, 196, '', 14, '#06101c', 'center');
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

    this.buyRect = this.add.rectangle(91, 480, 158, 44, 0x173f55, 0.95);
    this.buyText = uiText(this, 91, 480, '', 10, '#bff4ff', 'center');
    this.add
      .zone(12, 458, 158, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_BUY;
        this.buyOrUpgrade();
      });

    this.equipRect = this.add.rectangle(269, 480, 158, 44, 0x244b38, 0.95);
    this.equipText = uiText(this, 269, 480, '', 10, '#caffda', 'center');
    this.add
      .zone(190, 458, 158, 44)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        audioResume();
        this.focus = FOCUS_EQUIP;
        this.equipSelected();
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

    uiText(
      this,
      GAME_WIDTH / 2,
      596,
      '↑↓ FOCUS   ←→ SELECT   ENTER CONFIRM',
      8,
      '#68829d',
      'center',
    );
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
    if (this.focus !== FOCUS_CONTINUE) this.cycleItem(direction);
  }

  private moveVertical(direction: number): void {
    SFX.chirp();
    if (direction < 0) {
      if (this.focus < TAB_LABELS.length) this.focus = FOCUS_CONTINUE;
      else if (this.focus === FOCUS_CAROUSEL) this.focus = this.tabIndex;
      else this.focus--;
    } else if (this.focus < TAB_LABELS.length) this.focus = FOCUS_CAROUSEL;
    else if (this.focus === FOCUS_CONTINUE) this.focus = this.tabIndex;
    else this.focus++;
    this.refresh();
  }

  private confirmFocus(): void {
    if (this.focus < TAB_LABELS.length) this.setTab(this.focus);
    else if (this.focus === FOCUS_BUY) this.buyOrUpgrade();
    else if (this.focus === FOCUS_EQUIP) this.equipSelected();
    else if (this.focus === FOCUS_CONTINUE) this.continueRun();
    else {
      this.feedback = 'USE BUY / UPGRADE OR EQUIP';
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
    this.iconCore.setFillStyle(entry.color, unlocked ? 0.88 : 0.22);
    this.iconCore.setStrokeStyle(1, unlocked ? 0xffffff : 0x6a7480, unlocked ? 0.7 : 0.35);
    this.iconRing.setStrokeStyle(2, unlocked ? entry.color : 0x526070, unlocked ? 0.9 : 0.4);
    this.iconGlyph
      .setText(entry.weapon?.short ?? entry.name.slice(0, 2).toUpperCase())
      .setColor(unlocked ? '#06101c' : '#87919b');

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
