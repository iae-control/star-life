// 메인 게임플레이 — v4 데모의 update()/draw()를 Phaser로 이식.
// 순수 로직(무기 패턴·웨이브·데미지)은 src/game/logic/*, 여기는 씬 글루와 렌더.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { BOSS, EBULLET, ENEMY, ORB, PLAYER, SCROLL, SUPER, WEAPONS } from '../game/logic/balance';
import { aabb, applyDamage } from '../game/logic/damage';
import { firePattern, type ShotSpec } from '../game/logic/weapons';
import { buildWave, type SpawnEvent } from '../game/logic/waves';
import { newSession, saveBest, weaponLevel, type GameSession } from '../game/session';
import { ImagePool } from '../systems/Pool';
import { audioResume, isMuted, SFX, toggleMute } from '../systems/Sfx';
import { uiText } from '../ui/text';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = Phaser.Math.Clamp;

interface Bullet extends ShotSpec {
  t: number;
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
  type: 'e1' | 'e2' | 'e3';
  x: number;
  y: number;
  t: number;
  hp: number;
  hcd: number;
  dead: boolean;
  score: number;
  // e1
  spd?: number;
  amp?: number;
  f?: number;
  bx?: number;
  // e2
  holdY?: number;
  cool?: number;
  life?: number;
  drift?: number;
  // e3
  vx?: number;
  img: Phaser.GameObjects.Image;
}
interface BossState {
  x: number;
  y: number;
  t: number;
  hp: number;
  hpMax: number;
  phase: number;
  cool: number;
  hcd: number;
  dir: number;
  img: Phaser.GameObjects.Image;
}
interface Boom {
  x: number;
  y: number;
  t: number;
  scale: number;
  img: Phaser.GameObjects.Image;
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
};

export class GameScene extends Phaser.Scene {
  private session!: GameSession;

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
  private bg!: Phaser.GameObjects.TileSprite;
  private scrollSpd = 45;
  private shake = 0;
  private worldT = 0;

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

