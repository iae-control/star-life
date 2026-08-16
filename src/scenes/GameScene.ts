// 메인 게임플레이 — v4 데모의 update()/draw()를 Phaser로 이식.
// 콘텐츠 수치는 전부 src/data/*.json (M2 데이터 주도화), 여기는 해석·렌더 글루.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '../config';
import { DATA, t } from '../data';
import type {
  BossData,
  BossPhase,
  EnemyTypeData,
  GimmickData,
  LevelData,
  SectorData,
} from '../data/schemas';
import { BOSS_ENRAGE, DIFficulty, PLAYER, SPAWN, STICK, SUPER } from '../game/logic/balance';
import { aabb, applyDamage, sweptAabb } from '../game/logic/damage';
import {
  createWeaponRuntimeState,
  stepWeaponRuntime,
  triggerHeat,
  type WeaponRuntimeFrame,
  type WeaponRuntimeState,
} from '../game/logic/weaponRuntime';
import {
  cooldownFor,
  firePattern,
  isWeaponKind,
  WEAPON_PROFILES,
  type ShotSpec,
  type WeaponShotSpec,
} from '../game/logic/weapons';
import { buildLevelWave, levelWaveCount, type SpawnEvent } from '../game/logic/waves';
import {
  equippedStats,
  grantCredits,
  loadProgression,
  saveProgression,
  type ProgressionState,
} from '../game/progression';
import {
  newSession,
  saveBest,
  setSessionWeapon,
  weaponLevel,
  type GameSession,
} from '../game/session';
import { SpaceBackground } from '../systems/background';
import { playMusic } from '../systems/Music';
import { vibrate } from '../systems/haptics';
import { loadSave, updateSave } from '../systems/Save';
import { ImagePool } from '../systems/Pool';
import { audioResume, isMuted, SFX, toggleMute } from '../systems/Sfx';
import { uiText } from '../ui/text';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = Phaser.Math.Clamp;

interface Bullet extends ShotSpec {
  t: number;
  baseW: number;
  baseH: number;
  originX: number;
  originY: number;
  prevX: number;
  prevY: number;
  trailT: number;
  hitTargets: Set<object>;
  /** 유도 미사일 여부 (후방무기 seeker) */
  homing?: boolean;
  img: Phaser.GameObjects.Image;
}
interface EBul {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** warp 기믹: 좌우 화면 순환 1회 사용 여부 */
  warped?: boolean;
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
  /** 파괴 후 연기를 뿜는 간격 타이머. */
  smokeT: number;
  x: number;
  y: number;
  rotation: number;
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
  stage: number;
  cool: number;
  hcd: number;
  dir: number;
  flashT: number;
  entered: boolean;
  spiralAngle: number;
  wanderTx: number;
  wanderTy: number;
  cx: number;
  rotation: number;
  parts: BossPart[];
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

/** Optional presentation metadata is intentionally read defensively so older saves/data remain valid. */
interface BossPresentation {
  kind: 'warship' | 'scrolling-warship' | 'snail';
  displayWidth: number;
  displayHeight: number;
  /** 원본 일러스트 크기 — 파트 crop 좌표의 기준계. */
  artWidth?: number;
  artHeight?: number;
  movementScript: string;
}

interface SnailSpecialConfig {
  rageChargeMs: number;
  rageForcedDamage: number;
  barrageCount: number;
  huntIntervalMs: number;
  huntForcedDamage: number;
  huntDashCount: number;
  speech: string;
}

type ExtendedBossData = BossData & {
  presentation?: BossPresentation;
  snailSpecials?: SnailSpecialConfig;
};

type SnailSpecialPhase =
  | 'rage-angry'
  | 'rage-retract'
  | 'rage-charge'
  | 'rage-burst'
  | 'rage-recover'
  | 'hunt-speech'
  | 'hunt-dash'
  | 'hunt-recover';

interface SnailSpecialState {
  kind: 'rage' | 'hunt';
  phase: SnailSpecialPhase;
  phaseT: number;
  totalT: number;
  damageApplied: boolean;
  dashIndex: number;
  dashCount: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  pulseIndex: number;
  eyes: Phaser.GameObjects.Graphics;
  shell: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
}

interface SnailBarrageVisual {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  spin: number;
}
interface WeaponTarget {
  entity: object;
  x: number;
  y: number;
  radius: number;
  enemy?: Enemy;
  part?: BossPart;
  boss?: BossState;
}
// ansimuz 적 시트 — 2프레임 아이들 애니메이션 대상
const AZ_ENEMY_FRAMES: Record<string, number> = { 'az-small': 2, 'az-medium': 2, 'az-big': 2 };

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
/** 뜯겨나간 보스 파트 자리에서 계속 피어오르는 연기. */
interface DamageSmoke {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  grow: number;
  spin: number;
  ember: boolean;
}
interface Impact {
  core: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  t: number;
  scale: number;
}
type EnvironmentalHazardKind = 'ice' | 'fireball' | 'gas' | 'coolant' | 'prominence' | 'lightning';
interface EnvironmentalHazard {
  kind: EnvironmentalHazardKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  t: number;
  life: number;
  activeAt: number;
  hitW: number;
  hitH: number;
  damage: number;
  side: -1 | 0 | 1;
  reach: number;
  emitsGas: number;
  hit: boolean;
  img: Phaser.GameObjects.Image;
  warning?: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  layers?: Phaser.GameObjects.Image[];
}
interface OrbEnt {
  x: number;
  y: number;
  vy: number;
  t: number;
  type: 'C' | 'H' | 'E' | 'S';
  amount: number;
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
/** 박설희 필살기 — 거대 배드민턴 채 다중 스윙 (상하좌우 슁슁슁) */
interface RacketSwing {
  img: Phaser.GameObjects.Image;
  dir: 'L' | 'R' | 'T' | 'B';
  t0: number;
  lane: number;
  bossCounted: boolean;
}
interface RacketState {
  t: number;
  swings: RacketSwing[];
  spawned: number;
  bossSwings: number;
}
// 대사 표기는 정본 — 변경 금지
const PS_BUBBLE = '';
const PS = {
  bubbleUntil: 0,
  swingEvery: 0.24,
  swingDur: 0.56,
  swingCount: 10,
  endAt: 3.6,
  bossDamagePerSwing: 40,
  partDamagePerSwing: 34,
  maxBossSwings: 3,
} as const;
const PS_DIRS: RacketSwing['dir'][] = ['L', 'R', 'T', 'B', 'L', 'R', 'T', 'B', 'L', 'R'];

/** 어린지우 필살기 — "비켜!" 초록 산 배경 + 앵무새떼 급강하 (위→아래 전화면) */
interface Parrot {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  flap: number;
  bossCounted: boolean;
}
interface JiwooState {
  t: number;
  parrots: Parrot[];
  spawned: number;
  bossHits: number;
  yellN: number;
  yellT: number;
  bg: Phaser.GameObjects.TileSprite;
}
/** 지우큰애비 필살기 — 푸들 하무 단 한 마리의 화력집중 돌진: 느리게 출발→가속, 막판 1.2초 뱅글뱅글 */
interface KbState {
  t: number;
  phase: 'flight' | 'spin' | 'fade';
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  phaseT: number;
  trailT: number;
  bossHits: number;
  bossTickT: number;
}
// 대사 표기는 정본 — 변경 금지
const KB_BUBBLE = '';
const KB = {
  bubbleUntil: 0,
  vyStart: 150,
  accel: 620,
  vyMax: 1050,
  halfWidth: 100,
  spinY: 170,
  spinDur: 1.2,
  spinRadius: 165,
  fadeDur: 0.3,
  bossDamagePerHit: 40,
  partDamagePerHit: 34,
  maxBossHits: 3,
  spinBossEvery: 0.45,
  scale: 0.16,
} as const;

// 대사 표기는 정본 — 변경 금지
const JW_BUBBLE = '비켜!';
const JW_YELLS = ['비켜!', '비켜!', '비켜!!'] as const;
const JW = {
  bubbleUntil: 0.9,
  bgFade: 0.45,
  parrotCount: 42,
  spawnDur: 1.65,
  endAt: 4.0,
  yellEvery: 0.13,
  bossDamagePerHit: 24,
  partDamagePerHit: 20,
  maxBossHits: 5,
} as const;

/**
 * 함선 선체를 살짝 눌러 그 위를 지나는 적탄·플레이어 탄이 도드라지게 한다.
 * 본체와 crop 파트에 똑같이 적용해야 이음매가 드러나지 않는다.
 */
const HULL_TINT = 0xc8ccd8;

/** 피해 연기 농도 — 너무 짙으면 연기가 적탄을 가려 회피가 불가능해진다. */
const SMOKE_ALPHA = 0.78;
const SMOKE_EMBER_ALPHA = 0.62;

/** 스테이지 게이트 파트가 놓이는 화면 Y — scripts/gen-boss-layout.mjs 의 FOCUS_Y 와 같아야 한다. */
const WARSHIP_FOCUS_Y = 210;
/** 선체 중심이 내려올 수 있는 하한. 더 내려가면 본체가 플레이어를 덮는다. */
const WARSHIP_MAX_HULL_Y = 340;

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

const IMPACT_VISUALS: Record<
  string,
  { color: number; scale: number; sparks: number; recoil: number }
> = {
  spark: { color: 0xffd37a, scale: 0.42, sparks: 3, recoil: 0.08 },
  pulse: { color: 0x5ac8ff, scale: 0.52, sparks: 4, recoil: 0.12 },
  plasma: { color: 0x64f57a, scale: 0.68, sparks: 5, recoil: 0.16 },
  arc: { color: 0x9ff6ff, scale: 0.62, sparks: 6, recoil: 0.14 },
  scorch: { color: 0xff5d78, scale: 0.46, sparks: 2, recoil: 0.1 },
  blast: { color: 0xff9b42, scale: 0.95, sparks: 8, recoil: 0.5 },
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
  private pilotHullOverlay: Phaser.GameObjects.Image | null = null;
  private flameImg!: Phaser.GameObjects.Image;
  private auraImg!: Phaser.GameObjects.Image;

  // 엔티티
  private bullets: Bullet[] = [];
  private ebullets: EBul[] = [];
  private enemies: Enemy[] = [];
  private booms: Boom[] = [];
  private impacts: Impact[] = [];
  private sparks: Spark[] = [];
  private damageSmoke: DamageSmoke[] = [];
  private orbs: OrbEnt[] = [];
  private texts: FloatText[] = [];
  private textPool: Phaser.GameObjects.Text[] = [];
  private boss: BossState | null = null;
  private bossLinks!: Phaser.GameObjects.Graphics;
  private bossMarks!: Phaser.GameObjects.Graphics;
  private snailSpecial: SnailSpecialState | null = null;
  private snailBarrage: SnailBarrageVisual[] = [];
  private snailHuntCooldown = 0;
  private snailRageQueued = false;
  private sp: SuperState | null = null;
  private ps: RacketState | null = null;
  private jw: JiwooState | null = null;
  private kb: KbState | null = null;
  // 뼈다귀 리코셰 (지우큰애비 후방무기)
  private bones: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    bhcd: number;
    img: Phaser.GameObjects.Image;
  }[] = [];

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
  private sectorLandmark: Phaser.GameObjects.Image | null = null;
  private sectorLandmarkY = 118;
  private scrollSpd = 45;
  private shake = 0;
  private worldT = 0;
  private flashes: Flash[] = [];
  private thrustT = 0;
  private props: { img: Phaser.GameObjects.Image; rot: number }[] = [];
  private nextPropAt = 4;
  private propT = 0;
  private combo = 0;
  private comboT = 0;
  private comboPeak = 0;

  // 장비 (후방무기·사이드킥)
  private rearCd = 0;
  private sideCd = 0;
  private podL: Phaser.GameObjects.Image | null = null;
  private podR: Phaser.GameObjects.Image | null = null;
  private satellite: Phaser.GameObjects.Image | null = null;
  private satAng = 0;
  private diff = DIFficulty.normal;
  private endlessBossId = 'amoeba';

  // Tyrian식 영구 장비/열관리. 세션의 점수와 별도로 상점 크레딧·로드아웃을 유지한다.
  private progression!: ProgressionState;
  private equipment!: ReturnType<typeof equippedStats>;
  private engineScale = 1;
  private armorRegen = 0;
  private secondaryCd = 0;
  private weaponRuntime: WeaponRuntimeState = createWeaponRuntimeState();
  private weaponFrame: WeaponRuntimeFrame | null = null;
  private weaponFxLife = 0;
  private weaponFx!: Phaser.GameObjects.Graphics;

  // 입력
  private touchOn = false;
  private dragPointerId = -1;
  // 가상 아날로그 스틱 — 좌측하단 고정 + 아무 곳 터치 플로팅
  private stickOn = false;
  private stickBaseX = 0;
  private stickBaseY = 0;
  private stickDx = 0;
  private stickDy = 0;
  private stickBase!: Phaser.GameObjects.Graphics;
  private stickKnob!: Phaser.GameObjects.Graphics;

  // 스테이지 기믹 상태 (levels.json gimmick)
  private gimT = 0;
  private fogs: { img: Phaser.GameObjects.Image; vx: number; vy: number }[] = [];
  private vents: {
    x: number;
    t: number;
    warnImg: Phaser.GameObjects.Rectangle;
    img: Phaser.GameObjects.Image | null;
  }[] = [];
  private windCur = 0;
  private windT = 0;
  private windStreakT = 0;
  private heatwaves: { y: number; gapX: number; imgs: Phaser.GameObjects.Image[]; hit: boolean }[] =
    [];
  private warpPulseT = 0;
  private scrollRev = 0;
  private currentSector: SectorData | null = null;
  private gimmickTimers = new Map<string, number>();
  private envHazards: EnvironmentalHazard[] = [];
  private environmentWind = 0;
  private environmentSpeed = 1;
  private environmentHeat = 0;
  private heatDamageT = 0;
  private envCameraX = 0;
  private environmentOverlay!: Phaser.GameObjects.Rectangle;
  private touchTx = 0;
  private touchTy = 0;
  private keyMap!: Record<string, Phaser.Input.Keyboard.Key>;

  // HUD
  private hudRoot!: Phaser.GameObjects.Container;
  private hudShieldBar!: Phaser.GameObjects.Rectangle;
  private hudArmorBar!: Phaser.GameObjects.Rectangle;
  private hudWeaponAccent!: Phaser.GameObjects.Rectangle;
  private hudWpn!: Phaser.GameObjects.Text;
  private hudPips: Phaser.GameObjects.Rectangle[] = [];
  private hudWaveT!: Phaser.GameObjects.Text;
  private hudScore!: Phaser.GameObjects.Text;
  private hudCredits!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private hudMute!: Phaser.GameObjects.Text;
  private hudHeatBar!: Phaser.GameObjects.Rectangle;
  private envStatus!: Phaser.GameObjects.Text;
  private envBarBg!: Phaser.GameObjects.Rectangle;
  private envBar!: Phaser.GameObjects.Rectangle;
  private bossBar!: Phaser.GameObjects.Rectangle;
  private bossLabel!: Phaser.GameObjects.Text;
  private bossPartStatus!: Phaser.GameObjects.Text;
  private superBtn!: Phaser.GameObjects.Container;
  private superCount!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerT = 0;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleBg!: Phaser.GameObjects.Graphics;
  private bubbleText!: Phaser.GameObjects.Text;
  private bubbleMsg = '';

  private immuneMsgT = 0;
  // 게임필: 슬로모/히트스톱 + 화이트 플래시 (M5)
  private timeScale = 1;
  private slomoT = 0;
  private whiteFlash!: Phaser.GameObjects.Rectangle;
  // 튜토리얼 (첫 플레이)
  private tutStep = -1;
  private tutT = 0;
  private tutMoved = 0;
  private tutText: Phaser.GameObjects.Text | null = null;
  // HUD 변경 감지 캐시
  private lastScore = -1;
  private lastCredits = -1;
  private lastWave = -1;
  private lastSuperN = -1;
  private lastWpnKey = '';
  private lastWpnLvl = -1;
  private lastWeaponStatus = '';

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
    this.impacts = [];
    this.sparks = [];
    this.damageSmoke = [];
    this.orbs = [];
    this.texts = [];
    this.textPool = [];
    this.boss = null;
    this.snailSpecial = null;
    this.snailBarrage = [];
    this.snailHuntCooldown = 0;
    this.snailRageQueued = false;
    this.sp = null;
    this.ps = null;
    this.jw = null;
    this.kb = null;
    this.bones = [];
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
    this.sectorLandmark = null;
    this.sectorLandmarkY = 118;
    this.touchOn = false;
    this.dragPointerId = -1;
    this.stickOn = false;
    this.stickDx = 0;
    this.stickDy = 0;
    this.gimT = 0;
    this.fogs = [];
    this.vents = [];
    this.windCur = 0;
    this.windT = 0;
    this.windStreakT = 0;
    this.heatwaves = [];
    this.warpPulseT = 0;
    this.scrollRev = 0;
    this.currentSector = null;
    this.gimmickTimers = new Map();
    this.envHazards = [];
    this.environmentWind = 0;
    this.environmentSpeed = 1;
    this.environmentHeat = 0;
    this.heatDamageT = 0;
    this.envCameraX = 0;
    this.bubbleMsg = '';
    this.hudPips = [];
    this.flashes = [];
    this.thrustT = 0;
    this.props = [];
    this.propT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboPeak = 0;
    this.pilotHullOverlay = null;
    this.nextPropAt = 4 + Math.random() * 5;
    this.rearCd = 0;
    this.sideCd = 0;
    this.timeScale = 1;
    this.slomoT = 0;
    this.tutStep = -1;
    this.tutT = 0;
    this.tutMoved = 0;
    this.tutText = null;
    this.lastScore = this.lastCredits = this.lastWave = this.lastSuperN = -1;
    this.lastWpnKey = '';
    this.lastWpnLvl = -1;
    this.lastWeaponStatus = '';
    this.podL = this.podR = this.satellite = null;
    this.satAng = 0;
    this.diff = DIFficulty[this.session.difficulty] ?? DIFficulty.normal;
    this.secondaryCd = 0;
    this.weaponRuntime = createWeaponRuntimeState();
    this.weaponFrame = null;

    this.progression = loadProgression();
    const equippedPrimary = this.progression.loadout.primary;
    if (setSessionWeapon(this.session, equippedPrimary)) {
      this.session.weapons[equippedPrimary] = Math.max(
        1,
        Math.min(DATA.weapons.maxLevel, this.progression.owned[equippedPrimary] ?? 1),
      );
    }
    this.equipment = equippedStats(this.progression);
    const engineOutput = this.equipment.engine?.speed ?? 185;
    this.engineScale = clamp(engineOutput / 205, 0.9, 1.45);
    this.armorRegen = this.equipment.armor?.regen ?? 0;
    const previousArmorMax = this.session.armorMax;
    const equippedArmorMax = Math.max(PLAYER.armorMax, this.equipment.armor?.hp ?? PLAYER.armorMax);
    this.session.armorMax = equippedArmorMax;
    this.session.armor = clamp(
      this.session.armor + Math.max(0, equippedArmorMax - previousArmorMax),
      0,
      equippedArmorMax,
    );

