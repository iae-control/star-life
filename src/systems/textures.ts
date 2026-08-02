// 임시 에셋 절차 생성 — 전부 자체 제작(원작·Tyrian 무관), M3에서 정식 아트로 교체.
// 캔버스 2D로 프리렌더해 WebGL 스프라이트로 쓴다. 픽셀아트는 다크 아웃라인 + 3단 셰이딩.
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../config';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function addCanvasTexture(scene: Phaser.Scene, key: string, c: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

/** 문자열 픽셀맵 → 캔버스 (scale배 확대, 픽셀아트) */
function pixmap(rows: string[], palette: Record<string, string>, scale: number): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = canvas(w * scale, h * scale);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const col = palette[row[x] ?? '.'];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

/* ---------- 함선 픽셀맵 ---------- */

const PLAYER_MAP = [
  '.......OO.......',
  '......OGGO......',
  '......OGgO......',
  '.....OCGgCO.....',
  '.....OCBBCO.....',
  '....OCBBBBCO....',
  '....OCBDDBCO....',
  '...OCBBDDBBCO...',
  '...OCBBDDBBCO...',
  '..OCCBBBBBBCCO..',
  '..OCBWBBBBWBCO..',
  '.OCCBBBOOBBBCCO.',
  '.OCBBBO..OBBBCO.',
  'OCCBBO....OBBCCO',
  'OCBBO..EE..OBBCO',
  'OBBO..OEeO..OBBO',
  '.OO...OEeO...OO.',
  '......OEeO......',
];
const PLAYER_PAL = {
  O: '#0a1226',
  W: '#f0f8ff',
  C: '#9fdcff',
  B: '#2f6fd6',
  D: '#17356e',
  G: '#d8f6ff',
  g: '#5ec2f0',
  E: '#ffb347',
  e: '#b85a14',
};

const E1_MAP = [
  '.....OO.....',
  '....ORRO....',
  '....ORRO....',
  '...ORrrRO...',
  '..ORrddrRO..',
  '.ORrddddrRO.',
  '.ORrddddrRO.',
  '..ORrddrRO..',
  '...ORrrRO...',
  '..ORO..ORO..',
  '.ORO....ORO.',
  '.OO......OO.',
];
const E1_PAL = { O: '#200810', W: '#ffd8d8', R: '#e64a4a', r: '#a82838', d: '#571020' };

const E2_MAP = [
  '...OOOOOOOO...',
  '..OPPppppPPO..',
  '.OPpddddddpPO.',
  'OPpddCCCCddpPO',
  'OPpdCcccCddpPO',
  'OPpdCcccCddpPO',
  'OPpddCCCCddpPO',
  '.OPpddddddpPO.',
  '..OPPppppPPO..',
  '...OOWOOWOO...',
  '....OWO.OWO...',
  '....OO...OO...',
];
const E2_PAL = {
  O: '#14081f',
  W: '#e8d8ff',
  P: '#9a6ae0',
  p: '#5a3a9a',
  d: '#2a1850',
  C: '#ff8a4a',
  c: '#ffd0a0',
};

// 아래(플레이어 쪽)를 향한 화살촉 — 피아 식별을 실루엣 방향으로도 구분
const E3_MAP = [
  'OO......OO',
  'OWO....OWO',
  '.OWO..OWO.',
  '.OYoddoYO.',
  'OYoddddoYO',
  'OYoddddoYO',
  '.OYoddoYO.',
  '.OYoddoYO.',
  '..OYooYO..',
  '..OYooYO..',
  '...OYYO...',
  '...OYYO...',
  '....OO....',
];
const E3_PAL = { O: '#241004', W: '#fff2c8', Y: '#ffd76a', o: '#e6862a', d: '#8a4a10' };

// 보스 — 전용 스프라이트 (뿔 달린 장갑 코어체, 하단 포문)
const BOSS_MAP = [
  '....OO........OO....',
  '...OPPO......OPPO...',
  '..OPppPO....OPppPO..',
  '..OPpdPOOOOOOPdpPO..',
  '.OPpddPPppppPPddpPO.',
  '.OPpdppddddddppdpPO.',
  'OPpdpddddddddddpdpPO',
  'OPpdpddCCCCCCddpdpPO',
  'OPpdddCCccccCCdddpPO',
  'OPpdddCccccccCdddpPO',
  'OPpdddCccccccCdddpPO',
  'OPpdddCCccccCCdddpPO',
  'OPpdpddCCCCCCddpdpPO',
  'OPpdpddddddddddpdpPO',
  '.OPpdppddddddppdpPO.',
  '.OPpddPPppppPPddpPO.',
  '..OPpdWOtttOWdpPO...',
  '..OPpWO.ttt.OWpPO...',
  '...OWO..OOO..OWO....',
  '...OO....O....OO....',
];
const BOSS_PAL = {
  O: '#140a24',
  W: '#f0e0ff',
  P: '#a06ae8',
  p: '#6a44b4',
  d: '#341f6e',
  D: '#1c1040',
  C: '#ff6a3a',
  c: '#ffc89a',
  t: '#58e8d8',
};

/* ---------- L1~L3 신규 적 (M3) ---------- */

