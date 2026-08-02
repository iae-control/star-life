// 메인 게임플레이 — v4 데모의 update()/draw()를 Phaser로 이식.
// 콘텐츠 수치는 전부 src/data/*.json (M2 데이터 주도화), 여기는 해석·렌더 글루.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, t } from '../data';
import type { BossData, BossPhase, EnemyTypeData, LevelData } from '../data/schemas';
import { DIFficulty, PLAYER, SUPER } from '../game/logic/balance';
import { aabb, applyDamage } from '../game/logic/damage';
import { cooldownFor, firePattern, type ShotSpec } from '../game/logic/weapons';
import { buildLevelWave, type SpawnEvent } from '../game/logic/waves';
import { newSession, saveBest, weaponLevel, type GameSession } from '../game/session';
import { SpaceBackground } from '../systems/background';
import { playMusic } from '../systems/Music';
import { updateSave } from '../systems/Save';
import { ImagePool } from '../systems/Pool';
import { audioResume, isMuted, SFX, toggleMute } from '../systems/Sfx';
import { uiText } from '../ui/text';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = Phaser.Math.Clamp;

interface Bullet extends ShotSpec {
  t: number;
  /** 유도 미사일 여부 (후방무기 seeker) */
  homing?: boolean;
  img: Phaser.GameObjects.Image;
}
interface EBul {
  x: number;
  y: number;
  vx: number;
  vy: number;
  big: boolean;
  size: number;
  img: Phaser.GameObjects.Image;
}
interface Enemy {
  type: string;
  def: EnemyTypeData;
  x: number;
  y: number;
  t: number;
  hp: number;
  hcd: number;
  dead: boolean;
  score: number;
  flashT: number;
  // sineDescend
  spd?: number;
  amp?: number;
  f?: number;
  bx?: number;
  // turret
  holdY?: number;
  cool?: number;
  life?: number;
  drift?: number;
  // diver
  vx?: number;
  // strafer
  dir?: number;
  baseY?: number;
  fireT?: number;
  // orbiter
  cx?: number;
  cy?: number;
  ang?: number;
  rr?: number;
  img: Phaser.GameObjects.Image;
}
interface BossPart {
  def: NonNullable<BossData['parts']>[number];
  hp: number;
  hpMax: number;
  alive: boolean;
  flashT: number;
  fireT: number;
  img: Phaser.GameObjects.Image;
}
interface BossState {
  def: BossData;
  x: number;
  y: number;
  t: number;
  hp: number;
  hpMax: number;
  phase: number;
  cool: number;
  hcd: number;
  dir: number;
  flashT: number;
  entered: boolean;
  spiralAngle: number;
  wanderTx: number;
  wanderTy: number;
  cx: number;
  parts: BossPart[];
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  scale: number;
  img: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
}
interface Flash {
  img: Phaser.GameObjects.Image;
  t: number;
}
interface Spark {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  t: number;
}
interface OrbEnt {
  x: number;
  y: number;
  vy: number;
  t: number;
  type: 'P' | 'S';
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}
interface FloatText {
  obj: Phaser.GameObjects.Text;
  t: number;
}
interface Phantom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  s: number;
  img: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Image;
}
interface Hole {
  x: number;
  y: number;
  r: number;
  seed: number;
  open: number;
  core: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  arcs: Phaser.GameObjects.Image[];
}
interface SuperState {
  t: number;
  holes: Hole[];
  phantoms: Phantom[];
  acc: number;
  spidSaid: boolean;
}

const DEPTH = {
  bg: 0,
  hole: 2,
  orb: 3,
  enemy: 4,
  bullet: 5,
  phantom: 6,
  player: 7,
  ebullet: 8,
  boom: 9,
  floatText: 10,
  bubble: 11,
  hud: 20,
  banner: 21,
  debug: 30,
};

export class GameScene extends Phaser.Scene {
  private session!: GameSession;
  private level!: LevelData;

  // 플레이어
  private px = 0;
  private py = 0;
  private pvx = 0;
  private pvy = 0;
  private alive = true;
  private inv = 0;
  private regenT = 0;
  private fireCd = 0;
  private vseq = 0;
  private playerImg!: Phaser.GameObjects.Image;
  private flameImg!: Phaser.GameObjects.Image;
  private auraImg!: Phaser.GameObjects.Image;

  // 엔티티
  private bullets: Bullet[] = [];
  private ebullets: EBul[] = [];
  private enemies: Enemy[] = [];
  private booms: Boom[] = [];
  private sparks: Spark[] = [];
  private orbs: OrbEnt[] = [];
  private texts: FloatText[] = [];
  private textPool: Phaser.GameObjects.Text[] = [];
  private boss: BossState | null = null;
  private sp: SuperState | null = null;

  // 웨이브
  private spawnQ: SpawnEvent[] = [];
  private waveT = 0;
  private waveClearT = -1;
  private pendingShop = -1;
  private deathT = -1;

  // 풀
  private pool!: ImagePool;
  private fxPool!: ImagePool;

  // 배경/카메라
  private spaceBg!: SpaceBackground;
  private scrollSpd = 45;
  private shake = 0;
  private worldT = 0;
  private flashes: Flash[] = [];
  private thrustT = 0;
  private props: { img: Phaser.GameObjects.Image; rot: number }[] = [];
  private nextPropAt = 4;
  private propT = 0;

  // 장비 (후방무기·사이드킥)
  private rearCd = 0;
  private sideCd = 0;
  private podL: Phaser.GameObjects.Image | null = null;
  private podR: Phaser.GameObjects.Image | null = null;
  private satellite: Phaser.GameObjects.Image | null = null;
  private satAng = 0;
  private diff = DIFficulty.normal;
  private endlessBossId = 'amoeba';

  // 입력
  private touchOn = false;
  private dragPointerId = -1;
  private touchTx = 0;
  private touchTy = 0;
  private keyMap!: Record<string, Phaser.Input.Keyboard.Key>;

  // HUD
  private hudShieldBar!: Phaser.GameObjects.Rectangle;
  private hudArmorBar!: Phaser.GameObjects.Rectangle;
  private hudWpn!: Phaser.GameObjects.Text;
  private hudPips: Phaser.GameObjects.Rectangle[] = [];
  private hudWaveT!: Phaser.GameObjects.Text;
  private hudScore!: Phaser.GameObjects.Text;
  private hudCredits!: Phaser.GameObjects.Text;
  private hudMute!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Rectangle;
  private bossLabel!: Phaser.GameObjects.Text;
  private superBtn!: Phaser.GameObjects.Container;
  private superCount!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerT = 0;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleBg!: Phaser.GameObjects.Graphics;
  private bubbleText!: Phaser.GameObjects.Text;
  private bubbleMsg = '';

  private immuneMsgT = 0;