    const q = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV) {
      this.auto = q.get('auto') === '1';
      this.god = this.auto || q.get('god') === '1';
      this.debug = q.get('debug') !== null;
    }
    // ?boss=<id> 로 해당 보스전에 바로 진입한다(배포판에서도 동작 — 보스 확인용).
    // 봇/무적은 강제하지 않는다. 점수는 남기지 않도록 세션을 프리뷰로만 쓴다.
    const previewBoss = q.get('boss');
    if (previewBoss && previewBoss in DATA.bosses.bosses) {
      const levelIndex = DATA.levels.levels.findIndex(
        (candidate) => candidate.boss === previewBoss,
      );
      if (levelIndex >= 0) {
        this.session.level = levelIndex + 1;
        this.session.levelWave = levelWaveCount(levelIndex);
        this.session.wave = Math.max(this.session.wave, this.session.levelWave);
      }
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
    this.environmentOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff7a28, 0)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud - 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.pool = new ImagePool(this, 'b-pulse', DEPTH.bullet, 64);
    this.fxPool = new ImagePool(this, 'boom', DEPTH.boom, 16);
    this.bossLinks = this.add
      .graphics()
      .setDepth(DEPTH.enemy - 0.05)
      .setBlendMode(Phaser.BlendModes.ADD);
    // 파트 표적/파괴 표시는 Graphics 로 그린다. setTint 는 Canvas 렌더러에서 무시되므로
    // 틴트에만 의존하면 WebGL 이 없는 기기에서 "어디를 쏘는지" 단서가 통째로 사라진다.
    this.bossMarks = this.add.graphics().setDepth(DEPTH.enemy + 0.3);
    this.weaponFx = this.add
      .graphics()
      .setDepth(DEPTH.phantom - 0.15)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.flameImg = this.add
      .image(this.px, this.py + 15, 'engine-flame')
      .setDepth(DEPTH.player - 0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.auraImg = this.add
      .image(this.px, this.py, 'super-aura')
      .setDepth(DEPTH.player - 0.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.playerImg = this.add
      .image(this.px, this.py, 'hero-fighter-v2')
      .setScale(0.105)
      .setDepth(DEPTH.player);
    const pilotHullKey: Record<GameSession['pilot'], string> = {
      jungjioo: 'ship-overlay-jungjioo',
      parksulhee: 'ship-overlay-parksulhee',
      youngjioo: 'ship-overlay-youngjioo',
      keunaebi: 'ship-overlay-keunaebi',
    };
    this.pilotHullOverlay = this.add
      .image(this.px, this.py, pilotHullKey[this.session.pilot])
      .setDepth(DEPTH.player + 0.05)
      .setScale(0.74)
      .setAlpha(0.9);
    // 엔진 화염은 시트에 포함(행 플리커) — 별도 화염 이미지는 끈다
    this.flameImg.setVisible(false);

    // 사이드킥 표시체 (이어하기 세션 등 이미 보유한 경우)
    this.createSidekickVisuals();

    playMusic(this.level.background.theme);

    this.createHud();
    this.createBubble();
    this.whiteFlash = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH.banner + 1)
      .setAlpha(0)
      .setVisible(false);
    this.hudRoot.add(this.whiteFlash);
    this.setupInput();
    if (this.debug) this.createDebug();
    // 튜토리얼: 첫 플레이 L1 도입 (PLAN 4장 — 90초 내 자연 학습)
    if (
      !loadSave().progress.tutorialDone &&
      this.session.level === 1 &&
      this.session.levelWave === 0 &&
      !this.session.endless &&
      !this.auto
    ) {
      this.tutStep = 0;
      this.tutT = 0;
      this.tutText = uiText(
        this,
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.68,
        t('tut.move'),
        11,
        '#8fd3ff',
        'center',
      )
        .setDepth(DEPTH.banner)
        .setShadow(1, 1, 'rgba(0,0,0,0.9)', 0);
    }

    // 데이터 핫리로드 → 세션 유지한 채 현재 웨이브부터 재생
    const onDataReload = (): void => {
      if (this.scene.isPaused(SceneKeys.Game)) {
        this.scene.stop(SceneKeys.Pause);
        this.scene.resume();
      }
      if (!this.scene.isActive(SceneKeys.Game)) return;
      if (this.pendingShop > 0) {
        this.scene.start(SceneKeys.Shop, {
          session: this.session,
          clearedLevel: Math.max(1, this.session.level - 1),
        });
        return;
      }
      this.scene.restart({ session: this.session, replayWave: true });
    };
    this.game.events.on('data-reloaded', onDataReload);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('data-reloaded', onDataReload);
      saveProgression(this.progression);
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
      this.session.levelWave <= levelWaveCount(this.session.level - 1)
    ) {
      this.session.levelWave--;
      this.session.wave = Math.max(0, this.session.wave - 1);
    }
    if (!this.auto && !document.hasFocus()) this.time.delayedCall(0, () => this.togglePause(true));
    if (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('boss') === this.level.boss
    ) {
      this.spawnBoss();
    } else {
      this.nextWave();
    }
  }

  /* ---------- HUD ---------- */
  private createHud(): void {
    const hudStart = this.children.list.length;
    const frame = this.add.graphics().setDepth(DEPTH.hud);
    frame.fillStyle(0x020714, 0.9);
    frame.fillRoundedRect(3, 3, GAME_WIDTH - 6, 28, 8);
    frame.lineStyle(1, 0x79c9ff, 0.42);
    frame.strokeRoundedRect(3.5, 3.5, GAME_WIDTH - 7, 27, 8);
    frame.lineStyle(2, 0x2a69a8, 0.38);
    frame.lineBetween(111, 7, 111, 27);
    frame.lineBetween(238, 7, 238, 27);
    this.add
      .rectangle(5, 30, GAME_WIDTH - 10, 1, 0x78b4ff, 0.32)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud);

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

    this.hudWeaponAccent = this.add
      .rectangle(114, 5, 3, 20, 0x4db8ff, 0.9)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1);
    this.hudWpn = uiText(this, 121, 9, '', 9, '#8aff8a').setDepth(DEPTH.hud + 1);
    this.add.rectangle(120, 27, 108, 3, 0x18243a, 0.95).setOrigin(0, 0).setDepth(DEPTH.hud);
    this.hudHeatBar = this.add
      .rectangle(120, 27, 108, 3, 0x55d8ff, 0.95)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1)
      .setScale(0, 1);
    for (let i = 0; i < DATA.weapons.maxLevel; i++) {
      this.hudPips.push(
        this.add
          .rectangle(171 + i * 5, 5, 3, 7, 0x8aff8a)
          .setOrigin(0, 0)
          .setDepth(DEPTH.hud + 1),
      );
    }
    this.hudWaveT = uiText(this, 121, 22, '', 9, '#cfd8ff').setDepth(DEPTH.hud + 1);
    this.hudScore = uiText(this, GAME_WIDTH - 7, 9, '', 11, '#fff2b0', 'right').setDepth(
      DEPTH.hud + 1,
    );
    this.hudCredits = uiText(this, GAME_WIDTH - 7, 22, '', 8, '#63f0c8', 'right').setDepth(
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
    this.bossPartStatus = uiText(this, GAME_WIDTH - 34, GAME_HEIGHT - 12, '', 8, '#8fcfff', 'right')
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);

    this.envBarBg = this.add
      .rectangle(GAME_WIDTH / 2 - 70, 35, 140, 4, 0x101827, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x89dff2, 0.45)
      .setDepth(DEPTH.hud)
      .setVisible(false);
    this.envBar = this.add
      .rectangle(GAME_WIDTH / 2 - 69, 36, 138, 2, 0x59ddff, 0.95)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);
    this.envStatus = uiText(this, GAME_WIDTH / 2, 46, '', 8, '#9fefff', 'center')
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);
    this.comboText = uiText(this, GAME_WIDTH - 8, 62, '', 12, '#ffe36d', 'right')
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);

    // 슈퍼 버튼 (우하단)
    const bx = GAME_WIDTH - 31;
    const by = GAME_HEIGHT - 43;
    const g = this.add.image(0, 0, 'super-btn');
    const label = uiText(this, 0, -4, 'S', 15, '#cfc2ff', 'center');
    this.superCount = uiText(this, 0, 12, '', 8, '#cfc2ff', 'center');
    this.superBtn = this.add.container(bx, by, [g, label, this.superCount]).setDepth(DEPTH.hud + 1);

    // 가상 스틱 비주얼 — 평소엔 좌측하단에 반투명 대기, 잡으면 밝아짐
    this.stickBase = this.add.graphics().setDepth(DEPTH.hud + 1);
    this.stickBase.lineStyle(2, 0x8caaff, 0.9);
    this.stickBase.strokeCircle(0, 0, STICK.radius);
    this.stickBase.lineStyle(1, 0x8caaff, 0.35);
    this.stickBase.strokeCircle(0, 0, STICK.radius * 0.55);
    this.stickKnob = this.add.graphics().setDepth(DEPTH.hud + 1.1);
    this.stickKnob.fillStyle(0xbfd2ff, 0.9);
    this.stickKnob.fillCircle(0, 0, 17);
    this.stickKnob.lineStyle(1, 0xe8f0ff, 0.8);
    this.stickKnob.strokeCircle(0, 0, 17);
    this.setStickIdle();

    this.bannerText = uiText(this, GAME_WIDTH / 2, 200, '', 22, '#e8ecff', 'center')
      .setDepth(DEPTH.banner)
      .setVisible(false);

    const hudObjects = this.children.list.slice(hudStart) as Phaser.GameObjects.GameObject[];
    this.hudRoot = this.add.container(0, 0, hudObjects).setDepth(DEPTH.hud);
  }

  private createBubble(): void {
    this.bubbleBg = this.add.graphics();
    this.bubbleText = this.add
      .text(0, 0, '', {
        fontFamily:
          'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#101638',
      })
      .setOrigin(0, 0);
    this.bubble = this.add
      .container(0, 0, [this.bubbleBg, this.bubbleText])
      .setDepth(DEPTH.bubble)
      .setVisible(false);
    this.hudRoot.add(this.bubble);
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
        Math.random,
        this.diff.density,
      ).filter((e) => e.t > this.waveT);
    }
  }

  private clearField(): void {
    for (const e of this.enemies) this.pool.release(e.img);
    this.enemies = [];
    for (const b of this.ebullets) this.pool.release(b.img);
    this.ebullets = [];
    if (this.boss) {
      this.clearSnailRuntime(false);
      // crop 파트는 파괴 후에도 그을린 잔해로 남아 있으므로 살아있는지와 무관하게 회수한다.
      for (const part of this.boss.parts) this.pool.release(part.img);
      this.pool.release(this.boss.img);
      this.pool.release(this.boss.glow);
      this.boss = null;
      this.bossLinks.clear();
      this.bossMarks.clear();
      this.clearDamageSmoke();
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
      this.bossPartStatus.setVisible(false);
    }
    this.spawnQ = [];
    this.waveClearT = -1;
  }

  private updateTutorial(dt: number): void {
    if (!this.tutText) return;
    this.tutT += dt;
    this.tutMoved += Math.abs(this.pvx * dt) + Math.abs(this.pvy * dt);
    this.tutText.setAlpha(0.7 + Math.sin(this.worldT * 5) * 0.3);
    if (this.tutStep === 0 && (this.tutMoved > 60 || this.tutT > 5)) {
      this.tutStep = 1;
      this.tutT = 0;
      this.tutText.setText(t('tut.fire'));
    } else if (this.tutStep === 1 && this.tutT > 2.6) {
      this.tutStep = 2;
      this.tutT = 0;
      this.tutText.setText(t('tut.super')).setColor('#cfc2ff');
    } else if (this.tutStep === 2 && this.tutT > 3.2) {
      this.tutStep = 3;
      this.tutT = 0;
      this.tutText.setText(t('tut.done')).setColor('#8aff8a');
    } else if (this.tutStep === 3 && this.tutT > 1.6) {
      this.tutStep = -1;
      this.tutText.destroy();
      this.tutText = null;
      updateSave((sv) => {
        sv.progress.tutorialDone = true;
      });
    }
  }

  private slomo(scale: number, dur: number): void {
    this.timeScale = scale;
    this.slomoT = dur;
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
          part.x - part.def.hitbox.w / 2,
          part.y - part.def.hitbox.h / 2,
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

    // 멀티터치: 첫 손가락이 스틱을 잡고, 다른 손가락은 슈퍼 버튼 등 별개 처리
    this.input.addPointer(2);
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
        this.stickOn = true;
        // 좌측하단 고정 스틱을 잡으면 그 자리, 그 외엔 터치 지점에 플로팅
        const nearHome =
          Math.hypot(p.worldX - STICK.homeX, p.worldY - STICK.homeY) < STICK.grabRadius;
        // 플로팅 베이스는 터치 지점 그대로(클램프 금지) — 클램프하면 그 오프셋이 유령 편향으로 주입된다
        this.stickBaseX = nearHome ? STICK.homeX : p.worldX;
        this.stickBaseY = nearHome ? STICK.homeY : p.worldY;
        this.stickDx = nearHome ? p.worldX - STICK.homeX : 0;
        this.stickDy = nearHome ? p.worldY - STICK.homeY : 0;
        this.updateStickVisual();
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.stickOn || p.id !== this.dragPointerId) return;
      this.stickDx = p.worldX - this.stickBaseX;
      this.stickDy = p.worldY - this.stickBaseY;
      this.updateStickVisual();
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
    this.stickOn = false;
    this.stickDx = 0;
    this.stickDy = 0;
    this.dragPointerId = -1;
    this.setStickIdle();
  }

  /** 스틱 대기 상태: 좌측하단 홈 위치에 반투명 표시 */
  private setStickIdle(): void {
    this.stickBase.setPosition(STICK.homeX, STICK.homeY).setAlpha(0.34);
    this.stickKnob.setPosition(STICK.homeX, STICK.homeY).setAlpha(0.34);
  }

  private updateStickVisual(): void {
    const len = Math.hypot(this.stickDx, this.stickDy);
    const cl = len > STICK.radius ? STICK.radius / len : 1;
    this.stickBase.setPosition(this.stickBaseX, this.stickBaseY).setAlpha(0.75);
    this.stickKnob
      .setPosition(this.stickBaseX + this.stickDx * cl, this.stickBaseY + this.stickDy * cl)
      .setAlpha(0.9);
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
  private sectorForWave(routeWave: number): SectorData | null {
    const sectors = this.level.sectors;
    if (!sectors?.length) return null;
    let selected: SectorData | null = null;
    for (const sector of sectors) {
      if (sector.startWave <= routeWave) selected = sector;
      else break;
    }
    return selected ?? sectors[0] ?? null;
  }

  private clearSectorEnvironment(): void {
    for (const hazard of this.envHazards) {
      hazard.warning?.destroy();
      hazard.layers?.forEach((layer) => layer.destroy());
      hazard.img.destroy();
    }
    this.envHazards = [];
    for (const fog of this.fogs) fog.img.destroy();
    this.fogs = [];
    for (const vent of this.vents) {
      vent.warnImg.destroy();
      vent.img?.destroy();
    }
    this.vents = [];
    for (const wave of this.heatwaves) for (const img of wave.imgs) this.fxPool.release(img);
    this.heatwaves = [];
    this.gimmickTimers.clear();
    this.gimT = 0;
    this.windT = 0;
    this.windCur = 0;
    this.environmentWind = 0;
    this.environmentSpeed = 1;
    this.environmentHeat = 0;
    this.heatDamageT = 0;
    this.envCameraX = 0;
    this.environmentOverlay.setAlpha(0);
    this.playerImg.clearTint();
  }

  private sectorTransitionSeconds(): number {
    return 2.4;
  }

  private enterSector(routeWave: number): boolean {
    const next = this.sectorForWave(routeWave);
    if (!next || next.id === this.currentSector?.id) return false;
    const transitionSeconds = this.sectorTransitionSeconds();
    const firstSector = this.currentSector === null;
    const oldBackground = this.spaceBg;
    const oldLandmark = this.sectorLandmark;
    const oldVisuals = this.children.list.filter(
      (child): child is Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite =>
        (child instanceof Phaser.GameObjects.Image ||
          child instanceof Phaser.GameObjects.TileSprite) &&
        child.depth >= DEPTH.bg - 0.1 &&
        child.depth < DEPTH.hole,
    );

    this.clearSectorEnvironment();
    // 새 환경 기믹은 전환 카드가 사라진 뒤에만 활성화한다. 잔류 탄도 함께 정리해
    // 짧지만 실제로 안전한 진입 구간을 보장한다.
    this.currentSector = { ...next, gimmicks: [] };
    this.inv = Math.max(this.inv, transitionSeconds + 0.35);
    for (const hostile of this.ebullets) this.pool.release(hostile.img);
    this.ebullets = [];
    this.sectorLandmark = null;
    for (const prop of this.props) prop.img.destroy();
    this.props = [];
    this.propT = 0;

    const background = next.background ?? this.level.background;
    const newVisuals: (Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite)[] = [];
    const newVisualAlphas: number[] = [];
    if (!firstSector) {
      const childStart = this.children.list.length;
      this.spaceBg = new SpaceBackground(this, DEPTH.bg, background);
      for (const child of this.children.list.slice(childStart)) {
        if (
          child instanceof Phaser.GameObjects.Image ||
          child instanceof Phaser.GameObjects.TileSprite
        ) {
          newVisuals.push(child);
          newVisualAlphas.push(child.alpha);
          child.setAlpha(0);
        }
      }
    }

    const landmarkKey =
      next.id.includes('ice') || next.id.includes('frozen')
        ? 'planet-ice'
        : next.id.includes('volcanic')
          ? 'planet-volcanic'
          : next.id.includes('desert') || next.id.includes('uy-scuti')
            ? 'planet-desert'
            : next.id.includes('water')
              ? 'planet-ocean'
              : next.id.includes('rock') || next.id.includes('meteor')
                ? 'planet-rock'
                : null;
    if (landmarkKey && !background.artKey) {
      const side = routeWave % 2 === 0 ? 1 : -1;
      this.sectorLandmarkY = 118;
      this.sectorLandmark = this.add
        .image(side > 0 ? GAME_WIDTH - 34 : 34, this.sectorLandmarkY, landmarkKey)
        .setDepth(DEPTH.bg + 0.45)
        .setScale(0.92)
        .setAlpha(0.84)
        .setBlendMode(Phaser.BlendModes.SCREEN);
      if (!firstSector) {
        newVisuals.push(this.sectorLandmark);
        newVisualAlphas.push(0.84);
        this.sectorLandmark.setAlpha(0);
      }
    }

    const transitionTint: Partial<Record<LevelData['background']['theme'], number>> = {
      nebula: 0x6aa7d9,
      protostar: 0xd77742,
      mainseq: 0xe5bb65,
      asteroids: 0x8794a6,
      redgiant: 0xc54b3d,
      supernova: 0xa778d4,
      blackhole: 0x49436f,
      inside: 0x36506f,
    };
    const tint = transitionTint[background.theme] ?? 0x6f8fb6;
    const bridgeVeil = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, tint, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hole - 0.12)
      .setAlpha(0);
    const bridgeStars = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-stars-near')
      .setOrigin(0, 0)
      .setDepth(DEPTH.hole - 0.08)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setAlpha(0);

    const panel = this.add
      .rectangle(0, 0, GAME_WIDTH - 28, 82, 0x04101d, 0.94)
      .setStrokeStyle(1, tint, 0.92);
    const accent = this.add.rectangle(-(GAME_WIDTH - 38) / 2, 0, 3, 58, tint, 1);
    const header = uiText(this, -(GAME_WIDTH - 54) / 2, -29, t('sector.card.header'), 7, '#7692ab');
    const name = uiText(this, -(GAME_WIDTH - 54) / 2, -11, t(next.nameKey), 15, '#e8f6ff');
    const tagline = uiText(this, -(GAME_WIDTH - 54) / 2, 11, t(next.taglineKey), 7, '#9cb6c9');
    const bonus =
      next.bonusMultiplier && next.bonusMultiplier > 1 ? ` / x${next.bonusMultiplier}` : '';
    const safe = uiText(
      this,
      (GAME_WIDTH - 54) / 2,
      29,
      `${t('sector.card.safe')} / ${next.kind.toUpperCase()}${bonus}`,
      7,
      '#6edbc5',
      'right',
    );
    const card = this.add
      .container(GAME_WIDTH / 2 - 12, 126, [panel, accent, header, name, tagline, safe])
      .setAlpha(0);
    this.hudRoot.add(card);

    if (!firstSector) {
      for (const visual of oldVisuals) {
        if (!visual.active) continue;
        this.tweens.add({
          targets: visual,
          alpha: 0,
          duration: transitionSeconds * 1000,
          ease: 'Sine.easeInOut',
        });
      }
      for (let i = 0; i < newVisuals.length; i++) {
        this.tweens.add({
          targets: newVisuals[i],
          alpha: newVisualAlphas[i] ?? 1,
          duration: transitionSeconds * 1000,
          ease: 'Sine.easeInOut',
        });
      }
    }
    this.tweens.add({
      targets: bridgeVeil,
      alpha: 0.28,
      duration: transitionSeconds * 500,
      ease: 'Sine.easeInOut',
      yoyo: true,
    });
    this.tweens.add({
      targets: bridgeStars,
      alpha: 0.5,
      tilePositionY: -190,
      duration: transitionSeconds * 500,
      ease: 'Sine.easeInOut',
      yoyo: true,
    });
    this.tweens.add({
      targets: card,
      alpha: 1,
      x: GAME_WIDTH / 2,
      duration: 260,
      hold: transitionSeconds * 1000 - 580,
      ease: 'Cubic.easeOut',
      yoyo: true,
    });
    this.time.delayedCall(850, () => {
      if (this.currentSector?.id === next.id) playMusic(background.theme);
    });
    this.time.delayedCall(transitionSeconds * 1000, () => {
      if (this.currentSector?.id === next.id) this.currentSector = next;
      if (!firstSector) {
        oldBackground.destroy();
        oldLandmark?.destroy();
      }
      bridgeVeil.destroy();
      bridgeStars.destroy();
      card.destroy(true);
    });
    return true;
  }

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
        const wi = Math.floor(Math.random() * Math.max(1, levelWaveCount(li)));
        this.spawnQ = buildLevelWave(li, wi, Math.random, this.diff.density);
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
    const routeWave = this.session.levelWave;
    const isBossWave = routeWave >= levelWaveCount(li);
    const sectorChanged = this.enterSector(routeWave);
    this.spawnQ = buildLevelWave(li, this.session.levelWave, Math.random, this.diff.density);
    if (sectorChanged) {
      const safeDelay = this.sectorTransitionSeconds();
      this.spawnQ = this.spawnQ.map((event) => ({ ...event, t: event.t + safeDelay }));
    }
    if (!isBossWave) {
      this.session.wave++;
      this.session.levelWave++;
      if (!sectorChanged) this.banner(t('banner.wave', this.session.wave), 1.6, '#ffd75e');
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
      img: this.pool.get(
        AZ_ENEMY_FRAMES[def.sprite] && def.tint && this.textures.exists(def.sprite + def.tint)
          ? def.sprite + def.tint
          : def.sprite,
        x,
        y,
      ),
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
    if (AZ_ENEMY_FRAMES[def.sprite]) e.img.setFrame(0);
    if (def.scale) e.img.setScale(AZ_ENEMY_FRAMES[def.sprite] ? def.scale / 3 : def.scale);
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
    const presentation = (def as ExtendedBossData).presentation;
    this.ensureBossPartFrames(def);
    // 함선은 화면보다 커서, 선체 전체가 위에서 흘러내리도록 완전히 화면 밖에서 시작한다.
    const spawnY = presentation?.displayHeight ? -presentation.displayHeight / 2 - 40 : -80;
    const glow = this.pool.get('boss-glow', GAME_WIDTH / 2, spawnY);
    glow.setDepth(DEPTH.enemy - 0.2).setBlendMode(Phaser.BlendModes.ADD);
    const img = this.pool.get(def.sprite, GAME_WIDTH / 2, spawnY);
    // 파트 서브프레임이 등록된 텍스처이므로 본체는 원본 프레임을 명시해야 한다.
    if (this.textures.get(def.sprite).has('__BASE')) img.setFrame('__BASE');
    img.setDepth(DEPTH.enemy).setScale(def.layoutVersion === 2 ? 1.24 : 1);
    if (presentation?.displayWidth && presentation.displayHeight) {
      img.setDisplaySize(presentation.displayWidth, presentation.displayHeight);
      glow.setDisplaySize(
        Math.min(GAME_WIDTH * 1.25, presentation.displayWidth * 1.22),
        Math.max(120, presentation.displayHeight * 0.72),
      );
    }
    const parts: BossPart[] = (def.parts ?? []).map((pd) => {
      // crop 파트는 본체 일러스트에서 잘라낸 조각이라, 살아 있는 동안 선체 위에
      // 정확히 겹쳐져 이음매가 보이지 않는다. 파괴되면 그 구역만 그을려 남는다.
      const cropped = Boolean(pd.crop) && this.textures.exists(def.sprite);
      const texture = cropped ? def.sprite : pd.sprite;
      const img = this.pool.get(texture, GAME_WIDTH / 2 + pd.dx, spawnY + pd.dy);
      const roleDepth =
        pd.role === 'decor'
          ? -0.08
          : pd.role === 'structure'
            ? 0
            : pd.role === 'armor'
              ? 0.06
              : 0.12;
      img.setDepth(DEPTH.enemy + roleDepth).setRotation(pd.rotation ?? 0);
      if (cropped) {
        img.setFrame(this.bossPartFrame(pd.id));
        // 히트박스는 크롭에서 유도됐으므로 표시 크기와 판정이 정확히 일치한다.
        img.setDisplaySize(pd.hitbox.w, pd.hitbox.h);
      } else {
        img.setScale(pd.scale ?? 1);
      }
      const hp = (pd.hp.base + w * pd.hp.perWave) * this.diff.hp;
      return {
        def: pd,
        hp,
        hpMax: hp,
        alive: true,
        flashT: 0,
        fireT: (pd.fireEvery ?? 2) * 0.7,
        smokeT: 0,
        x: GAME_WIDTH / 2 + pd.dx,
        y: spawnY + pd.dy,
        rotation: pd.rotation ?? 0,
        img,
      };
    });
    this.boss = {
      def,
      x: GAME_WIDTH / 2,
      y: spawnY,
      t: 0,
      hp,
      hpMax: hp,
      phase: -1,
      stage: 0,
      cool: 1.2,
      hcd: 0,
      dir: 1,
      flashT: 0,
      entered: false,
      spiralAngle: Math.PI / 2,
      wanderTx: GAME_WIDTH / 2,
      wanderTy: def.entryY,
      cx: GAME_WIDTH / 2,
      rotation: 0,
      parts,
      img,
      glow,
    };
    this.snailHuntCooldown = this.snailHuntInterval(def) * rnd(0.72, 0.9);
    this.banner(t('banner.warning'), 2.2, '#ff6a6a');
    playMusic('boss');
    SFX.warn();
    this.scrollSpd = this.level.scroll.boss;
    this.bossBar.setVisible(true);
    this.bossLabel.setVisible(true);
    this.bossPartStatus.setVisible(true);
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
  ): Bullet {
    const img = this.pool.get(sprite, x, y);
    img.setDepth(DEPTH.bullet).setBlendMode(Phaser.BlendModes.ADD);
    if (vy > 0) img.setFlipY(true);
    if (vx !== 0 && vy === 0) img.setRotation(vx > 0 ? Math.PI / 2 : -Math.PI / 2);
    const bullet: Bullet = {
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
      baseW: 8,
      baseH: 10,
      originX: x,
      originY: y,
      prevX: x,
      prevY: y,
      trailT: 0,
      hitTargets: new Set<object>(),
      img,
    };
    this.bullets.push(bullet);
    return bullet;
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
          if (!part.alive || !this.partActive(part, B) || !this.partExposed(part, B)) continue;
          const px2 = part.x;
          const py2 = part.y;
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

  private playerFire(shotsOverride?: WeaponShotSpec[], immediate = false): void {
    const level = weaponLevel(this.session);
    this.vseq = (this.vseq + 1) % 3;
    const shots =
      shotsOverride ?? firePattern(this.session.cur, level, this.px, this.py, this.vseq);
    for (const source of shots) {
      const s = { ...source };
      const thermalSpread = this.weaponFrame?.spreadScale ?? 1;
      if (Math.abs(s.vx) > 0.001) s.vx *= thermalSpread;
      if (s.spin) {
        const spool = this.weaponFrame?.state.spool ?? 1;
        s.vx +=
          rnd(-1, 1) * s.spin.maxSpread * Math.abs(s.vy) * thermalSpread * (1.45 - spool * 0.45);
      }
      const delay = immediate ? 0 : Math.max(s.spawnDelay ?? 0, s.lock?.lockTime ?? 0);
      const img = this.pool.get(s.sprite, s.x, s.y).setVisible(delay <= 0);
      img.setDepth(DEPTH.bullet).setBlendMode(Phaser.BlendModes.ADD);
      if (s.stretch) img.setScale(1, 1.3);
      if (s.expansion) img.setScale(s.expansion.startScale);
      if (s.rotateToVelocity) img.setRotation(Math.atan2(s.vy, s.vx) + Math.PI / 2);
      this.bullets.push({
        ...s,
        t: -delay,
        baseW: s.w,
        baseH: s.h,
        originX: s.x,
        originY: s.y,
        prevX: s.x,
        prevY: s.y,
        trailT: 0,
        hitTargets: new Set<object>(),
        img,
      });
    }
    const visual = IMPACT_VISUALS[shots[0]?.impactFx ?? 'pulse'] ?? IMPACT_VISUALS.pulse!;
    const mz = this.fxPool.get('muzzle', this.px, this.py - 19);
    mz.setDepth(DEPTH.bullet + 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(visual.color)
      .setScale(0.85 + visual.scale * 0.35);
    this.flashes.push({ img: mz, t: 0 });
    this.shake = Math.min(7, this.shake + visual.recoil);
    SFX.shoot(shots[0]?.archetype ?? this.session.cur);
  }

  private activeWeaponTargets(): WeaponTarget[] {
    const targets: WeaponTarget[] = this.enemies
      .filter((enemy) => !enemy.dead)
      .map((enemy) => ({
        entity: enemy,
        x: enemy.x,
        y: enemy.y,
        radius: Math.max(DATA.enemies.hitbox.w, DATA.enemies.hitbox.h) * 0.45,
        enemy,
      }));
    const B = this.boss;
    if (!B?.entered) return targets;
    for (const part of B.parts) {
      if (!part.alive || !this.partActive(part, B) || !this.partExposed(part, B)) continue;
      targets.push({
        entity: part,
        x: part.x,
        y: part.y,
        radius: Math.max(part.def.hitbox.w, part.def.hitbox.h) * 0.45,
        part,
        boss: B,
      });
    }
    if (!this.coreShielded(B)) {
      targets.push({
        entity: B,
        x: B.x,
        y: B.y,
        radius: Math.max(B.def.hitbox.w, B.def.hitbox.h) * 0.34,
        boss: B,
      });
    }
    return targets;
  }

  private damageWeaponTarget(target: WeaponTarget, damage: number): void {
    if (target.enemy) {
      if (target.enemy.dead) return;
      target.enemy.hp -= damage;
      target.enemy.flashT = 0.06;
      if (target.enemy.hp <= 0) this.killEnemy(target.enemy);
      return;
    }
    if (target.part && target.boss && this.boss === target.boss && target.part.alive) {
      this.damagePart(target.part, target.boss, damage);
      return;
    }
    if (target.boss && this.boss === target.boss && !this.coreShielded(target.boss)) {
      target.boss.flashT = 0.06;
      this.damageBoss(damage);
    }
  }

  private segmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): { distance: number; along: number } {
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy || 1;
    const along = clamp(((px - ax) * dx + (py - ay) * dy) / length2, 0, 1);
    const qx = ax + dx * along;
    const qy = ay + dy * along;
    return { distance: Math.hypot(px - qx, py - qy), along };
  }

  private fireBeam(shots: WeaponShotSpec[], dealDamage: boolean): void {
    const colorText = DATA.weapons.weapons[this.session.cur]?.color ?? '#ff6880';
    const color = Number.parseInt(colorText.replace('#', ''), 16) || 0xff6880;
    for (const shot of shots) {
      const length = Math.hypot(shot.vx, shot.vy) || 1;
      const ex = shot.x + (shot.vx / length) * 900;
      const ey = shot.y + (shot.vy / length) * 900;
      const width = shot.beam?.width ?? Math.max(4, shot.w);
      this.weaponFx.lineStyle(width + 7, color, 0.16);
      this.weaponFx.lineBetween(shot.x, shot.y, ex, ey);
      this.weaponFx.lineStyle(width + 2, color, 0.78);
      this.weaponFx.lineBetween(shot.x, shot.y, ex, ey);
      this.weaponFx.lineStyle(Math.max(1.4, width * 0.24), 0xffffff, 0.94);
      this.weaponFx.lineBetween(shot.x, shot.y, ex, ey);
      if (!dealDamage) continue;
      const candidates = this.activeWeaponTargets()
        .map((target) => ({
          target,
          hit: this.segmentDistance(target.x, target.y, shot.x, shot.y, ex, ey),
        }))
        .filter(({ target, hit }) => hit.distance <= width * 0.6 + target.radius)
        .sort((a, b) => a.hit.along - b.hit.along)
        .slice(0, Math.max(1, shot.pierce + 1));
      const tick = shot.beam?.tickEvery ?? 0.04;
      const damage = (shot.beam?.dps ?? shot.dmg / Math.max(tick, 0.01)) * tick;
      for (const { target } of candidates) this.damageWeaponTarget(target, damage);
    }
  }

  private fireChain(shot: WeaponShotSpec): void {
    const chain = shot.chain;
    if (!chain) return;
    const colorText = DATA.weapons.weapons[this.session.cur]?.color ?? '#a8f6ff';
    const color = Number.parseInt(colorText.replace('#', ''), 16) || 0xa8f6ff;
    const candidates = this.activeWeaponTargets();
    const visited = new Set<object>();
    let x = shot.x;
    let y = shot.y;
    for (let hop = 0; hop < chain.maxTargets; hop++) {
      let best: WeaponTarget | null = null;
      let bestDistance = hop === 0 ? 560 : chain.radius;
      for (const target of candidates) {
        if (visited.has(target.entity) || target.enemy?.dead) continue;
        const distance = Math.hypot(target.x - x, target.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = target;
        }
      }
      if (!best) break;
      this.weaponFx.lineStyle(8, color, 0.16);
      this.weaponFx.lineBetween(x, y, best.x, best.y);
      this.weaponFx.lineStyle(2.4, color, 0.95);
      this.weaponFx.beginPath();
      this.weaponFx.moveTo(x, y);
      for (let segment = 1; segment < 5; segment++) {
        const p = segment / 5;
        const nx = Phaser.Math.Linear(x, best.x, p) + rnd(-7, 7);
        const ny = Phaser.Math.Linear(y, best.y, p) + rnd(-5, 5);
        this.weaponFx.lineTo(nx, ny);
      }
      this.weaponFx.lineTo(best.x, best.y);
      this.weaponFx.strokePath();
      const damage = shot.dmg * chain.falloff ** hop;
      this.damageWeaponTarget(best, damage);
      this.addImpact(best.x, best.y, shot);
      visited.add(best.entity);
      x = best.x;
      y = best.y;
      if (!this.boss && candidates.every((target) => target.enemy?.dead)) break;
    }
    this.weaponFxLife = 0.13;
    SFX.shoot('light');
  }

  private weaponCooler(): { cooling: number; heatCapacity: number } {
    return {
      cooling: Math.max(0.25, (this.equipment.cooler?.cooling ?? 18) / 18),
      heatCapacity: Math.max(0.5, (this.equipment.cooler?.heatCapacity ?? 100) / 100),
    };
  }

  private addWeaponHeat(
    profile: (typeof WEAPON_PROFILES)[keyof typeof WEAPON_PROFILES],
    triggerScale = 1,
  ): void {
    const scale = Number.isFinite(triggerScale) ? Math.max(0, triggerScale) : 1;
    const runtimeProfile =
      scale === 1
        ? profile
        : {
            ...profile,
            heat: { ...profile.heat, perTrigger: profile.heat.perTrigger * scale },
          };
    this.weaponRuntime = triggerHeat(this.weaponRuntime, runtimeProfile, this.weaponCooler());
  }

  private updatePrimaryWeapon(dt: number, wantFire: boolean): void {
    this.fireCd -= dt;
    if (this.weaponFxLife > 0) {
      this.weaponFxLife -= dt;
      if (this.weaponFxLife <= 0) this.weaponFx.clear();
    }
    if (!isWeaponKind(this.session.cur)) {
      if (wantFire && this.fireCd <= 0) {
        this.playerFire();
        this.fireCd = cooldownFor(this.session.cur, weaponLevel(this.session));
      }
      return;
    }

    const profile = WEAPON_PROFILES[this.session.cur];
    const charging = wantFire && (profile.mechanic !== 'charged-rail' || this.fireCd <= 0);
    const frame = stepWeaponRuntime(this.weaponRuntime, profile, dt, charging, this.weaponCooler());
    this.weaponRuntime = frame.state;
    this.weaponFrame = frame;

    if (profile.mechanic === 'charged-rail') {
      this.weaponFx.clear();
      if (charging && !frame.state.locked) {
        const colorText = DATA.weapons.weapons[this.session.cur]?.color ?? '#e8f5ff';
        const color = Number.parseInt(colorText.replace('#', ''), 16) || 0xe8f5ff;
        const radius = 7 + frame.state.charge * 18;
        this.weaponFx.lineStyle(2 + frame.state.charge * 3, color, 0.38 + frame.state.charge * 0.5);
        this.weaponFx.strokeCircle(this.px, this.py - 18, radius);
        this.weaponFx.lineStyle(1, color, 0.2 + frame.state.charge * 0.45);
        this.weaponFx.lineBetween(this.px, this.py - 25, this.px, 30);
      }
      if (frame.autoRelease && frame.canTrigger) {
        const shots = firePattern(
          this.session.cur,
          weaponLevel(this.session),
          this.px,
          this.py,
          this.vseq,
        );
        this.playerFire(shots, true);
        this.addWeaponHeat(profile);
        this.fireCd = Math.max(0.08, shots[0]?.charge?.recovery ?? 0.16);
        this.weaponFxLife = 0.1;
      }
      return;
    }

    if (profile.mechanic === 'sustained-beam') {
      this.weaponFx.clear();
      if (!wantFire || frame.state.locked) {
        // Do not bank missed beam ticks while idle or thermally locked.
        this.fireCd = Math.max(0, this.fireCd);
        return;
      }
      const shots = firePattern(
        this.session.cur,
        weaponLevel(this.session),
        this.px,
        this.py,
        this.vseq,
      );
      this.fireBeam(shots, false);
      let catchUp = 0;
      const tickEvery = shots[0]?.beam?.tickEvery ?? 0.04;
      const authoredCadence = cooldownFor(this.session.cur, weaponLevel(this.session));
      const heatPerTickScale = tickEvery / Math.max(0.001, authoredCadence);
      while (this.fireCd <= 0 && catchUp < 4 && !this.weaponRuntime.locked) {
        this.fireBeam(shots, true);
        // Beam damage is integrated at tickEvery, but authored heat is per weapon cadence.
        this.addWeaponHeat(profile, heatPerTickScale);
        this.fireCd += tickEvery;
        catchUp++;
      }
      if (catchUp > 0) SFX.shoot('laser');
      return;
    }

    if (!wantFire || !frame.canTrigger) {
      this.fireCd = Math.max(0, this.fireCd);
      return;
    }
    const baseCadence = cooldownFor(this.session.cur, weaponLevel(this.session));
    // Runtime cadenceScale is output rate: low spool is below 1, hot overdrive is above 1.
    const cadence = baseCadence / Math.max(0.2, frame.cadenceScale);
    let catchUp = 0;
    while (this.fireCd <= 0 && catchUp < 4 && !this.weaponRuntime.locked) {
      const shots = firePattern(
        this.session.cur,
        weaponLevel(this.session),
        this.px,
        this.py,
        this.vseq,
      );
      if (profile.mechanic === 'chain-lightning') {
        for (const shot of shots) this.fireChain(shot);
      } else {
        this.playerFire(shots);
      }
      this.addWeaponHeat(profile);
      this.fireCd += cadence;
      catchUp++;
    }
  }

  private updateSecondaryWeapon(dt: number, wantFire: boolean): void {
    this.secondaryCd -= dt;
    const stats = this.equipment.secondary;
    if (!stats || !wantFire || this.weaponRuntime.locked) {
      this.secondaryCd = Math.max(0, this.secondaryCd);
      return;
    }
    const id = this.progression.loadout.secondary;
    let catchUp = 0;
    while (this.secondaryCd <= 0 && catchUp < 3 && !this.weaponRuntime.locked) {
      const damage = stats.damage;
      const speed = stats.projectileSpeed;
      if (id === 'secondary-tail-cannon') {
        this.spawnPlayerBullet(this.px, this.py + 18, 0, speed, damage, 'b-vulcan');
      } else if (id === 'secondary-side-cutter') {
        this.spawnPlayerBullet(this.px - 13, this.py, -speed, 0, damage * 0.72, 'b-light');
        this.spawnPlayerBullet(this.px + 13, this.py, speed, 0, damage * 0.72, 'b-light');
      } else if (id === 'secondary-seeker-rack') {
        const missile = this.spawnPlayerBullet(
          this.px,
          this.py - 5,
          rnd(-35, 35),
          -speed,
          damage,
          'b-missile',
          true,
        );
        missile.splash = { radius: 42, ratio: 0.45 };
        missile.rotateToVelocity = true;
      } else if (id === 'secondary-arc-satellite') {
        const left = this.spawnPlayerBullet(
          this.px + Math.sin(this.worldT * 2.8) * 28,
          this.py - 14,
          rnd(-55, 55),
          -speed,
          damage,
          'b-light',
          true,
        );
        left.pierce = 1;
      } else if (id === 'secondary-plasma-pods') {
        this.spawnPlayerBullet(this.px - 24, this.py - 2, -25, -speed, damage, 'b-proton');
        this.spawnPlayerBullet(this.px + 24, this.py - 2, 25, -speed, damage, 'b-proton');
      } else if (id === 'secondary-mine-layer') {
        const mine = this.spawnPlayerBullet(
          this.px,
          this.py + 20,
          rnd(-18, 18),
          speed * 0.34,
          damage,
          'b-proton',
        );
        mine.w = mine.h = 18;
        mine.splash = { radius: 72, ratio: 0.82 };
        mine.pierce = 0;
        mine.img.setScale(1.5);
      } else if (id === 'secondary-drone-swarm') {
        for (const side of [-1, 1]) {
          const drone = this.spawnPlayerBullet(
            this.px + side * 24,
            this.py + 2,
            side * 95,
            -speed * 0.72,
            damage,
            'b-missile',
            true,
          );
          drone.rotateToVelocity = true;
          drone.pierce = 1;
        }
      } else {
        this.spawnPlayerBullet(this.px - 10, this.py - 3, -18, -speed, damage * 0.58, 'b-vulcan');
        this.spawnPlayerBullet(this.px + 10, this.py - 3, 18, -speed, damage * 0.58, 'b-vulcan');
      }
      SFX.shoot(id.includes('seeker') || id.includes('drone') ? 'missile' : 'vulcan');
      const cooler = this.weaponCooler();
      const cap = cooler.heatCapacity;
      const heat = Math.min(cap, this.weaponRuntime.heat + stats.heat / 100);
      const locked = heat >= cap - 1e-6;
      const primaryProfile = isWeaponKind(this.session.cur)
        ? WEAPON_PROFILES[this.session.cur]
        : null;
      this.weaponRuntime = createWeaponRuntimeState({
        ...this.weaponRuntime,
        heat,
        locked,
        lockoutRemaining: locked
          ? Math.max(this.weaponRuntime.lockoutRemaining, primaryProfile?.heat.lockout ?? 0.6)
          : this.weaponRuntime.lockoutRemaining,
      });
      this.secondaryCd += 1 / Math.max(0.1, stats.fireRate);
      catchUp++;
    }
  }

  private eFire(x: number, y: number, spd: number, big = false): void {
    // 탄막 상한 — 발사 빈도를 아무리 끌어올려도 회피 불능 수준으로는 못 쌓인다.
    if (this.ebullets.length >= SPAWN.maxEnemyBullets) return;
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
    if (this.ebullets.length >= SPAWN.maxEnemyBullets) return;
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
    const px = part.x;
    const py = part.y;
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
    } else if (ph.type === 'spiral') {
      for (let arm = 0; arm < ph.arms; arm++)
        this.eFireAngle(px, py, B.spiralAngle + (arm / ph.arms) * Math.PI * 2, ph.speed);
      B.spiralAngle += ph.rotStep;
      SFX.eshoot();
    } else {
      for (let k = 0; k < ph.count; k++)
        this.spawnEnemyAt(ph.enemy, px + rnd(-18, 18), py + rnd(6, 24), {});
    }
  }

  /** 실드 파츠가 살아 있는 동안 코어는 무적 */
  private bossStageId(B: BossState): string | null {
    return B.def.stages?.[B.stage]?.id ?? null;
  }

  private partActive(part: BossPart, B: BossState): boolean {
    const stages = part.def.activeStages;
    const stageId = this.bossStageId(B);
    return !stages || !stageId || stages.includes(stageId);
  }

  private partExposed(part: BossPart, B: BossState): boolean {
    const gates = part.def.exposedBy;
    if (gates?.some((id) => B.parts.find((candidate) => candidate.def.id === id)?.alive === true))
      return false;
    return !B.parts.some(
      (candidate) =>
        candidate !== part &&
        candidate.alive &&
        this.partActive(candidate, B) &&
        candidate.def.protects?.includes(part.def.id) === true,
    );
  }

  private partProtectsCore(part: BossPart): boolean {
    return part.def.shield || part.def.protects?.includes('core') === true;
  }

  private updateBossAssembly(B: BossState): void {
    const capitalShip = ['warship', 'scrolling-warship'].includes(
      this.bossPresentation(B.def)?.kind ?? '',
    );
    const illustratedSnail = this.bossPresentation(B.def)?.kind === 'snail';
    const resolved = new Set<string>();
    for (let pass = 0; pass < B.parts.length + 1; pass++) {
      let progressed = false;
      for (const part of B.parts) {
        if (resolved.has(part.def.id)) continue;
        const parent = part.def.parentId
          ? B.parts.find((candidate) => candidate.def.id === part.def.parentId)
          : undefined;
        if (parent && !resolved.has(parent.def.id)) continue;

        let localX = part.def.dx;
        let localY = part.def.dy;
        const motion = part.def.motion;
        if (motion?.type === 'oscillate') {
          const offset = Math.sin(B.t * motion.speed + (motion.phase ?? 0)) * motion.amplitude;
          if (motion.axis === 'x') localX += offset;
          else localY += offset;
        } else if (motion?.type === 'orbit') {
          const angle = B.t * motion.speed + (motion.phase ?? 0);
          localX += Math.cos(angle) * motion.radiusX;
          localY += Math.sin(angle) * motion.radiusY;
        }

        // Dependency parents remain combat gates; spatial offsets are authored against the hull.
        // Boss data stores authored world-space offsets even when parentId expresses the
        // dependency hierarchy. Re-adding every ancestor offset made deep assemblies drift far
        // outside their hull artwork, most visibly on the giant snail and scrolling dreadnought.
        const parentX = B.x;
        const parentY = B.y;
        const parentRot = B.rotation;
        part.x = parentX + Math.cos(parentRot) * localX - Math.sin(parentRot) * localY;
        part.y = parentY + Math.sin(parentRot) * localX + Math.cos(parentRot) * localY;
        part.rotation = parentRot + (part.def.rotation ?? 0);
        part.img.setPosition(part.x, part.y).setRotation(part.rotation);
        if (part.def.crop) {
          this.applyCroppedPartLook(part, B);
        } else {
          part.img
            .setVisible(part.alive && this.partActive(part, B))
            .setAlpha(
              this.partExposed(part, B)
                ? illustratedSnail
                  ? part.def.role === 'weakpoint'
                    ? 0.9
                    : 0.34
                  : capitalShip
                    ? part.def.role === 'weakpoint'
                      ? 0.94
                      : 0.78
                    : 1
                : illustratedSnail
                  ? 0.12
                  : capitalShip
                    ? 0.22
                    : 0.42,
            );
        }
        resolved.add(part.def.id);
        progressed = true;
      }
      if (!progressed) break;
    }

    this.drawBossPartMarks(B);
    this.bossLinks.clear();
    for (const part of B.parts) {
      if (!part.alive || !this.partActive(part, B) || !this.partProtectsCore(part)) continue;
      this.bossLinks.lineStyle(
        capitalShip ? 1 : 2,
        0x6cc9ff,
        (capitalShip ? 0.1 : 0.32) + Math.sin(B.t * 5 + part.x) * (capitalShip ? 0.035 : 0.12),
      );
      this.bossLinks.lineBetween(part.x, part.y, B.x, B.y);
    }
    if (this.coreShielded(B)) {
      this.bossLinks.lineStyle(
        capitalShip ? 1 : 2,
        0x78d8ff,
        (capitalShip ? 0.12 : 0.3) + Math.sin(B.t * 4) * (capitalShip ? 0.04 : 0.12),
      );
      this.bossLinks.strokeCircle(B.x, B.y, Math.max(B.def.hitbox.w, B.def.hitbox.h) * 0.62);
    }
  }

  private advanceBossStage(B: BossState): void {
    const current = B.def.stages?.[B.stage];
    if (!current?.advanceWhenDestroyed || !B.def.stages?.[B.stage + 1]) return;
    const ready = current.advanceWhenDestroyed.every(
      (id) => !B.parts.find((part) => part.def.id === id)?.alive,
    );
    if (!ready) return;
    B.stage++;
    B.phase = -1;
    B.cool = 0.8;
    const next = B.def.stages[B.stage];
    this.banner(next?.nameKey ? t(next.nameKey) : `PHASE ${B.stage + 1}`, 1.7, '#8fe8ff');
    this.shake = Math.max(this.shake, 4);
    SFX.warn();
    if (this.bossPresentation(B.def)?.kind === 'scrolling-warship') {
      this.scrollSpd = Math.max(this.level.scroll.boss, 58 + B.stage * 15);
      this.shake = Math.max(this.shake, 8);
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(i * 85, () => {
          if (this.boss === B)
            this.addBoom(B.x + rnd(-72, 72), B.y + rnd(-105, 105), 0.9 + i * 0.13, i === 3);
        });
      }
      const sectionWave = this.add
        .image(B.x, B.y, 'hazard-disaster-shockwave')
        .setDepth(DEPTH.enemy + 0.6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff9c53)
        .setScale(0.12)
        .setAlpha(0.88);
      this.tweens.add({
        targets: sectionWave,
        scale: 1.5,
        alpha: 0,
        duration: 620,
        ease: 'Quart.easeOut',
        onComplete: () => sectionWave.destroy(),
      });
    }
  }

  private coreShielded(B: BossState): boolean {
    const stage = B.def.stages?.[B.stage];
    if (stage && !stage.coreTargetable) return true;
    return B.parts.some(
      (part) => part.alive && this.partActive(part, B) && this.partProtectsCore(part),
    );
  }

  /**
   * Returns exposed assembly targets that must absorb special-weapon damage before the core.
   * Stage gates are preferred when coreTargetable=false even when they are armor rather than
   * legacy shield parts, preventing supers from bypassing a v2 destruction stage.
   */
  private bossDamageProxyParts(B: BossState, limit = 1): BossPart[] {
    const exposed = B.parts.filter(
      (part) => part.alive && this.partActive(part, B) && this.partExposed(part, B),
    );
    const protectors = exposed.filter((part) => this.partProtectsCore(part));
    if (protectors.length > 0) return protectors.slice(0, limit);
    if (!this.coreShielded(B)) return [];

    const gateIds = new Set(B.def.stages?.[B.stage]?.advanceWhenDestroyed ?? []);
    const stageGates = exposed.filter((part) => gateIds.has(part.def.id));
    return (stageGates.length > 0 ? stageGates : exposed).slice(0, limit);
  }

  private damagePart(part: BossPart, B: BossState, dmg: number): void {
    if (!part.alive) return;
    part.hp -= dmg * (part.def.damageMultiplier ?? 1);
    part.flashT = 0.05;
    if (part.hp <= 0) {
      part.alive = false;
      part.img.clearTint();
      const major = ['shield', 'engine', 'weakpoint'].includes(part.def.role ?? '');
      if (major) {
        vibrate(50);
        this.slomo(0.45, 0.18);
      }
      this.addBoom(part.x, part.y, major ? 1.45 : 0.8, major);
      const score = part.def.destroyScore ?? (major ? 500 : 180);
      this.session.score += score;
      this.addFloatText(part.x, part.y, `+${score}`, '#ffd76a');
      // crop 파트는 선체의 한 조각이라, 회수하지 않고 그을린 자국으로 남겨 파괴 흔적을 보여준다.
      if (!part.def.crop) this.pool.release(part.img);
      this.advanceBossStage(B);
    }
  }

  private damagePlayer(raw: number): void {
    if (!this.alive || this.inv > 0 || this.god) return;
    this.commitPlayerDamage(raw, false);
  }

  /**
   * Scripted set-piece damage deliberately bypasses temporary super/invulnerability frames.
   * It is kept non-lethal: an unavoidable cinematic should cost resources, never end a run
   * solely because the player had no legal dodge.
   */
  private damagePlayerForced(raw: number, label: string): void {
    if (!this.alive || this.god) return;
    const effectiveHp = Math.max(0, this.session.shield) + Math.max(0, this.session.armor);
    const requested = Math.max(1, Math.round(raw * this.diff.dmg));
    const forced = Math.min(requested, Math.max(0, effectiveHp - 1));
    if (forced <= 0) return;
    this.commitPlayerDamage(forced, true, label, true);
  }

  private commitPlayerDamage(
    raw: number,
    forced: boolean,
    label = '',
    alreadyDifficultyScaled = false,
  ): void {
    this.regenT = 0;
    const d = alreadyDifficultyScaled ? Math.round(raw) : Math.round(raw * this.diff.dmg);
    const r = applyDamage(this.session, d);
    this.session.shield = r.shield;
    this.session.armor = r.armor;
    if (!forced) this.inv = PLAYER.invulnAfterHit;
    SFX.hit();
    vibrate(forced ? [60, 28, 90] : 40);
    this.slomo(forced ? 0.4 : 0, forced ? 0.09 : 0.05);
    this.shake = Math.min(forced ? 9 : 7, this.shake + (forced ? 5 : 3));
    if (forced) {
      this.addFloatText(this.px, this.py - 28, `${label || 'UNAVOIDABLE'}  -${d}`, '#ff7c72');
      const strike = this.add
        .image(this.px, this.py, 'super-shockwave')
        .setDepth(DEPTH.phantom + 0.8)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff3535)
        .setAlpha(0.92)
        .setScale(0.12);
      this.tweens.add({
        targets: strike,
        scale: 0.92,
        alpha: 0,
        duration: 420,
        ease: 'Quart.easeOut',
        onComplete: () => strike.destroy(),
      });
    }
    if (r.dead) {
      this.alive = false;
      this.addBoom(this.px, this.py, 1.9, true);
      this.addBoom(this.px - 11, this.py + 8, 1.4, false);
      this.addBoom(this.px + 11, this.py - 8, 1.4, false);
      this.playerImg.setVisible(false);
      this.pilotHullOverlay?.setVisible(false);
      this.flameImg.setVisible(false);
      this.podL?.setVisible(false);
      this.podR?.setVisible(false);
      this.satellite?.setVisible(false);
      vibrate(160);
      this.slomo(0.3, 0.7);
      this.deathT = 1.4;
    }
  }

  /** 착탄 스플래시(미사일) — 반경 내 잡몹 피해 + 경량 폭발 연출 (셰이크 없음) */
  private addImpact(x: number, y: number, bullet: ShotSpec, shielded = false): void {
    const inferred =
      bullet.impactFx ??
      ({
        'b-vulcan': 'spark',
        'b-pulse': 'pulse',
        'b-proton': 'plasma',
        'b-light': 'arc',
        'b-laser': 'scorch',
        'b-missile': 'blast',
      }[bullet.sprite] as string | undefined) ??
      'spark';
    const visual = IMPACT_VISUALS[inferred] ?? IMPACT_VISUALS.spark!;
    const color = shielded ? 0x78c8ff : visual.color;
    const core = this.fxPool.get('impact-core', x, y);
    core
      .setDepth(DEPTH.boom + 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(visual.scale * 0.35);
    const ring = this.fxPool.get('impact-ring', x, y);
    ring
      .setDepth(DEPTH.boom + 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(visual.scale * 0.18)
      .setRotation(rnd(0, Math.PI * 2));
    this.impacts.push({ core, ring, t: 0, scale: visual.scale });

    const sparkBudget = Math.min(visual.sparks, Math.max(0, 180 - this.sparks.length));
    for (let k = 0; k < sparkBudget; k++) {
      const a = rnd(0, Math.PI * 2);
      const speed = rnd(35, 120) * visual.scale;
      const spark = this.fxPool.get('spark', x, y);
      spark
        .setDepth(DEPTH.boom)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(rnd(0.55, 1.2));
      this.sparks.push({
        img: spark,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        t: 0.15,
      });
    }
  }

  private splashHit(
    x: number,
    y: number,
    splash: { radius: number; ratio: number },
    dmg: number,
    exclude?: Enemy,
  ): void {
    const sd = dmg * splash.ratio;
    const r2 = splash.radius * splash.radius;
    // 길이 스냅샷: killEnemy의 onDeath 분열체(순회 중 push)가 이 폭발에 소급 피격되지 않게
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (!e || e.dead || e === exclude) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < r2) {
        e.hp -= sd;
        e.flashT = 0.05;
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    const img = this.fxPool.get('az-explosion', x, y);
    img
      .setFrame(0)
      .setDepth(DEPTH.boom)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.1)
      .setRotation(rnd(0, 6.283));
    const ring = this.fxPool.get('boom-ring', x, y);
    ring
      .setDepth(DEPTH.boom + 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.35);
    this.booms.push({ x, y, t: 0.25, scale: splash.radius / 44, img, ring });
    SFX.boom();
  }

  private projectileDamage(bullet: Bullet, target: 'enemy' | 'part' | 'core' = 'enemy'): number {
    let damage = bullet.dmg;
    if (bullet.range) {
      const distance = Math.hypot(bullet.x - bullet.originX, bullet.y - bullet.originY);
      if (distance > bullet.range.optimal) {
        const fade = clamp(
          (distance - bullet.range.optimal) / Math.max(1, bullet.range.max - bullet.range.optimal),
          0,
          1,
        );
        damage *= Phaser.Math.Linear(1, bullet.range.farMultiplier, fade);
      }
    }
    if (target === 'part' && bullet.charge) damage *= bullet.charge.partMultiplier;
    return damage;
  }

  private detonateCluster(bullet: Bullet, exclude?: Enemy): void {
    if (!bullet.lock) return;
    const ratio = clamp(0.16 + bullet.lock.clusterCount * 0.045, 0.24, 0.62);
    this.splashHit(
      bullet.x,
      bullet.y,
      { radius: bullet.lock.clusterRadius, ratio },
      bullet.dmg,
      exclude,
    );
    const burst = Math.min(8, bullet.lock.clusterCount);
    for (let i = 0; i < burst; i++) {
      const angle = (i / burst) * Math.PI * 2 + rnd(-0.18, 0.18);
      const radius = rnd(8, bullet.lock.clusterRadius * 0.7);
      this.addImpact(bullet.x + Math.cos(angle) * radius, bullet.y + Math.sin(angle) * radius, {
        ...bullet,
        impactFx: 'blast',
      });
    }
  }

  private activeComboMultiplier(): number {
    return Math.min(3, 1 + Math.floor(this.combo / 8) * 0.25);
  }

  private registerComboKill(x: number, y: number): number {
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.75;
    this.comboPeak = Math.max(this.comboPeak, this.combo);
    if (this.combo % 10 === 0) {
      const ring = this.add
        .image(x, y, 'boom-ring')
        .setDepth(DEPTH.boom + 0.4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(this.combo >= 30 ? 0xff7b5d : 0xffe36d)
        .setScale(0.3);
      this.tweens.add({
        targets: ring,
        scale: this.combo >= 30 ? 5.2 : 3.6,
        alpha: 0,
        duration: 420,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
      const callout = this.combo >= 50 ? 'ANNIHILATION' : this.combo >= 30 ? 'RAMPAGE' : 'CHAIN';
      this.addFloatText(
        x,
        y - 18,
        `${callout} ${this.combo}`,
        this.combo >= 30 ? '#ff8a62' : '#ffe36d',
      );
      this.shake = Math.min(7, this.shake + (this.combo >= 30 ? 3.2 : 1.6));
      this.slomo(this.combo >= 30 ? 0.48 : 0.68, 0.09);
      vibrate(this.combo >= 30 ? 55 : 28);
    }
    this.comboText.setScale(1.22);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 120, ease: 'Back.easeOut' });
    return this.activeComboMultiplier();
  }

  private updateCombo(dt: number): void {
    if (this.comboT > 0) this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 0;
    if (this.combo >= 3) {
      const multiplier = this.activeComboMultiplier();
      this.comboText
        .setVisible(true)
        .setAlpha(Math.min(1, this.comboT * 1.8))
        .setText(`${this.combo} HIT  ×${multiplier.toFixed(2)}`)
        .setColor(this.combo >= 30 ? '#ff8a62' : this.combo >= 10 ? '#ffe36d' : '#b8f4ff');
    } else {
      this.comboText.setVisible(false);
    }
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.session.kills++;
    const comboMultiplier = this.registerComboKill(e.x, e.y);
    const score = Math.round(
      e.score * (this.currentSector?.bonusMultiplier ?? 1) * comboMultiplier,
    );
    this.session.score += score;
    this.addBoom(e.x, e.y, 1.25 + Math.min(0.38, this.combo * 0.008), false);
    this.addFloatText(e.x, e.y, `+${score}`, '#ffd76a');
    const orb = DATA.enemies.orb;
    const chance = e.def.behavior === 'turret' ? orb.chanceTurret : orb.chance;
    const lootChance = Math.min(0.72, chance + Math.min(0.24, this.combo * 0.004));
    if (Math.random() < lootChance)
      this.dropOrb(e.x, e.y, false, Math.max(35, Math.round(score * 0.26)));
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
      this.clearSnailRuntime(false);
      this.inv = Math.max(this.inv, B.def.shopDelay + 2);
      for (const hostile of this.ebullets) this.pool.release(hostile.img);
      this.ebullets = [];
      for (const enemy of this.enemies) {
        if (!enemy.dead) this.addBoom(enemy.x, enemy.y, 0.65, false);
        this.pool.release(enemy.img);
      }
      this.enemies = [];
      for (let k = 0; k < 6; k++) {
        this.time.delayedCall(k * 130, () => {
          if (this.scene.isActive(SceneKeys.Game))
            this.addBoom(bx + rnd(-26, 26), by + rnd(-24, 24), rnd(1.2, 2.1), k === 0);
        });
      }
      vibrate([70, 50, 160]);
      this.slomo(0.25, 0.9);
      this.whiteFlash.setVisible(true).setAlpha(0.85);
      this.tweens.add({
        targets: this.whiteFlash,
        alpha: 0,
        duration: 550,
        onComplete: () => this.whiteFlash.setVisible(false),
      });
      this.session.score += B.def.killScore;
      this.addFloatText(bx, by, `+${B.def.killScore}`, '#7ef7ff');
      B.img.clearTint();
      for (const part of B.parts) {
        if (part.alive) {
          part.alive = false;
          this.addBoom(part.x, part.y, 1.4, false);
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
      this.bossLinks.clear();
      this.bossMarks.clear();
      this.clearDamageSmoke();
      this.bossBar.setVisible(false);
      this.bossLabel.setVisible(false);
      this.bossPartStatus.setVisible(false);
      this.scrollSpd = this.level.scroll.base + this.session.wave * this.level.scroll.perWave;
    }
  }

  /* ---------- 이펙트/드랍 ---------- */
  private addBoom(x: number, y: number, scale: number, big: boolean): void {
    const img = this.fxPool.get('az-explosion', x, y);
    img
      .setFrame(0)
      .setDepth(DEPTH.boom)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.4 * scale)
      .setRotation(rnd(0, 6.283));
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

  private dropOrb(x: number, y: number, forceS = false, amount = 75): void {
    this.session.orbCount++;
    const orb = DATA.enemies.orb;
    const n = this.session.orbCount;
    // 현장 드롭은 즉석 업그레이드가 아니라 상점 경제를 보조하는 보급품이다.
    const type =
      forceS || n % orb.everyNthIsSuper === 0
        ? 'S'
        : n % orb.everyNthIsRear === 0
          ? Math.floor(n / orb.everyNthIsRear) % 2 === 1
            ? 'H'
            : 'E'
          : 'C';
    const texture: Record<OrbEnt['type'], string> = {
      C: 'pickup-credit',
      H: 'pickup-repair',
      E: 'pickup-coolant',
      S: 'pickup-super',
    };
    const img = this.pool.get(texture[type], x, y);
    img.setDepth(DEPTH.orb).setScale(0.62);
    const glow = this.pool.get('orb-glow', x, y);
    glow
      .setDepth(DEPTH.orb - 0.5)
      .setScale(0.74)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.orbs.push({ x, y, vy: orb.fallSpeed, t: 0, type, amount, img, glow });
  }

  /* ---------- 슈퍼 Jungjioo ---------- */
  /** 사이드킥 표시체 생성 — 세션 보유 시(입장/이어하기) 또는 W오브 획득 순간 */
  private createSidekickVisuals(): void {
    if (this.session.sidekick === 'pods' && !this.podL) {
      this.podL = this.add
        .image(this.px - 26, this.py + 8, 'ship-mite')
        .setDepth(DEPTH.player - 0.2);
      this.podR = this.add
        .image(this.px + 26, this.py + 8, 'ship-mite')
        .setDepth(DEPTH.player - 0.2);
      this.podL.setTint(0x8fd3ff);
      this.podR.setTint(0x8fd3ff);
    } else if (this.session.sidekick === 'satellite' && !this.satellite) {
      this.satellite = this.add
        .image(this.px, this.py - 40, 'orb-S')
        .setDepth(DEPTH.player - 0.2)
        .setScale(1.2);
    }
  }

  private playSuperCinematic(color: number): void {
    this.shake = 7;
    this.slomo(0.34, 0.16);
    vibrate([28, 18, 72]);

    const speedlines = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'super-speedlines')
      .setDepth(DEPTH.phantom + 0.2)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setTint(color)
      .setAlpha(0.9)
      .setScale(0.86);
    this.tweens.add({
      targets: speedlines,
      scale: 1.12,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => speedlines.destroy(),
    });

    const impact = this.add
      .image(this.px, this.py, 'super-impact-burst')
      .setDepth(DEPTH.phantom + 0.65)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(0.12)
      .setAlpha(1);
    this.tweens.add({
      targets: impact,
      scale: 1.2,
      alpha: 0,
      duration: 390,
      ease: 'Quart.easeOut',
      onComplete: () => impact.destroy(),
    });

    const shockwave = this.add
      .image(this.px, this.py, 'super-shockwave')
      .setDepth(DEPTH.phantom + 0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(0.14)
      .setAlpha(0.95);
    this.tweens.add({
      targets: shockwave,
      scale: 1.45,
      alpha: 0,
      duration: 540,
      ease: 'Quart.easeOut',
      onComplete: () => shockwave.destroy(),
    });

    this.whiteFlash.setFillStyle(color, 1).setVisible(true).setAlpha(0.78);
    this.tweens.add({
      targets: this.whiteFlash,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => this.whiteFlash.setVisible(false),
    });

    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02030a, 0.42)
      .setOrigin(0, 0)
      .setDepth(DEPTH.phantom - 1);
    this.tweens.add({
      targets: shade,
      alpha: 0,
      duration: 420,
      onComplete: () => shade.destroy(),
    });

    const rays = this.add
      .graphics()
      .setPosition(this.px, this.py)
      .setDepth(DEPTH.phantom + 0.4);
    rays.lineStyle(3, color, 0.86);
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + rnd(-0.045, 0.045);
      const inner = rnd(18, 34);
      const outer = rnd(90, 210);
      rays.lineBetween(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
      );
    }
    rays.setScale(0.24).setAlpha(0.95).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: rays,
      scale: 1.35,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => rays.destroy(),
    });

    const ring = this.add
      .image(this.px, this.py, 'boom-ring')
      .setDepth(DEPTH.phantom + 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(0.18);
    this.tweens.add({
      targets: ring,
      scale: 7.5,
      alpha: 0,
      duration: 520,
      ease: 'Quart.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.055,
      duration: 90,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  private startSuper(): void {
    // pendingShop 카운트다운 중 발동하면 상점 전환으로 즉시 소멸되므로 차단
    if (
      !this.alive ||
      this.sp ||
      this.ps ||
      this.jw ||
      this.kb ||
      this.session.superN <= 0 ||
      this.pendingShop > 0
    )
      return;
    this.session.superN--;
    const superColor: Record<GameSession['pilot'], number> = {
      jungjioo: 0x8c7dff,
      parksulhee: 0xff63c6,
      youngjioo: 0x75ff9c,
      keunaebi: 0xff9f43,
    };
    this.playSuperCinematic(superColor[this.session.pilot]);
    // The final killer snail always retaliates to a player super, regardless of pilot.
    this.beginSnailRageRetaliation();
    if (this.session.pilot === 'keunaebi') {
      // 지우큰애비: "하무야 물어! 쉭쉭!" — 푸들 하무 전방 돌진
      const glow = this.add
        .image(this.px, this.py, 'super-aura')
        .setDepth(DEPTH.phantom - 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(3.2)
        .setVisible(false);
      const img = this.add
        .image(this.px, this.py, 'poodle')
        .setDepth(DEPTH.phantom)
        .setScale(KB.scale)
        .setVisible(false);
      this.kb = {
        t: 0,
        phase: 'flight',
        img,
        glow,
        x: clamp(this.px, 75, GAME_WIDTH - 75),
        y: this.py - 30,
        vy: KB.vyStart,
        phaseT: 0,
        trailT: 0,
        bossHits: 0,
        bossTickT: 0,
      };
      this.inv = 999;
      this.auraImg.setVisible(true);
      vibrate(80);
      SFX.superOn();
      this.shake = 5;
      return;
    }
    if (this.session.pilot === 'youngjioo') {
      // 어린지우: "비켜!" — 초록 산에서 앵무새떼가 부와아아악 쏟아진다
      const bg = this.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'jw-mountains')
        .setOrigin(0, 0)
        .setDepth(DEPTH.hole - 0.5)
        .setAlpha(0);
      this.jw = { t: 0, parrots: [], spawned: 0, bossHits: 0, yellN: 0, yellT: 0, bg };
      this.inv = 999;
      this.auraImg.setVisible(true);
      vibrate(80);
      SFX.superOn();
      SFX.voice('비켜!', 'ko-KR', 1.2, 1.08);
      this.shake = 5;
      return;
    }
    if (this.session.pilot === 'parksulhee') {
      // 박설희: 거대 배드민턴 채가 사방에서 연속 스윙
      this.ps = { t: 0, swings: [], spawned: 0, bossSwings: 0 };
      this.inv = 999;
      this.auraImg.setVisible(true);
      vibrate(80);
      SFX.superOn();
      this.shake = 5;
      return;
    }
    const n = 5 + (Math.random() < 0.6 ? 1 : 0);
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
    vibrate(80);
    SFX.superOn();
    SFX.voice('Hey I am Jungjioo!', 'en-US', 1.08, 1.04);
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
      SFX.voice('우린 엄청 빨라! Spid!!', 'ko-KR', 1.25, 1.12);
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
        // 모든 v2 단계 잠금을 지키며 현재 노출된 보호/게이트 파츠부터 부순다.
        const proxyPart = this.bossDamageProxyParts(B)[0];
        if (proxyPart) this.damagePart(proxyPart, B, SUPER.phantomBossDamage);
        else if (!this.coreShielded(B)) this.damageBoss(SUPER.phantomBossDamage);
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

  private updatePS(dt: number): void {
    const ps = this.ps;
    if (!ps) return;
    ps.t += dt;
    if (ps.t < PS.bubbleUntil) {
      this.showBubble(PS_BUBBLE, this.px, this.py - 34);
      return;
    }
    this.bubble.setVisible(false);
    // 스윙 생성: 상하좌우에서 시차를 두고
    while (ps.spawned < PS.swingCount && ps.t >= PS.bubbleUntil + ps.spawned * PS.swingEvery) {
      const dir = PS_DIRS[ps.spawned % PS_DIRS.length] ?? 'L';
      const lane =
        dir === 'L' || dir === 'R' ? rnd(140, GAME_HEIGHT - 180) : rnd(70, GAME_WIDTH - 70);
      const img = this.add
        .image(0, 0, 'racket')
        .setDepth(DEPTH.phantom)
        .setScale(1.8)
        .setVisible(true);
      if (dir === 'T') img.setRotation(Math.PI);
      ps.swings.push({ img, dir, t0: ps.t, lane, bossCounted: false });
      ps.spawned++;
      SFX.swoosh();
      vibrate(30);
    }
    // 스윙 진행: 사방에서 슁슁슁 — 지나간 궤적의 적 일망타진
    for (let i = ps.swings.length - 1; i >= 0; i--) {
      const sw = ps.swings[i];
      if (!sw) continue;
      const p = (ps.t - sw.t0) / PS.swingDur;
      if (p >= 1) {
        sw.img.destroy();
        ps.swings.splice(i, 1);
        continue;
      }
      const wob = Math.sin(p * Math.PI) * 0.35;
      let fx = 0;
      let fy = 0;
      if (sw.dir === 'L') {
        sw.img.setPosition(-140 + (GAME_WIDTH + 300) * p, sw.lane);
        sw.img.setRotation(-0.5 + p * 0.9 + wob * 0.2);
        fx = sw.img.x + 70;
        for (const e of this.enemies) if (!e.dead && e.x < fx) this.killEnemy(e);
      } else if (sw.dir === 'R') {
        sw.img.setPosition(GAME_WIDTH + 140 - (GAME_WIDTH + 300) * p, sw.lane);
        sw.img.setRotation(0.5 - p * 0.9 - wob * 0.2);
        fx = sw.img.x - 70;
        for (const e of this.enemies) if (!e.dead && e.x > fx) this.killEnemy(e);
      } else if (sw.dir === 'T') {
        sw.img.setPosition(sw.lane, -160 + (GAME_HEIGHT + 340) * p);
        sw.img.setRotation(Math.PI + (-0.4 + p * 0.8));
        fy = sw.img.y + 80;
        for (const e of this.enemies) if (!e.dead && e.y < fy) this.killEnemy(e);
      } else {
        sw.img.setPosition(sw.lane, GAME_HEIGHT + 160 - (GAME_HEIGHT + 340) * p);
        sw.img.setRotation(0.4 - p * 0.8);
        fy = sw.img.y - 80;
        for (const e of this.enemies) if (!e.dead && e.y > fy) this.killEnemy(e);
      }
      // 보스 타격: 스윙당 1회, 최대 3회
      const B = this.boss;
      if (B && !sw.bossCounted && ps.bossSwings < PS.maxBossSwings) {
        const crossed =
          (sw.dir === 'L' && B.x < fx) ||
          (sw.dir === 'R' && B.x > fx) ||
          (sw.dir === 'T' && B.y < fy) ||
          (sw.dir === 'B' && B.y > fy);
        if (crossed) {
          sw.bossCounted = true;
          ps.bossSwings++;
          vibrate(70);
          this.shake = Math.min(7, this.shake + 4);
          const proxyParts = this.bossDamageProxyParts(B, 3);
          if (proxyParts.length > 0) {
            const damage = (PS.partDamagePerSwing * 2) / proxyParts.length;
            for (const part of proxyParts) this.damagePart(part, B, damage);
          } else if (!this.coreShielded(B)) {
            B.flashT = 0.08;
            this.damageBoss(PS.bossDamagePerSwing);
          }
        }
      }
    }
    this.reapEnemies();
    for (const b of this.ebullets) this.pool.release(b.img);
    this.ebullets.length = 0;

    if (ps.t >= PS.endAt && ps.swings.length === 0) {
      this.ps = null;
      this.inv = SUPER.endInvuln;
      this.auraImg.setVisible(false);
      this.bubble.setVisible(false);
    }
  }

  /** 뼈다귀 리코셰 — 벽에 튕기며 닿는 적을 갉아먹는다 (보스는 쿨다운 딜) */
  private updateBones(dt: number): void {
    if (this.bones.length === 0) return;
    const hb = DATA.enemies.hitbox;
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const bn = this.bones[i];
      if (!bn) continue;
      bn.life -= dt;
      bn.bhcd -= dt;
      bn.x += bn.vx * dt;
      bn.y += bn.vy * dt;
      // 화면 벽 반사
      if (bn.x < 12) {
        bn.x = 12;
        bn.vx = Math.abs(bn.vx);
      } else if (bn.x > GAME_WIDTH - 12) {
        bn.x = GAME_WIDTH - 12;
        bn.vx = -Math.abs(bn.vx);
      }
      if (bn.y < 44) {
        bn.y = 44;
        bn.vy = Math.abs(bn.vy);
      } else if (bn.y > GAME_HEIGHT - 14) {
        bn.y = GAME_HEIGHT - 14;
        bn.vy = -Math.abs(bn.vy);
      }
      bn.img.setPosition(bn.x, bn.y);
      bn.img.setRotation(bn.img.rotation + dt * 9);
      // 적 접촉 피해 — 개체별 히트 쿨다운(hcd)으로 갉아먹기
      for (const e of this.enemies) {
        if (e.dead || e.hcd > 0) continue;
        if (aabb(bn.x, bn.y, 22, 12, e.x, e.y, hb.w, hb.h)) {
          e.hp -= 6;
          e.hcd = 0.22;
          e.flashT = 0.05;
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      // 보스 접촉 — 뼈다귀별 쿨다운 딜 (실드 파츠 우선)
      const B = this.boss;
      if (B && B.entered && bn.bhcd <= 0) {
        const bhb = B.def.hitbox;
        if (aabb(bn.x, bn.y, 22, 12, B.x, B.y, bhb.w + 10, bhb.h + 10)) {
          bn.bhcd = 0.6;
          const proxyParts = this.bossDamageProxyParts(B, 3);
          if (proxyParts.length > 0) {
            const part = proxyParts[Math.floor(Math.random() * proxyParts.length)];
            if (part) this.damagePart(part, B, 4);
          } else if (!this.coreShielded(B)) {
            B.flashT = 0.05;
            this.damageBoss(4);
          }
        }
      }
      if (bn.life <= 0) {
        this.pool.release(bn.img);
        this.bones.splice(i, 1);
      }
    }
  }

  private updateKB(dt: number): void {
    const kb = this.kb;
    if (!kb) return;
    kb.t += dt;
    if (kb.t < KB.bubbleUntil) {
      this.showBubble(KB_BUBBLE, this.px, this.py - 34);
      return;
    }
    this.bubble.setVisible(false);
    if (!kb.img.visible) {
      kb.img.setVisible(true).setAlpha(1);
      kb.glow.setVisible(true);
      SFX.swoosh();
      vibrate(40);
    }
    const B = this.boss;
    if (kb.phase === 'flight') {
      // 느리게 출발 → 점차 가속 (화력집중 단일 돌진)
      kb.vy = Math.min(KB.vyMax, kb.vy + KB.accel * dt);
      kb.y -= kb.vy * dt;
      const wob = Math.sin(kb.t * 18) * 5;
      kb.img.setPosition(kb.x + wob, kb.y);
      kb.img.setRotation(Math.sin(kb.t * 14) * 0.1);
      kb.glow.setPosition(kb.x + wob, kb.y).setAlpha(0.5 + Math.sin(kb.t * 24) * 0.25);
      kb.trailT += dt;
      if (kb.trailT >= 0.045) {
        kb.trailT = 0;
        for (let i = 0; i < 3; i++) {
          const spark = this.fxPool.get('spark', kb.x + wob + rnd(-28, 28), kb.y + rnd(40, 88));
          spark
            .setDepth(DEPTH.phantom - 0.2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(i === 0 ? 0x71eaff : 0xff9f43)
            .setScale(rnd(0.8, 1.8));
          this.sparks.push({ img: spark, vx: rnd(-35, 35), vy: rnd(170, 310), t: 0 });
        }
      }
      for (const e of this.enemies) {
        if (!e.dead && Math.abs(e.x - kb.x) < KB.halfWidth && e.y > kb.y - 240 && e.y < kb.y + 220)
          this.killEnemy(e);
      }
      // 돌진 중 보스를 지나치면 1타
      if (
        B &&
        B.entered &&
        kb.bossHits < KB.maxBossHits &&
        kb.bossTickT <= 0 &&
        Math.abs(B.x - kb.x) < B.def.hitbox.w / 2 + KB.halfWidth &&
        kb.y < B.y + 50
      ) {
        this.kbBossBite(B);
        kb.bossTickT = KB.spinBossEvery;
      }
      if (kb.bossTickT > 0) kb.bossTickT -= dt;
      if (kb.y <= KB.spinY) {
        kb.phase = 'spin';
        kb.phaseT = 0;
        SFX.swoosh();
        vibrate(60);
      }
    } else if (kb.phase === 'spin') {
      // 사라지기 전 1.2초 — 뱅글뱅글 블렌더
      kb.phaseT += dt;
      kb.img.setPosition(kb.x, kb.y);
      kb.img.setRotation(kb.img.rotation + dt * 17);
      kb.glow.setPosition(kb.x, kb.y).setAlpha(0.6 + Math.sin(kb.phaseT * 40) * 0.3);
      this.shake = Math.min(6, this.shake + dt * 8);
      kb.trailT += dt;
      if (kb.trailT >= 0.12) {
        kb.trailT = 0;
        const ring = this.add
          .image(kb.x, kb.y, 'boom-ring')
          .setDepth(DEPTH.phantom - 0.1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffa34e)
          .setScale(0.4);
        this.tweens.add({
          targets: ring,
          scale: 4.8,
          alpha: 0,
          duration: 260,
          onComplete: () => ring.destroy(),
        });
      }
      const r2 = KB.spinRadius * KB.spinRadius;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - kb.x;
        const dy = e.y - kb.y;
        if (dx * dx + dy * dy < r2) this.killEnemy(e);
      }
      kb.bossTickT -= dt;
      if (
        B &&
        B.entered &&
        kb.bossHits < KB.maxBossHits &&
        kb.bossTickT <= 0 &&
        Math.hypot(B.x - kb.x, B.y - kb.y) < KB.spinRadius + B.def.hitbox.w / 2
      ) {
        this.kbBossBite(B);
        kb.bossTickT = KB.spinBossEvery;
      }
      if (kb.phaseT >= KB.spinDur) {
        kb.phase = 'fade';
        kb.phaseT = 0;
      }
    } else {
      // 페이드 아웃 — 회전 유지하며 사라진다
      kb.phaseT += dt;
      const p = Math.min(1, kb.phaseT / KB.fadeDur);
      kb.img.setRotation(kb.img.rotation + dt * 17);
      kb.img.setAlpha(1 - p).setScale(KB.scale * (1 + p * 0.5));
      kb.glow.setAlpha((1 - p) * 0.6);
      if (p >= 1) {
        kb.img.destroy();
        kb.glow.destroy();
        this.kb = null;
        this.inv = SUPER.endInvuln;
        this.auraImg.setVisible(false);
        this.bubble.setVisible(false);
        return;
      }
    }
    this.reapEnemies();
    for (const b of this.ebullets) this.pool.release(b.img);
    this.ebullets.length = 0;
  }

  /** 하무의 물기 — 실드 파츠 우선, 총 3회 상한 */
  private kbBossBite(B: BossState): void {
    const kb = this.kb;
    if (!kb) return;
    kb.bossHits++;
    vibrate(70);
    this.shake = Math.min(7, this.shake + 4);
    const proxyParts = this.bossDamageProxyParts(B, 3);
    if (proxyParts.length > 0) {
      const damage = (KB.partDamagePerHit * 2) / proxyParts.length;
      for (const part of proxyParts) this.damagePart(part, B, damage);
    } else if (!this.coreShielded(B)) {
      B.flashT = 0.08;
      this.damageBoss(KB.bossDamagePerHit);
    }
  }

  private updateJW(dt: number): void {
    const jw = this.jw;
    if (!jw) return;
    jw.t += dt;
    // 초록 산 배경 페이드 인/아웃 — 배경은 정지 화면 (사용자 지시: 스크롤 없음)
    const fadeIn = Math.min(1, jw.t / JW.bgFade);
    const fadeOut = Math.min(1, Math.max(0, (JW.endAt + 0.4 - jw.t) / JW.bgFade));
    jw.bg.setAlpha(0.93 * fadeIn * fadeOut);
    if (jw.t < JW.bubbleUntil) {
      this.showBubble(JW_BUBBLE, this.px, this.py - 34);
      return;
    }
    this.bubble.setVisible(false);
    // 앵무새 생성: spawnDur 동안 위에서 부와아아악
    const target = Math.min(
      JW.parrotCount,
      Math.floor(((jw.t - JW.bubbleUntil) / JW.spawnDur) * JW.parrotCount) + 1,
    );
    while (jw.spawned < target) {
      const img = this.add
        .image(0, 0, Math.random() < 0.5 ? 'parrot-g' : 'parrot-r')
        .setDepth(DEPTH.phantom)
        .setScale(rnd(1.0, 1.5));
      jw.parrots.push({
        img,
        x: rnd(16, GAME_WIDTH - 16),
        y: -30 - rnd(0, 50),
        vx: rnd(-70, 70),
        vy: rnd(520, 820),
        flap: rnd(0, 6.28),
        bossCounted: false,
      });
      jw.spawned++;
      if (jw.spawned % 4 === 1) SFX.chirp();
    }
    // "비켜!!!" 외침 — 정본 3종 순환
    jw.yellT += dt;
    if (jw.yellT >= JW.yellEvery && jw.parrots.length > 0) {
      jw.yellT = 0;
      const pr = jw.parrots[Math.floor(Math.random() * jw.parrots.length)];
      if (pr && pr.y > -10 && pr.y < GAME_HEIGHT - 60) {
        if (jw.yellN === 0) SFX.voice('비켜! 비켜! 비켜!!', 'ko-KR', 1.28, 1.18);
        const msg = JW_YELLS[jw.yellN % JW_YELLS.length] ?? '비켜!';
        jw.yellN++;
        this.addFloatText(pr.x + rnd(-12, 12), pr.y + rnd(-8, 4), msg, '#eaffe0');
      }
    }
    // 앵무새 진행: 급강하 + 날갯짓, 닿는 적 일망타진
    const B = this.boss;
    for (let i = jw.parrots.length - 1; i >= 0; i--) {
      const pr = jw.parrots[i];
      if (!pr) continue;
      pr.flap += dt * 26;
      pr.x = clamp(pr.x + pr.vx * dt, 10, GAME_WIDTH - 10);
      pr.y += pr.vy * dt;
      pr.img.setPosition(pr.x, pr.y);
      pr.img.setRotation(pr.vx * 0.002 + Math.sin(pr.flap * 0.5) * 0.1);
      const sy = pr.img.scaleY;
      pr.img.setScale(sy * (0.82 + 0.24 * Math.abs(Math.sin(pr.flap))), sy);
      for (const e of this.enemies) {
        if (!e.dead && Math.abs(e.x - pr.x) < 32 && Math.abs(e.y - pr.y) < 34) this.killEnemy(e);
      }
      // 보스 타격: 앵무새당 1회, 총 5회 상한
      if (B && B.entered && !pr.bossCounted && jw.bossHits < JW.maxBossHits) {
        const hb = B.def.hitbox;
        if (Math.abs(B.x - pr.x) < hb.w / 2 + 14 && Math.abs(B.y - pr.y) < hb.h / 2 + 16) {
          pr.bossCounted = true;
          jw.bossHits++;
          vibrate(50);
          this.shake = Math.min(7, this.shake + 3);
          const proxyParts = this.bossDamageProxyParts(B, 3);
          if (proxyParts.length > 0) {
            const damage = (JW.partDamagePerHit * 2) / proxyParts.length;
            for (const part of proxyParts) this.damagePart(part, B, damage);
          } else if (!this.coreShielded(B)) {
            B.flashT = 0.08;
            this.damageBoss(JW.bossDamagePerHit);
          }
        }
      }
      if (pr.y > GAME_HEIGHT + 50) {
        pr.img.destroy();
        jw.parrots.splice(i, 1);
      }
    }
    this.reapEnemies();
    for (const b of this.ebullets) this.pool.release(b.img);
    this.ebullets.length = 0;

    if (jw.t >= JW.endAt + 0.4 && jw.parrots.length === 0) {
      jw.bg.destroy();
      this.jw = null;
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
    const realDt = Math.min(0.05, deltaMs / 1000);
    if (this.slomoT > 0) {
      this.slomoT -= realDt;
      if (this.slomoT <= 0) this.timeScale = 1;
    }
    const dt = realDt * this.timeScale;
    this.worldT += dt;
    if (this.tutStep >= 0) this.updateTutorial(realDt);

    this.spaceBg.update(dt, this.scrollRev > 0 ? -this.scrollSpd * 0.55 : this.scrollSpd);
    this.updateProps(dt);
    this.updateGimmick(dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.bannerText.setAlpha(Math.min(1, this.bannerT * 2));
      if (this.bannerT <= 0) this.bannerText.setVisible(false);
    }
    if (this.immuneMsgT > 0) this.immuneMsgT -= dt;
    if (this.sp) this.updateSuper(dt);
    if (this.ps) this.updatePS(dt);
    if (this.jw) this.updateJW(dt);
    if (this.kb) this.updateKB(dt);
    this.updateBones(dt);
    if (this.auto) this.updateAutoPilot(dt);

    this.updatePlayer(dt);
    this.updateWaves(dt);
    this.updateBullets(dt);
    this.updateEBullets(dt);
    this.updateEnemies(dt);
    this.updateSnailBarrage(dt);
    this.updateBoss(dt);
    this.updateOrbs(dt);
    this.updateFx(dt);
    this.updateCombo(dt);
    this.updateHud();
    this.updateDebug();

    if (import.meta.env.DEV) {
      this.fpsTitleT += dt;
      if (this.fpsTitleT >= 0.25) {
        this.fpsTitleT = 0;
        document.title = `별의 일생 — ${this.game.loop.actualFps.toFixed(1)} fps`;
      }
    }

    // 슈퍼 진행 중에는 전환을 보류한 뒤 스타베이스에서 장비를 정비한다.
    if (this.pendingShop > 0 && !this.sp && !this.ps && !this.jw && !this.kb) {
      this.pendingShop -= dt;
      if (this.pendingShop <= 0 && this.alive) {
        saveProgression(this.progression);
        if (this.session.endless) {
          this.scene.restart({ session: this.session });
        } else {
          if (this.session.campaignDone) saveBest(this.session.score);
          this.scene.start(SceneKeys.Shop, {
            session: this.session,
            clearedLevel: Math.max(1, this.session.level - 1),
          });
        }
        return;
      }
    }
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        saveBest(this.session.score);
        saveProgression(this.progression);
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
      const shakeX = rnd(-this.shake, this.shake);
      const shakeY = rnd(-this.shake, this.shake);
      this.cameras.main.setScroll(shakeX + this.envCameraX, shakeY);
      this.hudRoot.setPosition(shakeX + this.envCameraX, shakeY);
    } else {
      this.cameras.main.setScroll(this.envCameraX, 0);
      this.hudRoot.setPosition(this.envCameraX, 0);
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
    if (this.stickOn) {
      // 아날로그 스틱: 상대 조작 — 기울인 방향·크기로 속도 직결 (지연 없는 즉답감)
      const len = Math.hypot(this.stickDx, this.stickDy);
      let mag = Math.min(1, len / STICK.radius);
      mag = mag < STICK.deadzone ? 0 : Math.pow(mag, STICK.curve);
      if (mag > 0 && len > 0) {
        this.pvx = (this.stickDx / len) * STICK.speed * this.engineScale * mag;
        this.pvy = (this.stickDy / len) * STICK.speed * this.engineScale * mag;
      } else {
        const fr = Math.pow(PLAYER.friction, f60);
        this.pvx *= fr;
        this.pvy *= fr;
      }
    } else if (this.touchOn) {
      // 스프링 추적 — 자동 조종(?auto 소크 봇)용으로 유지
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
      const maxSpeed = PLAYER.maxSpeed * this.engineScale;
      const acceleration = PLAYER.acc * (0.82 + this.engineScale * 0.18);
      this.pvx = clamp(this.pvx + ax * acceleration * dt, -maxSpeed, maxSpeed);
      this.pvy = clamp(this.pvy + ay * acceleration * dt, -maxSpeed, maxSpeed);
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
    // 태양풍(기믹): 속도 대입에 소멸되지 않도록 위치 변위로 — 조작 방식과 무관하게 동일한 밀림
    this.px += this.environmentWind * 0.62 * dt;
    this.px = clamp(this.px + this.pvx * dt * this.environmentSpeed, PLAYER.minX, PLAYER.maxX);
    this.py = clamp(this.py + this.pvy * dt * this.environmentSpeed, PLAYER.minY, PLAYER.maxY);

    const wantFire = Boolean(
      this.touchOn || this.stickOn || this.keyMap?.space?.isDown || this.keyMap?.z?.isDown,
    );
    this.updatePrimaryWeapon(dt, wantFire);
    this.updateSecondaryWeapon(dt, wantFire);
    if (this.inv > 0 && !this.sp && !this.ps && !this.jw && !this.kb) this.inv -= dt;

    // 후방무기 — R오브 아이템제, 레벨 스케일 (rearLv 1~5)
    const rear = this.session.rear ? DATA.equipment.rear[this.session.rear] : undefined;
    if (rear && this.alive) {
      const rl = this.session.rearLv;
      this.rearCd -= dt;
      if (this.rearCd <= 0) {
        this.rearCd = rear.fireEvery * (1 - 0.09 * (rl - 1));
        if (rear.kind === 'tail') {
          const offs = rl >= 3 ? [-9, 0, 9] : [-6, 6];
          for (const off of offs)
            this.spawnPlayerBullet(
              this.px + off,
              this.py + 16,
              rnd(-25, 25),
              520,
              1.6 + 0.3 * rl,
              'b-vulcan',
            );
        } else if (rear.kind === 'side') {
          const dmg = 2.2 + 0.4 * rl;
          this.spawnPlayerBullet(this.px - 12, this.py, -430, 0, dmg, 'b-light');
          this.spawnPlayerBullet(this.px + 12, this.py, 430, 0, dmg, 'b-light');
          if (rl >= 4) {
            this.spawnPlayerBullet(this.px - 12, this.py - 6, -330, -330, dmg, 'b-light');
            this.spawnPlayerBullet(this.px + 12, this.py - 6, 330, -330, dmg, 'b-light');
          }
        } else if (rear.kind === 'homing') {
          const dmg = 4.5 + 0.6 * rl;
          this.spawnPlayerBullet(this.px, this.py + 12, rnd(-40, 40), 240, dmg, 'b-proton', true);
          if (rl >= 4)
            this.spawnPlayerBullet(this.px, this.py + 12, rnd(-40, 40), 300, dmg, 'b-proton', true);
        } else {
          // 뼈다귀: 벽 반사 리코셰 — 홀수 강화=속도, 짝수 강화=유지시간 (사용자 지시)
          const speedUps = Math.floor(rl / 2);
          const durUps = Math.floor((rl - 1) / 2);
          const sp = 250 + 55 * speedUps;
          const ang = rnd(0.6, 2.5);
          this.bones.push({
            x: this.px,
            y: this.py + 14,
            vx: Math.cos(ang) * sp * (Math.random() < 0.5 ? 1 : -1),
            vy: Math.abs(Math.sin(ang)) * sp,
            life: 3.4 + 1.3 * durUps,
            bhcd: 0,
            img: this.pool.get('b-bone', this.px, this.py + 14).setDepth(DEPTH.bullet),
          });
          SFX.swoosh();
        }
      }
    }
    // 사이드킥
    const side = this.session.sidekick ? DATA.equipment.sidekick[this.session.sidekick] : undefined;
    if (side && this.alive) {
      const sl = this.session.sideLv;
      const sideEvery = side.fireEvery * (1 - 0.15 * (sl - 1));
      this.sideCd -= dt;
      if (this.podL && this.podR) {
        this.podL.setPosition(this.px - 26, this.py + 8);
        this.podR.setPosition(this.px + 26, this.py + 8);
        if (this.sideCd <= 0) {
          this.sideCd = sideEvery;
          const dmg = 1.4 + 0.4 * sl;
          this.spawnPlayerBullet(this.px - 26, this.py - 4, 0, -640, dmg, 'b-pulse');
          this.spawnPlayerBullet(this.px + 26, this.py - 4, 0, -640, dmg, 'b-pulse');
        }
      } else if (this.satellite) {
        this.satAng += dt * 2.6;
        const sx = this.px + Math.cos(this.satAng) * 44;
        const sy = this.py + Math.sin(this.satAng) * 44;
        this.satellite.setPosition(sx, sy);
        if (this.sideCd <= 0) {
          this.sideCd = sideEvery;
          const tgt = this.nearestTarget(sx, sy);
          if (tgt) {
            const L = Math.hypot(tgt.x - sx, tgt.y - sy) || 1;
            this.spawnPlayerBullet(
              sx,
              sy,
              ((tgt.x - sx) / L) * 480,
              ((tgt.y - sy) / L) * 480,
              3 + 0.7 * sl,
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
      const s = this.fxPool.get('spark-cyan', this.px + rnd(-3, 3), this.py + 23);
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
    if (
      this.regenT > PLAYER.shieldRegenDelay * 1.5 &&
      this.armorRegen > 0 &&
      this.session.armor < this.session.armorMax
    ) {
      this.session.armor = Math.min(
        this.session.armorMax,
        this.session.armor + this.armorRegen * dt,
      );
    }

    // 렌더 반영 — 뱅킹은 시트 열(0..4), 엔진 플리커는 행(0/1)
    this.playerImg.setPosition(Math.round(this.px), Math.round(this.py));
    const bank = clamp(this.pvx / 240, -1, 1);
    const shipPulse = 1 + Math.sin(this.worldT * 18) * 0.006;
    this.playerImg.setRotation(bank * 0.1).setScale(0.105 * shipPulse);
    this.playerImg.setVisible(
      !(
        this.inv > 0 &&
        !this.sp &&
        !this.ps &&
        !this.jw &&
        !this.kb &&
        Math.floor(this.worldT * 20) % 2 === 1
      ),
    );
    this.pilotHullOverlay
      ?.setPosition(Math.round(this.px), Math.round(this.py))
      .setRotation(bank * 0.11)
      .setScale(0.74 * shipPulse)
      .setVisible(this.playerImg.visible);
    if (this.sp || this.ps || this.jw || this.kb) this.auraImg.setPosition(this.px, this.py);
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
      b.prevX = b.x;
      b.prevY = b.y;
      b.t += dt;
      if (b.t < 0) continue;
      if (!b.img.visible) b.img.setVisible(true);
      if (b.expansion) {
        const scale = Math.min(
          b.expansion.endScale,
          b.expansion.startScale + b.expansion.growthPerSecond * b.t,
        );
        b.img.setScale(scale);
        b.w = Math.min(b.expansion.maxRadius * 2, b.baseW * scale);
        b.h = Math.min(b.expansion.maxRadius * 2, b.baseH * scale);
      }
      if (b.homing || b.guidance) {
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
        const guidance = b.guidance ?? {
          speed: 430,
          turnRate: 3.2,
          acquireRadius: 420,
          armingTime: 0,
        };
        const tgt = b.t >= guidance.armingTime ? this.nearestTarget(b.x, b.y) : null;
        const targetDistance = tgt ? Math.hypot(tgt.x - b.x, tgt.y - b.y) : Infinity;
        const currentSpeed = Math.max(90, Math.hypot(b.vx, b.vy));
        let angle = Math.atan2(b.vy, b.vx);
        if (tgt && targetDistance <= guidance.acquireRadius) {
          const desired = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          const delta = Phaser.Math.Angle.Wrap(desired - angle);
          angle += clamp(delta, -guidance.turnRate * dt, guidance.turnRate * dt);
        }
        const speed = Phaser.Math.Linear(currentSpeed, guidance.speed, clamp(dt * 4, 0, 1));
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
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
      if (b.rotateToVelocity || b.homing || b.guidance)
        b.img.setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      b.img.setPosition(b.x, b.y);

      if (b.trail) {
        b.trailT += dt;
        if (b.trailT >= b.trail.interval && this.sparks.length < 180) {
          b.trailT %= b.trail.interval;
          const trail = this.fxPool.get(b.trail.texture, b.prevX, b.prevY);
          trail
            .setDepth(DEPTH.bullet - 0.2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(0xffa45c)
            .setAlpha(0.72)
            .setScale(b.trail.scale)
            .setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          this.sparks.push({ img: trail, vx: -b.vx * 0.025, vy: -b.vy * 0.025, t: 0.42 });
        }
      }
      if (b.y < -30 || b.y > GAME_HEIGHT + 30 || b.x < -30 || b.x > GAME_WIDTH + 30) {
        this.pool.release(b.img);
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateEBullets(dt: number): void {
    const eb = DATA.enemies.ebullet;
    const activeGimmick = this.currentSector ? this.currentSector.gimmicks[0] : this.level.gimmick;
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (!b) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // warp 기믹: 좌우로 나간 적탄이 반대편에서 1회 재진입
      if (activeGimmick?.type === 'warp' && !b.warped) {
        if (b.x < -8) {
          b.x += GAME_WIDTH + 16;
          b.warped = true;
        } else if (b.x > GAME_WIDTH + 8) {
          b.x -= GAME_WIDTH + 16;
          b.warped = true;
        }
      }
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
      // 스플래시 등으로 이미 죽은 개체는 행동·사격·탄 흡수 전에 즉시 리핑
      if (e.dead) {
        this.pool.release(e.img);
        this.enemies.splice(i, 1);
        continue;
      }
      e.t += dt;
      if (e.hcd > 0) e.hcd -= dt;
      const def = e.def;
      if (def.behavior === 'sineDescend') {
        const p = def.params;
        e.y += (e.spd ?? 0) * dt;
        e.x = (e.bx ?? e.x) + Math.sin(e.t * (e.f ?? 2)) * (e.amp ?? 0);
        if (
          w >= p.fireFromWave &&
          Math.random() < (p.fireChancePerSec / SPAWN.fireCoolScale) * dt &&
          this.alive
        ) {
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
              (rnd(p.fireCoolMin, p.fireCoolMax) -
                Math.min(p.coolReduceMax, w * p.coolReducePerWave)) *
              SPAWN.fireCoolScale;
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
          e.fireT = p.fireEvery * SPAWN.fireCoolScale;
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
            e.fireT = p.fireEvery * SPAWN.fireCoolScale;
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
      // 시트 아이들 애니메이션 (ansimuz 2프레임)
      const fc = AZ_ENEMY_FRAMES[def.sprite];
      if (fc && e.flashT <= 0) e.img.setFrame(Math.floor(e.t * 7) % fc);
      // 피격 화이트 플래시
      if (e.flashT > 0) {
        e.flashT -= dt;
        e.img.setTintFill(0xffffff);
        if (e.flashT <= 0) e.img.clearTint();
      }

      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (!b || b.t < 0) continue;
        if (b.hitTargets.has(e)) continue;
        if (sweptAabb(b.prevX, b.prevY, b.x, b.y, b.w, b.h, e.x, e.y, hb.w, hb.h)) {
          // 관통탄은 겹친 프레임마다 히트하므로 60fps 기준으로 정규화
          b.hitTargets.add(e);
          e.hp -= this.projectileDamage(b, 'enemy');
          e.flashT = 0.05;
          this.addImpact(b.x, b.y, b);
          if (b.splash) this.splashHit(b.x, b.y, b.splash, b.dmg, e);
          this.detonateCluster(b, e);
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

  private bossPresentation(def: BossData): BossPresentation | undefined {
    return (def as ExtendedBossData).presentation;
  }

  private bossPartFrame(partId: string): string {
    return `part:${partId}`;
  }

  /**
   * crop 파트는 본체 그림의 한 조각이다.
   *  - 아직 차례가 아니면 선체와 완전히 같은 픽셀이라 이음매가 보이지 않는다.
   *  - 지금 때려야 할 구역만 맥동하는 열기로 물들여 표적을 알려준다.
   *  - 부서지면 그을린 자국으로 남아 어디를 뜯어냈는지 그대로 읽힌다.
   */
  /**
   * 지금 때려야 할 구역에 조준 브래킷을, 뜯겨나간 구역에 그을림을 그린다.
   * Graphics 는 Canvas 렌더러에서도 그려지므로 WebGL 이 없는 기기에서도 단서가 남는다.
   */
  private drawBossPartMarks(B: BossState): void {
    const g = this.bossMarks;
    g.clear();
    if (!B.entered) return;

    for (const part of B.parts) {
      if (!part.def.crop) continue;
      const hw = part.def.hitbox.w / 2;
      const hh = part.def.hitbox.h / 2;
      const left = part.x - hw;
      const top = part.y - hh;

      // 뜯겨나간 구역은 사각형으로 덮지 않는다 — 선체 그림을 그대로 두고
      // 그 자리에서 연기가 피어오르게 해 피해를 읽힌다(updateDamageSmoke).
      if (!part.alive) continue;
      if (!this.partActive(part, B) || !this.partExposed(part, B)) continue;

      // 현재 표적 — 맥동하는 모서리 브래킷
      const pulse = 0.55 + Math.sin(B.t * 5.2) * 0.45;
      const arm = Math.min(hw, hh) * 0.42;
      g.lineStyle(2, part.def.role === 'weakpoint' ? 0xffe27a : 0xff8a4c, 0.45 + pulse * 0.5);
      for (const [cx, cy, sx, sy] of [
        [left, top, 1, 1],
        [part.x + hw, top, -1, 1],
        [left, part.y + hh, 1, -1],
        [part.x + hw, part.y + hh, -1, -1],
      ] as const) {
        g.beginPath();
        g.moveTo(cx + sx * arm, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy + sy * arm);
        g.strokePath();
      }
    }
  }

  /**
   * 뜯겨나간 파트 자리에서 연기를 피워 올린다. 파트는 선체와 함께 움직이므로
   * 발생 지점은 매 프레임 파트 위치를 따라가고, 뿜어진 연기는 뒤로 흘러간다.
   */
  private emitDamageSmoke(B: BossState, dt: number): void {
    const MAX_PUFFS = 40;
    // 후반에는 부서진 구역이 많아진다. 구역 수에 비례해 각자 덜 뿜게 해서
    // 연기 총량을 일정하게 묶는다 — 안 그러면 화면이 뿌예져 적탄이 안 보인다.
    let smoking = 0;
    for (const part of B.parts) if (!part.alive && part.def.crop) smoking++;
    const spread = 1 + Math.max(0, smoking - 1) * 0.24;

    for (const part of B.parts) {
      if (part.alive || !part.def.crop) continue;
      part.smokeT -= dt;
      if (part.smokeT > 0) continue;
      // 큰 구역일수록 자주 뿜는다.
      const area = part.def.hitbox.w * part.def.hitbox.h;
      part.smokeT = rnd(0.14, 0.26) * (area > 4200 ? 0.75 : 1.2) * spread;
      if (this.damageSmoke.length >= MAX_PUFFS) continue;

      const ember = Math.random() < 0.22;
      const img = this.fxPool.get('hazard-disaster-smoke', 0, 0);
      const size = rnd(0.2, 0.32) * (area > 4200 ? 1.3 : 1);
      img
        .setPosition(
          part.x + rnd(-1, 1) * part.def.hitbox.w * 0.3,
          part.y + rnd(-1, 1) * part.def.hitbox.h * 0.3,
        )
        .setDepth(DEPTH.enemy + 0.35)
        .setBlendMode(ember ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setTint(ember ? 0xff9a44 : 0x788296)
        .setScale(size)
        .setRotation(rnd(0, 6.283))
        .setAlpha(ember ? SMOKE_EMBER_ALPHA : SMOKE_ALPHA);
      this.damageSmoke.push({
        img,
        vx: rnd(-12, 12),
        vy: rnd(30, 62),
        t: 0,
        life: ember ? rnd(0.3, 0.5) : rnd(0.7, 1.05),
        size,
        grow: ember ? 0.5 : rnd(1.1, 1.7),
        spin: rnd(-0.9, 0.9),
        ember,
      });
    }
  }

  private updateDamageSmoke(dt: number): void {
    for (let i = this.damageSmoke.length - 1; i >= 0; i--) {
      const s = this.damageSmoke[i];
      if (!s) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        this.fxPool.release(s.img);
        this.damageSmoke.splice(i, 1);
        continue;
      }
      // 연기는 함선 뒤로 흘러내리며 퍼지고 옅어진다.
      s.img
        .setPosition(s.img.x + s.vx * dt, s.img.y + (s.vy + this.scrollSpd * 0.35) * dt)
        .setScale(s.size * (1 + k * s.grow))
        .setRotation(s.img.rotation + s.spin * dt)
        .setAlpha((s.ember ? SMOKE_EMBER_ALPHA : SMOKE_ALPHA) * (1 - k * k));
    }
  }

  private clearDamageSmoke(): void {
    for (const s of this.damageSmoke) this.fxPool.release(s.img);
    this.damageSmoke = [];
  }

  private applyCroppedPartLook(part: BossPart, B: BossState): void {
    const img = part.img;
    if (!part.alive) {
      // 파괴된 조각은 감춘다. 아래에 본체 그림이 그대로 있어 선체는 멀쩡해 보이고,
      // 피해는 그 자리에서 올라오는 연기로 읽힌다.
      img.setVisible(false);
      return;
    }
    img.setVisible(true).setAlpha(1);
    if (this.partActive(part, B) && this.partExposed(part, B)) {
      const pulse = 0.5 + Math.sin(B.t * 5.2) * 0.5;
      const g = 0xff - Math.round(pulse * 0x62);
      const b = 0xff - Math.round(pulse * 0x9a);
      img.setTint(Phaser.Display.Color.GetColor(0xff, g, b));
    } else {
      // 아직 차례가 아닌 구역은 본체와 같은 그림·같은 톤이라 이음매가 보이지 않는다.
      img.setTint(HULL_TINT);
    }
  }

  /**
   * 파트 crop 을 본체 텍스처의 서브프레임으로 등록한다.
   * 파트 아트가 곧 본체 아트라서 화풍이 어긋날 수 없고, 별도 이미지 파일도 필요 없다.
   */
  private ensureBossPartFrames(def: BossData): void {
    if (!def.parts?.length || !this.textures.exists(def.sprite)) return;
    const tex = this.textures.get(def.sprite);
    const source = tex.getSourceImage() as { width: number; height: number };
    const presentation = this.bossPresentation(def);
    // crop 은 원본 일러스트 좌표. 실제 텍스처가 리사이즈됐어도 비율로 환산한다.
    const kx = source.width / (presentation?.artWidth ?? source.width);
    const ky = source.height / (presentation?.artHeight ?? source.height);
    for (const pd of def.parts) {
      const crop = pd.crop;
      if (!crop) continue;
      const name = this.bossPartFrame(pd.id);
      if (tex.has(name)) continue;
      tex.add(name, 0, crop.x * kx, crop.y * ky, crop.w * kx, crop.h * ky);
    }
    // Phaser 는 첫 서브프레임이 추가되는 순간 firstFrame 을 그쪽으로 옮긴다.
    // 그대로 두면 프레임을 지정하지 않은 본체가 파트 조각 하나로 그려진다.
    tex.firstFrame = '__BASE';
  }

  /**
   * 격노 배수 — 파트가 뜯겨나갈수록 남은 화기의 발사 쿨다운이 줄어든다.
   * 전부 파괴 직전이면 BOSS_ENRAGE.minCoolScale 까지 떨어진다(= 그만큼 자주 쏜다).
   */
  private bossEnrageScale(B: BossState): number {
    const total = B.parts.length;
    if (!total) return 1;
    let destroyed = 0;
    for (const part of B.parts) if (!part.alive) destroyed++;
    const ratio = destroyed / total;
    return 1 - (1 - BOSS_ENRAGE.minCoolScale) * ratio;
  }

  /** 함선이 좌우로 흔들려도 모든 파트가 화면에 남는 최대 진폭 (gen-boss-layout.mjs 와 동일 공식). */
  private warshipSwayLimit(B: BossState): number {
    let limit = 46;
    for (const part of B.parts)
      limit = Math.min(limit, GAME_WIDTH / 2 - 4 - Math.abs(part.def.dx) - part.def.hitbox.w / 2);
    return Math.max(0, limit);
  }

  /**
   * 스테이지 게이트 파트를 플레이어 사거리 한가운데(WARSHIP_FOCUS_Y)에 올려놓는 선체 중심 Y.
   * 스테이지가 넘어갈수록 선체가 아래로 전진해 다음 구역이 사거리에 들어온다.
   */
  private warshipStageHullY(B: BossState, stage: number): number {
    const stages = B.def.stages;
    if (!stages?.length) return B.def.entryY;
    const gate = stages[Math.min(stage, stages.length - 1)]?.advanceWhenDestroyed;
    if (!gate?.length) return B.def.entryY;
    let sum = 0;
    let n = 0;
    for (const id of gate) {
      const part = B.parts.find((candidate) => candidate.def.id === id);
      if (!part) continue;
      sum += part.def.dy;
      n++;
    }
    if (!n) return B.def.entryY;
    return Math.min(WARSHIP_MAX_HULL_Y, WARSHIP_FOCUS_Y - sum / n);
  }

  private snailConfig(def: BossData): Required<SnailSpecialConfig> {
    const configured = (def as ExtendedBossData).snailSpecials;
    return {
      rageChargeMs: clamp(configured?.rageChargeMs ?? 1450, 1000, 2000),
      rageForcedDamage: clamp(configured?.rageForcedDamage ?? 22, 8, 42),
      barrageCount: clamp(configured?.barrageCount ?? 176, 96, 220),
      huntIntervalMs: clamp(configured?.huntIntervalMs ?? 14500, 8000, 26000),
      huntForcedDamage: clamp(configured?.huntForcedDamage ?? 18, 6, 36),
      huntDashCount: clamp(configured?.huntDashCount ?? 7, 4, 10),
      speech: configured?.speech ?? "I'll......... kill..............you!!!",
    };
  }

  private snailHuntInterval(def: BossData): number {
    return this.snailConfig(def).huntIntervalMs / 1000;
  }

  private isSnailBoss(B: BossState | null): B is BossState {
    if (!B) return false;
    const presentation = this.bossPresentation(B.def);
    return presentation?.kind === 'snail' || B.def.sprite.toLowerCase().includes('snail');
  }

  private clearSnailSpecial(resetBoss = true): void {
    const state = this.snailSpecial;
    if (state) {
      state.eyes.destroy();
      state.shell.destroy();
      this.snailSpecial = null;
    }
    if (resetBoss && this.boss) {
      this.boss.img.clearTint().setAlpha(1).setRotation(this.boss.rotation);
      for (const part of this.boss.parts) {
        if (part.alive) part.img.clearTint().setAlpha(1);
      }
    }
    this.bubble.setVisible(false);
  }

  private clearSnailRuntime(resetBoss = true): void {
    this.clearSnailSpecial(resetBoss);
    for (const bullet of this.snailBarrage) bullet.img.destroy();
    this.snailBarrage = [];
    this.snailRageQueued = false;
  }

  private createSnailSpecialState(B: BossState, kind: 'rage' | 'hunt'): SnailSpecialState {
    const presentation = this.bossPresentation(B.def);
    const displayW = presentation?.displayWidth ?? 176;
    const displayH = presentation?.displayHeight ?? 158;
    const eyes = this.add
      .graphics()
      .setDepth(DEPTH.enemy + 0.58)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    // Inward-rising, reverse-eight eyes: deliberately exaggerated for the rage read.
    eyes.lineStyle(Math.max(5, displayW * 0.034), 0xfff2dc, 1);
    eyes.lineBetween(-displayW * 0.19, -displayH * 0.17, -displayW * 0.045, -displayH * 0.27);
    eyes.lineBetween(displayW * 0.19, -displayH * 0.17, displayW * 0.045, -displayH * 0.27);
    eyes.lineStyle(Math.max(2, displayW * 0.013), 0xff2525, 0.95);
    eyes.lineBetween(-displayW * 0.19, -displayH * 0.145, -displayW * 0.05, -displayH * 0.245);
    eyes.lineBetween(displayW * 0.19, -displayH * 0.145, displayW * 0.05, -displayH * 0.245);

    let shell: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (this.textures.exists('boss-snail-shell-v2')) {
      shell = this.add
        .image(B.x, B.y, 'boss-snail-shell-v2')
        .setDepth(DEPTH.enemy + 0.42)
        .setDisplaySize(displayW * 0.82, displayH * 0.78)
        .setVisible(false);
    } else {
      const fallback = this.add
        .graphics()
        .setDepth(DEPTH.enemy + 0.42)
        .setVisible(false);
      fallback.fillStyle(0x5e211c, 1);
      fallback.fillEllipse(0, 0, displayW * 0.76, displayH * 0.68);
      fallback.lineStyle(8, 0xff6b45, 0.9);
      fallback.strokeEllipse(0, 0, displayW * 0.64, displayH * 0.56);
      fallback.lineStyle(5, 0xffb04a, 0.72);
      fallback.strokeCircle(0, 0, Math.min(displayW, displayH) * 0.2);
      fallback.setPosition(B.x, B.y);
      shell = fallback;
    }
    return {
      kind,
      phase: kind === 'rage' ? 'rage-angry' : 'hunt-speech',
      phaseT: 0,
      totalT: 0,
      damageApplied: false,
      dashIndex: 0,
      dashCount: this.snailConfig(B.def).huntDashCount,
      startX: B.x,
      startY: B.y,
      targetX: B.x,
      targetY: B.y,
      pulseIndex: -1,
      eyes,
      shell,
    };
  }

  private beginSnailRageRetaliation(): void {
    const B = this.boss;
    if (!this.isSnailBoss(B)) return;
    if (!B.entered) {
      this.snailRageQueued = true;
      return;
    }
    this.clearSnailSpecial(false);
    this.snailSpecial = this.createSnailSpecialState(B, 'rage');
    this.snailRageQueued = false;
    this.banner('SUPER REACTION // SHELL OVERLOAD', 1.35, '#ff554d');
    this.shake = Math.max(this.shake, 5);
    SFX.warn();
  }

  private beginSnailHunt(B: BossState): void {
    if (this.snailSpecial || !this.alive) return;
    const state = this.createSnailSpecialState(B, 'hunt');
    this.snailSpecial = state;
    const speech = this.snailConfig(B.def).speech;
    this.banner('PREDATION DRIVE // IMPACT CANNOT BE EVADED', 1.65, '#ff5a58');
    this.showBubble(speech, B.x, B.y - 46);
    SFX.voice(speech, 'en-US', 0.68, 0.58);
    SFX.warn();
    this.shake = Math.max(this.shake, 4);
  }

  private setSnailPhase(state: SnailSpecialState, phase: SnailSpecialPhase): void {
    state.phase = phase;
    state.phaseT = 0;
    state.pulseIndex = -1;
  }

  private emitSnailChargePulse(B: BossState, strength: number): void {
    const ring = this.add
      .image(B.x, B.y, 'super-shockwave')
      .setDepth(DEPTH.enemy + 0.36)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff392f)
      .setScale(0.12 + strength * 0.12)
      .setAlpha(0.88);
    this.tweens.add({
      targets: ring,
      scale: 1.05 + strength * 0.7,
      alpha: 0,
      duration: 380,
      ease: 'Quart.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private launchSnailBarrage(B: BossState): void {
    const count = this.snailConfig(B.def).barrageCount;
    const rings = 4;
    for (let i = 0; i < count; i++) {
      const ring = i % rings;
      const lane = Math.floor(i / rings);
      const lanes = Math.ceil(count / rings);
      const angle = (lane / lanes) * Math.PI * 2 + ring * 0.055 + Math.sin(i * 9.73) * 0.018;
      const radius = 22 + ring * 7;
      const speed = 150 + ring * 58 + (i % 5) * 8;
      const key = ring === rings - 1 && this.textures.exists('eb-big') ? 'eb-big' : 'eb-small';
      const img = this.add
        .image(B.x + Math.cos(angle) * radius, B.y + Math.sin(angle) * radius, key)
        .setDepth(DEPTH.ebullet + 0.42)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(ring % 2 === 0 ? 0xff3636 : 0xffb04a)
        .setScale(ring === rings - 1 ? 1.08 : 0.78)
        .setRotation(angle + Math.PI / 2);
      this.snailBarrage.push({
        img,
        x: img.x,
        y: img.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2.25,
        maxLife: 2.25,
        spin: ring % 2 === 0 ? 3.6 : -3.6,
      });
    }

    for (let i = 0; i < 3; i++) {
      const wave = this.add
        .image(B.x, B.y, 'hazard-disaster-shockwave')
        .setDepth(DEPTH.ebullet + 0.2 + i * 0.01)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i === 1 ? 0xffc15a : 0xff302c)
        .setScale(0.1)
        .setAlpha(0.92 - i * 0.16);
      this.tweens.add({
        targets: wave,
        scale: 1.75 + i * 0.62,
        alpha: 0,
        duration: 620 + i * 120,
        delay: i * 55,
        ease: 'Quart.easeOut',
        onComplete: () => wave.destroy(),
      });
    }
    this.whiteFlash.setFillStyle(0xff2a24, 1).setVisible(true).setAlpha(0.72);
    this.tweens.add({
      targets: this.whiteFlash,
      alpha: 0,
      duration: 420,
      onComplete: () => this.whiteFlash.setVisible(false),
    });
    this.shake = 10;
    this.slomo(0.24, 0.2);
    vibrate([100, 35, 150]);
    SFX.pow();
  }

  private updateSnailBarrage(dt: number): void {
    for (let i = this.snailBarrage.length - 1; i >= 0; i--) {
      const bullet = this.snailBarrage[i];
      if (!bullet) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.img
        .setPosition(bullet.x, bullet.y)
        .setRotation(bullet.img.rotation + bullet.spin * dt)
        .setAlpha(clamp(bullet.life / Math.min(0.42, bullet.maxLife), 0, 1));
      if (
        bullet.life <= 0 ||
        bullet.x < -55 ||
        bullet.x > GAME_WIDTH + 55 ||
        bullet.y < -55 ||
        bullet.y > GAME_HEIGHT + 55
      ) {
        bullet.img.destroy();
        this.snailBarrage.splice(i, 1);
      }
    }
  }

  private nextSnailDashTarget(state: SnailSpecialState, B: BossState): void {
    state.startX = B.x;
    state.startY = B.y;
    const i = state.dashIndex;
    if (i === Math.floor(state.dashCount / 2)) {
      state.targetX = clamp(this.px, 42, GAME_WIDTH - 42);
      state.targetY = clamp(this.py, 86, GAME_HEIGHT - 74);
    } else {
      state.targetX = i % 2 === 0 ? GAME_WIDTH - rnd(38, 72) : rnd(38, 72);
      const rows = [92, 210, 338, 490];
      state.targetY = rows[(i * 3 + 1) % rows.length] ?? rnd(90, GAME_HEIGHT - 80);
    }
    const ghost = this.add
      .image(B.x, B.y, B.def.sprite)
      .setDepth(DEPTH.enemy - 0.02)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff4538)
      .setAlpha(0.46)
      .setRotation(B.rotation);
    const presentation = this.bossPresentation(B.def);
    if (presentation?.displayWidth && presentation.displayHeight)
      ghost.setDisplaySize(presentation.displayWidth, presentation.displayHeight);
    else ghost.setScale(B.img.scaleX, B.img.scaleY);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: ghost.scaleX * 1.08,
      scaleY: ghost.scaleY * 1.08,
      duration: 260,
      onComplete: () => ghost.destroy(),
    });
  }

  /** Returns true while the snail owns movement and firing for a cinematic special. */
  private updateSnailSpecial(B: BossState, dt: number): boolean {
    const state = this.snailSpecial;
    if (!state) return false;
    const config = this.snailConfig(B.def);
    state.phaseT += dt;
    state.totalT += dt;
    state.eyes.setPosition(B.x, B.y).setRotation(B.rotation);
    state.shell.setPosition(B.x, B.y).setRotation(B.rotation);

    if (state.kind === 'rage') {
      if (state.phase === 'rage-angry') {
        if (state.phaseT >= 0.52) this.setSnailPhase(state, 'rage-retract');
      } else if (state.phase === 'rage-retract') {
        if (state.phaseT >= 0.38) {
          state.shell.setVisible(true).setAlpha(1);
          this.setSnailPhase(state, 'rage-charge');
        }
      } else if (state.phase === 'rage-charge') {
        const chargeSeconds = config.rageChargeMs / 1000;
        const pulseIndex = Math.floor(state.phaseT / 0.23);
        if (pulseIndex !== state.pulseIndex) {
          state.pulseIndex = pulseIndex;
          this.emitSnailChargePulse(B, clamp(state.phaseT / chargeSeconds, 0, 1));
        }
        state.shell.setRotation(B.rotation + Math.sin(state.totalT * 22) * 0.055);
        if (state.phaseT >= chargeSeconds) {
          this.launchSnailBarrage(B);
          this.damagePlayerForced(config.rageForcedDamage, 'SHELL BARRAGE');
          state.damageApplied = true;
          this.setSnailPhase(state, 'rage-burst');
        }
      } else if (state.phase === 'rage-burst') {
        if (state.phaseT >= 0.7) this.setSnailPhase(state, 'rage-recover');
      } else if (state.phase === 'rage-recover' && state.phaseT >= 0.66) {
        this.clearSnailSpecial(true);
        this.snailHuntCooldown = this.snailHuntInterval(B.def) * rnd(0.82, 1.12);
        return false;
      }
      return true;
    }

    if (state.phase === 'hunt-speech') {
      this.showBubble(config.speech, B.x, B.y - 48);
      B.x += (GAME_WIDTH / 2 - B.x) * Math.min(1, dt * 2.4);
      B.y += (B.def.entryY - B.y) * Math.min(1, dt * 2.4);
      if (state.phaseT >= 2.15) {
        this.bubble.setVisible(false);
        this.setSnailPhase(state, 'hunt-dash');
        this.nextSnailDashTarget(state, B);
      }
    } else if (state.phase === 'hunt-dash') {
      const dashDuration = 0.245;
      const progress = clamp(state.phaseT / dashDuration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      B.x = Phaser.Math.Linear(state.startX, state.targetX, eased);
      B.y = Phaser.Math.Linear(state.startY, state.targetY, eased);
      B.rotation = Math.atan2(state.targetY - state.startY, state.targetX - state.startX) * 0.08;
      this.shake = Math.max(this.shake, 3 + progress * 3);
      if (!state.damageApplied && progress >= 0.56) {
        this.damagePlayerForced(config.huntForcedDamage, 'KILL DRIVE');
        state.damageApplied = true;
      }
      if (progress >= 1) {
        state.dashIndex++;
        if (state.dashIndex >= state.dashCount) {
          state.targetX = GAME_WIDTH / 2;
          state.targetY = B.def.entryY;
          state.startX = B.x;
          state.startY = B.y;
          this.setSnailPhase(state, 'hunt-recover');
        } else {
          state.phaseT = 0;
          this.nextSnailDashTarget(state, B);
        }
      }
    } else if (state.phase === 'hunt-recover') {
      const recover = clamp(state.phaseT / 0.72, 0, 1);
      const eased = recover * recover * (3 - 2 * recover);
      B.x = Phaser.Math.Linear(state.startX, state.targetX, eased);
      B.y = Phaser.Math.Linear(state.startY, state.targetY, eased);
      B.rotation *= Math.max(0, 1 - dt * 8);
      if (recover >= 1) {
        B.rotation = 0;
        this.clearSnailSpecial(true);
        this.snailHuntCooldown = this.snailHuntInterval(B.def) * rnd(0.82, 1.16);
        return false;
      }
    }
    return true;
  }

  private applySnailSpecialPose(B: BossState): void {
    const state = this.snailSpecial;
    if (!state) return;
    state.eyes.setPosition(B.x, B.y).setRotation(B.rotation);
    state.shell.setPosition(B.x, B.y);
    const phase = state.phase;
    const angry = phase === 'rage-angry' || phase === 'rage-retract';
    const hiddenInShell =
      phase === 'rage-charge' || phase === 'rage-burst' || phase === 'rage-recover';
    const hunting = state.kind === 'hunt';
    state.eyes.setVisible(angry || hunting).setAlpha(hunting ? 0.78 : 1);
    state.shell
      .setVisible(hiddenInShell)
      .setAlpha(phase === 'rage-recover' ? Math.max(0, 1 - state.phaseT / 0.66) : 1);
    if (angry || hunting) B.img.setTint(0xff4a3f);
    if (hiddenInShell) {
      const emerge = phase === 'rage-recover' ? clamp(state.phaseT / 0.66, 0, 1) : 0;
      B.img.setAlpha(0.06 + emerge * 0.94).setTint(0xff3c32);
      for (const part of B.parts) {
        if (part.alive) part.img.setAlpha(0.04 + emerge * 0.96);
      }
    } else if (phase === 'rage-retract') {
      const retract = clamp(state.phaseT / 0.38, 0, 1);
      B.img.setAlpha(1 - retract * 0.88);
      for (const part of B.parts) if (part.alive) part.img.setAlpha(1 - retract * 0.88);
    }
    if (angry) {
      for (const part of B.parts) {
        if (!part.alive) continue;
        if (part.def.id === 'eyeL') part.img.setRotation(part.rotation + 0.5);
        if (part.def.id === 'eyeR') part.img.setRotation(part.rotation - 0.5);
        if (part.def.id === 'eyeL' || part.def.id === 'eyeR') part.img.setTint(0xffdfc8);
        else part.img.setTint(0xff5a46);
      }
    }
  }

  /** Capital ships have authored attack runs instead of the old single-axis patrol. */
  private updateWarshipMovement(B: BossState, dt: number, mobility: number): boolean {
    const presentation = this.bossPresentation(B.def);
    if (presentation?.kind !== 'warship' && presentation?.kind !== 'scrolling-warship')
      return false;
    const script = (presentation.movementScript ?? 'broadside').toLowerCase();
    // 선체 높이는 현재 스테이지에서 유도한다 — 표적이 항상 사거리 안에 놓인다.
    // 이동 스크립트는 좌우 성격과 미세한 세로 흔들림만 담당한다.
    const hullY = this.warshipStageHullY(B, B.stage);
    // 함선이 화면보다 넓으므로 좌우 진폭은 파트가 화면에 남는 한도까지만 허용한다.
    const sway = this.warshipSwayLimit(B) * mobility;
    let lateral = 0;
    let yWobble = 0;
    let rotation = 0;
    let follow = 1.2;

    if (script.includes('dive') || script === 'solar-lance') {
      const cycle = B.t % 9.2;
      if (cycle < 2.6) {
        lateral = Math.sin(B.t * 1.1);
        yWobble = 8;
      } else if (cycle < 4.4) {
        const p = (cycle - 2.6) / 1.8;
        lateral = p < 0.5 ? -1 : 1;
        yWobble = Math.sin(p * Math.PI) * 46;
        rotation = lateral * 0.1;
        follow = 2.6;
      } else {
        lateral = Math.sin(B.t * 0.72) * 0.7;
      }
    } else if (script.includes('encircle') || script.includes('orbit') || script === 'wing-sweep') {
      const angle = B.t * 0.62;
      lateral = Math.cos(angle);
      yWobble = Math.sin(angle * 1.35) * 26;
      rotation = -Math.sin(angle) * 0.05;
      follow = 1.9;
    } else if (script.includes('siege') || script === 'fortress-assault') {
      const hold = Math.floor(B.t / 3.8) % 3;
      lateral = [-1, 0, 1][hold] ?? 0;
      yWobble = Math.sin(B.t * 0.9) * 18;
      rotation = -lateral * 0.03;
      follow = 1.1;
    } else if (script.includes('crawl') || script === 'hull-crawl') {
      // 거대 함선이 천천히 밀고 내려오는 느낌 — 좌우는 거의 정지.
      lateral = Math.sin(B.t * 0.42) * 0.55;
      yWobble = Math.sin(B.t * 0.7) * 9;
      rotation = Math.sin(B.t * 0.5) * 0.012;
      follow = B.stage === 0 ? 1.0 : 0.72;
    } else {
      const sweep = Math.sin(B.t * 0.58);
      lateral = sweep;
      yWobble = Math.sin(B.t * 1.16 + 0.7) * 16;
      rotation = -Math.cos(B.t * 0.58) * 0.045;
      follow = 1.6;
    }

    const targetX = GAME_WIDTH / 2 + Phaser.Math.Clamp(lateral, -1, 1) * sway;
    const targetY = hullY + yWobble;
    if (presentation.kind === 'scrolling-warship')
      this.scrollSpd = Math.max(this.level.scroll.boss, 58 + B.stage * 15);

    B.x += (targetX - B.x) * Math.min(1, dt * follow * mobility);
    // 구역 전진은 연출이라 추진부 파괴로 느려지면 안 된다(좌우 기동만 둔해진다).
    B.y += (targetY - B.y) * Math.min(1, dt * Math.max(follow, 1.7));
    B.rotation += (rotation - B.rotation) * Math.min(1, dt * 4.5);
    return true;
  }

  private applyBossBodyPresentation(B: BossState): void {
    const presentation = this.bossPresentation(B.def);
    const pulse = 1 + Math.sin(B.t * 2.4) * (presentation?.kind === 'snail' ? 0.012 : 0.006);
    if (presentation?.displayWidth && presentation.displayHeight) {
      B.img.setDisplaySize(presentation.displayWidth * pulse, presentation.displayHeight * pulse);
      // 화면을 뒤덮는 선체 위에서도 탄이 보이도록 톤을 눌러둔다(피격 플래시 중엔 건드리지 않는다).
      if (presentation.kind !== 'snail' && B.flashT <= 0) B.img.setTint(HULL_TINT);
    } else {
      const bodyScale = B.def.layoutVersion === 2 ? 1.24 : 1;
      B.img.setScale(bodyScale + Math.sin(B.t * 2.4) * 0.018);
    }
    B.img.setRotation(B.rotation);
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
        this.banner(t(def.nameKey), 2.0, '#ff9a9a');
        if (this.snailRageQueued && this.isSnailBoss(B)) this.beginSnailRageRetaliation();
      }
    } else {
      const mv = def.movement;
      const engines = B.parts.filter((part) => part.def.role === 'engine');
      const mobility = engines.length
        ? 0.55 + (engines.filter((part) => part.alive).length / engines.length) * 0.45
        : 1;
      let specialOwnsMovement = false;
      if (this.isSnailBoss(B)) {
        if (this.snailSpecial) {
          specialOwnsMovement = this.updateSnailSpecial(B, dt);
        } else {
          this.snailHuntCooldown -= dt;
          if (this.snailHuntCooldown <= 0) {
            this.beginSnailHunt(B);
            specialOwnsMovement = true;
          }
        }
      }

      if (!specialOwnsMovement) {
        const scripted = this.updateWarshipMovement(B, dt, mobility);
        if (!scripted) {
          B.rotation += (0 - B.rotation) * Math.min(1, dt * 4);
          if (mv.type === 'patrol') {
            B.x += B.dir * (mv.base + this.session.wave * mv.perWave) * mobility * dt;
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
              B.x += (dx / L) * mv.speed * mobility * dt;
              B.y += (dy / L) * mv.speed * mobility * dt;
            }
          } else {
            B.x = B.cx + Math.sin(B.t * mv.freq * mobility * Math.PI * 2) * mv.amp * mobility;
            B.y = def.entryY + Math.sin(B.t * mv.bobFreq * mobility * Math.PI * 2) * mv.bobAmp;
          }
        }
        B.cool -= dt;
        if (B.cool <= 0 && this.alive) {
          B.phase = (B.phase + 1) % def.phases.length;
          const ph = def.phases[B.phase];
          if (ph) {
            if (this.ebullets.length < 210) this.executeBossPhase(ph);
            const stageScale = def.stages?.[B.stage]?.coolScale ?? 1;
            // 격노: 파트가 뜯겨나갈수록 본체 발사 간격이 줄어든다.
            B.cool =
              (ph.cool ??
                Math.max(def.cool.min, def.cool.base + this.session.wave * def.cool.perWave)) *
              stageScale *
              this.bossEnrageScale(B);
          }
        }
      }
    }
    B.img.setPosition(B.x, B.y);
    this.applyBossBodyPresentation(B);
    this.updateBossAssembly(B);
    this.emitDamageSmoke(B, dt);
    // 파츠: 앵커 추적 + 자체 사격
    for (const part of B.parts) {
      if (!part.alive) continue;
      if (part.flashT > 0) {
        part.flashT -= dt;
        part.img.setTintFill(0xffffff);
        if (part.flashT <= 0) part.img.clearTint();
      }
      if (
        part.def.phase &&
        B.entered &&
        this.alive &&
        !this.snailSpecial &&
        this.partActive(part, B)
      ) {
        part.fireT -= dt;
        if (part.fireT <= 0) {
          // 격노: 동료 파트가 부서질수록 살아남은 화기가 자주 쏜다.
          part.fireT = (part.def.fireEvery ?? 2) * this.bossEnrageScale(B);
          if (this.ebullets.length < 210) this.executePartPhase(part, B);
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
    this.applySnailSpecialPose(B);

    // The entrance silhouette and telegraph are guaranteed before the boss can be damaged.
    if (!B.entered) return;

    const shellClosed =
      this.isSnailBoss(B) &&
      (this.snailSpecial?.phase === 'rage-charge' || this.snailSpecial?.phase === 'rage-burst');
    const snailPresentation = this.bossPresentation(B.def);
    const shellHitW = Math.min(190, (snailPresentation?.displayWidth ?? def.hitbox.w) * 0.62);
    const shellHitH = Math.min(160, (snailPresentation?.displayHeight ?? def.hitbox.h) * 0.62);

    for (let j = this.bullets.length - 1; j >= 0; j--) {
      const b = this.bullets[j];
      if (!b || b.t < 0) continue;
      if (
        shellClosed &&
        sweptAabb(b.prevX, b.prevY, b.x, b.y, b.w, b.h, B.x, B.y, shellHitW, shellHitH)
      ) {
        this.addImpact(b.x, b.y, b, true);
        this.pool.release(b.img);
        this.bullets.splice(j, 1);
        if (this.immuneMsgT <= 0) {
          this.immuneMsgT = 0.35;
          this.addFloatText(B.x, B.y + shellHitH * 0.42, 'SHELL LOCK', '#ff9b76');
        }
        continue;
      }
      // 파츠 히트 우선
      let hitPart: BossPart | null = null;
      for (const part of B.parts) {
        if (
          !part.alive ||
          !this.partActive(part, B) ||
          !this.partExposed(part, B) ||
          b.hitTargets.has(part)
        )
          continue;
        if (
          sweptAabb(
            b.prevX,
            b.prevY,
            b.x,
            b.y,
            b.w,
            b.h,
            part.x,
            part.y,
            part.def.hitbox.w,
            part.def.hitbox.h,
          )
        ) {
          hitPart = part;
          break;
        }
      }
      if (hitPart) {
        b.hitTargets.add(hitPart);
        const dmg = this.projectileDamage(b, 'part');
        this.addImpact(b.x, b.y, b);
        if (b.splash) this.splashHit(b.x, b.y, b.splash, b.dmg);
        this.detonateCluster(b);
        if (b.pierce > 0) b.pierce--;
        else {
          this.pool.release(b.img);
          this.bullets.splice(j, 1);
        }
        this.damagePart(hitPart, B, dmg);
        continue;
      }
      if (
        !b.hitTargets.has(B) &&
        sweptAabb(b.prevX, b.prevY, b.x, b.y, b.w, b.h, B.x, B.y, def.hitbox.w, def.hitbox.h)
      ) {
        b.hitTargets.add(B);
        const shielded = this.coreShielded(B);
        const dmg = this.projectileDamage(b, 'core');
        this.addImpact(b.x, b.y, b, shielded);
        if (b.splash) this.splashHit(b.x, b.y, b.splash, b.dmg);
        this.detonateCluster(b);
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
    const snailCinematicCollision = this.isSnailBoss(B) && this.snailSpecial !== null;
    if (this.boss && this.alive && !snailCinematicCollision) {
      for (const part of B.parts) {
        if (!part.alive || !this.partActive(part, B)) continue;
        if (
          aabb(
            part.x,
            part.y,
            part.def.hitbox.w,
            part.def.hitbox.h,
            this.px,
            this.py,
            PLAYER.hitW,
            PLAYER.hitH,
          )
        ) {
          this.damagePlayer(Math.max(8, Math.round(def.touchDamage * 0.65)));
          break;
        }
      }
    }
    if (
      this.boss &&
      this.alive &&
      !snailCinematicCollision &&
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
      o.img.setPosition(o.x, yy).setScale(0.62 * pulse);
      o.glow.setPosition(o.x, yy).setScale(0.74 * pulse);
      if (
        this.alive &&
        aabb(o.x, o.y, 16, 16, this.px, this.py, PLAYER.hitW + 7, PLAYER.hitH + 8)
      ) {
        this.pool.release(o.img);
        this.pool.release(o.glow);
        this.orbs.splice(i, 1);
        SFX.pow();
        if (o.type === 'C') {
          this.progression = grantCredits(this.progression, o.amount);
          this.addFloatText(this.px, this.py - 21, `₡ ${o.amount}`, '#63f0c8');
        } else if (o.type === 'H') {
          const repair = Math.max(18, Math.round(this.session.armorMax * 0.16));
          this.session.armor = Math.min(this.session.armorMax, this.session.armor + repair);
          this.addFloatText(this.px, this.py - 21, `ARMOR +${repair}`, '#ffbf72');
        } else if (o.type === 'E') {
          this.weaponRuntime = createWeaponRuntimeState({
            ...this.weaponRuntime,
            heat: Math.max(0, this.weaponRuntime.heat - 0.46),
            locked: false,
            lockoutRemaining: 0,
          });
          this.environmentHeat = Math.max(0, this.environmentHeat - 0.35);
          this.addFloatText(this.px, this.py - 21, 'THERMAL FLUSH', '#72eaff');
        } else {
          if (this.session.superN < PLAYER.superMax) {
            this.session.superN++;
            this.addFloatText(this.px, this.py - 21, t('game.superup'), '#cfa8ff');
          } else {
            this.progression = grantCredits(this.progression, orb.maxPowerBonusScore);
            this.addFloatText(this.px, this.py - 21, `₡ ${orb.maxPowerBonusScore}`, '#cfa8ff');
          }
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
  /** 스테이지 기믹 — 테마별 환경 요소 (levels.json gimmick, 데이터 주도) */
  private gimmickTimer(key: string, dt: number, interval: number): boolean {
    const next = (this.gimmickTimers.get(key) ?? 0) + dt;
    if (next < interval) {
      this.gimmickTimers.set(key, next);
      return false;
    }
    this.gimmickTimers.set(key, next % interval);
    return true;
  }

  private addEnvironmentalHazard(
    kind: EnvironmentalHazardKind,
    texture: string,
    x: number,
    y: number,
    options: Partial<Omit<EnvironmentalHazard, 'kind' | 'img' | 'x' | 'y'>> = {},
  ): EnvironmentalHazard {
    const img = this.add.image(x, y, texture).setDepth(DEPTH.ebullet + 0.35);
    const hazard: EnvironmentalHazard = {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      t: 0,
      life: 5,
      activeAt: 0,
      hitW: img.width * 0.62,
      hitH: img.height * 0.62,
      damage: 0,
      side: 0,
      reach: 0,
      emitsGas: 0,
      hit: false,
      img,
      ...options,
    };
    if (hazard.activeAt > 0) img.setVisible(false);
    this.envHazards.push(hazard);
    return hazard;
  }

  private spawnGasClouds(duration: number): void {
    for (let i = 0; i < 3; i++) {
      const gas = this.addEnvironmentalHazard(
        'gas',
        'fog-cloud',
        rnd(45, GAME_WIDTH - 45),
        rnd(100, GAME_HEIGHT - 100),
        {
          vx: rnd(-12, 12),
          vy: rnd(-4, 9),
          life: duration,
          hitW: 0,
          hitH: 0,
        },
      );
      gas.img
        .setDepth(DEPTH.hud - 1.25)
        .setScale(rnd(1.8, 2.8), rnd(1.4, 2.1))
        .setTint(0xb3a79c)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.SCREEN);
    }
  }

  private spawnIceStorm(g: Extract<GimmickData, { type: 'iceStorm' }>): void {
    const direction = Math.sin(this.worldT * 0.37) >= 0 ? 1 : -1;
    const shard = this.addEnvironmentalHazard(
      'ice',
      'hazard-ice',
      direction > 0 ? -25 : GAME_WIDTH + 25,
      rnd(55, GAME_HEIGHT * 0.64),
      {
        vx: direction * g.shardSpeed * rnd(0.6, 0.88),
        vy: g.shardSpeed * rnd(0.26, 0.48),
        life: 5,
        hitW: 17,
        hitH: 32,
        damage: g.damage,
      },
    );
    shard.img
      .setScale(rnd(0.72, 1.18))
      .setRotation(Math.atan2(shard.vy, shard.vx) + Math.PI / 2)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private playVolcanicBlast(x: number): void {
    this.shake = 7;
    this.slomo(0.72, 0.09);
    vibrate([42, 18, 92]);
    SFX.pow();

    const flash = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff6128, 0.3)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud - 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const vent = this.add
      .image(x, GAME_HEIGHT - 36, 'hazard-volcanic-vent')
      .setDepth(DEPTH.ebullet - 0.35)
      .setDisplaySize(158, 98)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.95);
    this.tweens.add({
      targets: vent,
      scaleX: 1.24,
      scaleY: 1.18,
      alpha: 0,
      duration: 1180,
      ease: 'Cubic.easeOut',
      onComplete: () => vent.destroy(),
    });

    const shockwave = this.add
      .image(x, GAME_HEIGHT - 54, 'hazard-disaster-shockwave')
      .setDepth(DEPTH.ebullet - 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff7a30)
      .setScale(0.18)
      .setAlpha(0.95);
    this.tweens.add({
      targets: shockwave,
      scale: 1.36,
      alpha: 0,
      duration: 720,
      ease: 'Quart.easeOut',
      onComplete: () => shockwave.destroy(),
    });

    for (let i = 0; i < 5; i++) {
      const flame = this.add
        .image(x + rnd(-42, 42), GAME_HEIGHT - 26, 'hazard-disaster-flame')
        .setDepth(DEPTH.ebullet - 0.05 + i * 0.003)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(rnd(0.42, 0.78), rnd(0.48, 0.92))
        .setAlpha(0.92);
      this.tweens.add({
        targets: flame,
        y: GAME_HEIGHT - rnd(118, 220),
        scaleX: flame.scaleX * rnd(0.55, 0.85),
        scaleY: flame.scaleY * rnd(1.35, 1.9),
        alpha: 0,
        duration: rnd(520, 860),
        ease: 'Cubic.easeOut',
        onComplete: () => flame.destroy(),
      });
    }

    for (let i = 0; i < 4; i++) {
      const smoke = this.add
        .image(x + rnd(-38, 38), GAME_HEIGHT - 58, 'hazard-disaster-smoke')
        .setDepth(DEPTH.ebullet - 0.45 + i * 0.002)
        .setScale(rnd(0.42, 0.7))
        .setAlpha(rnd(0.48, 0.72));
      this.tweens.add({
        targets: smoke,
        x: smoke.x + rnd(-45, 45),
        y: smoke.y - rnd(90, 180),
        rotation: rnd(-0.3, 0.3),
        scale: smoke.scaleX * rnd(1.35, 1.85),
        alpha: 0,
        duration: rnd(1050, 1550),
        ease: 'Sine.easeOut',
        onComplete: () => smoke.destroy(),
      });
    }

    for (let i = 0; i < 5; i++) {
      const rock = this.add
        .image(x + rnd(-25, 25), GAME_HEIGHT - 54, 'hazard-disaster-rock')
        .setDepth(DEPTH.ebullet - 0.1)
        .setScale(rnd(0.18, 0.36))
        .setAlpha(0.88);
      this.tweens.add({
        targets: rock,
        x: rock.x + rnd(-85, 85),
        y: rock.y - rnd(80, 180),
        rotation: rnd(-4, 4),
        alpha: 0,
        duration: rnd(520, 900),
        ease: 'Cubic.easeOut',
        onComplete: () => rock.destroy(),
      });
    }
  }

  private spawnVolcanicEruption(g: Extract<GimmickData, { type: 'volcanic' }>): void {
    const eruptionX = rnd(55, GAME_WIDTH - 55);
    const crack = this.add
      .image(0, 0, 'hazard-volcanic-crack')
      .setDisplaySize(270, 96)
      .setAlpha(0.9);
    const thermalRing = this.add
      .image(0, -8, 'hazard-volcanic-thermal-ring')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.56)
      .setAlpha(0.74);
    const vent = this.add
      .image(0, 12, 'hazard-volcanic-vent')
      .setDisplaySize(132, 82)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.76);
    const warning = this.add
      .container(eruptionX, GAME_HEIGHT - 50, [crack, thermalRing, vent])
      .setDepth(DEPTH.ebullet - 0.2);
    this.tweens.add({
      targets: crack,
      scaleY: crack.scaleY * 1.16,
      alpha: 0.62,
      duration: Math.max(180, g.warn * 480),
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: thermalRing,
      scale: 0.94,
      alpha: 0.18,
      duration: Math.max(220, g.warn * 920),
      ease: 'Cubic.easeOut',
    });
    for (let i = 0; i < g.fireballs; i++) {
      const fireball = this.addEnvironmentalHazard(
        'fireball',
        'hazard-fireball',
        eruptionX + rnd(-9, 9),
        GAME_HEIGHT + 25,
        {
          vx: rnd(-95, 95),
          vy: rnd(-410, -300),
          ay: rnd(175, 240),
          life: 4.4,
          activeAt: g.warn,
          hitW: 25,
          hitH: 25,
          damage: g.damage,
          emitsGas: i === 0 && Math.random() < g.gasChance ? g.gasDuration : 0,
          warning: i === 0 ? warning : undefined,
        },
      );
      fireball.img.setScale(rnd(0.7, 1.08)).setBlendMode(Phaser.BlendModes.ADD);
    }
  }

  private spawnCoolant(): void {
    const coolant = this.addEnvironmentalHazard(
      'coolant',
      'coolant-item',
      rnd(38, GAME_WIDTH - 38),
      -28,
      {
        vx: rnd(-12, 12),
        vy: 86,
        life: 9,
        hitW: 30,
        hitH: 38,
      },
    );
    coolant.img
      .setDepth(DEPTH.orb + 0.25)
      .setScale(0.66)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private spawnProminence(g: Extract<GimmickData, { type: 'prominence' }>): void {
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const y = rnd(105, GAME_HEIGHT - 125);
    const warning = this.add
      .image(side < 0 ? -48 : GAME_WIDTH + 48, y, 'hazard-corona')
      .setDepth(DEPTH.ebullet - 0.25)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff673c)
      .setScale(0.82)
      .setAlpha(0.24);
    const prominence = this.addEnvironmentalHazard(
      'prominence',
      'hazard-prominence-ribbon',
      side < 0 ? -160 : GAME_WIDTH + 160,
      y,
      {
        life: 3.15,
        activeAt: g.warn,
        hitW: Math.min(250, g.reach),
        hitH: 62,
        damage: g.damage,
        side,
        reach: g.reach,
        warning,
      },
    );
    const filament = this.add
      .image(prominence.x, prominence.y, 'hazard-prominence-filament')
      .setDepth(DEPTH.ebullet + 0.06)
      .setFlipX(side > 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.82)
      .setVisible(false);
    const corona = this.add
      .image(side < 0 ? -112 : GAME_WIDTH + 112, y, 'hazard-corona')
      .setDepth(DEPTH.ebullet - 0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff7044)
      .setScale(1.16)
      .setAlpha(0.52)
      .setVisible(false);
    prominence.layers = [filament, corona];
    prominence.img
      .setFlipX(side > 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(clamp(g.reach / 270, 0.84, 1.08), 0.92);
  }

  private spawnLightning(g: Extract<GimmickData, { type: 'electricStorm' }>): void {
    const x = rnd(38, GAME_WIDTH - 38);
    const warning = this.add
      .rectangle(x, GAME_HEIGHT / 2, 36, GAME_HEIGHT, 0x58d7ff, 0.12)
      .setDepth(DEPTH.ebullet - 0.2)
      .setStrokeStyle(2, 0xd8fbff, 0.7);
    const strike = this.addEnvironmentalHazard(
      'lightning',
      'hazard-lightning',
      x,
      GAME_HEIGHT / 2,
      {
        life: 0.32,
        activeAt: g.warn,
        hitW: 26,
        hitH: GAME_HEIGHT,
        damage: g.damage,
        warning,
      },
    );
    strike.img.setDisplaySize(46, GAME_HEIGHT).setBlendMode(Phaser.BlendModes.ADD);
  }

  private updateEnvironmentalHazards(dt: number, canHurt: boolean): void {
    for (let i = this.envHazards.length - 1; i >= 0; i--) {
      const hazard = this.envHazards[i];
      if (!hazard) continue;
      hazard.t += dt;
      if (hazard.t < hazard.activeAt) {
        hazard.warning?.setAlpha(0.14 + (Math.floor(hazard.t * 12) % 2) * 0.28);
        continue;
      }
      if (!hazard.img.visible) hazard.img.setVisible(true);
      hazard.layers?.forEach((layer) => layer.setVisible(true));
      if (hazard.warning) {
        if (hazard.kind === 'fireball') this.playVolcanicBlast(hazard.x);
        hazard.warning.destroy();
        hazard.warning = undefined;
        hazard.img.setVisible(true);
        if (hazard.kind !== 'lightning') SFX.swoosh();
      }
      if (hazard.emitsGas > 0) {
        this.spawnGasClouds(hazard.emitsGas);
        hazard.emitsGas = 0;
      }
      const age = hazard.t - hazard.activeAt;
      hazard.vx += hazard.ax * dt;
      hazard.vy += hazard.ay * dt;
      if (hazard.kind === 'prominence') {
        const extension = Math.sin(clamp(age / hazard.life, 0, 1) * Math.PI);
        hazard.x =
          hazard.side < 0
            ? -160 + extension * hazard.reach
            : GAME_WIDTH + 160 - extension * hazard.reach;
        const tongue = Math.sin(this.worldT * 8.6 + hazard.y * 0.017);
        const billow = Math.sin(this.worldT * 3.1 + hazard.t * 1.7);
        const baseScale = clamp(hazard.reach / 270, 0.84, 1.08);
        hazard.img
          .setScale(baseScale * (1 + tongue * 0.035), 0.9 + tongue * 0.11)
          .setRotation(billow * 0.035);
        const filament = hazard.layers?.[0];
        if (filament) {
          filament
            .setPosition(hazard.x - hazard.side * (5 + tongue * 7), hazard.y + tongue * 5)
            .setScale(baseScale * (1.02 - tongue * 0.025), 0.84 + billow * 0.14)
            .setRotation(-billow * 0.025)
            .setAlpha(0.64 + Math.abs(tongue) * 0.28);
        }
        const corona = hazard.layers?.[1];
        if (corona) {
          corona
            .setPosition(hazard.side < 0 ? -112 : GAME_WIDTH + 112, hazard.y)
            .setScale(1.1 + billow * 0.08)
            .setRotation(this.worldT * 0.08 * -hazard.side)
            .setAlpha(0.4 + Math.abs(tongue) * 0.16);
        }
        if (Math.random() < dt * 18) {
          const tipX = hazard.x - hazard.side * baseScale * 145;
          const spark = this.fxPool.get('spark', tipX + rnd(-12, 12), hazard.y + rnd(-38, 38));
          spark
            .setDepth(DEPTH.ebullet + 0.08)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(Math.random() < 0.45 ? 0xffe08a : 0xff563d)
            .setScale(rnd(0.8, 1.8));
          this.sparks.push({
            img: spark,
            vx: -hazard.side * rnd(55, 125),
            vy: rnd(-70, 70),
            t: 0.24,
          });
        }
      } else {
        hazard.x += hazard.vx * dt;
        hazard.y += hazard.vy * dt;
      }
      hazard.img.setPosition(hazard.x, hazard.y);
      if (hazard.kind === 'ice' || hazard.kind === 'fireball') {
        hazard.img.rotation += dt * (hazard.kind === 'ice' ? 2.2 : 4.8);
      } else if (hazard.kind === 'gas') {
        const fade = Math.min(1, age * 1.5, (hazard.life - age) * 1.5);
        hazard.img.setAlpha(clamp(fade, 0, 1) * 0.68);
        hazard.img.rotation += dt * 0.04;
      } else if (hazard.kind === 'coolant') {
        hazard.img.rotation = Math.sin(this.worldT * 3 + hazard.x) * 0.14;
        hazard.img.setScale(0.66 * (1 + Math.sin(this.worldT * 6) * 0.08));
      } else if (hazard.kind === 'lightning') {
        hazard.img.setAlpha(Math.random() > 0.3 ? 1 : 0.42);
        this.environmentOverlay.setFillStyle(0xb9efff, 1).setAlpha(0.13);
      }

      if (
        hazard.kind === 'coolant' &&
        this.alive &&
        aabb(
          hazard.x,
          hazard.y,
          hazard.hitW,
          hazard.hitH,
          this.px,
          this.py,
          PLAYER.hitW,
          PLAYER.hitH,
        )
      ) {
        this.environmentHeat = Math.min(this.environmentHeat, 0.12);
        this.heatDamageT = 0;
        this.addFloatText(hazard.x, hazard.y, 'COOLED', '#79f5ff');
        SFX.pow();
        hazard.hit = true;
      } else if (
        !hazard.hit &&
        canHurt &&
        this.alive &&
        hazard.damage > 0 &&
        aabb(
          hazard.x,
          hazard.y,
          hazard.hitW,
          hazard.hitH,
          this.px,
          this.py,
          PLAYER.hitW,
          PLAYER.hitH,
        )
      ) {
        hazard.hit = true;
        this.damagePlayer(hazard.damage);
      }

      const expired =
        hazard.hit ||
        age >= hazard.life ||
        hazard.y > GAME_HEIGHT + 100 ||
        hazard.x < -240 ||
        hazard.x > GAME_WIDTH + 240;
      if (expired) {
        hazard.layers?.forEach((layer) => layer.destroy());
        hazard.img.destroy();
        this.envHazards.splice(i, 1);
      }
    }
  }

  private updateGimmick(dt: number): void {
    const g = this.currentSector ? this.currentSector.gimmicks[0] : this.level.gimmick;
    this.environmentWind = 0;
    this.environmentSpeed = 1;
    this.envCameraX = 0;
    this.playerImg.clearTint();
    this.environmentOverlay.setFillStyle(0xff7a28, 1).setAlpha(0);
    if (!g) {
      this.environmentOverlay.setAlpha(0);
      this.updateEnvironmentalHazards(dt, this.pendingShop <= 0);
      return;
    }
    // 보스전 중·보스 격파 후 클리어 연출(pendingShop) 중에는 위험 기믹을 봉인:
    // 스폰 금지 + 타이머 홀드(게이트 해제 직후 즉발 방지) + 연출 중 피해 판정 정지
    const hazardGate = !!this.boss || this.pendingShop > 0;
    const canHurt = !hazardGate;

    if (g.type === 'fog') {
      // L1 성운: 안개 구름이 흘러가며 적을 가린다
      this.gimT += dt;
      if (this.gimT >= g.interval && this.fogs.length < 3) {
        this.gimT = 0;
        const img = this.add
          .image(rnd(40, GAME_WIDTH - 40), -70, 'fog-cloud')
          .setDepth(DEPTH.enemy + 0.5)
          .setScale(rnd(1.7, 2.7), rnd(1.4, 2.0))
          .setAlpha(g.alpha)
          .setBlendMode(Phaser.BlendModes.SCREEN);
        this.fogs.push({ img, vx: rnd(-9, 9), vy: this.scrollSpd * rnd(0.75, 1.0) });
      }
      for (let i = this.fogs.length - 1; i >= 0; i--) {
        const f = this.fogs[i];
        if (!f) continue;
        f.img.x += f.vx * dt;
        f.img.y += f.vy * dt;
        if (f.img.y > GAME_HEIGHT + 90) {
          f.img.destroy();
          this.fogs.splice(i, 1);
        }
      }
    } else if (g.type === 'vents') {
      // L2 원시별: 예고선 → 화염 기둥 분출
      this.gimT += dt;
      if (hazardGate) this.gimT = Math.min(this.gimT, g.interval * 0.4);
      if (this.gimT >= g.interval && !hazardGate) {
        this.gimT = 0;
        const x = rnd(50, GAME_WIDTH - 50);
        const warnImg = this.add
          .rectangle(x, GAME_HEIGHT - 165, 5, 330, 0xff6a30, 0.55)
          .setDepth(DEPTH.bg + 1.2);
        this.vents.push({ x, t: 0, warnImg, img: null });
        SFX.eshoot();
      }
      for (let i = this.vents.length - 1; i >= 0; i--) {
        const v = this.vents[i];
        if (!v) continue;
        v.t += dt;
        if (v.t < g.warn) {
          v.warnImg.setAlpha(Math.floor(v.t * 10) % 2 === 0 ? 0.6 : 0.2);
        } else {
          if (!v.img) {
            v.warnImg.destroy();
            v.img = this.add
              .image(v.x, GAME_HEIGHT - 165, 'vent-pillar')
              .setDepth(DEPTH.ebullet + 0.5)
              .setBlendMode(Phaser.BlendModes.ADD);
            SFX.swoosh();
            this.shake = Math.min(7, this.shake + 2);
          }
          v.img.setScale(rnd(0.9, 1.2), 1).setAlpha(Math.min(1, (g.warn + g.burn - v.t) * 4));
          if (
            this.alive &&
            canHurt &&
            Math.abs(this.px - v.x) < g.width / 2 + PLAYER.hitW / 2 &&
            this.py > GAME_HEIGHT - 330
          ) {
            this.damagePlayer(g.damage);
          }
          if (v.t >= g.warn + g.burn) {
            v.img.destroy();
            this.vents.splice(i, 1);
          }
        }
      }
    } else if (g.type === 'wind') {
      // L3 주계열성: 태양풍 — 주기적으로 방향이 바뀌는 횡풍
      this.windT += dt;
      const target = this.windT % (g.period * 2) < g.period ? 1 : -1;
      this.windCur += (target - this.windCur) * Math.min(1, dt * 1.6);
      this.environmentWind = this.windCur * g.force;
      this.windStreakT += dt;
      if (this.windStreakT > 0.11) {
        this.windStreakT = 0;
        const sImg = this.fxPool.get('wind-streak', rnd(0, GAME_WIDTH), rnd(50, GAME_HEIGHT - 40));
        sImg
          .setDepth(DEPTH.bg + 1.1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.5)
          .setFlipX(this.windCur < 0);
        this.sparks.push({ img: sImg, vx: this.windCur * 430, vy: 0, t: 0.35 });
      }
    } else if (g.type === 'heatwave') {
      // L4 적색거성: 팽창 맥동 — 틈새 하나 남기고 올라오는 열파 띠
      this.gimT += dt;
      if (hazardGate) this.gimT = Math.min(this.gimT, g.interval * 0.4);
      if (this.gimT >= g.interval && !hazardGate) {
        this.gimT = 0;
        const gapX = rnd(70, GAME_WIDTH - 70);
        const imgs: Phaser.GameObjects.Image[] = [];
        for (let x = 14; x < GAME_WIDTH; x += 28) {
          if (Math.abs(x - gapX) < g.gap / 2) continue;
          const im = this.fxPool.get('heat-flame', x, GAME_HEIGHT + 22);
          im.setDepth(DEPTH.ebullet + 0.3)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(1.25);
          imgs.push(im);
        }
        this.heatwaves.push({ y: GAME_HEIGHT + 22, gapX, imgs, hit: false });
        SFX.swoosh();
        vibrate(25);
      }
      for (let i = this.heatwaves.length - 1; i >= 0; i--) {
        const hw = this.heatwaves[i];
        if (!hw) continue;
        hw.y -= g.speed * dt;
        for (const im of hw.imgs) {
          im.setY(hw.y);
          im.setScale(1.1 + Math.sin(this.worldT * 18 + im.x) * 0.2);
        }
        if (
          this.alive &&
          canHurt &&
          !hw.hit &&
          Math.abs(this.py - hw.y) < 15 + PLAYER.hitH / 2 &&
          Math.abs(this.px - hw.gapX) > g.gap / 2 - PLAYER.hitW / 2
        ) {
          hw.hit = true;
          this.damagePlayer(g.damage);
        }
        if (hw.y < -26) {
          for (const im of hw.imgs) this.fxPool.release(im);
          this.heatwaves.splice(i, 1);
        }
      }
    } else if (g.type === 'debris') {
      // L5 초신성: 파괴 가능한 잔해 낙하 (부수면 점수·크레딧)
      this.gimT += dt;
      if (hazardGate) this.gimT = Math.min(this.gimT, g.interval * 0.4);
      if (this.gimT >= g.interval && !hazardGate) {
        this.gimT = 0;
        this.spawnEnemyAt(g.enemy, rnd(40, GAME_WIDTH - 40), -45, { vx: rnd(-28, 28) });
      }
    } else if (g.type === 'warp') {
      // L6 블랙홀 안쪽: 공간 왜곡 — 주기적 스크롤 역류 (적탄 순환은 updateEBullets)
      this.warpPulseT += dt;
      if (this.warpPulseT >= g.pulseEvery) {
        this.warpPulseT = 0;
        this.scrollRev = 1.3;
      }
      if (this.scrollRev > 0) this.scrollRev -= dt;
    } else if (g.type === 'iceStorm') {
      const gust = Math.sin(this.worldT * 0.72) * 0.72 + Math.sin(this.worldT * 2.1) * 0.28;
      this.environmentWind = gust * g.windForce;
      this.environmentSpeed = 1 - g.slow;
      this.playerImg.setTint(0xb8efff);
      this.environmentOverlay.setFillStyle(0x8edfff, 1).setAlpha(0.035 + Math.abs(gust) * 0.035);
      if (!hazardGate && this.gimmickTimer('ice-shards', dt, g.shardEvery)) this.spawnIceStorm(g);
    } else if (g.type === 'volcanic') {
      if (!hazardGate && this.gimmickTimer('volcanic-eruption', dt, g.eruptionEvery)) {
        this.spawnVolcanicEruption(g);
      }
    } else if (g.type === 'desertHeat') {
      if (!hazardGate) this.environmentHeat = Math.min(1, this.environmentHeat + g.heatPerSec * dt);
      if (!hazardGate && this.gimmickTimer('desert-coolant', dt, g.coolantEvery)) {
        this.spawnCoolant();
      }
      if (this.environmentHeat >= 1 && canHurt) {
        this.heatDamageT += dt;
        if (this.heatDamageT >= g.damageEvery) {
          this.heatDamageT %= g.damageEvery;
          this.damagePlayer(5);
          this.addFloatText(this.px, this.py - 22, 'OVERHEAT', '#ff9a55');
        }
      } else {
        this.heatDamageT = 0;
      }
      const heatRatio = this.environmentHeat;
      this.environmentOverlay.setAlpha(heatRatio * g.distortion * 0.16);
      this.envCameraX = Math.sin(this.worldT * 11.5) * heatRatio * g.distortion * 2.2;
    } else if (g.type === 'prominence') {
      this.environmentWind =
        (Math.sin(this.worldT * 0.58) + Math.sin(this.worldT * 1.73) * 0.35) * g.windForce;
      this.environmentOverlay
        .setFillStyle(0xff6835, 1)
        .setAlpha(0.035 + Math.abs(Math.sin(this.worldT * 1.4)) * 0.035);
      if (
        this.envHazards.some(
          (hazard) => hazard.kind === 'prominence' && hazard.t >= hazard.activeAt,
        )
      ) {
        this.shake = Math.min(3.2, this.shake + dt * 0.85);
      }
      if (!hazardGate && this.gimmickTimer('stellar-prominence', dt, g.interval)) {
        this.spawnProminence(g);
      }
    } else if (g.type === 'electricStorm') {
      if (!hazardGate && this.gimmickTimer('electric-strike', dt, g.interval)) {
        this.spawnLightning(g);
      }
    } else if (g.type === 'meteorField') {
      if (!hazardGate && this.gimmickTimer('meteor-field', dt, g.interval)) {
        this.spawnEnemyAt(g.enemy, rnd(34, GAME_WIDTH - 34), -48, { vx: rnd(-34, 34) });
      }
    }

    for (const bullet of this.bullets) bullet.x += this.environmentWind * 0.35 * dt;
    if ((g.type === 'iceStorm' || g.type === 'prominence') && Math.abs(this.environmentWind) > 2) {
      this.windStreakT += dt;
      if (this.windStreakT > 0.1) {
        this.windStreakT = 0;
        const streak = this.fxPool.get(
          'wind-streak',
          rnd(0, GAME_WIDTH),
          rnd(45, GAME_HEIGHT - 35),
        );
        streak
          .setDepth(DEPTH.bg + 1.1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(g.type === 'iceStorm' ? 0.72 : 0.48)
          .setTint(g.type === 'iceStorm' ? 0xb8f5ff : 0xffc077)
          .setFlipX(this.environmentWind < 0);
        this.sparks.push({ img: streak, vx: this.environmentWind * 4.2, vy: 0, t: 0.34 });
      }
    }
    this.updateEnvironmentalHazards(dt, canHurt);
  }

  private updateProps(dt: number): void {
    if (this.sectorLandmark) {
      this.sectorLandmark.rotation += dt * 0.018;
      this.sectorLandmark.y = this.sectorLandmarkY + Math.sin(this.worldT * 0.32) * 8;
      this.sectorLandmark.setAlpha(0.78 + Math.sin(this.worldT * 0.7) * 0.06);
    }
    this.propT += dt;
    if (this.propT >= this.nextPropAt) {
      this.propT = 0;
      this.nextPropAt = 7 + Math.random() * 6;
      const table: Record<string, string[]> = {
        nebula: ['prop-crystal'],
        protostar: ['prop-emberrock'],
        mainseq: ['prop-emberrock', 'az-asteroid-med-a'],
        asteroids: [
          'az-asteroid-big-a',
          'az-asteroid-big-b',
          'az-asteroid-med-a',
          'az-asteroid-med-b',
        ],
        redgiant: ['prop-emberrock', 'az-asteroid-med-b'],
        supernova: ['az-asteroid-med-a', 'prop-rock'],
        blackhole: ['prop-derelict'],
        inside: ['prop-eye', 'prop-shellswirl', 'prop-derelict'],
      };
      const theme = this.currentSector?.background?.theme ?? this.level.background.theme;
      const keys = table[theme] ?? ['prop-rock'];
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
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      if (!impact) continue;
      impact.t += dt;
      const p = clamp(impact.t / 0.24, 0, 1);
      impact.core
        .setScale(impact.scale * (0.35 + p * 0.5))
        .setAlpha(1 - p)
        .setRotation(impact.core.rotation + dt * 4);
      impact.ring
        .setScale(impact.scale * (0.18 + p * 0.95))
        .setAlpha((1 - p) * 0.9)
        .setRotation(impact.ring.rotation - dt * 2);
      if (p >= 1) {
        this.fxPool.release(impact.core);
        this.fxPool.release(impact.ring);
        this.impacts.splice(i, 1);
      }
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const bm = this.booms[i];
      if (!bm) continue;
      bm.t += dt * 2.4;
      const p = clamp(bm.t, 0, 1);
      const r = (5 + 41 * p) * bm.scale;
      bm.img.setFrame(Math.min(4, Math.floor(p * 5)));
      bm.img.setScale((1.7 + 0.5 * p) * bm.scale).setAlpha(1 - p * 0.55);
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
    this.updateDamageSmoke(dt);
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
    // 텍스트는 값이 바뀔 때만 재생성 (모바일 텍스처 업로드 절약)
    const lvl = weaponLevel(s);
    const weaponChanged = s.cur !== this.lastWpnKey;
    if (weaponChanged) {
      this.lastWpnKey = s.cur;
      const color = wpn?.color ?? '#8aff8a';
      const colorValue = Number.parseInt(color.slice(1), 16);
      this.hudWpn.setColor(color);
      this.hudWeaponAccent.setFillStyle(colorValue, 0.95);
    }
    if (lvl !== this.lastWpnLvl) {
      this.lastWpnLvl = lvl;
      const colorValue = Number.parseInt((wpn?.color ?? '#8aff8a').slice(1), 16);
      this.hudPips.forEach((p, i) => p.setFillStyle(i < lvl ? colorValue : 0x283747));
    }
    const weaponStatus = this.weaponRuntime.locked
      ? 'LOCKED'
      : (this.weaponFrame?.status ?? 'READY');
    if (weaponChanged || weaponStatus !== this.lastWeaponStatus) {
      this.lastWeaponStatus = weaponStatus;
      const suffix = weaponStatus === 'READY' ? '' : ` · ${weaponStatus}`;
      this.hudWpn.setText(`${wpn?.short ?? s.cur}${suffix}`);
    }
    const heatRatio = clamp(this.weaponRuntime.heat / this.weaponCooler().heatCapacity, 0, 1);
    const heatColor =
      weaponStatus === 'LOCKED'
        ? 0xff4059
        : weaponStatus === 'HOT'
          ? 0xffa33b
          : weaponStatus === 'CHARGE'
            ? 0xc98cff
            : 0x55d8ff;
    this.hudHeatBar.setScale(heatRatio, 1).setFillStyle(heatColor, 0.95);
    if (s.wave !== this.lastWave) {
      this.lastWave = s.wave;
      this.hudWaveT.setText(t('hud.wave', s.wave));
    }
    if (s.score !== this.lastScore) {
      this.lastScore = s.score;
      this.hudScore.setText(String(s.score).padStart(7, '0'));
    }
    if (this.progression.credits !== this.lastCredits) {
      this.lastCredits = this.progression.credits;
      this.hudCredits.setText(`₡ ${this.progression.credits.toLocaleString('en-US')}`);
    }
    // 하단 탄막을 가리지 않게 반투명 유지, 사용 가능 시 펄스
    if (s.superN > 0) {
      this.superBtn.setAlpha(0.66).setScale(1 + Math.sin(this.worldT * 4.5) * 0.05);
    } else {
      this.superBtn.setAlpha(0.28).setScale(1);
    }
    if (s.superN !== this.lastSuperN) {
      this.lastSuperN = s.superN;
      this.superCount.setText(`x${s.superN}`);
    }
    const sectorGimmick = this.currentSector?.gimmicks[0];
    const bonusMultiplier = this.currentSector?.bonusMultiplier ?? 1;
    if (sectorGimmick?.type === 'desertHeat') {
      const ratio = clamp(this.environmentHeat, 0, 1);
      this.envBarBg.setVisible(true);
      this.envBar
        .setVisible(true)
        .setScale(ratio, 1)
        .setFillStyle(ratio > 0.78 ? 0xff6845 : 0xffb33f, 0.95);
      this.envStatus
        .setVisible(true)
        .setText(`CORE HEAT  ${Math.round(this.environmentHeat * 100)}%`);
    } else if (sectorGimmick) {
      const labels: Partial<Record<GimmickData['type'], string>> = {
        iceStorm: 'ICE STORM / FLIGHT CONTROL DEGRADED',
        volcanic: 'VOLCANIC ACTIVITY',
        prominence: 'STELLAR WIND / PROMINENCE',
        electricStorm: 'ELECTRIC STORM',
        meteorField: 'METEOR FIELD',
        fog: 'LOW VISIBILITY',
        warp: 'SPACETIME SHEAR',
      };
      this.envBarBg.setVisible(false);
      this.envBar.setVisible(false);
      this.envStatus.setVisible(true).setText(labels[sectorGimmick.type] ?? 'HAZARD ZONE');
    } else if (bonusMultiplier > 1) {
      this.envBarBg.setVisible(false);
      this.envBar.setVisible(false);
      this.envStatus.setVisible(true).setText(`BONUS ROUTE  x${bonusMultiplier}`);
    } else {
      this.envBarBg.setVisible(false);
      this.envBar.setVisible(false);
      this.envStatus.setVisible(false);
    }
    const B = this.boss;
    if (B) {
      this.bossBar.setScale(clamp(B.hp / B.hpMax, 0, 1), 1);
      const partsAlive = B.parts.filter((part) => part.alive).length;
      const shield = this.coreShielded(B) ? 'SHIELD' : 'CORE OPEN';
      const status = `P${B.stage + 1}  ${shield}  ${partsAlive}/${B.parts.length}`;
      if (this.bossPartStatus.text !== status) this.bossPartStatus.setText(status);
    }
  }
}