// 성운 해파리 — 유령빛 시안
const WISP_MAP = [
  '...OOOO...',
  '..OTggTO..',
  '.OTgGGgTO.',
  '.OTgGGgTO.',
  '.OTggggTO.',
  '..OTggTO..',
  '..OT..TO..',
  '.OT.OO.TO.',
  '.OT.OO.TO.',
  '..O....O..',
];
const WISP_PAL = { O: '#062430', T: '#2a8a9a', g: '#5ad8d8', G: '#c8fff4' };

// 성운 포자 — 분열체 (죽으면 마이트 방출)
const SPORE_MAP = [
  '...OOOOOO...',
  '..OPpppppO..',
  '.OPpGGGGpPO.',
  'OPpGgggggpPO',
  'OPpGgOOggpPO',
  'OPpGgOOggpPO',
  'OPpGgggggpPO',
  '.OPpGGGGpPO.',
  '..OPpppppO..',
  '...OOOOOO...',
];
const SPORE_PAL = { O: '#101c14', P: '#5aa070', p: '#357a50', G: '#8ae0a0', g: '#4aa868' };

// 원시별 불씨 — 측면 소사
const EMBER_MAP = [
  '....OO....',
  '...OYYO...',
  '..OYffYO..',
  '.OYffffYO.',
  '.OYfrrfYO.',
  '.OYfrrfYO.',
  '..OYffYO..',
  '..OrOOrO..',
  '.OrO..OrO.',
  '.OO....OO.',
];
const EMBER_PAL = { O: '#2a0c04', Y: '#ffd75e', f: '#ff8a3a', r: '#c8401a' };

// 궤도병 — 공전하며 링 사격
const ORBITER_MAP = [
  '...OOOOOO...',
  '..OmMMMMmO..',
  '.OmMwwwwMmO.',
  'OmMwCCCCwMmO',
  'OmMwCddCwMmO',
  'OmMwCddCwMmO',
  'OmMwCCCCwMmO',
  '.OmMwwwwMmO.',
  '..OmMMMMmO..',
  '...OOOOOO...',
];
const ORBITER_PAL = {
  O: '#180a24',
  m: '#6a3aa0',
  M: '#9a5ae0',
  w: '#d8c8f0',
  C: '#ff5a8a',
  d: '#8a1030',
};

// 홍염 — 3방향 확산 사격 사인 강하
const PROM_MAP = [
  '.....OO.....',
  '....OYYO....',
  '...OYffYO...',
  'OO.OYffYO.OO',
  'OfOYfrrfYOfO',
  'OffYfrrfYffO',
  '.OffrrrrffO.',
  '..OffrrffO..',
  '...OffffO...',
  '....OOOO....',
];
const PROM_PAL = { O: '#2a0808', Y: '#ffe28a', f: '#ff9a3a', r: '#d84a1a' };

/* ---------- 보스 3종 (M3) ---------- */

// L1 성운 아메바 — 핵이 여럿 박힌 반투명 덩어리
const AMOEBA_MAP = [
  '.....OOOO..OOO......',
  '...OOggggOOgggOO....',
  '..OggGGggggGGggO....',
  '.OgGGgggggggggGgO...',
  'OgGgggNNgggggggGO...',
  'OggggNNNNggNNggggO..',
  'OggggNNNNgNNNNgggO..',
  '.OgggggNNggNNgggggO.',
  '.OggGggggggggggGggO.',
  'OggGGgggNNNgggGGggO.',
  'OgGggggNNNNNggggGgO.',
  'OggggggNNNNNggggggO.',
  '.OggggggNNNggggggO..',
  '.OgGGggggggggGGgO...',
  '..OggGGggggGGggO....',
  '...OOggggggggOO.....',
  '.....OOggggOO.......',
  '.......OOOO.........',
];
const AMOEBA_PAL = { O: '#0c2418', g: '#3a8a5a', G: '#7ad89a', N: '#d8ff8a' };

// L2 원시별 코어 — 강착 원반을 두른 용융핵
const PROTOCORE_MAP = [
  '.......OOOOOO.......',
  '.....OOrrrrrrOO.....',
  '....OrrffffffrrO....',
  '..OOrrffYYYYffrrOO..',
  '.OaarffYYccYYfraaO..',
  'OaaarfYYccccYYfaaaO.',
  'OaaarfYccWWccYfaaaO.',
  '.OaarfYccWWccYfraaO.',
  '..OrrfYYccccYYfrrO..',
  '..OrrffYYccYYffrrO..',
  '.OaarrffYYYYffrraaO.',
  'OaaarrffffffffrraaaO',
  'OaaaOrrffffffrrOaaaO',
  '.OaO.OOrrrrrrOO.OaO.',
  '..O....OOOOOO....O..',
];
const PROTOCORE_PAL = {
  O: '#240a04',
  r: '#c84a1a',
  f: '#ff8a3a',
  Y: '#ffd75e',
  c: '#ffefb0',
  W: '#ffffff',
  a: '#6a2a10',
};