  // 개발용 (?auto ?god) / 디버그 도구 (?debug — PLAN 3장)
  private auto = false;
  private god = false;
  private autoSuperT = 0;
  private fpsTitleT = 0;
  private debug = false;
  private debugHitbox = false;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Game);
  }

  create(data?: { session?: GameSession; replayWave?: boolean }): void {
    // 씬 재시작마다 상태 초기화 (씬 인스턴스는 재사용됨)
    this.session = data?.session ?? newSession();
    this.bullets = [];
    this.ebullets = [];
    this.enemies = [];
    this.booms = [];
    this.sparks = [];
    this.orbs = [];
    this.texts = [];
    this.textPool = [];
    this.boss = null;
    this.sp = null;
    this.spawnQ = [];
    this.waveClearT = -1;
    this.pendingShop = -1;
    this.deathT = -1;
    this.alive = true;
    this.inv = 0;
    this.regenT = 0;
    this.fireCd = 0;
    this.vseq = 0;
    this.shake = 0;
    this.worldT = 0;
    this.touchOn = false;
    this.dragPointerId = -1;
    this.bubbleMsg = '';
    this.hudPips = [];
    this.flashes = [];
    this.thrustT = 0;
    this.props = [];
    this.propT = 0;
    this.nextPropAt = 4 + Math.random() * 5;
    this.rearCd = 0;
    this.sideCd = 0;
    this.podL = this.podR = this.satellite = null;
    this.satAng = 0;
    this.diff = DIFficulty[this.session.difficulty] ?? DIFficulty.normal;

    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search);
      this.auto = q.get('auto') === '1';
      this.god = this.auto || q.get('god') === '1';
      this.debug = q.get('debug') !== null;
    }

    const li = Math.min(this.session.level - 1, DATA.levels.levels.length - 1);
    this.level = DATA.levels.levels[Math.max(0, li)] ?? DATA.levels.levels[0]!;

    this.px = PLAYER.startX;
    this.py = PLAYER.startY;
    this.pvx = 0;
    this.pvy = 0;

    this.spaceBg = new SpaceBackground(this, DEPTH.bg, this.level.background);
    // 비네트 — 게임플레이 위, HUD 아래
    this.add
      .image(0, 0, 'vignette')
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud - 1);

    this.pool = new ImagePool(this, 'b-pulse', DEPTH.bullet, 64);
    this.fxPool = new ImagePool(this, 'boom', DEPTH.boom, 16);

    this.flameImg = this.add
      .image(this.px, this.py + 15, 'engine-flame')
      .setDepth(DEPTH.player - 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.auraImg = this.add
      .image(this.px, this.py, 'super-aura')
      .setDepth(DEPTH.player - 0.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.playerImg = this.add.image(this.px, this.py, 'ship-player').setDepth(DEPTH.player);

    // 사이드킥 표시체
    if (this.session.sidekick === 'pods') {
      this.podL = this.add
        .image(this.px - 26, this.py + 8, 'ship-mite')
        .setDepth(DEPTH.player - 0.2);
      this.podR = this.add
        .image(this.px + 26, this.py + 8, 'ship-mite')
        .setDepth(DEPTH.player - 0.2);
      this.podL.setTint(0x8fd3ff);
      this.podR.setTint(0x8fd3ff);
    } else if (this.session.sidekick === 'satellite') {
      this.satellite = this.add
        .image(this.px, this.py - 40, 'orb-S')
        .setDepth(DEPTH.player - 0.2)
        .setScale(1.2);
    }

    playMusic(this.level.background.theme);

    this.createHud();
    this.createBubble();
    this.setupInput();
    if (this.debug) this.createDebug();

    // 데이터 핫리로드 → 세션 유지한 채 현재 웨이브부터 재생
    const onDataReload = (): void => {
      if (this.scene.isPaused(SceneKeys.Game)) {
        this.scene.stop(SceneKeys.Pause);
        this.scene.resume();
      }
      if (!this.scene.isActive(SceneKeys.Game)) return;
      if (this.pendingShop > 0 && !this.session.campaignDone) {
        // 보스 격파~상점 전환 창: 상점을 건너뛰지 않도록 곧장 상점으로
        this.scene.start(SceneKeys.Shop, { session: this.session });
        return;
      }
      this.scene.restart({ session: this.session, replayWave: true });
    };
    this.game.events.on('data-reloaded', onDataReload);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('data-reloaded', onDataReload);
    });

    if (this.session.campaignDone) {
      // 완주 세션으로 재진입(핫리로드 등) — 빈 레벨 소프트락 대신 완료 화면
      this.time.delayedCall(0, () => {
        saveBest(this.session.score);
        this.scene.pause();
        this.scene.launch(SceneKeys.Result, { session: this.session, mode: 'complete' });
      });
      return;
    }
    // 핫리로드 재시작이면 방금 웨이브를 다시 재생 (카운터는 nextWave가 재증가)
    if (
      data?.replayWave &&
      this.session.levelWave > 0 &&
      this.session.levelWave <= this.level.waves.length
    ) {
      this.session.levelWave--;
      this.session.wave = Math.max(0, this.session.wave - 1);
    }
    if (!this.auto && !document.hasFocus()) this.time.delayedCall(0, () => this.togglePause(true));
    this.nextWave();
  }

  /* ---------- HUD ---------- */
  private createHud(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, 30, 0x040814, 0.88).setOrigin(0, 0).setDepth(DEPTH.hud);
    this.add.rectangle(0, 30, GAME_WIDTH, 1, 0x78b4ff, 0.25).setOrigin(0, 0).setDepth(DEPTH.hud);

    uiText(this, 7, 9, 'SHD', 9, '#7ecbff').setDepth(DEPTH.hud + 1);
    this.add
      .rectangle(33, 5, 72, 8, 0x18243a, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4a6a, 0.9)
      .setDepth(DEPTH.hud);
    this.hudShieldBar = this.add
      .rectangle(34, 6, 70, 6, 0x5ab4ec)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1);
    uiText(this, 7, 22, 'ARM', 9, '#ffd18a').setDepth(DEPTH.hud + 1);
    this.add
      .rectangle(33, 17, 72, 8, 0x18243a, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a4a6a, 0.9)
      .setDepth(DEPTH.hud);
    this.hudArmorBar = this.add
      .rectangle(34, 18, 70, 6, 0xe8a84a)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1);

    this.hudWpn = uiText(this, 114, 9, '', 9, '#8aff8a').setDepth(DEPTH.hud + 1);
    for (let i = 0; i < 6; i++) {
      this.hudPips.push(
        this.add
          .rectangle(156 + i * 8, 5, 6, 7, 0x8aff8a)
          .setOrigin(0, 0)
          .setDepth(DEPTH.hud + 1),
      );
    }
    this.hudWaveT = uiText(this, 114, 22, '', 9, '#cfd8ff').setDepth(DEPTH.hud + 1);
    this.hudScore = uiText(this, GAME_WIDTH - 7, 9, '', 11, '#fff2b0', 'right').setDepth(
      DEPTH.hud + 1,
    );
    this.hudCredits = uiText(this, GAME_WIDTH - 7, 22, '', 9, '#ffd76a', 'right').setDepth(
      DEPTH.hud + 1,
    );
    this.add.image(244, 15, 'pause-btn').setDepth(DEPTH.hud + 1);
    this.hudMute = uiText(this, 216, 22, 'MUTE', 8, '#8a93b0')
      .setDepth(DEPTH.hud + 1)
      .setVisible(isMuted());

    this.bossBar = this.add
      .rectangle(68, GAME_HEIGHT - 16, GAME_WIDTH - 136, 6, 0xdd3333)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);
    this.bossLabel = uiText(this, 34, GAME_HEIGHT - 12, 'BOSS', 9, '#ff9a9a')
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);

    // 슈퍼 버튼 (우하단)
    const bx = GAME_WIDTH - 31;
    const by = GAME_HEIGHT - 43;
    const g = this.add.image(0, 0, 'super-btn');
    const label = uiText(this, 0, -4, 'S', 15, '#cfc2ff', 'center');
    this.superCount = uiText(this, 0, 12, '', 8, '#cfc2ff', 'center');
    this.superBtn = this.add.container(bx, by, [g, label, this.superCount]).setDepth(DEPTH.hud + 1);

    this.bannerText = uiText(this, GAME_WIDTH / 2, 200, '', 22, '#e8ecff', 'center')
      .setDepth(DEPTH.banner)
      .setVisible(false);
  }

  private createBubble(): void {
    this.bubbleBg = this.add.graphics();
    this.bubbleText = this.add
      .text(0, 0, '', {
        fontFamily: 'Galmuri11, "Courier New", monospace',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#101638',
      })
      .setOrigin(0, 0);
    this.bubble = this.add
      .container(0, 0, [this.bubbleBg, this.bubbleText])
      .setDepth(DEPTH.bubble)
      .setVisible(false);
  }

  private showBubble(msg: string, bx: number, by: number): void {
    if (this.bubbleMsg !== msg) {
      this.bubbleMsg = msg;
      const w = this.bubbleText.setText(msg).width + 16;
      const g = this.bubbleBg;
      g.clear();
      g.fillStyle(0xf6f8ff, 1);
      g.fillRoundedRect(0, 0, w, 22, 5);
      g.fillTriangle(w / 2 - 5, 22, w / 2 + 5, 22, w / 2, 29);
      g.lineStyle(1, 0x26305a, 1);
      g.strokeRoundedRect(0.5, 0.5, w - 1, 21, 5);
      this.bubbleText.setPosition(8, 4);
    }
    const w = this.bubbleText.width + 16;
    this.bubble.setPosition(clamp(bx - w / 2, 4, GAME_WIDTH - w - 4), by - 29);
    this.bubble.setVisible(true);
  }

  /* ---------- 디버그 도구 (?debug) ---------- */
  private createDebug(): void {
    this.debugGfx = this.add.graphics().setDepth(DEPTH.debug);
    this.debugText = uiText(this, 4, GAME_HEIGHT - 58, '', 8, '#7ef7a0')
      .setDepth(DEPTH.debug)
      .setAlpha(0.9);
    uiText(
      this,
      4,
      GAME_HEIGHT - 70,
      'DBG G:무적 H:히트박스 N:웨이브+1 J/K:±5s L:레벨테마',
      8,
      '#5aa06a',
    ).setDepth(DEPTH.debug);
    const kb = this.input.keyboard;
    kb?.on('keydown-G', () => {
      this.god = !this.god;
    });
    kb?.on('keydown-H', () => {
      this.debugHitbox = !this.debugHitbox;
      this.debugGfx.clear();
    });
    kb?.on('keydown-N', () => {
      if (this.pendingShop > 0) return;
      if (this.boss) {
        // 보스는 정식 격파 처리로 넘긴다 (레벨 전이 일관성)
        this.damageBoss(this.boss.hp + 1);
        return;
      }
      this.clearField();
      this.nextWave();
    });
    kb?.on('keydown-J', () => {
      if (this.pendingShop <= 0 && !this.boss) this.scrubWave(5);
    });
    kb?.on('keydown-K', () => {
      if (this.pendingShop <= 0 && !this.boss) this.scrubWave(-5);
    });
    kb?.on('keydown-L', () => {
      this.session.level = (this.session.level % DATA.levels.levels.length) + 1;
      this.session.levelWave = 0;
      this.session.campaignDone = false;
      this.scene.restart({ session: this.session });
    });
  }

  /** 웨이브 타임라인 스크럽 — 뒤로 갈 때는 큐를 재생성해 남은 스폰을 복원 */
  private scrubWave(delta: number): void {
    this.waveT = Math.max(0, this.waveT + delta);
    if (delta < 0) {
      this.clearField();
      this.spawnQ = buildLevelWave(
        this.session.level - 1,
        Math.max(0, this.session.levelWave - 1),
      ).filter((e) => e.t > this.waveT);
    }
  }

  private clearField(): void {
    for (const e of this.enemies) this.pool.release(e.img);
    this.enemies = [];
    for (const b of this.ebullets) this.pool.release(b.img);
    this.ebullets = [];
    if (this.boss) {
      for (const part of this.boss.parts) if (part.alive) this.pool.release(part.img);
      this.pool.release(this.boss.img);
      this.pool.release(this.boss.glow);
      this.boss = null;
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
    }
    this.spawnQ = [];
    this.waveClearT = -1;
  }

  private updateDebug(): void {
    if (!this.debug) return;
    const fps = this.game.loop.actualFps.toFixed(1);
    this.debugText.setText(
      `FPS ${fps} · obj ${this.children.length} · e ${this.enemies.length} b ${this.bullets.length} eb ${this.ebullets.length} ph ${this.sp?.phantoms.length ?? 0}` +
        `${this.god ? ' · GOD' : ''} · L${this.level.id} ${this.level.background.theme} · waveT ${this.waveT.toFixed(1)}`,
    );
    const g = this.debugGfx;
    g.clear();
    if (!this.debugHitbox) return;
    g.lineStyle(1, 0x00ff88, 0.9);
    g.strokeRect(this.px - PLAYER.hitW / 2, this.py - PLAYER.hitH / 2, PLAYER.hitW, PLAYER.hitH);
    const hb = DATA.enemies.hitbox;
    g.lineStyle(1, 0xff5566, 0.9);
    for (const e of this.enemies) g.strokeRect(e.x - hb.w / 2, e.y - hb.h / 2, hb.w, hb.h);
    if (this.boss) {
      const B = this.boss;
      g.strokeRect(
        B.x - B.def.hitbox.w / 2,
        B.y - B.def.hitbox.h / 2,
        B.def.hitbox.w,
        B.def.hitbox.h,
      );
      g.lineStyle(1, 0xffee44, 0.9);
      for (const part of B.parts) {
        if (!part.alive) continue;
        g.strokeRect(
          B.x + part.def.dx - part.def.hitbox.w / 2,
          B.y + part.def.dy - part.def.hitbox.h / 2,
          part.def.hitbox.w,
          part.def.hitbox.h,
        );
      }
      g.lineStyle(1, 0xff5566, 0.9);
    }
    g.lineStyle(1, 0x66aaff, 0.7);
    for (const b of this.bullets) g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    g.lineStyle(1, 0xffaa33, 0.9);
    for (const b of this.ebullets) g.strokeRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
  }

  /* ---------- 입력 ---------- */
  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      kb.removeAllListeners();
      this.keyMap = {
        left: kb.addKey('LEFT'),
        right: kb.addKey('RIGHT'),
        up: kb.addKey('UP'),
        down: kb.addKey('DOWN'),
        a: kb.addKey('A'),
        d: kb.addKey('D'),
        w: kb.addKey('W'),
        s: kb.addKey('S'),
        space: kb.addKey('SPACE'),
        z: kb.addKey('Z'),
      };
      kb.on('keydown-X', () => this.startSuper());
      kb.on('keydown-B', () => this.startSuper());
      kb.on('keydown-M', () => {
        const m = toggleMute();
        this.hudMute.setVisible(m);
        updateSave((sv) => {
          sv.settings.muted = m;
        });
      });
      kb.on('keydown-P', () => this.togglePause());
      kb.on('keydown-ESC', () => this.togglePause());
    }

    // 멀티터치: 첫 손가락이 드래그를 잡고, 다른 손가락은 슈퍼 버튼 등 별개 처리
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audioResume();
      const bx = GAME_WIDTH - 31;
      const by = GAME_HEIGHT - 43;
      if (Math.hypot(p.worldX - bx, p.worldY - by) < 30) {
        this.startSuper();
        return;
      }
      if (p.worldY < 34 && p.worldX > 220 && p.worldX < 268) {
        this.togglePause();
        return;
      }
      if (this.dragPointerId === -1) {
        this.dragPointerId = p.id;
        this.touchOn = true;
        this.touchTx = p.worldX;
        this.touchTy = p.worldY + PLAYER.touchOffsetY;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.touchOn || p.id !== this.dragPointerId) return;
      this.touchTx = p.worldX;
      this.touchTy = p.worldY + PLAYER.touchOffsetY;
    });
    const onUp = (p: Phaser.Input.Pointer): void => {
      if (p.id === this.dragPointerId) this.releaseTouch();
    };
    this.input.on('pointerup', onUp);
    this.input.on('pointerupoutside', onUp);

    // 백그라운드 전환 시 자동 일시정지 — BLUR(데스크톱)와 HIDDEN(iOS 사파리/PWA) 모두
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onBlur, this);
    });
    // 일시정지 중 놓친 pointerup 대비 — 재개 시 입력 상태를 통째로 리셋
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.releaseTouch();
      if (this.keyMap) for (const key of Object.values(this.keyMap)) key.reset();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME);
    });
  }

  private releaseTouch(): void {
    this.touchOn = false;
    this.dragPointerId = -1;
  }

  private onBlur = (): void => {
    if (this.scene.isActive(SceneKeys.Game)) this.togglePause(true);
  };

  private togglePause(forcePause = false): void {
    if (this.scene.isPaused(SceneKeys.Game)) return;
    if (!forcePause || this.scene.isActive(SceneKeys.Game)) {
      this.releaseTouch();
      this.scene.launch(SceneKeys.Pause);
      this.scene.pause();
    }
  }

  /* ---------- 웨이브 ---------- */
  private nextWave(): void {
    if (this.session.endless) {
      // 엔들리스: 전 레벨 웨이브 풀에서 무작위, 6웨이브마다 보스 순환
      const cycle = this.session.levelWave;
      if (cycle > 0 && cycle % 6 === 5) {
        const ids = Object.keys(DATA.bosses.bosses);
        this.endlessBossId = ids[Math.floor(cycle / 6) % ids.length] ?? 'amoeba';
        this.spawnQ = [{ t: 1.0 + DATA.levels.bossDelay, kind: 'boss' }];
        this.session.levelWave++;
      } else {
        const li = Math.floor(Math.random() * DATA.levels.levels.length);
        const lvl = DATA.levels.levels[li];
        const wi = Math.floor(Math.random() * (lvl?.waves.length ?? 1));
        this.spawnQ = buildLevelWave(li, wi);
        this.session.wave++;
        this.session.levelWave++;
        this.banner(t('banner.wave', this.session.wave), 1.6, '#ffd75e');
        this.scrollSpd = this.level.scroll.base + this.session.wave * this.level.scroll.perWave;
      }
      this.waveT = 0;
      this.waveClearT = -1;
      return;
    }
    const li = Math.min(this.session.level, DATA.levels.levels.length) - 1;
    const isBossWave = this.session.levelWave >= this.level.waves.length;
    this.spawnQ = buildLevelWave(li, this.session.levelWave);
    if (!isBossWave) {
      this.session.wave++;
      this.session.levelWave++;
      this.banner(t('banner.wave', this.session.wave), 1.6, '#ffd75e');
      this.scrollSpd = this.level.scroll.base + this.session.wave * this.level.scroll.perWave;
    }
    this.waveT = 0;
    this.waveClearT = -1;
  }

  private banner(msg: string, dur: number, color: string): void {
    this.bannerText.setText(msg).setColor(color).setVisible(true).setAlpha(1);
    this.bannerT = dur;
    this.bannerText.setScale(1.35);
    this.tweens.add({ targets: this.bannerText, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  /* ---------- 스폰 ---------- */
  private spawnFromEvent(ev: SpawnEvent): void {
    if (ev.kind === 'boss') {
      this.spawnBoss();
      return;
    }
    this.spawnEnemyAt(ev.type, ev.x, ev.opt.y ?? DATA.enemies.spawnY, ev.opt);
  }

  private spawnEnemyAt(
    type: string,
    x: number,
    y: number,
    opt: { amp?: number; vx?: number },
  ): void {
    const def = DATA.enemies.types[type];
    if (!def) {
      console.error(`[data] 알 수 없는 적 타입: ${type}`);
      return;
    }
    const w = this.session.wave;
    const e: Enemy = {
      type,
      def,
      x,
      y,
      t: 0,
      hp: (def.hp.base + w * def.hp.perWave) * this.diff.hp,
      hcd: 0,
      dead: false,
      score: def.score,
      flashT: 0,
      img: this.pool.get(def.sprite, x, y),
    };
    if (def.behavior === 'sineDescend') {
      const p = def.params;
      e.spd = rnd(p.spdMin, p.spdMax) + w * p.spdPerWave;
      e.amp = opt.amp ?? rnd(p.ampMin, p.ampMax);
      e.f = rnd(p.freqMin, p.freqMax);
      e.bx = x;
    } else if (def.behavior === 'turret') {
      const p = def.params;
      e.spd = p.spd;
      e.holdY = rnd(p.holdYMin, p.holdYMax);
      e.cool = rnd(p.coolMin, p.coolMax);
      e.life = p.life;
      e.drift = rnd(-p.driftMax, p.driftMax);
    } else if (def.behavior === 'diver') {
      const p = def.params;
      e.spd = p.spdBase + w * p.spdPerWave;
      e.vx = opt.vx ?? 0;
    } else if (def.behavior === 'strafer') {
      const p = def.params;
      e.dir = x < GAME_WIDTH / 2 ? 1 : -1;
      e.baseY = rnd(p.yMin, p.yMax);
      e.y = e.baseY;
      e.fireT = p.fireEvery * 0.6;
    } else {
      const p = def.params;
      e.cx = x;
      e.cy = y;
      e.ang = rnd(0, 6.283);
      e.holdY = rnd(p.holdYMin, p.holdYMax);
      e.fireT = p.fireEvery * 0.5;
      e.life = p.life;
    }
    e.img.setDepth(DEPTH.enemy);
    this.enemies.push(e);
  }

  private spawnBoss(): void {
    const bossId = this.session.endless ? this.endlessBossId : this.level.boss;
    const def = DATA.bosses.bosses[bossId];
    if (!def) {
      console.error(`[data] 알 수 없는 보스: ${bossId}`);
      return;
    }
    const w = this.session.wave;
    const hp = (def.hp.base + w * def.hp.perWave) * this.diff.hp;
    const glow = this.pool.get('boss-glow', GAME_WIDTH / 2, -80);
    glow.setDepth(DEPTH.enemy - 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const img = this.pool.get(def.sprite, GAME_WIDTH / 2, -80);
    img.setDepth(DEPTH.enemy);
    const parts: BossPart[] = (def.parts ?? []).map((pd) => {
      const img = this.pool.get(pd.sprite, GAME_WIDTH / 2 + pd.dx, -80 + pd.dy);
      img.setDepth(DEPTH.enemy + 0.1);
      const hp = (pd.hp.base + w * pd.hp.perWave) * this.diff.hp;
      return {
        def: pd,
        hp,
        hpMax: hp,
        alive: true,
        flashT: 0,
        fireT: (pd.fireEvery ?? 2) * 0.7,
        img,
      };
    });
    this.boss = {
      def,
      x: GAME_WIDTH / 2,
      y: -80,
      t: 0,
      hp,
      hpMax: hp,
      phase: -1,
      cool: 1.2,
      hcd: 0,
      dir: 1,
      flashT: 0,
      entered: false,
      spiralAngle: Math.PI / 2,
      wanderTx: GAME_WIDTH / 2,
      wanderTy: def.entryY,
      cx: GAME_WIDTH / 2,
      parts,
      img,
      glow,
    };
    this.banner(t('banner.warning'), 2.2, '#ff6a6a');
    playMusic('boss');
    SFX.warn();
    this.scrollSpd = this.level.scroll.boss;
    this.bossBar.setVisible(true);
    this.bossLabel.setVisible(true);
  }

  /* ---------- 발사/피해 ---------- */
  /** 장비류 공용 탄 스폰 (전방무기 패턴과 별개) */
  private spawnPlayerBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    sprite: string,
    homing = false,
  ): void {
    const img = this.pool.get(sprite, x, y);
    img.setDepth(DEPTH.bullet).setBlendMode(Phaser.BlendModes.ADD);
    if (vy > 0) img.setFlipY(true);
    if (vx !== 0 && vy === 0) img.setRotation(vx > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.bullets.push({
      kind: 'equip',
      x,
      y,
      vx,
      vy,
      dmg,
      w: 8,
      h: 10,
      pierce: 0,
      sprite,
      stretch: false,
      homing,
      t: 0,
      img,
    });
  }

  private nearestTarget(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (this.boss) {
      const B = this.boss;
      if (this.coreShielded(B)) {
        // 실드 페이즈: 무적 코어 대신 살아 있는 파츠를 조준
        for (const part of B.parts) {
          if (!part.alive) continue;
          const px2 = B.x + part.def.dx;
          const py2 = B.y + part.def.dy;
          const d = (px2 - x) * (px2 - x) + (py2 - y) * (py2 - y);
          if (d < bd) {
            bd = d;
            best = { x: px2, y: py2 };
          }
        }
      } else {
        const d = (B.x - x) * (B.x - x) + (B.y - y) * (B.y - y);
        if (d < bd) best = B;
      }
    }
    return best;
  }

  private playerFire(): void {
    const level = weaponLevel(this.session);
    this.vseq = (this.vseq + 1) % 3;
    const shots = firePattern(this.session.cur, level, this.px, this.py, this.vseq);
    for (const s of shots) {
      const img = this.pool.get(s.sprite, s.x, s.y);
      img.setDepth(DEPTH.bullet).setBlendMode(Phaser.BlendModes.ADD);
      if (s.stretch) img.setScale(1, 1.3);
      this.bullets.push({ ...s, t: 0, img });
    }
    const mz = this.fxPool.get('muzzle', this.px, this.py - 19);
    mz.setDepth(DEPTH.bullet + 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.flashes.push({ img: mz, t: 0 });
    SFX.shoot(this.session.cur);
  }

  private eFire(x: number, y: number, spd: number, big = false): void {
    const dx = this.px - x;
    const dy = this.py - y;
    const L = Math.hypot(dx, dy) || 1;
    const eb = DATA.enemies.ebullet;
    const img = this.pool.get(big ? 'eb-big' : 'eb-small', x, y);
    img.setDepth(DEPTH.ebullet);
    this.ebullets.push({
      x,
      y,
      vx: (dx / L) * spd,
      vy: (dy / L) * spd,
      big,
      size: big ? eb.bigSize : eb.smallSize,
      img,
    });
    SFX.eshoot();
  }

  /** 각도 기반 적탄 (링/나선/부채꼴 스폰용) */
  private eFireAngle(x: number, y: number, ang: number, spd: number, size?: number): void {
    const img = this.pool.get('eb-small', x, y);
    img.setDepth(DEPTH.ebullet);
    this.ebullets.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      big: false,
      size: size ?? DATA.enemies.ebullet.smallSize,
      img,
    });
  }

  private executeBossPhase(ph: BossPhase): void {
    const B = this.boss;
    if (!B) return;
    const oy = B.def.fireOffsetY;
    if (ph.type === 'fan') {
      for (let k = 0; k < ph.count; k++) {
        const ang = Math.PI / 2 + (k - (ph.count - 1) / 2) * ph.angleStep;
        this.eFireAngle(B.x, B.y + oy + 3, ang, ph.speed, DATA.enemies.ebullet.fanSize);
      }
      SFX.eshoot();
    } else if (ph.type === 'aimed') {
      this.eFire(B.x - ph.offsetX, B.y + oy, ph.speed, ph.big);
      this.eFire(B.x + ph.offsetX, B.y + oy, ph.speed, ph.big);
    } else if (ph.type === 'ring') {
      for (let k = 0; k < ph.count; k++)
        this.eFireAngle(B.x, B.y, (k / ph.count) * Math.PI * 2, ph.speed);
      SFX.eshoot();
    } else if (ph.type === 'spiral') {
      for (let a = 0; a < ph.arms; a++)
        this.eFireAngle(B.x, B.y, B.spiralAngle + (a / ph.arms) * Math.PI * 2, ph.speed);
      B.spiralAngle += ph.rotStep;
      SFX.eshoot();
    } else {
      // spawn: 보스 양옆에서 미니언 소환
      for (let k = 0; k < ph.count; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        this.spawnEnemyAt(ph.enemy, B.x + side * 46, B.y + 10, {});
      }
    }
  }

  /** 파츠 자체 사격 — 페이즈 정의를 파츠 위치 기준으로 실행 */
  private executePartPhase(part: BossPart, B: BossState): void {
    const ph = part.def.phase;
    if (!ph) return;
    const px = B.x + part.def.dx;
    const py = B.y + part.def.dy;
    if (ph.type === 'aimed') {
      this.eFire(px, py + 8, ph.speed, ph.big);
    } else if (ph.type === 'fan') {
      for (let k = 0; k < ph.count; k++) {
        const ang = Math.PI / 2 + (k - (ph.count - 1) / 2) * ph.angleStep;
        this.eFireAngle(px, py + 8, ang, ph.speed, DATA.enemies.ebullet.fanSize);
      }
      SFX.eshoot();
    } else if (ph.type === 'ring') {
      for (let k = 0; k < ph.count; k++)
        this.eFireAngle(px, py, (k / ph.count) * Math.PI * 2, ph.speed);
      SFX.eshoot();
    }
  }

  /** 실드 파츠가 살아 있는 동안 코어는 무적 */
  private coreShielded(B: BossState): boolean {
    return B.parts.some((p) => p.alive && p.def.shield);
  }

  private damagePart(part: BossPart, B: BossState, dmg: number): void {
    if (!part.alive) return;
    part.hp -= dmg;
    part.flashT = 0.05;
    if (part.hp <= 0) {
      part.alive = false;
      part.img.clearTint();
      this.addBoom(B.x + part.def.dx, B.y + part.def.dy, 1.6, true);
      this.session.score += 800;
      this.session.credits += Math.round(800 * DATA.shop.creditRate * this.diff.credit);
      this.addFloatText(B.x + part.def.dx, B.y + part.def.dy, '+800', '#ffd76a');
      this.pool.release(part.img);
    }
  }

  private damagePlayer(raw: number): void {
    if (!this.alive || this.inv > 0 || this.god) return;
    this.regenT = 0;
    const d = Math.round(raw * this.diff.dmg);
    const r = applyDamage(this.session, d);
    this.session.shield = r.shield;
    this.session.armor = r.armor;
    this.inv = PLAYER.invulnAfterHit;
    SFX.hit();
    this.shake = Math.min(7, this.shake + 3);
    if (r.dead) {
      this.alive = false;
      this.addBoom(this.px, this.py, 1.9, true);
      this.addBoom(this.px - 11, this.py + 8, 1.4, false);
      this.addBoom(this.px + 11, this.py - 8, 1.4, false);
      this.playerImg.setVisible(false);
      this.flameImg.setVisible(false);
      this.podL?.setVisible(false);
      this.podR?.setVisible(false);
      this.satellite?.setVisible(false);
      this.deathT = 1.4;
    }
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.session.kills++;
    this.session.score += e.score;
    this.session.credits += Math.round(e.score * DATA.shop.creditRate * this.diff.credit);
    this.addBoom(e.x, e.y, 1.3, false);
    this.addFloatText(e.x, e.y, `+${e.score}`, '#ffd76a');
    const orb = DATA.enemies.orb;
    const chance = e.def.behavior === 'turret' ? orb.chanceTurret : orb.chance;
    if (Math.random() < chance) this.dropOrb(e.x, e.y);
    // 분열체: 사망 시 파생 스폰
    if (e.def.onDeath) {
      const sp = e.def.onDeath.spawn;
      // 충돌 킬 시 플레이어 위치에 겹쳐 즉사하지 않도록 약간 위쪽에 흩뿌린다
      for (let k = 0; k < sp.count; k++)
        this.spawnEnemyAt(sp.type, e.x + rnd(-22, 22), e.y - rnd(28, 48), {
          vx: rnd(-70, 70),
        });
    }
  }

  private damageBoss(d: number): void {
    const B = this.boss;
    if (!B) return;
    B.hp -= d;
    if (B.hp <= 0) {
      const bx = B.x;
      const by = B.y;
      for (let k = 0; k < 6; k++) {
        this.time.delayedCall(k * 130, () => {
          if (this.scene.isActive(SceneKeys.Game))
            this.addBoom(bx + rnd(-26, 26), by + rnd(-24, 24), rnd(1.2, 2.1), k === 0);
        });
      }
      this.session.score += B.def.killScore;
      this.session.credits += Math.round(B.def.killScore * DATA.shop.creditRate * this.diff.credit);
      this.addFloatText(bx, by, `+${B.def.killScore}`, '#7ef7ff');
      B.img.clearTint();
      for (const part of B.parts) {
        if (part.alive) {
          part.alive = false;
          this.addBoom(B.x + part.def.dx, B.y + part.def.dy, 1.4, false);
          this.pool.release(part.img);
        }
      }
      this.pool.release(B.img);
      this.pool.release(B.glow);
      this.pendingShop = B.def.shopDelay;
      playMusic(this.level.background.theme);
      // 레벨 클리어 — 다음 레벨로 (마지막 레벨이면 캠페인 완료)
      if (!this.session.endless) {
        this.session.level++;
        this.session.levelWave = 0;
        if (this.session.level > DATA.levels.levels.length) this.session.campaignDone = true;
        // 진행 저장: 도달 레벨 해금 + 완주 시 엔들리스 해금 (SaveSystem)
        updateSave((sv) => {
          sv.progress.unlockedLevel = Math.max(
            sv.progress.unlockedLevel,
            Math.min(this.session.level, DATA.levels.levels.length),
          );
          if (this.session.campaignDone) sv.progress.endlessUnlocked = true;
        });
      }
      // 엔들리스는 levelWave를 계속 누적 — 순환 인덱스(cycle/6)가 진행된다
      this.boss = null;
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
      this.scrollSpd = this.level.scroll.base + this.session.wave * this.level.scroll.perWave;
    }
  }

  /* ---------- 이펙트/드랍 ---------- */
  private addBoom(x: number, y: number, scale: number, big: boolean): void {
    const img = this.fxPool.get('boom', x, y);
    img
      .setDepth(DEPTH.boom)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.1 * scale);
    const ring = this.fxPool.get('boom-ring', x, y);
    ring
      .setDepth(DEPTH.boom + 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.1 * scale);
    this.booms.push({ x, y, t: 0, scale, img, ring });
    for (let k = 0; k < 7; k++) {
      const a = rnd(0, 6.283);
      const sp = rnd(40, 130) * scale;
      const s = this.fxPool.get('spark', x, y);
      s.setDepth(DEPTH.boom).setBlendMode(Phaser.BlendModes.ADD);
      this.sparks.push({ img: s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
    }
    if (big) SFX.bigboom();
    else SFX.boom();
    this.shake = Math.min(7, this.shake + (big ? 6 : 2));
  }

  private addFloatText(x: number, y: number, s: string, color: string): void {
    // Text 객체 풀링 — 킬마다 생성/파괴하면 모바일에서 텍스처 업로드·GC 부담
    const obj =
      this.textPool.pop() ??
      uiText(this, 0, 0, '', 10, '#ffffff', 'center').setDepth(DEPTH.floatText);
    obj.setText(s).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
    this.texts.push({ obj, t: 0 });
  }

  private dropOrb(x: number, y: number, forceS = false): void {
    this.session.orbCount++;
    const orb = DATA.enemies.orb;
    const type = forceS || this.session.orbCount % orb.everyNthIsShield === 0 ? 'S' : 'P';
    const img = this.pool.get(`orb-${type}`, x, y);
    img.setDepth(DEPTH.orb);
    const glow = this.pool.get('orb-glow', x, y);
    glow.setDepth(DEPTH.orb - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.orbs.push({ x, y, vy: orb.fallSpeed, t: 0, type, img, glow });
  }

  /* ---------- 슈퍼 Jungjioo ---------- */
  private startSuper(): void {
    // pendingShop 카운트다운 중 발동하면 상점 전환으로 즉시 소멸되므로 차단
    if (!this.alive || this.sp || this.session.superN <= 0 || this.pendingShop > 0) return;
    this.session.superN--;
    const n = 3 + (Math.random() < 0.5 ? 1 : 0);
    const holes: Hole[] = [];
    for (let i = 0; i < n; i++) {
      const hx =
        SUPER.holeMarginX +
        (GAME_WIDTH - SUPER.holeMarginX * 2) * ((i + 0.5) / n) +
        rnd(-SUPER.holeJitterX, SUPER.holeJitterX);
      const hy = GAME_HEIGHT - rnd(SUPER.holeYMin, SUPER.holeYMax);
      const r = rnd(SUPER.holeMinR, SUPER.holeMaxR);
      const core = this.fxPool.get('hole-core', hx, hy);
      core.setDepth(DEPTH.hole).setScale(0);
      const glow = this.fxPool.get('hole-glow', hx, hy);
      glow
        .setDepth(DEPTH.hole - 0.2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0);
      const arcs = [0, 1, 2].map((k) => {
        const a = this.fxPool.get(`hole-arc${k}`, hx, hy);
        a.setDepth(DEPTH.hole + 0.2)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0);
        return a;
      });
      holes.push({ x: hx, y: hy, r, seed: rnd(0, 6.283), open: 0, core, glow, arcs });
    }
    this.sp = { t: 0, holes, phantoms: [], acc: 0, spidSaid: false };
    this.inv = 999;
    this.auraImg.setVisible(true);
    SFX.superOn();
    this.shake = 6;
  }

  private updateSuper(dt: number): void {
    const sp = this.sp;
    if (!sp) return;
    sp.t += dt;
    for (const h of sp.holes) {
      if (sp.t > SUPER.openDelay) h.open = Math.min(1, h.open + dt * SUPER.openRate);
      const s = h.open * h.open * (3 - 2 * h.open);
      const scale = ((h.r * 2) / 48) * s;
      h.core.setScale(scale);
      h.glow.setScale(((h.r * 3.8) / 128) * s * 2);
      h.arcs.forEach((a, k) => {
        a.setScale(scale * (1 + k * 0.06));
        a.setRotation(this.worldT * (3 + k) + h.seed + k * 2.1);
      });
    }
    if (sp.t > SUPER.spidAt && !sp.spidSaid) {
      sp.spidSaid = true;
      SFX.spid();
    }
    if (sp.t > SUPER.rushFrom && sp.t < SUPER.rushTo) {
      sp.acc += dt * SUPER.rushPerSec;
      while (sp.acc > 1) {
        sp.acc -= 1;
        const h = sp.holes[(Math.random() * sp.holes.length) | 0];
        if (!h) break;
        const img = this.pool.get('ship-ghost', 0, 0);
        img.setDepth(DEPTH.phantom).setBlendMode(Phaser.BlendModes.ADD);
        const trail = this.pool.get('ghost-trail', 0, 0);
        trail.setDepth(DEPTH.phantom - 0.1).setBlendMode(Phaser.BlendModes.ADD);
        const ph: Phantom = {
          x: h.x + rnd(-h.r, h.r) * 0.7,
          y: h.y + rnd(-8, 8),
          vx: rnd(-SUPER.phantomVxMax, SUPER.phantomVxMax),
          vy: -rnd(SUPER.phantomVyMin, SUPER.phantomVyMax),
          a: rnd(0.55, 0.95),
          s: rnd(0.8, 1.25),
          img,
          trail,
        };
        img.setAlpha(ph.a).setScale(ph.s);
        this.sp?.phantoms.push(ph);
      }
      for (const b of this.ebullets) this.pool.release(b.img);
      this.ebullets.length = 0;
    }
    const hb = DATA.enemies.hitbox;
    for (let i = sp.phantoms.length - 1; i >= 0; i--) {
      const q = sp.phantoms[i];
      if (!q) continue;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.img.setPosition(q.x, q.y);
      q.trail.setPosition(q.x, q.y + 22);
      for (const e of this.enemies) {
        if (
          e.hcd <= 0 &&
          aabb(q.x, q.y, SUPER.phantomHitW, SUPER.phantomHitH, e.x, e.y, hb.w, hb.h)
        ) {
          e.hcd = SUPER.enemyHitCooldown;
          e.hp -= SUPER.phantomDamage;
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      const B = this.boss;
      if (
        B &&
        B.hcd <= 0 &&
        aabb(
          q.x,
          q.y,
          SUPER.phantomHitW,
          SUPER.phantomHitH,
          B.x,
          B.y,
          B.def.hitbox.w,
          B.def.hitbox.h,
        )
      ) {
        B.hcd = B.def.hitCooldown;
        // 실드 파츠가 살아 있으면 팬텀도 파츠부터 부순다 (코어 무적 우회 방지)
        const shieldPart =
          B.parts.find((pp) => pp.alive && pp.def.shield) ?? B.parts.find((pp) => pp.alive);
        if (shieldPart) this.damagePart(shieldPart, B, SUPER.phantomBossDamage);
        else this.damageBoss(SUPER.phantomBossDamage);
      }
      if (q.y < -50) {
        this.pool.release(q.img);
        this.pool.release(q.trail);
        sp.phantoms.splice(i, 1);
      }
    }
    this.reapEnemies();

    if (sp.t < SUPER.bubble1Until) this.showBubble(SUPER.bubble1, this.px, this.py - 34);
    else if (sp.t < SUPER.bubble2Until) this.showBubble(SUPER.bubble2, this.px, this.py - 34);
    else this.bubble.setVisible(false);

    if (sp.t > SUPER.endAt && sp.phantoms.length === 0) {
      for (const h of sp.holes) {
        this.fxPool.release(h.core);
        this.fxPool.release(h.glow);
        h.arcs.forEach((a) => this.fxPool.release(a));
      }
      this.sp = null;
      this.inv = SUPER.endInvuln;
      this.auraImg.setVisible(false);
      this.bubble.setVisible(false);
    }
  }

  private reapEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e && e.dead) {
        this.pool.release(e.img);
        this.enemies.splice(i, 1);
      }
    }
  }

  /* ---------- 메인 업데이트 ---------- */
  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.worldT += dt;

    this.spaceBg.update(dt, this.scrollSpd);
    this.updateProps(dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.bannerText.setAlpha(Math.min(1, this.bannerT * 2));
      if (this.bannerT <= 0) this.bannerText.setVisible(false);
    }
    if (this.immuneMsgT > 0) this.immuneMsgT -= dt;
    if (this.sp) this.updateSuper(dt);
    if (this.auto) this.updateAutoPilot(dt);

    this.updatePlayer(dt);
    this.updateWaves(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateOrbs(dt);
    this.updateFx(dt);
    this.updateHud();
    this.updateDebug();

    if (import.meta.env.DEV) {
      this.fpsTitleT += dt;
      if (this.fpsTitleT >= 0.25) {
        this.fpsTitleT = 0;
        document.title = `별의 일생 — ${this.game.loop.actualFps.toFixed(1)} fps`;
      }
    }

    // 슈퍼 진행 중에는 상점 전환을 보류 (연출 강제 절단 방지)
    if (this.pendingShop > 0 && !this.sp) {
      this.pendingShop -= dt;
      if (this.pendingShop <= 0 && this.alive) {
        if (this.session.campaignDone) {
          saveBest(this.session.score);
          this.scene.pause();
          this.scene.launch(SceneKeys.Result, { session: this.session, mode: 'complete' });
        } else {
          this.scene.start(SceneKeys.Shop, { session: this.session });
        }
        return;
      }
    }
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        saveBest(this.session.score);
        if (this.session.endless)
          updateSave((sv) => {
            if (this.session.score > sv.endlessBest) sv.endlessBest = this.session.score;
          });
        this.scene.pause();
        this.scene.launch(SceneKeys.Result, { session: this.session });
      }
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 14 * dt);
      this.cameras.main.setScroll(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
    } else {
      this.cameras.main.setScroll(0, 0);
    }
  }

  private updateAutoPilot(dt: number): void {
    // DEV 소크 테스트 봇: 좌우 위빙 + 상시 발사 + 주기적 슈퍼
    this.touchOn = true;
    this.touchTx = GAME_WIDTH / 2 + Math.sin(this.worldT * 0.9) * 130;
    this.touchTy = GAME_HEIGHT - 120 + Math.sin(this.worldT * 0.53) * 60;
    this.autoSuperT += dt;
    if (this.autoSuperT > 20) {
      this.autoSuperT = 0;
      if (this.session.superN <= 0) this.session.superN = 2;
      this.startSuper();
    }
  }

  private updatePlayer(dt: number): void {
    if (!this.alive) return;
    const k = this.keyMap;
    let ax = 0;
    let ay = 0;
    if (k) {
      if (k.left?.isDown || k.a?.isDown) ax -= 1;
      if (k.right?.isDown || k.d?.isDown) ax += 1;
      if (k.up?.isDown || k.w?.isDown) ay -= 1;
      if (k.down?.isDown || k.s?.isDown) ay += 1;
    }
    const f60 = dt * 60;
    if (this.touchOn) {
      this.pvx +=
        clamp(
          (this.touchTx - this.px) * PLAYER.touchSpring,
          -PLAYER.touchClamp,
          PLAYER.touchClamp,
        ) * dt;
      this.pvy +=
        clamp(
          (this.touchTy - this.py) * PLAYER.touchSpring,
          -PLAYER.touchClamp,
          PLAYER.touchClamp,
        ) * dt;
      const damp = Math.pow(PLAYER.touchDamp, f60);
      this.pvx *= damp;
      this.pvy *= damp;
    } else {
      this.pvx = clamp(this.pvx + ax * PLAYER.acc * dt, -PLAYER.maxSpeed, PLAYER.maxSpeed);
      this.pvy = clamp(this.pvy + ay * PLAYER.acc * dt, -PLAYER.maxSpeed, PLAYER.maxSpeed);
      const fr = Math.pow(PLAYER.friction, f60);
      if (!ax) this.pvx *= fr;
      if (!ay) this.pvy *= fr;
    }
    // 블랙홀 중력: 기체도 서서히 끌린다
    const grav = this.boss?.entered ? this.boss.def.gravity : undefined;
    if (grav && this.boss && this.alive) {
      const dx = this.boss.x - this.px;
      const dy = this.boss.y - this.py;
      const L = Math.hypot(dx, dy);
      if (L < grav.radius && L > 1) {
        const f = grav.playerPull * (1 - L / grav.radius);
        this.pvx += (dx / L) * f * dt * 6;
        this.pvy += (dy / L) * f * dt * 6;
      }
    }
    this.px = clamp(this.px + this.pvx * dt, PLAYER.minX, PLAYER.maxX);
    this.py = clamp(this.py + this.pvy * dt, PLAYER.minY, PLAYER.maxY);

    this.fireCd -= dt;
    const wantFire = this.touchOn || this.keyMap?.space?.isDown || this.keyMap?.z?.isDown;
    if (wantFire && this.fireCd <= 0) {
      this.playerFire();
      this.fireCd = cooldownFor(this.session.cur, weaponLevel(this.session));
    }
    if (this.inv > 0 && !this.sp) this.inv -= dt;

    // 후방무기 (피드백 4 — 무기 체계 확장)
    const rear = this.session.rear ? DATA.equipment.rear[this.session.rear] : undefined;
    if (rear && this.alive) {
      this.rearCd -= dt;
      if (this.rearCd <= 0) {
        this.rearCd = rear.fireEvery;
        if (rear.kind === 'tail') {
          for (const off of [-6, 6])
            this.spawnPlayerBullet(this.px + off, this.py + 16, rnd(-25, 25), 520, 1.6, 'b-vulcan');
        } else if (rear.kind === 'side') {
          this.spawnPlayerBullet(this.px - 12, this.py, -430, 0, 2.2, 'b-light');
          this.spawnPlayerBullet(this.px + 12, this.py, 430, 0, 2.2, 'b-light');
        } else {
          this.spawnPlayerBullet(this.px, this.py + 12, rnd(-40, 40), 240, 4.5, 'b-proton', true);
        }
      }
    }
    // 사이드킥
    const side = this.session.sidekick ? DATA.equipment.sidekick[this.session.sidekick] : undefined;
    if (side && this.alive) {
      this.sideCd -= dt;
      if (this.podL && this.podR) {
        this.podL.setPosition(this.px - 26, this.py + 8);
        this.podR.setPosition(this.px + 26, this.py + 8);
        if (this.sideCd <= 0) {
          this.sideCd = side.fireEvery;
          this.spawnPlayerBullet(this.px - 26, this.py - 4, 0, -640, 1.4, 'b-pulse');
          this.spawnPlayerBullet(this.px + 26, this.py - 4, 0, -640, 1.4, 'b-pulse');
        }
      } else if (this.satellite) {
        this.satAng += dt * 2.6;
        const sx = this.px + Math.cos(this.satAng) * 44;
        const sy = this.py + Math.sin(this.satAng) * 44;
        this.satellite.setPosition(sx, sy);
        if (this.sideCd <= 0) {
          this.sideCd = side.fireEvery;
          const tgt = this.nearestTarget(sx, sy);
          if (tgt) {
            const L = Math.hypot(tgt.x - sx, tgt.y - sy) || 1;
            this.spawnPlayerBullet(
              sx,
              sy,
              ((tgt.x - sx) / L) * 480,
              ((tgt.y - sy) / L) * 480,
              3,
              'b-proton',
            );
          }
        }
      }
    }
    // 엔진 궤적 파티클
    this.thrustT += dt;
    if (this.thrustT > 0.028 && this.playerImg.visible) {
      this.thrustT = 0;
      const s = this.fxPool.get('spark-cyan', this.px + rnd(-3, 3), this.py + 18);
      s.setDepth(DEPTH.player - 0.6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.9)
        .setScale(rnd(0.8, 1.6));
      this.sparks.push({ img: s, vx: rnd(-10, 10), vy: rnd(120, 190), t: 0.15 });
    }
    this.regenT += dt;
    if (this.regenT > PLAYER.shieldRegenDelay && this.session.shield < this.session.shieldMax) {
      this.session.shield = Math.min(
        this.session.shieldMax,
        this.session.shield + PLAYER.shieldRegenRate * dt,
      );
    }

    // 렌더 반영
    this.playerImg.setPosition(Math.round(this.px), Math.round(this.py));
    this.playerImg.setRotation(clamp(this.pvx * 0.0007, -0.15, 0.15));
    // 뱅킹 연출: 좌우 속도에 비례한 가로 스쿼시
    this.playerImg.setScale(1 - Math.min(0.18, Math.abs(this.pvx) / 1500), 1);
    this.playerImg.setVisible(
      !(this.inv > 0 && !this.sp && Math.floor(this.worldT * 20) % 2 === 1),
    );
    this.flameImg.setPosition(Math.round(this.px), Math.round(this.py) + 17);
    this.flameImg.setScale(1, 1 + Math.sin(this.worldT * 40) * 0.25);
    this.flameImg.setVisible(this.playerImg.visible);
    if (this.sp) this.auraImg.setPosition(this.px, this.py);
  }

  private updateWaves(dt: number): void {
    // 보스 격파~상점/완료 전환 대기 중에는 웨이브 진행 금지
    // (슈퍼 진행으로 전환이 보류된 동안 다음 레벨 웨이브가 오염 스폰되는 것 방지)
    if (this.pendingShop > 0) return;
    this.waveT += dt;
    for (let i = this.spawnQ.length - 1; i >= 0; i--) {
      const ev = this.spawnQ[i];
      if (ev && ev.t <= this.waveT) {
        this.spawnFromEvent(ev);
        this.spawnQ.splice(i, 1);
      }
    }
    if (!this.boss && this.spawnQ.length === 0 && this.enemies.length === 0 && this.alive) {
      if (this.waveClearT < 0) this.waveClearT = this.waveT + DATA.levels.clearDelay;
      if (this.waveT > this.waveClearT) this.nextWave();
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.t += dt;
      if (b.homing) {
        const gh = this.boss?.entered ? this.boss.def.gravity : undefined;
        if (gh && this.boss) {
          const dx = this.boss.x - b.x;
          const dy = this.boss.y - b.y;
          const L = Math.hypot(dx, dy);
          if (L < gh.radius && L > 1) {
            const f = gh.pull * (1 - L / gh.radius);
            b.vx += (dx / L) * f * dt;
            b.vy += (dy / L) * f * dt;
          }
        }
        const tgt = this.nearestTarget(b.x, b.y);
        if (tgt) {
          const L = Math.hypot(tgt.x - b.x, tgt.y - b.y) || 1;
          const want = 430;
          b.vx += ((tgt.x - b.x) / L) * want * 3.2 * dt;
          b.vy += ((tgt.y - b.y) / L) * want * 3.2 * dt;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          b.vx = (b.vx / sp) * Math.min(sp, want);
          b.vy = (b.vy / sp) * Math.min(sp, want);
          b.img.setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      } else if (b.x0 !== undefined) {
        b.y += b.vy * dt;
        b.x = b.x0 + Math.sin(b.t * 22 + (b.ph ?? 0)) * 8;
      } else {
        // 블랙홀 중력: 탄이 보스 쪽으로 끌린다 (탄을 빨아들이는 기믹)
        const g = this.boss?.entered ? this.boss.def.gravity : undefined;
        if (g && this.boss) {
          const dx = this.boss.x - b.x;
          const dy = this.boss.y - b.y;
          const L = Math.hypot(dx, dy);
          if (L < g.radius && L > 1) {
            const f = g.pull * (1 - L / g.radius);
            b.vx += (dx / L) * f * dt;
            b.vy += (dy / L) * f * dt;
          }
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      b.img.setPosition(b.x, b.y);
      if (b.y < -30 || b.y > GAME_HEIGHT + 30 || b.x < -30 || b.x > GAME_WIDTH + 30) {
        this.pool.release(b.img);
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateEBullets(dt: number): void {
    const eb = DATA.enemies.ebullet;
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (!b) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.img.setPosition(b.x, b.y);
      if (b.y > GAME_HEIGHT + 25 || b.y < -25 || b.x < -25 || b.x > GAME_WIDTH + 25) {
        this.pool.release(b.img);
        this.ebullets.splice(i, 1);
        continue;
      }
      if (
        this.alive &&
        aabb(b.x, b.y, b.size, b.size, this.px, this.py, PLAYER.hitW, PLAYER.hitH)
      ) {
        this.pool.release(b.img);
        this.ebullets.splice(i, 1);
        this.damagePlayer(b.big ? eb.bigDamage : eb.smallDamage);
      }
    }
  }

  private updateEnemies(dt: number): void {
    const w = this.session.wave;
    const hb = DATA.enemies.hitbox;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;
      e.t += dt;
      if (e.hcd > 0) e.hcd -= dt;
      const def = e.def;
      if (def.behavior === 'sineDescend') {
        const p = def.params;
        e.y += (e.spd ?? 0) * dt;
        e.x = (e.bx ?? e.x) + Math.sin(e.t * (e.f ?? 2)) * (e.amp ?? 0);
        if (w >= p.fireFromWave && Math.random() < p.fireChancePerSec * dt && this.alive) {
          if (p.fireMode === 'spread3') {
            for (const off of [-0.35, 0, 0.35])
              this.eFireAngle(e.x, e.y + 10, Math.PI / 2 + off, p.bulletSpeed);
            SFX.eshoot();
          } else {
            this.eFire(e.x, e.y + 10, p.bulletSpeed);
          }
        }
      } else if (def.behavior === 'turret') {
        const p = def.params;
        if (e.y < (e.holdY ?? 0)) e.y += (e.spd ?? 0) * dt;
        else {
          e.x += (e.drift ?? 0) * dt;
          e.life = (e.life ?? 0) - dt;
          e.cool = (e.cool ?? 0) - dt;
          if (e.x < p.driftBoundX || e.x > GAME_WIDTH - p.driftBoundX) e.drift = -(e.drift ?? 0);
          if ((e.cool ?? 0) <= 0 && this.alive) {
            this.eFire(e.x, e.y + 13, p.bulletSpeedBase + w * p.bulletSpeedPerWave);
            e.cool =
              rnd(p.fireCoolMin, p.fireCoolMax) -
              Math.min(p.coolReduceMax, w * p.coolReducePerWave);
          }
          if ((e.life ?? 0) <= 0) e.y += p.leaveSpd * dt;
        }
      } else if (def.behavior === 'diver') {
        const p = def.params;
        e.vx =
          (e.vx ?? 0) + clamp(this.px - e.x, -p.homingClamp, p.homingClamp) * p.homingGain * dt;
        e.x += (e.vx ?? 0) * dt;
        e.y += (e.spd ?? 0) * dt;
      } else if (def.behavior === 'strafer') {
        const p = def.params;
        e.x += (e.dir ?? 1) * p.speedX * dt;
        e.y = (e.baseY ?? e.y) + Math.sin(e.t * p.swayFreq) * p.swayAmp;
        e.fireT = (e.fireT ?? 0) - dt;
        if ((e.fireT ?? 0) <= 0 && this.alive) {
          this.eFire(e.x, e.y + 10, p.bulletSpeed);
          e.fireT = p.fireEvery;
        }
      } else {
        // orbiter: 하강 후 중심점 주위를 공전하며 링 사격
        const p = def.params;
        if ((e.cy ?? 0) < (e.holdY ?? 0)) {
          e.cy = (e.cy ?? 0) + p.descendSpd * dt;
          e.y = e.cy ?? e.y;
          e.x = e.cx ?? e.x;
        } else {
          e.cy = (e.cy ?? 0) + p.centerDriftY * dt;
          e.ang = (e.ang ?? 0) + p.orbitSpeed * dt;
          e.rr = Math.min(p.orbitRadius, (e.rr ?? 0) + p.orbitRadius * 2.2 * dt);
          e.x = (e.cx ?? e.x) + Math.cos(e.ang ?? 0) * (e.rr ?? 0);
          e.y = (e.cy ?? e.y) + Math.sin(e.ang ?? 0) * (e.rr ?? 0);
          e.life = (e.life ?? p.life) - dt;
          e.fireT = (e.fireT ?? 0) - dt;
          if ((e.fireT ?? 0) <= 0 && this.alive) {
            for (let k = 0; k < p.ringCount; k++)
              this.eFireAngle(e.x, e.y, (k / p.ringCount) * Math.PI * 2, p.bulletSpeed);
            SFX.eshoot();
            e.fireT = p.fireEvery;
          }
          if ((e.life ?? 0) <= 0) e.cy = (e.cy ?? 0) + 90 * dt;
        }
      }
      e.img.setPosition(e.x, e.y);
      // 움직임 주스: 이동 방향에 따른 기울기
      if (def.behavior === 'diver') {
        e.img.setRotation(clamp((e.vx ?? 0) * 0.0016, -0.45, 0.45));
      } else if (def.behavior === 'sineDescend') {
        e.img.setRotation(Math.cos(e.t * (e.f ?? 2)) * (e.amp ?? 0) * 0.003);
      } else if (def.behavior === 'strafer') {
        e.img.setRotation((e.dir ?? 1) * 0.18);
      }
      // 피격 화이트 플래시
      if (e.flashT > 0) {
        e.flashT -= dt;
        e.img.setTintFill(0xffffff);
        if (e.flashT <= 0) e.img.clearTint();
      }

      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (!b) continue;
        if (aabb(b.x, b.y, b.w, b.h, e.x, e.y, hb.w, hb.h)) {
          // 관통탄은 겹친 프레임마다 히트하므로 60fps 기준으로 정규화
          e.hp -= b.pierce > 0 ? b.dmg * Math.min(3, dt * 60) : b.dmg;
          e.flashT = 0.05;
          if (b.pierce > 0) b.pierce--;
          else {
            this.pool.release(b.img);
            this.bullets.splice(j, 1);
          }
          if (e.hp <= 0) {
            this.killEnemy(e);
            break;
          }
        }
      }
      if (e.dead) {
        this.pool.release(e.img);
        this.enemies.splice(i, 1);
        continue;
      }
      if (
        this.alive &&
        aabb(e.x, e.y, hb.w - 4, hb.h - 4, this.px, this.py, PLAYER.hitW, PLAYER.hitH)
      ) {
        this.killEnemy(e);
        this.pool.release(e.img);
        this.enemies.splice(i, 1);
        this.damagePlayer(PLAYER.collideDamage);
        continue;
      }
      if (e.y > GAME_HEIGHT + 40 || e.x < -50 || e.x > GAME_WIDTH + 50) {
        this.pool.release(e.img);
        this.enemies.splice(i, 1);
      }
    }
  }

  private updateBoss(dt: number): void {
    const B = this.boss;
    if (!B) return;
    const def = B.def;
    B.t += dt;
    if (B.hcd > 0) B.hcd -= dt;
    if (!B.entered) {
      B.y += def.entrySpd * dt;
      if (B.y >= def.entryY) {
        B.entered = true;
        B.cx = B.x;
      }
    } else {
      const mv = def.movement;
      if (mv.type === 'patrol') {
        B.x += B.dir * (mv.base + this.session.wave * mv.perWave) * dt;
        if (B.x < mv.minX) {
          B.x = mv.minX;
          B.dir = 1;
        }
        if (B.x > mv.maxX) {
          B.x = mv.maxX;
          B.dir = -1;
        }
      } else if (mv.type === 'wander') {
        const dx = B.wanderTx - B.x;
        const dy = B.wanderTy - B.y;
        const L = Math.hypot(dx, dy);
        if (L < 8) {
          B.wanderTx = rnd(mv.minX, mv.maxX);
          B.wanderTy = rnd(mv.minY, mv.maxY);
        } else {
          B.x += (dx / L) * mv.speed * dt;
          B.y += (dy / L) * mv.speed * dt;
        }
      } else {
        B.x = B.cx + Math.sin(B.t * mv.freq * Math.PI * 2) * mv.amp;
        B.y = def.entryY + Math.sin(B.t * mv.bobFreq * Math.PI * 2) * mv.bobAmp;
      }
      B.cool -= dt;
      if (B.cool <= 0 && this.alive) {
        B.phase = (B.phase + 1) % def.phases.length;
        const ph = def.phases[B.phase];
        if (ph) {
          this.executeBossPhase(ph);
          B.cool =
            ph.cool ?? Math.max(def.cool.min, def.cool.base + this.session.wave * def.cool.perWave);
        }
      }
    }
    B.img.setPosition(B.x, B.y);
    B.img.setScale(1 + Math.sin(B.t * 2.4) * 0.02);
    // 파츠: 앵커 추적 + 자체 사격
    for (const part of B.parts) {
      if (!part.alive) continue;
      part.img.setPosition(B.x + part.def.dx, B.y + part.def.dy);
      if (part.flashT > 0) {
        part.flashT -= dt;
        part.img.setTintFill(0xffffff);
        if (part.flashT <= 0) part.img.clearTint();
      }
      if (part.def.phase && B.entered && this.alive) {
        part.fireT -= dt;
        if (part.fireT <= 0) {
          part.fireT = part.def.fireEvery ?? 2;
          this.executePartPhase(part, B);
        }
      }
    }
    // 코어 글로우 펄스
    B.glow.setPosition(B.x, B.y + 2);
    B.glow.setAlpha(0.45 + Math.sin(B.t * 4) * 0.2).setScale(1.15 + Math.sin(B.t * 4) * 0.08);
    if (B.flashT > 0) {
      B.flashT -= dt;
      B.img.setTintFill(0xffffff);
      if (B.flashT <= 0) B.img.clearTint();
    }

    for (let j = this.bullets.length - 1; j >= 0; j--) {
      const b = this.bullets[j];
      if (!b) continue;
      // 파츠 히트 우선
      let hitPart: BossPart | null = null;
      for (const part of B.parts) {
        if (!part.alive) continue;
        if (
          aabb(
            b.x,
            b.y,
            b.w,
            b.h,
            B.x + part.def.dx,
            B.y + part.def.dy,
            part.def.hitbox.w,
            part.def.hitbox.h,
          )
        ) {
          hitPart = part;
          break;
        }
      }
      if (hitPart) {
        const dmg = b.pierce > 0 ? b.dmg * Math.min(3, dt * 60) : b.dmg;
        if (b.pierce > 0) b.pierce--;
        else {
          this.pool.release(b.img);
          this.bullets.splice(j, 1);
        }
        this.damagePart(hitPart, B, dmg);
        continue;
      }
      if (aabb(b.x, b.y, b.w, b.h, B.x, B.y, def.hitbox.w, def.hitbox.h)) {
        const shielded = this.coreShielded(B);
        const dmg = b.pierce > 0 ? b.dmg * Math.min(3, dt * 60) : b.dmg;
        if (b.pierce > 0) b.pierce--;
        else {
          this.pool.release(b.img);
          this.bullets.splice(j, 1);
        }
        if (shielded) {
          // 실드 파츠가 남아 있으면 코어 무적 — 약점 연출
          if (Math.random() < 0.2)
            this.addFloatText(b.x, B.y + def.hitbox.h / 2 + 12, 'IMMUNE', '#8a93b0');
        } else {
          B.flashT = 0.05;
          this.damageBoss(dmg);
        }
        if (!this.boss) return;
      }
    }
    if (
      this.boss &&
      this.alive &&
      aabb(B.x, B.y, def.hitbox.w - 7, def.hitbox.h - 7, this.px, this.py, PLAYER.hitW, PLAYER.hitH)
    )
      this.damagePlayer(def.touchDamage);
  }

  private updateOrbs(dt: number): void {
    const orb = DATA.enemies.orb;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!o) continue;
      o.t += dt;
      o.y += o.vy * dt;
      const dx = this.px - o.x;
      const dy = this.py - o.y;
      const L = Math.hypot(dx, dy);
      if (this.alive && L < orb.magnetRadius && L > 0.001) {
        o.x += (dx / L) * orb.magnetPull * dt;
        o.y += (dy / L) * orb.magnetPull * dt;
      }
      const yy = o.y + Math.sin(o.t * 5) * 2;
      const pulse = 1 + Math.sin(o.t * 6) * 0.14;
      o.img.setPosition(o.x, yy).setScale(pulse);
      o.glow.setPosition(o.x, yy).setScale(pulse);
      if (
        this.alive &&
        aabb(o.x, o.y, 16, 16, this.px, this.py, PLAYER.hitW + 7, PLAYER.hitH + 8)
      ) {
        this.pool.release(o.img);
        this.pool.release(o.glow);
        this.orbs.splice(i, 1);
        SFX.pow();
        if (o.type === 'P') {
          if (weaponLevel(this.session) < DATA.weapons.maxLevel) {
            this.session.weapons[this.session.cur] = weaponLevel(this.session) + 1;
            this.addFloatText(this.px, this.py - 21, t('game.powerup'), '#8aff8a');
          } else {
            this.session.score += orb.maxPowerBonusScore;
            this.session.credits += Math.round(
              orb.maxPowerBonusScore * DATA.shop.creditRate * this.diff.credit,
            );
            this.addFloatText(this.px, this.py - 21, `+${orb.maxPowerBonusScore}`, '#8aff8a');
          }
        } else {
          this.session.shield = this.session.shieldMax;
          this.session.armor = Math.min(
            this.session.armorMax,
            this.session.armor + orb.shieldArmorBonus,
          );
          this.addFloatText(this.px, this.py - 21, t('game.shield'), '#7ecbff');
        }
        continue;
      }
      if (o.y > GAME_HEIGHT + 21) {
        this.pool.release(o.img);
        this.pool.release(o.glow);
        this.orbs.splice(i, 1);
      }
    }
  }

  /** 티리안식 대형 지형 구조물 — 테마별 프롭이 스크롤을 따라 흘러간다 */
  private updateProps(dt: number): void {
    this.propT += dt;
    if (this.propT >= this.nextPropAt) {
      this.propT = 0;
      this.nextPropAt = 7 + Math.random() * 6;
      const table: Record<string, string[]> = {
        nebula: ['prop-crystal'],
        protostar: ['prop-emberrock'],
        mainseq: ['prop-emberrock', 'prop-rock'],
        asteroids: ['prop-rock'],
        redgiant: ['prop-emberrock'],
        supernova: ['prop-rock'],
        blackhole: ['prop-derelict'],
      };
      const keys = table[this.level.background.theme] ?? ['prop-rock'];
      const key = keys[Math.floor(Math.random() * keys.length)] ?? 'prop-rock';
      const img = this.add
        .image(rnd(45, GAME_WIDTH - 45), -90, key)
        .setDepth(DEPTH.bg + 0.8)
        .setAlpha(0.88)
        .setScale(rnd(0.65, 1.25))
        .setRotation(rnd(0, 6.28));
      this.props.push({ img, rot: rnd(-0.25, 0.25) });
    }
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      if (!pr) continue;
      pr.img.y += this.scrollSpd * 1.15 * dt;
      pr.img.rotation += pr.rot * dt;
      if (pr.img.y > GAME_HEIGHT + 100) {
        pr.img.destroy();
        this.props.splice(i, 1);
      }
    }
  }

  private updateFx(dt: number): void {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const bm = this.booms[i];
      if (!bm) continue;
      bm.t += dt * 2.4;
      const p = clamp(bm.t, 0, 1);
      const r = (5 + 41 * p) * bm.scale;
      bm.img.setScale((r * 2) / 64).setAlpha(1 - p);
      // 링은 파이어볼보다 빠르게 확장하며 사라진다
      bm.ring.setScale((r * 3.1) / 64).setAlpha((1 - p) * 0.8);
      if (bm.t >= 1) {
        this.fxPool.release(bm.img);
        this.fxPool.release(bm.ring);
        this.booms.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.t += dt;
      f.img.setAlpha(1 - f.t / 0.07).setScale(1 + f.t * 8);
      if (f.t >= 0.07) {
        this.fxPool.release(f.img);
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      if (!s) continue;
      s.t += dt * 2.4;
      s.img.setPosition(s.img.x + s.vx * dt, s.img.y + s.vy * dt).setAlpha(1 - clamp(s.t, 0, 1));
      if (s.t >= 1) {
        this.fxPool.release(s.img);
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      if (!tx) continue;
      tx.t += dt;
      tx.obj.setY(tx.obj.y - 32 * dt).setAlpha(1 - tx.t / 0.9);
      if (tx.t > 0.9) {
        tx.obj.setVisible(false);
        this.textPool.push(tx.obj);
        this.texts.splice(i, 1);
      }
    }
  }

  private updateHud(): void {
    const s = this.session;
    const wpn = DATA.weapons.weapons[s.cur];
    this.hudShieldBar.setScale(clamp(s.shield / s.shieldMax, 0, 1), 1);
    this.hudArmorBar.setScale(clamp(s.armor / s.armorMax, 0, 1), 1);
    this.hudWpn.setText(wpn?.short ?? s.cur);
    const lvl = weaponLevel(s);
    this.hudPips.forEach((p, i) => p.setFillStyle(i < lvl ? 0x8aff8a : 0x37543f));
    this.hudWaveT.setText(t('hud.wave', s.wave));
    this.hudScore.setText(String(s.score).padStart(7, '0'));
    this.hudCredits.setText(t('hud.credits', s.credits));
    // 하단 탄막을 가리지 않게 반투명 유지, 사용 가능 시 펄스
    if (s.superN > 0) {
      this.superBtn.setAlpha(0.66).setScale(1 + Math.sin(this.worldT * 4.5) * 0.05);
    } else {
      this.superBtn.setAlpha(0.28).setScale(1);
    }
    this.superCount.setText(`x${s.superN}`);
    const B = this.boss;
    if (B) this.bossBar.setScale(clamp(B.hp / B.hpMax, 0, 1), 1);
  }
}