  // 개발용
  private auto = false;
  private god = false;
  private autoSuperT = 0;
  private fpsTitleT = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  create(data?: { session?: GameSession }): void {
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

    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search);
      this.auto = q.get('auto') === '1';
      this.god = this.auto || q.get('god') === '1';
    }

    this.px = PLAYER.startX;
    this.py = PLAYER.startY;
    this.pvx = 0;
    this.pvy = 0;

    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-tiles')
      .setOrigin(0, 0)
      .setAlpha(0.6)
      .setDepth(DEPTH.bg);
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020412, 0.38)
      .setOrigin(0, 0)
      .setDepth(DEPTH.bg + 0.5);

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

    this.createHud();
    this.createBubble();
    this.setupInput();

    this.nextWave();
  }

  /* ---------- HUD ---------- */
  private createHud(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, 30, 0x040814, 0.66).setOrigin(0, 0).setDepth(DEPTH.hud);
    this.add.rectangle(0, 30, GAME_WIDTH, 1, 0x78b4ff, 0.25).setOrigin(0, 0).setDepth(DEPTH.hud);

    uiText(this, 7, 9, 'SHD', 9, '#7ecbff').setDepth(DEPTH.hud + 1);
    this.add.rectangle(33, 5, 72, 8, 0x000000, 0.55).setOrigin(0, 0).setDepth(DEPTH.hud);
    this.hudShieldBar = this.add
      .rectangle(34, 6, 70, 6, 0x5ab4ec)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1);
    uiText(this, 7, 22, 'ARM', 9, '#ffd18a').setDepth(DEPTH.hud + 1);
    this.add.rectangle(33, 17, 72, 8, 0x000000, 0.55).setOrigin(0, 0).setDepth(DEPTH.hud);
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
    // 터치용 일시정지 버튼 (히트 존은 setupInput의 pointerdown에서 처리)
    uiText(this, 244, 15, 'II', 12, '#8fa0c8', 'center').setDepth(DEPTH.hud + 1);
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
    const g = this.add.graphics();
    g.fillStyle(0x2a1a5f, 1);
    g.fillCircle(0, 0, 24);
    g.lineStyle(1.5, 0x8f7aff, 1);
    g.strokeCircle(0, 0, 24);
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
        fontFamily: '"Courier New", monospace',
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
      kb.on('keydown-M', () => this.hudMute.setVisible(toggleMute()));
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
      if (p.worldY < 30 && p.worldX > 226 && p.worldX < 262) {
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
    this.session.wave++;
    this.banner(`WAVE ${this.session.wave}`, 1.6, '#e8ecff');
    this.scrollSpd = SCROLL.base(this.session.wave);
    this.spawnQ = buildWave(this.session.wave);
    this.waveT = 0;
    this.waveClearT = -1;
  }

  private banner(msg: string, dur: number, color: string): void {
    this.bannerText.setText(msg).setColor(color).setVisible(true).setAlpha(1);
    this.bannerT = dur;
  }

  /* ---------- 스폰 ---------- */
  private spawnFromEvent(ev: SpawnEvent): void {
    if (ev.kind === 'boss') {
      this.spawnBoss();
      return;
    }
    const base: Omit<Enemy, 'img' | 'score'> = {
      type: ev.kind,
      x: ev.x,
      y: ENEMY.spawnY,
      t: 0,
      hp: 1,
      hcd: 0,
      dead: false,
    };
    const w = this.session.wave;
    let e: Enemy;
    if (ev.kind === 'e1') {
      e = {
        ...base,
        score: ENEMY.e1.score,
        hp: ENEMY.e1.hp(w),
        spd: rnd(ENEMY.e1.spdMin, ENEMY.e1.spdMax) + w * ENEMY.e1.spdPerWave,
        amp: ev.amp,
        f: rnd(ENEMY.e1.freqMin, ENEMY.e1.freqMax),
        bx: ev.x,
        img: this.pool.get('ship-e1', ev.x, ENEMY.spawnY),
      };
    } else if (ev.kind === 'e2') {
      e = {
        ...base,
        score: ENEMY.e2.score,
        hp: ENEMY.e2.hp(w),
        spd: ENEMY.e2.spd,
        holdY: rnd(ENEMY.e2.holdYMin, ENEMY.e2.holdYMax),
        cool: rnd(ENEMY.e2.coolMin, ENEMY.e2.coolMax),
        life: ENEMY.e2.life,
        drift: rnd(-ENEMY.e2.driftMax, ENEMY.e2.driftMax),
        img: this.pool.get('ship-e2', ev.x, ENEMY.spawnY),
      };
    } else {
      e = {
        ...base,
        score: ENEMY.e3.score,
        hp: ENEMY.e3.hp(w),
        spd: ENEMY.e3.spd(w),
        vx: ev.vx,
        y: ev.y,
        img: this.pool.get('ship-e3', ev.x, ev.y),
      };
    }
    e.img.setDepth(DEPTH.enemy);
    this.enemies.push(e);
  }

  private spawnBoss(): void {
    const w = this.session.wave;
    const hp = BOSS.hp(w);
    const img = this.pool.get('ship-e2', GAME_WIDTH / 2, -80);
    img.setDepth(DEPTH.enemy).setScale(2.4);
    this.boss = {
      x: GAME_WIDTH / 2,
      y: -80,
      t: 0,
      hp,
      hpMax: hp,
      phase: 0,
      cool: 1.2,
      hcd: 0,
      dir: 1,
      img,
    };
    this.banner('!! WARNING !!', 2.2, '#ff6a6a');
    SFX.warn();
    this.scrollSpd = SCROLL.boss;
    this.bossBar.setVisible(true);
    this.bossLabel.setVisible(true);
  }

  /* ---------- 발사/피해 ---------- */
  private playerFire(): void {
    const level = weaponLevel(this.session);
    this.vseq = (this.vseq + 1) % 3;
    const shots = firePattern(this.session.cur, level, this.px, this.py, this.vseq);
    for (const s of shots) {
      const img = this.pool.get(`b-${s.kind}`, s.x, s.y);
      img.setDepth(DEPTH.bullet);
      if (s.kind === 'laser' || s.kind === 'pulse') img.setBlendMode(Phaser.BlendModes.ADD);
      this.bullets.push({ ...s, t: 0, img });
    }
    SFX.shoot[this.session.cur]();
  }

  private eFire(x: number, y: number, spd: number, big = false): void {
    const dx = this.px - x;
    const dy = this.py - y;
    const L = Math.hypot(dx, dy) || 1;
    const img = this.pool.get(big ? 'eb-big' : 'eb-small', x, y);
    img.setDepth(DEPTH.ebullet);
    this.ebullets.push({
      x,
      y,
      vx: (dx / L) * spd,
      vy: (dy / L) * spd,
      big,
      size: big ? EBULLET.bigSize : EBULLET.smallSize,
      img,
    });
    SFX.eshoot();
  }

  private bossFan(): void {
    const B = this.boss;
    if (!B) return;
    for (let k = -3; k <= 3; k++) {
      const ang = Math.PI / 2 + k * BOSS.fanAngleStep;
      const img = this.pool.get('eb-small', B.x, B.y + 27);
      img.setDepth(DEPTH.ebullet);
      this.ebullets.push({
        x: B.x,
        y: B.y + 27,
        vx: Math.cos(ang) * BOSS.fanSpeed,
        vy: Math.sin(ang) * BOSS.fanSpeed,
        big: false,
        size: EBULLET.fanSize,
        img,
      });
    }
    SFX.eshoot();
  }

  private damagePlayer(d: number): void {
    if (!this.alive || this.inv > 0 || this.god) return;
    this.regenT = 0;
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
      this.deathT = 1.4;
    }
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.session.kills++;
    this.session.score += e.score;
    this.session.credits += e.score;
    this.addBoom(e.x, e.y, 1.3, false);
    this.addFloatText(e.x, e.y, `+${e.score}`, '#ffd76a');
    if (Math.random() < ENEMY.orbChance || (e.type === 'e2' && Math.random() < ENEMY.orbChanceE2))
      this.dropOrb(e.x, e.y);
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
      this.session.score += BOSS.killScore;
      this.session.credits += BOSS.killScore;
      this.addFloatText(bx, by, `+${BOSS.killScore}`, '#7ef7ff');
      this.pool.release(B.img);
      this.boss = null;
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
      this.scrollSpd = SCROLL.base(this.session.wave);
      this.pendingShop = BOSS.shopDelay;
    }
  }

  /* ---------- 이펙트/드랍 ---------- */
  private addBoom(x: number, y: number, scale: number, big: boolean): void {
    const img = this.fxPool.get('boom', x, y);
    img
      .setDepth(DEPTH.boom)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.1 * scale);
    this.booms.push({ x, y, t: 0, scale, img });
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
    const type = forceS || this.session.orbCount % ORB.everyNthIsShield === 0 ? 'S' : 'P';
    const img = this.pool.get(`orb-${type}`, x, y);
    img.setDepth(DEPTH.orb);
    const glow = this.pool.get('orb-glow', x, y);
    glow.setDepth(DEPTH.orb - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.orbs.push({ x, y, vy: ORB.fallSpeed, t: 0, type, img, glow });
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
      // 러시 동안 적탄 소거
      for (const b of this.ebullets) this.pool.release(b.img);
      this.ebullets.length = 0;
    }
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
          aabb(q.x, q.y, SUPER.phantomHitW, SUPER.phantomHitH, e.x, e.y, ENEMY.hitW, ENEMY.hitH)
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
        aabb(q.x, q.y, SUPER.phantomHitW, SUPER.phantomHitH, B.x, B.y, BOSS.hitW, BOSS.hitH)
      ) {
        B.hcd = BOSS.hitCooldown;
        this.damageBoss(SUPER.phantomBossDamage);
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

    this.bg.tilePositionY -= this.scrollSpd * dt;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.bannerText.setAlpha(Math.min(1, this.bannerT * 2));
      if (this.bannerT <= 0) this.bannerText.setVisible(false);
    }
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
        this.scene.start(SceneKeys.Shop, { session: this.session });
        return;
      }
    }
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        saveBest(this.session.score);
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
    this.px = clamp(this.px + this.pvx * dt, PLAYER.minX, PLAYER.maxX);
    this.py = clamp(this.py + this.pvy * dt, PLAYER.minY, PLAYER.maxY);

    this.fireCd -= dt;
    const wantFire = this.touchOn || this.keyMap?.space?.isDown || this.keyMap?.z?.isDown;
    if (wantFire && this.fireCd <= 0) {
      this.playerFire();
      this.fireCd = WEAPONS[this.session.cur].cd(weaponLevel(this.session));
    }
    if (this.inv > 0 && !this.sp) this.inv -= dt;
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
    this.playerImg.setVisible(
      !(this.inv > 0 && !this.sp && Math.floor(this.worldT * 20) % 2 === 1),
    );
    this.flameImg.setPosition(Math.round(this.px), Math.round(this.py) + 17);
    this.flameImg.setScale(1, 1 + Math.sin(this.worldT * 40) * 0.25);
    this.flameImg.setVisible(this.playerImg.visible);
    if (this.sp) this.auraImg.setPosition(this.px, this.py);
  }

  private updateWaves(dt: number): void {
    this.waveT += dt;
    for (let i = this.spawnQ.length - 1; i >= 0; i--) {
      const ev = this.spawnQ[i];
      if (ev && ev.t <= this.waveT) {
        this.spawnFromEvent(ev);
        this.spawnQ.splice(i, 1);
      }
    }
    if (!this.boss && this.spawnQ.length === 0 && this.enemies.length === 0 && this.alive) {
      if (this.waveClearT < 0) this.waveClearT = this.waveT + 1.6;
      if (this.waveT > this.waveClearT) this.nextWave();
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.t += dt;
      if (b.kind === 'light') {
        b.y += b.vy * dt;
        b.x = (b.x0 ?? b.x) + Math.sin(b.t * 22 + (b.ph ?? 0)) * 8;
      } else {
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
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (!b) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.img.setPosition(b.x, b.y);
      const size = b.size;
      if (b.y > GAME_HEIGHT + 25 || b.y < -25 || b.x < -25 || b.x > GAME_WIDTH + 25) {
        this.pool.release(b.img);
        this.ebullets.splice(i, 1);
        continue;
      }
      if (this.alive && aabb(b.x, b.y, size, size, this.px, this.py, PLAYER.hitW, PLAYER.hitH)) {
        this.pool.release(b.img);
        this.ebullets.splice(i, 1);
        this.damagePlayer(b.big ? EBULLET.bigDamage : EBULLET.smallDamage);
      }
    }
  }

  private updateEnemies(dt: number): void {
    const w = this.session.wave;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;
      e.t += dt;
      if (e.hcd > 0) e.hcd -= dt;
      if (e.type === 'e1') {
        e.y += (e.spd ?? 0) * dt;
        e.x = (e.bx ?? e.x) + Math.sin(e.t * (e.f ?? 2)) * (e.amp ?? 0);
        if (
          w >= ENEMY.e1.fireFromWave &&
          Math.random() < ENEMY.e1.fireChancePerSec * dt &&
          this.alive
        )
          this.eFire(e.x, e.y + 10, ENEMY.e1.bulletSpeed);
      } else if (e.type === 'e2') {
        if (e.y < (e.holdY ?? 0)) e.y += (e.spd ?? 0) * dt;
        else {
          e.x += (e.drift ?? 0) * dt;
          e.life = (e.life ?? 0) - dt;
          e.cool = (e.cool ?? 0) - dt;
          if (e.x < ENEMY.e2.driftBoundX || e.x > GAME_WIDTH - ENEMY.e2.driftBoundX)
            e.drift = -(e.drift ?? 0);
          if ((e.cool ?? 0) <= 0 && this.alive) {
            this.eFire(e.x, e.y + 13, ENEMY.e2.bulletSpeed(w));
            e.cool = rnd(1.1, 2.0) - ENEMY.e2.coolReduce(w);
          }
          if ((e.life ?? 0) <= 0) e.y += ENEMY.e2.leaveSpd * dt;
        }
      } else {
        e.vx =
          (e.vx ?? 0) +
          clamp(this.px - e.x, -ENEMY.e3.homingClamp, ENEMY.e3.homingClamp) *
            ENEMY.e3.homingGain *
            dt;
        e.x += (e.vx ?? 0) * dt;
        e.y += (e.spd ?? 0) * dt;
      }
      e.img.setPosition(e.x, e.y);

      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (!b) continue;
        if (aabb(b.x, b.y, b.w, b.h, e.x, e.y, ENEMY.hitW, ENEMY.hitH)) {
          e.hp -= b.dmg;
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
        aabb(e.x, e.y, ENEMY.hitW - 4, ENEMY.hitH - 4, this.px, this.py, PLAYER.hitW, PLAYER.hitH)
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
    B.t += dt;
    if (B.hcd > 0) B.hcd -= dt;
    if (B.y < BOSS.entryY) B.y += BOSS.entrySpd * dt;
    else {
      B.x += B.dir * BOSS.patrolSpd(this.session.wave) * dt;
      if (B.x < BOSS.patrolMinX) {
        B.x = BOSS.patrolMinX;
        B.dir = 1;
      }
      if (B.x > BOSS.patrolMaxX) {
        B.x = BOSS.patrolMaxX;
        B.dir = -1;
      }
      B.cool -= dt;
      if (B.cool <= 0 && this.alive) {
        B.phase = (B.phase + 1) % 3;
        if (B.phase !== 1) this.bossFan();
        else {
          this.eFire(B.x - BOSS.aimedOffsetX, B.y + BOSS.fireOffsetY, BOSS.aimedSpeed, true);
          this.eFire(B.x + BOSS.aimedOffsetX, B.y + BOSS.fireOffsetY, BOSS.aimedSpeed, true);
        }
        B.cool = BOSS.cool(this.session.wave);
      }
    }
    B.img.setPosition(B.x, B.y);

    for (let j = this.bullets.length - 1; j >= 0; j--) {
      const b = this.bullets[j];
      if (!b) continue;
      if (aabb(b.x, b.y, b.w, b.h, B.x, B.y, BOSS.hitW, BOSS.hitH)) {
        if (b.pierce > 0) b.pierce--;
        else {
          this.pool.release(b.img);
          this.bullets.splice(j, 1);
        }
        this.damageBoss(b.dmg);
        if (!this.boss) return;
      }
    }
    if (
      this.boss &&
      this.alive &&
      aabb(B.x, B.y, BOSS.hitW - 7, BOSS.hitH - 7, this.px, this.py, PLAYER.hitW, PLAYER.hitH)
    )
      this.damagePlayer(PLAYER.bossTouchDamage);
  }

  private updateOrbs(dt: number): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!o) continue;
      o.t += dt;
      o.y += o.vy * dt;
      const dx = this.px - o.x;
      const dy = this.py - o.y;
      const L = Math.hypot(dx, dy);
      if (this.alive && L < ORB.magnetRadius && L > 0.001) {
        o.x += (dx / L) * ORB.magnetPull * dt;
        o.y += (dy / L) * ORB.magnetPull * dt;
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
          if (weaponLevel(this.session) < 6) {
            this.session.weapons[this.session.cur] = weaponLevel(this.session) + 1;
            this.addFloatText(this.px, this.py - 21, 'POWER UP!', '#8aff8a');
          } else {
            this.session.score += ORB.maxPowerBonusScore;
            this.session.credits += ORB.maxPowerBonusScore;
            this.addFloatText(this.px, this.py - 21, `+${ORB.maxPowerBonusScore}`, '#8aff8a');
          }
        } else {
          this.session.shield = this.session.shieldMax;
          this.session.armor = Math.min(
            this.session.armorMax,
            this.session.armor + ORB.shieldArmorBonus,
          );
          this.addFloatText(this.px, this.py - 21, 'SHIELD!', '#7ecbff');
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

  private updateFx(dt: number): void {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const bm = this.booms[i];
      if (!bm) continue;
      bm.t += dt * 2.4;
      const p = clamp(bm.t, 0, 1);
      const r = (5 + 41 * p) * bm.scale;
      bm.img.setScale((r * 2) / 64).setAlpha(1 - p);
      if (bm.t >= 1) {
        this.fxPool.release(bm.img);
        this.booms.splice(i, 1);
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
      const t = this.texts[i];
      if (!t) continue;
      t.t += dt;
      t.obj.setY(t.obj.y - 32 * dt).setAlpha(1 - t.t / 0.9);
      if (t.t > 0.9) {
        t.obj.setVisible(false);
        this.textPool.push(t.obj);
        this.texts.splice(i, 1);
      }
    }
  }

  private updateHud(): void {
    const s = this.session;
    this.hudShieldBar.setScale(clamp(s.shield / s.shieldMax, 0, 1), 1);
    this.hudArmorBar.setScale(clamp(s.armor / s.armorMax, 0, 1), 1);
    this.hudWpn.setText(WEAPONS[s.cur].short);
    const lvl = weaponLevel(s);
    this.hudPips.forEach((p, i) => p.setAlpha(i < lvl ? 1 : 0.15));
    this.hudWaveT.setText(`WAVE ${s.wave}`);
    this.hudScore.setText(String(s.score).padStart(7, '0'));
    this.hudCredits.setText(`CR ${s.credits}`);
    this.superBtn.setAlpha(s.superN > 0 ? 0.92 : 0.35);
    this.superCount.setText(`x${s.superN}`);
    const B = this.boss;
    if (B) this.bossBar.setScale(clamp(B.hp / B.hpMax, 0, 1), 1);
  }
}