// L3 헬리오스 — 코로나 스파이크를 두른 항성체
const HELIOS_MAP = [
  '....O....OO....O....',
  '...OYO..OYYO..OYO...',
  '..OYYO.OYffYO.OYYO..',
  '.OYffYOYffffYOYffY..',
  'OYffffYffccffYffffYO',
  '.OYffcccccccccffYO..',
  '..OfccccWWccccfO....',
  'OYfccccWWWWccccfYO..',
  'OYfcccWWWWWWcccfYO..',
  'OYfcccWWWWWWcccfYO..',
  'OYfccccWWWWccccfYO..',
  '..OfccccccccccfO....',
  '.OYffcccccccffYO....',
  'OYffffYffccffYffffYO',
  '.OYffYOYffffYOYffY..',
  '..OYYO.OYffYO.OYYO..',
  '...OYO..OYYO..OYO...',
  '....O....OO....O....',
];
const HELIOS_PAL = { O: '#3a1804', Y: '#ffd75e', f: '#ff9a3a', c: '#ffe8a0', W: '#fffff0' };

/* ---------- L4~L6 보스 (M4 — 거대 멀티파츠) ---------- */

// L4 크림슨 자이언트 — 부풀어 오른 적색거성 껍질
const CRIMSON_MAP = [
  '....OOO........OOO....',
  '..OOrrrOO....OOrrrOO..',
  '.OrrffrrrOOOOrrrffrrO.',
  '.OrfffrrrrrrrrrrfffrO.',
  'OrrfffrrrrrrrrrrfffrrO',
  'OrfffrrRRRRRRRRrrfffrO',
  'OrffrrRRffffffRRrrffrO',
  'OrfrrRRffYYYYffRRrrfrO',
  'OrrrRRffYYccYYffRRrrrO',
  'OrrrRffYYccccYYffRrrrO',
  'OrrrRffYYccccYYffRrrrO',
  'OrrrRRffYYYYYYffRRrrrO',
  'OrffrrRRffffffRRrrffrO',
  'OrfffrrRRRRRRRRrrfffrO',
  'OrrfffrrrrrrrrrrfffrrO',
  '.OrfffrrrOOOOrrrfffrO.',
  '..OOrrrOO....OOrrrOO..',
  '....OOO........OOO....',
];
const CRIMSON_PAL = {
  O: '#2a0808',
  r: '#8a2018',
  R: '#c84a2a',
  f: '#e07040',
  Y: '#ffb060',
  c: '#ffe0a0',
};

// L5 노바 코어 — 붕괴 직전의 항성핵
const NOVA_MAP = [
  '.....O....OO....O.....',
  '....OcO..OccO..OcO....',
  '...OcWcOOcWWcOOcWc....',
  '..OcWWWccWWWWccWWWcO..',
  '.OcWWffWWffffWWffWWcO.',
  'OcWffffffffffffffffWcO',
  'OcWfffccccccccccfffWcO',
  '.OWffccWWWWWWWWccffWO.',
  '.OWffcWWWWWWWWWWcffWO.',
  'OcWffcWWWWWWWWWWcffWcO',
  'OcWffcWWWWWWWWWWcffWcO',
  '.OWffcWWWWWWWWWWcffWO.',
  '.OWffccWWWWWWWWccffWO.',
  'OcWfffccccccccccfffWcO',
  'OcWffffffffffffffffWcO',
  '.OcWWffWWffffWWffWWcO.',
  '..OcWWWccWWWWccWWWcO..',
  '...OcWcOOcWWcOOcWcO...',
  '....OcO..OccO..OcO....',
  '.....O....OO....O.....',
];
const NOVA_PAL = { O: '#3a2404', c: '#ffd75e', W: '#fffff0', f: '#ff9a3a' };

// L6 싱귤래리티 — 강착 원반을 두른 블랙홀 (최종 보스, Jungjioo 호응)
const SING_MAP = [
  '......OOOOOOOOOOOO......',
  '....OOaaaaAAAAaaaaOO....',
  '..OOaaAAppppppppAAaaOO..',
  '.OaaAppaaaaaaaaaappAaaO.',
  '.OaAppaa........aappAaO.',
  'OaAppa....DDDD....appAaO',
  'OaApa...DDDDDDDD...apAaO',
  'OaAp...DDDDDDDDDD...pAaO',
  'OaAp..DDDDDDDDDDDD..pAaO',
  'OaAp..DDDDDDDDDDDD..pAaO',
  'OaAp..DDDDDDDDDDDD..pAaO',
  'OaAp..DDDDDDDDDDDD..pAaO',
  'OaAp...DDDDDDDDDD...pAaO',
  'OaApa...DDDDDDDD...apAaO',
  'OaAppa....DDDD....appAaO',
  '.OaAppaa........aappAaO.',
  '.OaaAppaaaaaaaaaappAaaO.',
  '..OOaaAAppppppppAAaaOO..',
  '....OOaaaaAAAAaaaaOO....',
  '......OOOOOOOOOOOO......',
];
const SING_PAL = { O: '#160a24', a: '#5a3aa0', A: '#9a6ae0', p: '#d8b0ff', D: '#050208' };

/* ---------- 보스 파츠 (파괴 가능 부위) ---------- */
const POD_MAP = [
  '..OOOO..',
  '.OggGgO.',
  'OgGNNGgO',
  'OgNNNNgO',
  'OgNNNNgO',
  'OgGNNGgO',
  '.OggGgO.',
  '..OOOO..',
];
const POD_PAL = { O: '#0c2418', g: '#3a8a5a', G: '#7ad89a', N: '#d8ff8a' };
const VANE_MAP = ['.Oa.', 'OfaO', 'OfrO', 'OfrO', 'OfrO', 'OfrO', 'OfrO', 'OfrO', 'OfaO', '.Oa.'];
const VANE_PAL = { O: '#240a04', f: '#ff8a3a', r: '#c84a1a', a: '#6a2a10' };
const CORONA_MAP = ['..OY..', '.OYfO.', 'OYffYO', 'OYffYO', 'OYffYO', '.OYfO.', '..OY..'];
const CORONA_PAL = { O: '#3a1804', Y: '#ffd75e', f: '#ff9a3a' };
const CANNON_MAP = ['.OrrO.', 'OrffrO', 'OrffrO', 'OrffrO', 'OrYYrO', 'OrYYrO', '.OrrO.', '.OWWO.'];
const CANNON_PAL = { O: '#2a0808', r: '#8a2018', f: '#e07040', Y: '#ffb060', W: '#ffe0a0' };
const SHARDP_MAP = ['..OW..', '.OWcO.', 'OWccWO', 'OcWWcO', 'OcWWcO', '.OccO.', '..OO..'];
const SHARDP_PAL = { O: '#3a2404', W: '#fffff0', c: '#ffd75e' };
const ARC_MAP = [
  '..Op.',
  '.OpAO',
  'OpAaO',
  'OpAaO',
  'OAaO.',
  'OAaO.',
  'OpAaO',
  'OpAaO',
  '.OpAO',
  '..Op.',
];
const ARC_PAL = { O: '#160a24', p: '#d8b0ff', A: '#9a6ae0', a: '#5a3aa0' };

function tinted(rows: string[], scale: number, color: string, alpha: number): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = canvas(w * scale, h * scale);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      if ((row[x] ?? '.') === '.') continue;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

/* ---------- 유틸: 글로우 탄환 ---------- */

function glowBullet(
  w: number,
  h: number,
  glowColor: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, Math.max(w, h) / 2);
  g.addColorStop(0, glowColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  draw(ctx);
  return c;
}

/* ---------- 메인 ---------- */

export function generateTextures(scene: Phaser.Scene): void {
  // 함선
  addCanvasTexture(scene, 'ship-player', pixmap(PLAYER_MAP, PLAYER_PAL, 2));
  addCanvasTexture(scene, 'ship-e1', pixmap(E1_MAP, E1_PAL, 2));
  addCanvasTexture(scene, 'ship-e2', pixmap(E2_MAP, E2_PAL, 2));
  addCanvasTexture(scene, 'ship-e3', pixmap(E3_MAP, E3_PAL, 2));
  addCanvasTexture(scene, 'ship-boss', pixmap(BOSS_MAP, BOSS_PAL, 3));
  // 환영 함선(Jungjioo 러시): 플레이어 실루엣 청백 틴트
  addCanvasTexture(scene, 'ship-ghost', tinted(PLAYER_MAP, 2, 'rgb(150,225,255)', 0.88));

  // L1~L3 신규 적 (신규 맵 + 팔레트 스왑 변형)
  addCanvasTexture(scene, 'ship-wisp', pixmap(WISP_MAP, WISP_PAL, 2));
  addCanvasTexture(scene, 'ship-spore', pixmap(SPORE_MAP, SPORE_PAL, 2));
  addCanvasTexture(
    scene,
    'ship-mite',
    pixmap(E1_MAP, { O: '#08282a', W: '#c8fff4', R: '#3ac8b8', r: '#1f8a80', d: '#0c4a48' }, 1),
  );
  addCanvasTexture(scene, 'ship-ember', pixmap(EMBER_MAP, EMBER_PAL, 2));
  addCanvasTexture(
    scene,
    'ship-shard',
    pixmap(E3_MAP, { O: '#2a0424', W: '#ffd8f4', Y: '#ff8ad8', o: '#c83a9a', d: '#701858' }, 2),
  );
  addCanvasTexture(scene, 'ship-orbiter', pixmap(ORBITER_MAP, ORBITER_PAL, 2));
  addCanvasTexture(
    scene,
    'ship-flare',
    pixmap(E3_MAP, { O: '#3a2404', W: '#ffffff', Y: '#ffefb0', o: '#ffc83a', d: '#e6862a' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-sentinel',
    pixmap(
      E2_MAP,
      {
        O: '#241404',
        W: '#ffe8c8',
        P: '#e0a03a',
        p: '#9a6a1a',
        d: '#684a10',
        C: '#ff4a3a',
        c: '#ffc0a0',
      },
      2,
    ),
  );
  addCanvasTexture(scene, 'ship-prominence', pixmap(PROM_MAP, PROM_PAL, 2));
  addCanvasTexture(scene, 'boss-amoeba', pixmap(AMOEBA_MAP, AMOEBA_PAL, 3));
  addCanvasTexture(scene, 'boss-protocore', pixmap(PROTOCORE_MAP, PROTOCORE_PAL, 3));
  addCanvasTexture(scene, 'boss-helios', pixmap(HELIOS_MAP, HELIOS_PAL, 3));

  // L4~L6 적 (팔레트 스왑 변형)
  addCanvasTexture(
    scene,
    'ship-cinder',
    pixmap(EMBER_MAP, { O: '#2a0404', Y: '#ff6a3a', f: '#c8301a', r: '#701008' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-furnace',
    pixmap(
      E2_MAP,
      {
        O: '#240804',
        W: '#ffc8a0',
        P: '#c84a2a',
        p: '#8a2018',
        d: '#4a0f08',
        C: '#ffd75e',
        c: '#fff0c0',
      },
      2,
    ),
  );
  addCanvasTexture(
    scene,
    'ship-flarewing',
    pixmap(PROM_MAP, { O: '#2a0808', Y: '#ff9a5a', f: '#e05028', r: '#8a1810' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-fragment',
    pixmap(SPORE_MAP, { O: '#241804', P: '#e0a03a', p: '#9a6a1a', G: '#fff0b0', g: '#ffd75e' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-bit',
    pixmap(E1_MAP, { O: '#241804', W: '#fff0c0', R: '#ffc83a', r: '#c8901a', d: '#705008' }, 1),
  );
  addCanvasTexture(
    scene,
    'ship-lancer',
    pixmap(EMBER_MAP, { O: '#04182a', Y: '#7ef7ff', f: '#3aa8e0', r: '#1a5a9a' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-shade',
    pixmap(WISP_MAP, { O: '#0a0614', T: '#4a3a7a', g: '#7a5ac8', G: '#c8b0ff' }, 2),
  );
  addCanvasTexture(
    scene,
    'ship-gazer',
    pixmap(
      ORBITER_MAP,
      { O: '#0a0614', m: '#3a2a6a', M: '#5a4a9a', w: '#b0a0e0', C: '#ff3a6a', d: '#700a20' },
      2,
    ),
  );
  addCanvasTexture(
    scene,
    'ship-wraith',
    pixmap(E3_MAP, { O: '#0a0614', W: '#d8c8ff', Y: '#8a6ae0', o: '#5a3aa0', d: '#2a1850' }, 2),
  );

  // 보스 3종 (@4 거대) + 파츠
  addCanvasTexture(scene, 'boss-crimson', pixmap(CRIMSON_MAP, CRIMSON_PAL, 4));
  addCanvasTexture(scene, 'boss-nova', pixmap(NOVA_MAP, NOVA_PAL, 4));
  addCanvasTexture(scene, 'boss-singularity', pixmap(SING_MAP, SING_PAL, 4));
  addCanvasTexture(scene, 'part-pod', pixmap(POD_MAP, POD_PAL, 3));
  addCanvasTexture(scene, 'part-vane', pixmap(VANE_MAP, VANE_PAL, 3));
  addCanvasTexture(scene, 'part-corona', pixmap(CORONA_MAP, CORONA_PAL, 3));
  addCanvasTexture(scene, 'part-flarecannon', pixmap(CANNON_MAP, CANNON_PAL, 3));
  addCanvasTexture(scene, 'part-shard', pixmap(SHARDP_MAP, SHARDP_PAL, 3));
  addCanvasTexture(scene, 'part-arc', pixmap(ARC_MAP, ARC_PAL, 3));

  // 플레이어 탄 (글로우 베이크)
  addCanvasTexture(
    scene,
    'b-pulse',
    glowBullet(11, 22, 'rgba(90,190,255,0.55)', (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 22);
      g.addColorStop(0, 'rgba(200,245,255,0.1)');
      g.addColorStop(0.4, '#e8fbff');
      g.addColorStop(1, '#4db8ff');
      ctx.fillStyle = g;
      ctx.fillRect(4, 1, 3, 20);
    }),
  );
  addCanvasTexture(
    scene,
    'b-vulcan',
    glowBullet(7, 14, 'rgba(255,210,110,0.5)', (ctx) => {
      ctx.fillStyle = '#ffe28a';
      ctx.fillRect(2, 1, 3, 12);
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(2, 1, 3, 4);
    }),
  );
  addCanvasTexture(
    scene,
    'b-proton',
    glowBullet(15, 15, 'rgba(90,230,90,0.5)', (ctx) => {
      const g = ctx.createRadialGradient(6, 6, 0.5, 7.5, 7.5, 5.4);
      g.addColorStop(0, '#f0fff0');
      g.addColorStop(0.5, '#59e659');
      g.addColorStop(1, '#0a7f2a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(7.5, 7.5, 5.2, 0, 7);
      ctx.fill();
    }),
  );
  addCanvasTexture(
    scene,
    'b-light',
    glowBullet(14, 24, 'rgba(140,240,255,0.4)', (ctx) => {
      ctx.strokeStyle = '#aef4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 23);
      ctx.lineTo(5, 15);
      ctx.lineTo(9, 9);
      ctx.lineTo(4, 1);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 11, 2, 2);
    }),
  );
  addCanvasTexture(
    scene,
    'b-laser',
    glowBullet(13, 31, 'rgba(255,90,90,0.55)', (ctx) => {
      ctx.fillStyle = 'rgba(255,90,90,0.45)';
      ctx.fillRect(3, 0, 7, 31);
      const g = ctx.createLinearGradient(0, 0, 0, 31);
      g.addColorStop(0, 'rgba(255,150,150,0.2)');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, 'rgba(255,80,80,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(5, 0, 3, 31);
    }),
  );

  // 적탄 (글로우 베이크, NORMAL 블렌드로 가독성 유지)
  for (const [key, size, core, glow] of [
    ['eb-small', 12, '#ff5a5a', 'rgba(255,80,80,0.5)'],
    ['eb-big', 16, '#ffb347', 'rgba(255,170,70,0.55)'],
  ] as const) {
    addCanvasTexture(
      scene,
      key,
      glowBullet(size, size, glow, (ctx) => {
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.28, 0, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(size / 2 - 1, size / 2 - 1, 2, 2);
      }),
    );
  }

  // 오브 P/S — 함선과 같은 픽셀 밀도의 플랫 셰이딩 (2px 그리드)
  for (const [key, pal, letter, dark] of [
    ['orb-P', { O: '#04300f', A: '#2fae4a', B: '#59e659', H: '#d8ffd8' }, 'P', '#043012'],
    ['orb-S', { O: '#062248', A: '#2a72c8', B: '#54b4ff', H: '#d8eeff' }, 'S', '#062248'],
  ] as const) {
    const rows = [
      '..OOOO..',
      '.OBBBBO.',
      'OBHHBBBO',
      'OBHBBBAO',
      'OBBBBAAO',
      'OBBBAAAO',
      '.OBAAAO.',
      '..OOOO..',
    ];
    const c = pixmap(rows, pal as Record<string, string>, 2);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = dark;
      ctx.font = "bold 9px 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(letter, 8, 11.5);
    }
    addCanvasTexture(scene, key, c);
  }
  {
    const [c, ctx] = canvas(48, 48);
    const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(200,255,220,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    addCanvasTexture(scene, 'orb-glow', c);
  }

  // 폭발: 파이어볼 + 확장 링 + 스파크
  {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,230,0.95)');
    g.addColorStop(0.3, 'rgba(255,190,60,0.85)');
    g.addColorStop(0.7, 'rgba(255,70,15,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvasTexture(scene, 'boom', c);
  }
  {
    const [c, ctx] = canvas(64, 64);
    ctx.strokeStyle = 'rgba(255,220,160,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,140,60,0.4)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, 7);
    ctx.stroke();
    addCanvasTexture(scene, 'boom-ring', c);
  }
  {
    const [c, ctx] = canvas(3, 3);
    ctx.fillStyle = '#ffc860';
    ctx.fillRect(0, 0, 3, 3);
    addCanvasTexture(scene, 'spark', c);
  }
  {
    const [c, ctx] = canvas(2, 2);
    ctx.fillStyle = '#8fd3ff';
    ctx.fillRect(0, 0, 2, 2);
    addCanvasTexture(scene, 'spark-cyan', c);
  }
  {
    const [c, ctx] = canvas(18, 18); // 총구 화염
    const g = ctx.createRadialGradient(9, 9, 0, 9, 9, 9);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(160,225,255,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 18, 18);
    addCanvasTexture(scene, 'muzzle', c);
  }

  // 블랙홀
  {
    const [c, ctx] = canvas(96, 96);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(48, 48, 24, 0, 7);
    ctx.fill();
    addCanvasTexture(scene, 'hole-core', c);
  }
  {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 24, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(120,80,255,0.30)');
    g.addColorStop(0.8, 'rgba(90,180,255,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    addCanvasTexture(scene, 'hole-glow', c);
  }
  for (let k = 0; k < 3; k++) {
    const [c, ctx] = canvas(96, 96);
    ctx.strokeStyle = `rgba(160,120,255,${0.5 - k * 0.13})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(48, 48, 24 * (1.05 + k * 0.22) + 8, 0, 2.2);
    ctx.stroke();
    addCanvasTexture(scene, `hole-arc${k}`, c);
  }

  // 환영 함선 트레일
  {
    const [c, ctx] = canvas(5, 30);
    const g = ctx.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, 'rgba(140,220,255,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 5, 30);
    addCanvasTexture(scene, 'ghost-trail', c);
  }

  // 플레이어 엔진 화염 / 슈퍼 오라
  {
    const [c, ctx] = canvas(8, 16);
    const g = ctx.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(140,200,255,0.9)');
    g.addColorStop(1, 'rgba(40,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.lineTo(7, 0);
    ctx.lineTo(4, 16);
    ctx.closePath();
    ctx.fill();
    addCanvasTexture(scene, 'engine-flame', c);
  }
  {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(160,220,255,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvasTexture(scene, 'super-aura', c);
  }
  {
    const [c, ctx] = canvas(96, 96); // 보스 코어 글로우
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 48);
    g.addColorStop(0, 'rgba(255,120,60,0.55)');
    g.addColorStop(0.6, 'rgba(200,60,120,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    addCanvasTexture(scene, 'boss-glow', c);
  }

  // 슈퍼 버튼 — 밝은 링 + 외곽 글로우 (탄막 가림 방지를 위해 런타임에서 반투명)
  {
    const [c, ctx] = canvas(60, 60);
    const glow = ctx.createRadialGradient(30, 30, 20, 30, 30, 30);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(0.7, 'rgba(160,120,255,0.4)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 60, 60);
    const g = ctx.createRadialGradient(25, 23, 3, 30, 30, 25);
    g.addColorStop(0, '#6a48c0');
    g.addColorStop(1, '#1a1236');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(30, 30, 23, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#b8a4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(30, 30, 23, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(126,247,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(30, 30, 19.5, 0, 7);
    ctx.stroke();
    addCanvasTexture(scene, 'super-btn', c);
  }

  // 일시정지 버튼 (원형 테두리 + ‖)
  {
    const [c, ctx] = canvas(28, 28);
    ctx.strokeStyle = 'rgba(180,200,240,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(14, 14, 12, 0, 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,28,52,0.5)';
    ctx.beginPath();
    ctx.arc(14, 14, 11, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#c8d4f0';
    ctx.fillRect(9, 8, 3, 12);
    ctx.fillRect(16, 8, 3, 12);
    addCanvasTexture(scene, 'pause-btn', c);
  }

  // 비네트 (화면 가장자리 어둡게)
  {
    const [c, ctx] = canvas(GAME_WIDTH, GAME_HEIGHT);
    const g = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_HEIGHT * 0.32,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_HEIGHT * 0.62,
    );
    g.addColorStop(0, 'rgba(0,0,16,0)');
    g.addColorStop(1, 'rgba(0,0,16,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    addCanvasTexture(scene, 'vignette', c);
  }

  /* ---------- 배경 레이어 (세로 무한 타일 — y±H 복제로 이음매 제거) ---------- */
  const TILE_H = 720;

  {
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H); // 성운
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * TILE_H;
      const r = 80 + Math.random() * 120;
      const hue = [
        'rgba(106,68,200,A)',
        'rgba(40,90,200,A)',
        'rgba(40,150,176,A)',
        'rgba(150,60,160,A)',
      ][i % 4] as string;
      const a = 0.09 + Math.random() * 0.08;
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
        g.addColorStop(0, hue.replace('A', String(a)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, yy - r, r * 2, r * 2);
      }
    }
    addCanvasTexture(scene, 'bg-nebula', c);
  }
  {
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H); // 원경 별
    for (let i = 0; i < 230; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * TILE_H;
      const a = 0.15 + Math.random() * 0.3;
      ctx.fillStyle = `rgba(207,224,255,${a})`;
      for (const yy of [y - TILE_H, y, y + TILE_H]) ctx.fillRect(x, yy, 1, 1);
    }
    addCanvasTexture(scene, 'bg-stars-far', c);
  }
  {
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H); // 근경 별 (일부 십자 광채)
    // 탄환과의 혼동 방지: 어떤 투사체보다 어둡게(alpha ≤0.72), 2px 고정
    for (let i = 0; i < 55; i++) {
      const x = Math.floor(Math.random() * GAME_WIDTH);
      const y = Math.floor(Math.random() * TILE_H);
      const a = 0.42 + Math.random() * 0.3;
      const glint = Math.random() < 0.25;
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        ctx.fillStyle = `rgba(238,246,255,${a})`;
        ctx.fillRect(x, yy, 2, 2);
        if (glint) {
          ctx.fillStyle = `rgba(238,246,255,${a * 0.45})`;
          ctx.fillRect(x - 2, yy, 2, 2);
          ctx.fillRect(x + 2, yy, 2, 2);
          ctx.fillRect(x, yy - 2, 2, 2);
          ctx.fillRect(x, yy + 2, 2, 2);
        }
      }
    }
    addCanvasTexture(scene, 'bg-stars-near', c);
  }
  {
    // 소행성대 지형 레이어 (티리안식 "지형 위 비행") — levels.json theme: 'asteroids'
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H);
    const snap = (v: number) => Math.round(v / 2) * 2;
    const drawAsteroid = (cx: number, cy: number, r: number) => {
      const verts: [number, number][] = [];
      const n = 9 + Math.floor(Math.random() * 4);
      const seed = Math.random() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = seed + (i / n) * Math.PI * 2;
        const rr = r * (0.72 + Math.random() * 0.42);
        verts.push([snap(cx + Math.cos(a) * rr), snap(cy + Math.sin(a) * rr)]);
      }
      const poly = (offX: number, offY: number, shrink: number) => {
        ctx.beginPath();
        verts.forEach(([vx, vy], i) => {
          const px = cx + (vx - cx) * shrink + offX;
          const py = cy + (vy - cy) * shrink + offY;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      };
      for (const yy of [-TILE_H, 0, TILE_H]) {
        ctx.save();
        ctx.translate(0, yy);
        ctx.fillStyle = '#2e2622';
        poly(2, 3, 1);
        ctx.fill();
        ctx.fillStyle = '#584a40';
        poly(0, 0, 1);
        ctx.fill();
        ctx.fillStyle = '#7a685a';
        poly(-r * 0.12, -r * 0.14, 0.72);
        ctx.fill();
        ctx.fillStyle = '#948270';
        poly(-r * 0.2, -r * 0.24, 0.4);
        ctx.fill();
        // 크레이터
        const craters = 1 + Math.floor(r / 14);
        for (let k = 0; k < craters; k++) {
          const ca = Math.random() * 6.28;
          const cd = r * 0.45 * Math.random();
          ctx.fillStyle = 'rgba(30,24,20,0.55)';
          ctx.beginPath();
          ctx.arc(
            snap(cx + Math.cos(ca) * cd),
            snap(cy + Math.sin(ca) * cd),
            Math.max(2, r * 0.16),
            0,
            7,
          );
          ctx.fill();
        }
        ctx.restore();
      }
    };
    for (let i = 0; i < 5; i++)
      drawAsteroid(Math.random() * GAME_WIDTH, Math.random() * TILE_H, 22 + Math.random() * 26);
    for (let i = 0; i < 12; i++)
      drawAsteroid(Math.random() * GAME_WIDTH, Math.random() * TILE_H, 5 + Math.random() * 12);
    addCanvasTexture(scene, 'bg-asteroids', c);
  }
  {
    // 웜 성운 (원시별/주계열성 테마)
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H);
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * TILE_H;
      const r = 80 + Math.random() * 120;
      const hue = [
        'rgba(200,90,30,A)',
        'rgba(180,50,60,A)',
        'rgba(220,140,40,A)',
        'rgba(150,40,90,A)',
      ][i % 4] as string;
      const a = 0.08 + Math.random() * 0.08;
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
        g.addColorStop(0, hue.replace('A', String(a)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, yy - r, r * 2, r * 2);
      }
    }
    addCanvasTexture(scene, 'bg-nebula-warm', c);
  }
  {
    // 잔파편 (원시별 강착 원반 조각들) — 전속 스크롤 레이어
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(Math.random() * GAME_WIDTH);
      const y = Math.floor(Math.random() * TILE_H);
      const w = 3 + Math.floor(Math.random() * 6);
      const h = 2 + Math.floor(Math.random() * 4);
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        ctx.fillStyle = '#241410';
        ctx.fillRect(x + 1, yy + 1, w, h);
        ctx.fillStyle = '#584034';
        ctx.fillRect(x, yy, w, h);
        ctx.fillStyle = '#8a6a50';
        ctx.fillRect(x, yy, Math.max(1, w - 2), Math.max(1, h - 2));
      }
    }
    addCanvasTexture(scene, 'bg-debris', c);
  }
  {
    // 코로나 광선 (주계열성 테마) — 세로 광선 + 광점
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H);
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * GAME_WIDTH;
      const w = 10 + Math.random() * 26;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(255,200,90,0)');
      g.addColorStop(0.5, `rgba(255,214,94,${0.04 + Math.random() * 0.05})`);
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, w, TILE_H);
    }
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * TILE_H;
      const r = 20 + Math.random() * 50;
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
        g.addColorStop(0, `rgba(255,230,150,${0.05 + Math.random() * 0.06})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, yy - r, r * 2, r * 2);
      }
    }
    addCanvasTexture(scene, 'bg-sunstreaks', c);
  }
  {
    // 적색 성운 (적색거성 테마)
    const [c, ctx] = canvas(GAME_WIDTH, TILE_H);
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * TILE_H;
      const r = 90 + Math.random() * 130;
      const a = 0.1 + Math.random() * 0.09;
      const hue = ['rgba(200,40,20,A)', 'rgba(160,20,40,A)', 'rgba(220,80,20,A)'][i % 3] as string;
      for (const yy of [y - TILE_H, y, y + TILE_H]) {
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
        g.addColorStop(0, hue.replace('A', String(a)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, yy - r, r * 2, r * 2);
      }
    }
    addCanvasTexture(scene, 'bg-nebula-red', c);
  }
  {
    // 거대 태양 (주계열성 상단 장식 — 피드백 5)
    const [c, ctx] = canvas(280, 280);
    let g = ctx.createRadialGradient(140, 140, 10, 140, 140, 140);
    g.addColorStop(0, 'rgba(255,250,220,0.95)');
    g.addColorStop(0.35, 'rgba(255,214,94,0.75)');
    g.addColorStop(0.7, 'rgba(255,150,50,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 280, 280);
    g = ctx.createRadialGradient(140, 140, 60, 140, 140, 100);
    g.addColorStop(0, 'rgba(255,240,190,0.9)');
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(140, 140, 100, 0, 7);
    ctx.fill();
    addCanvasTexture(scene, 'decor-sun', c);
  }
  {
    // 적색거성 가장자리 (화면 하단을 채우는 거대한 붉은 반구)
    const [c, ctx] = canvas(GAME_WIDTH, 200);
    const g = ctx.createRadialGradient(180, 320, 80, 180, 320, 330);
    g.addColorStop(0, 'rgba(255,120,60,0.85)');
    g.addColorStop(0.55, 'rgba(200,50,25,0.55)');
    g.addColorStop(0.85, 'rgba(120,20,15,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, 200);
    addCanvasTexture(scene, 'decor-redlimb', c);
  }
  {
    // 초신성 충격파 링
    const [c, ctx] = canvas(300, 300);
    for (const [r, w, a] of [
      [130, 22, 0.22],
      [95, 12, 0.16],
      [60, 8, 0.12],
    ] as const) {
      const g = ctx.createRadialGradient(150, 150, r - w, 150, 150, r + w);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(255,230,160,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 300, 300);
    }
    addCanvasTexture(scene, 'decor-shock', c);
  }
  {
    // 블랙홀 강착 소용돌이 (회전 장식)
    const [c, ctx] = canvas(300, 300);
    ctx.translate(150, 150);
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 60; i++) {
        const p = i / 60;
        const ang = arm * Math.PI + p * 4.2;
        const r = 30 + p * 110;
        const a = 0.28 * (1 - p);
        ctx.fillStyle = `rgba(${150 + p * 90},${100 + p * 60},255,${a})`;
        const sz = 3 + (1 - p) * 5;
        ctx.fillRect(Math.cos(ang) * r - sz / 2, Math.sin(ang) * r - sz / 2, sz, sz);
      }
    }
    addCanvasTexture(scene, 'decor-swirl', c);
  }
}
