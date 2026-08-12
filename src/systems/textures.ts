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
  // Preloaded production art always wins over procedural fallbacks with the same key.
  if (
    scene.textures.exists(key) &&
    scene.textures.get(key).getSourceImage() instanceof HTMLImageElement
  )
    return;
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

// 최종 보스 — 살인달팽이 (나선 껍데기 = 블랙홀 나선 호응)
const SNAIL_MAP = [
  '..........OOOOOOOO........',
  '........OOssssssssOO......',
  '......OOssppppppppssOO....',
  '.....OsspPPPPPPPPPpssO....',
  '....OsspPttttttttPPpssO...',
  '...OsspPttSSSSSSttPpssO...',
  '...OspPttSSppppSSttPpsO...',
  '..OspPttSSppttppSSttPpsO..',
  '..OspPttSSpttttppSStPpsO..',
  '..OspPttSSppttppSSttPpsO..',
  '...OspPttSSppppSSttPpsO...',
  '...OsspPttSSSSSSttPpssO...',
  'OOOOsspPttttttttPPpssO....',
  'OggggOsspPPPPPPPPpssO.....',
  'OgGGggOOssssssssssOO......',
  'OgGGGggggggggggOOO........',
  'OggGGGGGGGGGggggO.........',
  '.OggggggggggggggO.........',
  '..OOgggOOOOgggOO..........',
  '....OOO....OOO............',
];
const SNAIL_PAL = {
  O: '#12081e',
  s: '#5a3aa0',
  p: '#8a5ad4',
  P: '#b48aff',
  t: '#3aa88a',
  S: '#7ee8c8',
  g: '#8ad84a',
  G: '#c8ff8a',
};

// 달팽이 눈자루 (파괴 가능 파츠)
const EYESTALK_MAP = [
  '..OWWO..',
  '.OWiiWO.',
  '.OWiIWO.',
  '.OWiiWO.',
  '..OWWO..',
  '...OgO..',
  '...OgO..',
  '..OgO...',
  '..OgO...',
  '.OgO....',
  '.OgO....',
];
const EYESTALK_PAL = { O: '#12081e', W: '#f0fff0', i: '#3a8a5a', I: '#0a2a14', g: '#8ad84a' };

// 요상한 프롭: 거대 눈알 / 소용돌이 껍데기
const EYE_MAP = [
  '...OOOOOO...',
  '..OWWWWWWO..',
  '.OWWWiiWWWO.',
  'OWWWiiiiWWWO',
  'OWWiiIIiiWWO',
  'OWWiiIIiiWWO',
  'OWWWiiiiWWWO',
  '.OWWWiiWWWO.',
  '..OWWWWWWO..',
  '...OOOOOO...',
];
const EYE_PAL = { O: '#1c0a2a', W: '#e8e0f4', i: '#b03aa0', I: '#12040f' };

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

/** 픽셀아트 입체감 필터: 상단 림 라이트 + 하단 셀프 섀도 + 수직 그라디언트 */
function enhance(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const w = c.width;
  const h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (d[idx(x, y) + 3] ?? 0);
  const out = ctx.createImageData(w, h);
  out.data.set(d);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if ((d[i + 3] ?? 0) === 0) continue;
      let f = 1 + 0.16 * (0.5 - y / h);
      if (alphaAt(x, y - 2) === 0) f *= 1.4;
      else if (alphaAt(x, y + 2) === 0) f *= 0.7;
      o[i] = Math.min(255, (d[i] ?? 0) * f);
      o[i + 1] = Math.min(255, (d[i + 1] ?? 0) * f);
      o[i + 2] = Math.min(255, (d[i + 2] ?? 0) * f);
    }
  }
  ctx.putImageData(out, 0, 0);
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

/** Kenney 회색 헐 → 테마 색상화 + 하향 반전 + 입체 필터 (기계형 적기) */
function kenneyShip(scene: Phaser.Scene, outKey: string, srcKey: string, color: string): boolean {
  if (!scene.textures.exists(srcKey)) return false;
  const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
  const [c, ctx] = canvas(32, 32);
  ctx.save();
  ctx.translate(0, 32);
  ctx.scale(1, -1); // 적기는 아래를 향한다
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  // 회색 헐에 테마 색 입히기 (음영 유지)
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 32);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(0, 32);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  // 우주 톤으로 약간 어둡게
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(160,160,190,1)';
  ctx.fillRect(0, 0, 32, 32);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(0, 32);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  addCanvasTexture(scene, outKey, enhance(c));
  return true;
}

/** ansimuz 시트 → 팔레트 변형 시트 ('color' 블렌드 = 음영 유지 색상 스왑, 프레임 격자 유지) */
export function azSheetVariant(
  scene: Phaser.Scene,
  outKey: string,
  srcKey: string,
  color: string,
  frameW: number,
  frameH: number,
): boolean {
  if (!scene.textures.exists(srcKey)) return false;
  const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (scene.textures.exists(outKey)) scene.textures.remove(outKey);
  const tex = scene.textures.addCanvas(outKey, c);
  if (!tex) return false;
  const cols = Math.floor(src.width / frameW);
  const rows = Math.floor(src.height / frameH);
  for (let i = 0; i < cols * rows; i++) {
    tex.add(i, 0, (i % cols) * frameW, Math.floor(i / cols) * frameH, frameW, frameH);
  }
  return true;
}

/* ---------- 어린지우 필살기: 앵무새 + 초록 산 ---------- */
// 아래로 급강하하는 앵무새 (날개 활짝) — 팔레트 스왑으로 색 변형
function parrotTexture(
  scene: Phaser.Scene,
  key: string,
  plumage: string,
  shadow: string,
  face: string,
): void {
  const [c, ctx] = canvas(44, 40);
  const wing = ctx.createLinearGradient(0, 4, 0, 31);
  wing.addColorStop(0, '#f4ffff');
  wing.addColorStop(0.24, plumage);
  wing.addColorStop(1, shadow);

  ctx.save();
  ctx.shadowColor = plumage;
  ctx.shadowBlur = 7;
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(21, 14);
  ctx.bezierCurveTo(15, 6, 6, 2, 1, 6);
  ctx.bezierCurveTo(5, 17, 12, 23, 21, 26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(23, 14);
  ctx.bezierCurveTo(29, 6, 38, 2, 43, 6);
  ctx.bezierCurveTo(39, 17, 32, 23, 23, 26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const body = ctx.createLinearGradient(16, 10, 29, 34);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.18, face);
  body.addColorStop(0.48, plumage);
  body.addColorStop(1, shadow);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(22, 22, 9, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = plumage;
  ctx.beginPath();
  ctx.moveTo(18, 31);
  ctx.lineTo(20, 40);
  ctx.lineTo(23, 32);
  ctx.lineTo(27, 39);
  ctx.lineTo(26, 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(22, 13, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#13263a';
  ctx.beginPath();
  ctx.arc(24.1, 12.2, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffbd35';
  ctx.beginPath();
  ctx.moveTo(27.2, 14);
  ctx.lineTo(35, 16.5);
  ctx.lineTo(27, 18.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 8);
  ctx.quadraticCurveTo(13, 15, 19, 17);
  ctx.moveTo(38, 8);
  ctx.quadraticCurveTo(31, 15, 25, 17);
  ctx.stroke();
  addCanvasTexture(scene, key, c);
}

/** 초록 산 배경 — 필살기 중 정지 화면(사용자 지시: 스크롤 없음), 화면 크기 640px 한 장 */
function jwMountains(): HTMLCanvasElement {
  const W = 360;
  const H = 640;
  const [c, ctx] = canvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#79cfea');
  sky.addColorStop(0.35, '#bfe9d2');
  sky.addColorStop(0.68, '#659f7b');
  sky.addColorStop(1, '#102a26');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const sun = ctx.createRadialGradient(282, 118, 4, 282, 118, 122);
  sun.addColorStop(0, 'rgba(255,252,213,0.98)');
  sun.addColorStop(0.12, 'rgba(223,255,232,0.5)');
  sun.addColorStop(1, 'rgba(180,245,225,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(150, 0, 210, 260);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 6; i++) {
    const x = 190 + i * 34;
    const ray = ctx.createLinearGradient(x, 60, x - 120, 520);
    ray.addColorStop(0, 'rgba(226,255,241,0.17)');
    ray.addColorStop(1, 'rgba(226,255,241,0)');
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x + 18, 50);
    ctx.lineTo(x - 66, H);
    ctx.lineTo(x - 124, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const ridge = (baseY: number, amp: number, color: string, phase: number): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= W; x += 4) {
      const broad = Math.sin((x + phase) * 0.022) * amp;
      const detail = Math.sin((x + phase * 0.7) * 0.061) * amp * 0.24;
      const crown = Math.abs(Math.sin((x + phase) * 0.012)) * amp * 0.32;
      ctx.lineTo(x, baseY - broad - detail - crown);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };

  ridge(280, 42, '#79b99a', 12);
  ridge(372, 64, '#3e8065', 96);

  const mist = ctx.createLinearGradient(0, 330, 0, 470);
  mist.addColorStop(0, 'rgba(221,255,241,0)');
  mist.addColorStop(0.45, 'rgba(221,255,241,0.28)');
  mist.addColorStop(1, 'rgba(221,255,241,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, 300, W, 190);

  ridge(485, 90, '#1f5949', 184);
  ridge(575, 74, '#113b35', 35);

  for (let i = 0; i < 34; i++) {
    const x = (i * 73 + 19) % W;
    const y = 500 + ((i * 47) % 126);
    const h = 13 + ((i * 11) % 22);
    ctx.fillStyle = i % 3 === 0 ? '#0d302c' : '#123c34';
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - h * 0.32, y);
    ctx.lineTo(x + h * 0.32, y);
    ctx.closePath();
    ctx.fill();
  }

  const foregroundMist = ctx.createLinearGradient(0, H - 130, 0, H);
  foregroundMist.addColorStop(0, 'rgba(128,218,189,0)');
  foregroundMist.addColorStop(1, 'rgba(18,61,52,0.68)');
  ctx.fillStyle = foregroundMist;
  ctx.fillRect(0, H - 130, W, 130);
  return c;
}

/** Smooth high-resolution two-frame enemy craft, replacing the legacy 16 px sheets. */
function modernEnemySheet(
  scene: Phaser.Scene,
  key: string,
  frameW: number,
  frameH: number,
  mass: 'light' | 'medium' | 'heavy',
): void {
  const [c, ctx] = canvas(frameW * 2, frameH);
  for (let frame = 0; frame < 2; frame++) {
    const ox = frame * frameW;
    const cx = ox + frameW / 2;
    const pulse = frame === 0 ? 0 : frameH * 0.035;
    const bodyW = frameW * (mass === 'light' ? 0.18 : mass === 'medium' ? 0.16 : 0.22);
    const top = frameH * 0.12;
    const nose = frameH * 0.9;
    ctx.save();
    ctx.shadowColor = '#65e8ff';
    ctx.shadowBlur = frameW * 0.08;

    const wing = ctx.createLinearGradient(cx, top, cx, nose);
    wing.addColorStop(0, '#d9f7ff');
    wing.addColorStop(0.38, '#5d8dac');
    wing.addColorStop(1, '#18253b');
    ctx.fillStyle = wing;
    const wingSpan = frameW * (mass === 'light' ? 0.43 : mass === 'medium' ? 0.45 : 0.47);
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.55, top + frameH * 0.2);
    ctx.lineTo(cx - wingSpan, frameH * (0.46 + pulse / frameH));
    ctx.lineTo(cx - frameW * 0.31, frameH * 0.72);
    ctx.lineTo(cx - bodyW * 0.5, frameH * 0.63);
    ctx.lineTo(cx + bodyW * 0.5, frameH * 0.63);
    ctx.lineTo(cx + frameW * 0.31, frameH * 0.72);
    ctx.lineTo(cx + wingSpan, frameH * (0.46 + pulse / frameH));
    ctx.lineTo(cx + bodyW * 0.55, top + frameH * 0.2);
    ctx.closePath();
    ctx.fill();

    const body = ctx.createLinearGradient(cx - bodyW, 0, cx + bodyW, 0);
    body.addColorStop(0, '#15233b');
    body.addColorStop(0.42, '#84cde8');
    body.addColorStop(0.55, '#efffff');
    body.addColorStop(1, '#223553');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx, nose);
    ctx.lineTo(cx - bodyW, frameH * 0.48);
    ctx.lineTo(cx - bodyW * 0.5, top);
    ctx.lineTo(cx + bodyW * 0.5, top);
    ctx.lineTo(cx + bodyW, frameH * 0.48);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = frame === 0 ? '#7ef7ff' : '#f4fdff';
    ctx.beginPath();
    ctx.ellipse(cx, frameH * 0.46, bodyW * 0.35, frameH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(215,250,255,0.9)';
    ctx.lineWidth = Math.max(1, frameW / 64);
    ctx.beginPath();
    ctx.moveTo(cx - wingSpan * 0.82, frameH * 0.5);
    ctx.lineTo(cx - bodyW * 0.8, frameH * 0.43);
    ctx.moveTo(cx + wingSpan * 0.82, frameH * 0.5);
    ctx.lineTo(cx + bodyW * 0.8, frameH * 0.43);
    ctx.stroke();

    if (mass !== 'light') {
      ctx.fillStyle = '#ffb45d';
      const pod = frameW * 0.05;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + side * frameW * 0.31, frameH * 0.57, pod, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (mass === 'heavy') {
      ctx.strokeStyle = '#7eeeff';
      ctx.lineWidth = frameW * 0.025;
      ctx.beginPath();
      ctx.arc(cx, frameH * 0.5, frameW * 0.3, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.addCanvas(key, c);
  if (!texture) return;
  texture.add(0, 0, 0, 0, frameW, frameH);
  texture.add(1, 0, frameW, 0, frameW, frameH);
}

function smoothTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): void {
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  addCanvasTexture(scene, key, c);
}

function capitalPartTextures(scene: Phaser.Scene): void {
  const metal = '#263448';
  const edge = '#b7d5e5';
  const shadow = '#07101c';
  const glow = '#6eeaff';

  smoothTexture(scene, 'part-shield-array', 84, 48, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const g = ctx.createLinearGradient(-34, 0, 34, 0);
    g.addColorStop(0, shadow);
    g.addColorStop(0.45, metal);
    g.addColorStop(0.55, '#536b80');
    g.addColorStop(1, shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-27, -18);
    ctx.lineTo(27, -18);
    ctx.lineTo(40, 0);
    ctx.lineTo(27, 18);
    ctx.lineTo(-27, 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 12;
    ctx.shadowColor = glow;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-25, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
  });

  smoothTexture(scene, 'part-armor-plate', 76, 54, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const g = ctx.createLinearGradient(0, -25, 0, 25);
    g.addColorStop(0, '#8da1af');
    g.addColorStop(0.18, '#405268');
    g.addColorStop(1, shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-34, -18);
    ctx.lineTo(-21, -26);
    ctx.lineTo(25, -23);
    ctx.lineTo(36, -7);
    ctx.lineTo(29, 23);
    ctx.lineTo(-27, 23);
    ctx.lineTo(-37, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d4e1e8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#0d1824';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.lineTo(18, -8);
    ctx.lineTo(25, 8);
    ctx.lineTo(-13, 8);
    ctx.closePath();
    ctx.stroke();
  });

  smoothTexture(scene, 'part-capital-turret', 70, 70, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const g = ctx.createRadialGradient(-7, -9, 2, 0, 0, 30);
    g.addColorStop(0, '#8fa7b8');
    g.addColorStop(0.45, metal);
    g.addColorStop(1, shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 5, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#172434';
    ctx.fillRect(-19, -7, 38, 25);
    ctx.fillStyle = '#667c8c';
    ctx.fillRect(-17, -34, 11, 38);
    ctx.fillRect(6, -34, 11, 38);
    ctx.fillStyle = glow;
    ctx.shadowBlur = 8;
    ctx.shadowColor = glow;
    ctx.fillRect(-13, -29, 3, 22);
    ctx.fillRect(10, -29, 3, 22);
  });

  smoothTexture(scene, 'part-ion-engine', 68, 82, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    const g = ctx.createLinearGradient(0, -34, 0, 34);
    g.addColorStop(0, '#7a91a4');
    g.addColorStop(0.35, metal);
    g.addColorStop(1, shadow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-27, -32);
    ctx.lineTo(27, -32);
    ctx.lineTo(31, 22);
    ctx.lineTo(19, 36);
    ctx.lineTo(-19, 36);
    ctx.lineTo(-31, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    const flame = ctx.createRadialGradient(0, 21, 2, 0, 21, 22);
    flame.addColorStop(0, '#ffffff');
    flame.addColorStop(0.25, glow);
    flame.addColorStop(1, '#1c6cff00');
    ctx.fillStyle = flame;
    ctx.shadowBlur = 15;
    ctx.shadowColor = glow;
    ctx.fillRect(-23, 0, 46, 45);
  });

  smoothTexture(scene, 'part-reactor-core', 82, 82, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    for (let r = 37; r >= 8; r -= 9) {
      ctx.strokeStyle = r % 2 ? edge : '#52687b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 23);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, glow);
    g.addColorStop(1, '#164bff00');
    ctx.fillStyle = g;
    ctx.shadowBlur = 20;
    ctx.shadowColor = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
  });

  smoothTexture(scene, 'part-hull-frame', 82, 42, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = shadow;
    ctx.fillRect(-40, -18, 80, 36);
    ctx.strokeStyle = '#50677a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-35, 13);
    ctx.lineTo(-22, -12);
    ctx.lineTo(22, -12);
    ctx.lineTo(35, 13);
    ctx.stroke();
    ctx.strokeStyle = '#9eb3c2';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

type ModernIconFrame = 'token' | 'panel' | 'none';

function roundedPanelPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexPanelPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function modernNeonIcon(
  scene: Phaser.Scene,
  key: string,
  size: number,
  primary: string,
  accent: string,
  frame: ModernIconFrame,
  drawGlyph: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void,
): void {
  smoothTexture(scene, key, size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.49);
    aura.addColorStop(0, `${primary}52`);
    aura.addColorStop(0.58, `${primary}1c`);
    aura.addColorStop(1, `${primary}00`);
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    if (frame !== 'none') {
      ctx.save();
      ctx.shadowColor = primary;
      ctx.shadowBlur = size * 0.12;
      const shell = ctx.createLinearGradient(size * 0.18, size * 0.12, size * 0.82, size * 0.88);
      shell.addColorStop(0, '#172641');
      shell.addColorStop(0.5, '#081321');
      shell.addColorStop(1, '#030812');
      ctx.fillStyle = shell;
      if (frame === 'token') hexPanelPath(ctx, cx, cy, size * 0.39);
      else roundedPanelPath(ctx, size * 0.1, size * 0.1, size * 0.8, size * 0.8, size * 0.16);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = primary;
      ctx.lineWidth = size * 0.045;
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.018;
      if (frame === 'token') hexPanelPath(ctx, cx, cy, size * 0.32);
      else roundedPanelPath(ctx, size * 0.15, size * 0.15, size * 0.7, size * 0.7, size * 0.12);
      ctx.stroke();
      ctx.restore();

      if (frame === 'panel') {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.4;
        for (const sx of [-1, 1] as const) {
          for (const sy of [-1, 1] as const) {
            ctx.beginPath();
            ctx.moveTo(cx + sx * size * 0.26, cy + sy * size * 0.34);
            ctx.lineTo(cx + sx * size * 0.34, cy + sy * size * 0.34);
            ctx.lineTo(cx + sx * size * 0.34, cy + sy * size * 0.26);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.shadowColor = primary;
    ctx.shadowBlur = size * 0.09;
    drawGlyph(ctx, cx, cy);
    ctx.restore();
  });
}

/** Smooth, high-contrast shop/pickup glyphs and weapon-state effects for mobile HUD use. */
function modernInterfaceTextures(scene: Phaser.Scene): void {
  modernNeonIcon(scene, 'pickup-credit', 56, '#ffc857', '#fff1a6', 'token', (ctx, cx, cy) => {
    ctx.strokeStyle = '#fff3bd';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 12.5, Math.PI * 0.28, Math.PI * 1.72);
    ctx.stroke();
    ctx.strokeStyle = '#ffc857';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy - 8);
    ctx.lineTo(cx + 16, cy - 8);
    ctx.moveTo(cx + 10, cy + 8);
    ctx.lineTo(cx + 16, cy + 8);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  modernNeonIcon(scene, 'pickup-repair', 56, '#55f29a', '#d8ffe6', 'token', (ctx, cx, cy) => {
    ctx.fillStyle = 'rgba(29,107,78,0.82)';
    ctx.strokeStyle = '#baffd5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.quadraticCurveTo(cx + 15, cy - 10, cx + 14, cy + 2);
    ctx.quadraticCurveTo(cx + 10, cy + 14, cx, cy + 18);
    ctx.quadraticCurveTo(cx - 10, cy + 14, cx - 14, cy + 2);
    ctx.quadraticCurveTo(cx - 15, cy - 10, cx, cy - 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy);
    ctx.lineTo(cx + 7, cy);
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
  });

  modernNeonIcon(scene, 'pickup-coolant', 56, '#54dfff', '#dcfaff', 'token', (ctx, cx, cy) => {
    ctx.fillStyle = 'rgba(35,128,174,0.72)';
    ctx.strokeStyle = '#d8faff';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 17);
    ctx.bezierCurveTo(cx + 5, cy - 8, cx + 13, cy - 1, cx + 13, cy + 7);
    ctx.bezierCurveTo(cx + 13, cy + 17, cx - 13, cy + 17, cx - 13, cy + 7);
    ctx.bezierCurveTo(cx - 13, cy - 1, cx - 5, cy - 8, cx, cy - 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * 7, cy - Math.sin(angle) * 7 + 4);
      ctx.lineTo(cx + Math.cos(angle) * 7, cy + Math.sin(angle) * 7 + 4);
      ctx.stroke();
    }
  });

  modernNeonIcon(scene, 'pickup-super', 56, '#b78cff', '#ffe8ff', 'token', (ctx, cx, cy) => {
    ctx.strokeStyle = '#e8d6ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 17, 8, -0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const radius = i % 2 === 0 ? 13 : 6;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9f66ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  modernNeonIcon(scene, 'icon-primary', 64, '#50cfff', '#e5fbff', 'panel', (ctx, cx, cy) => {
    const body = ctx.createLinearGradient(cx, cy - 18, cx, cy + 17);
    body.addColorStop(0, '#f0fdff');
    body.addColorStop(0.45, '#53d9ff');
    body.addColorStop(1, '#1768a8');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 19);
    ctx.lineTo(cx + 5, cy - 19);
    ctx.lineTo(cx + 8, cy + 11);
    ctx.lineTo(cx + 14, cy + 18);
    ctx.lineTo(cx - 14, cy + 18);
    ctx.lineTo(cx - 8, cy + 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = '#071a34';
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  modernNeonIcon(scene, 'icon-secondary', 64, '#f08cff', '#ffeaff', 'panel', (ctx, cx, cy) => {
    ctx.strokeStyle = '#ffe8ff';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 8);
    ctx.quadraticCurveTo(cx, cy - 18, cx + 13, cy - 8);
    ctx.stroke();
    for (const side of [-1, 1] as const) {
      const x = cx + side * 13;
      const pod = ctx.createLinearGradient(x - 6, cy - 12, x + 6, cy + 15);
      pod.addColorStop(0, '#fff1ff');
      pod.addColorStop(0.4, '#dd71f2');
      pod.addColorStop(1, '#642487');
      ctx.fillStyle = pod;
      roundedPanelPath(ctx, x - 6, cy - 10, 12, 25, 5);
      ctx.fill();
      ctx.strokeStyle = '#ffcaff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, cy - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  modernNeonIcon(scene, 'icon-engine', 64, '#ff9b54', '#fff0c7', 'panel', (ctx, cx, cy) => {
    ctx.strokeStyle = '#ffe9c4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 15, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy - 2);
      ctx.rotate(angle);
      const blade = ctx.createLinearGradient(0, 0, 14, 0);
      blade.addColorStop(0, '#fff4d8');
      blade.addColorStop(1, '#ff7b32');
      ctx.fillStyle = blade;
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.quadraticCurveTo(9, -8, 14, -4);
      ctx.quadraticCurveTo(9, 2, 2, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff9eb';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffad5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + 18);
    ctx.lineTo(cx, cy + 24);
    ctx.lineTo(cx + 8, cy + 18);
    ctx.stroke();
  });

  modernNeonIcon(scene, 'icon-cooler', 64, '#58e8ff', '#efffff', 'panel', (ctx, cx, cy) => {
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = 3;
    roundedPanelPath(ctx, cx - 16, cy - 17, 32, 34, 7);
    ctx.stroke();
    ctx.strokeStyle = '#54dfff';
    ctx.lineWidth = 2.5;
    for (let x = -9; x <= 9; x += 6) {
      ctx.beginPath();
      ctx.moveTo(cx + x, cy - 12);
      ctx.lineTo(cx + x, cy + 12);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#baf8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - 8);
    ctx.lineTo(cx - 16, cy - 8);
    ctx.moveTo(cx + 16, cy + 8);
    ctx.lineTo(cx + 20, cy + 8);
    ctx.stroke();
  });

  modernNeonIcon(scene, 'icon-armor', 64, '#6ff0a5', '#e9fff1', 'panel', (ctx, cx, cy) => {
    const shield = ctx.createLinearGradient(cx - 12, cy - 18, cx + 13, cy + 18);
    shield.addColorStop(0, '#effff5');
    shield.addColorStop(0.42, '#5ee69a');
    shield.addColorStop(1, '#176b55');
    ctx.fillStyle = shield;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.quadraticCurveTo(cx + 17, cy - 14, cx + 16, cy + 1);
    ctx.quadraticCurveTo(cx + 12, cy + 16, cx, cy + 22);
    ctx.quadraticCurveTo(cx - 12, cy + 16, cx - 16, cy + 1);
    ctx.quadraticCurveTo(cx - 17, cy - 14, cx, cy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#eafff2';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = '#165a4a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 14);
    ctx.moveTo(cx - 9, cy - 4);
    ctx.lineTo(cx + 9, cy - 4);
    ctx.stroke();
  });

  modernNeonIcon(scene, 'fx-rail-charge', 64, '#88eaff', '#ffffff', 'none', (ctx, cx, cy) => {
    const beam = ctx.createLinearGradient(cx, cy - 30, cx, cy + 30);
    beam.addColorStop(0, 'rgba(125,225,255,0)');
    beam.addColorStop(0.35, 'rgba(125,225,255,0.72)');
    beam.addColorStop(0.5, '#ffffff');
    beam.addColorStop(0.65, 'rgba(125,225,255,0.72)');
    beam.addColorStop(1, 'rgba(125,225,255,0)');
    ctx.strokeStyle = beam;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 29);
    ctx.lineTo(cx, cy + 29);
    ctx.stroke();
    ctx.strokeStyle = '#a8efff';
    ctx.lineWidth = 2.2;
    for (const y of [-13, 0, 13]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + y, 19 - Math.abs(y) * 0.3, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  modernNeonIcon(scene, 'fx-lock-reticle', 64, '#ff715f', '#ffe2cc', 'none', (ctx, cx, cy) => {
    ctx.strokeStyle = '#ff8c70';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#fff0df';
    ctx.lineWidth = 3;
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 27, angle - 0.25, angle + 0.25);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff715f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
  });

  modernNeonIcon(scene, 'fx-plasma-bloom', 64, '#d27cff', '#80eaff', 'none', (ctx, cx, cy) => {
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    bloom.addColorStop(0, '#ffffff');
    bloom.addColorStop(0.18, 'rgba(116,234,255,0.95)');
    bloom.addColorStop(0.48, 'rgba(202,93,255,0.6)');
    bloom.addColorStop(1, 'rgba(105,37,190,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ebc2ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(angle) * 12,
        cy + Math.sin(angle) * 12,
        13,
        5,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  });

  modernNeonIcon(scene, 'fx-chain-node', 48, '#68f2ff', '#ffffff', 'none', (ctx, cx, cy) => {
    const node = ctx.createRadialGradient(cx - 3, cy - 4, 0, cx, cy, 13);
    node.addColorStop(0, '#ffffff');
    node.addColorStop(0.35, '#74efff');
    node.addColorStop(1, 'rgba(27,121,210,0)');
    ctx.fillStyle = node;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9ffff';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - 0.4;
      const innerX = cx + Math.cos(angle) * 7;
      const innerY = cy + Math.sin(angle) * 7;
      const bendX = cx + Math.cos(angle + 0.22) * 15;
      const bendY = cy + Math.sin(angle + 0.22) * 15;
      const outerX = cx + Math.cos(angle) * 22;
      const outerY = cy + Math.sin(angle) * 22;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(bendX, bendY);
      ctx.lineTo(outerX, outerY);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** High-resolution modular boss bodies and reusable hardpoints. */
function modernBossTextures(scene: Phaser.Scene): void {
  smoothTexture(scene, 'boss-amoeba', 170, 126, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.shadowColor = '#6dff9c';
    ctx.shadowBlur = 20;
    const membrane = ctx.createRadialGradient(cx - 18, cy - 19, 5, cx, cy, 72);
    membrane.addColorStop(0, '#eeffd8');
    membrane.addColorStop(0.28, '#74f279');
    membrane.addColorStop(0.72, '#217d55');
    membrane.addColorStop(1, 'rgba(10,34,38,0.15)');
    ctx.fillStyle = membrane;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = 55 + Math.sin(i * 2.7) * 8 + Math.cos(i * 1.4) * 5;
      const x = cx + Math.cos(a) * r * 1.25;
      const y = cy + Math.sin(a) * r * 0.78;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(177,255,194,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const [x, y, r] of [
      [cx - 27, cy - 4, 14],
      [cx + 24, cy + 8, 11],
      [cx + 4, cy - 24, 8],
    ] as const) {
      const nucleus = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, r);
      nucleus.addColorStop(0, '#ffffd4');
      nucleus.addColorStop(0.38, '#d5ff52');
      nucleus.addColorStop(1, '#367d32');
      ctx.fillStyle = nucleus;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,255,176,0.8)';
      ctx.stroke();
    }
  });

  smoothTexture(scene, 'boss-protocore', 184, 142, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.shadowColor = '#ffad42';
    ctx.shadowBlur = 22;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * 57, cy + Math.sin(a) * 40);
      ctx.rotate(a);
      const fin = ctx.createLinearGradient(-13, 0, 15, 0);
      fin.addColorStop(0, '#2a3448');
      fin.addColorStop(0.55, '#d7e4ed');
      fin.addColorStop(1, '#6c321f');
      ctx.fillStyle = fin;
      ctx.beginPath();
      ctx.moveTo(-16, -7);
      ctx.lineTo(18, -11);
      ctx.lineTo(27, 0);
      ctx.lineTo(18, 11);
      ctx.lineTo(-16, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#7fc9df';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 43, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#263d59';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 46, 32, 0, 0, Math.PI * 2);
    ctx.stroke();
    const core = ctx.createRadialGradient(cx - 8, cy - 9, 2, cx, cy, 31);
    core.addColorStop(0, '#fffce4');
    core.addColorStop(0.28, '#ffd35a');
    core.addColorStop(0.72, '#f15b30');
    core.addColorStop(1, '#32142c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
  });

  smoothTexture(scene, 'boss-helios', 184, 154, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.shadowColor = '#ff8528';
    ctx.shadowBlur = 25;
    ctx.fillStyle = 'rgba(255,86,26,0.72)';
    ctx.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = i % 2 === 0 ? 73 + (i % 6) * 2 : 54;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const sun = ctx.createRadialGradient(cx - 13, cy - 15, 4, cx, cy, 52);
    sun.addColorStop(0, '#fffbd0');
    sun.addColorStop(0.25, '#ffd857');
    sun.addColorStop(0.67, '#ff7a2d');
    sun.addColorStop(1, '#9e1836');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,247,178,0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 22 + i * 8, i * 0.7, i * 0.7 + 2.3);
      ctx.stroke();
    }
  });

  smoothTexture(scene, 'boss-crimson', 208, 132, (ctx, w, h) => {
    const cx = w / 2;
    const hull = ctx.createLinearGradient(0, 0, w, h);
    hull.addColorStop(0, '#1b1f33');
    hull.addColorStop(0.35, '#e6584d');
    hull.addColorStop(0.56, '#6f1729');
    hull.addColorStop(1, '#14182c');
    ctx.shadowColor = '#ff4c4c';
    ctx.shadowBlur = 18;
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(w - 27, 34);
    ctx.lineTo(w - 5, 94);
    ctx.lineTo(cx + 37, 82);
    ctx.lineTo(cx + 22, h - 5);
    ctx.lineTo(cx - 22, h - 5);
    ctx.lineTo(cx - 37, 82);
    ctx.lineTo(5, 94);
    ctx.lineTo(27, 34);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff9380';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#10172b';
    ctx.fillRect(cx - 42, 43, 84, 35);
    const reactor = ctx.createRadialGradient(cx - 5, 56, 1, cx, 61, 21);
    reactor.addColorStop(0, '#ffffff');
    reactor.addColorStop(0.3, '#ff9a65');
    reactor.addColorStop(1, '#8e1737');
    ctx.fillStyle = reactor;
    ctx.beginPath();
    ctx.arc(cx, 61, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d6e8ff';
    for (const side of [-1, 1]) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + side * 44, 38);
      ctx.lineTo(cx + side * 78, 87);
      ctx.stroke();
    }
  });

  smoothTexture(scene, 'boss-nova', 196, 164, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.shadowColor = '#d477ff';
    ctx.shadowBlur = 24;
    const crystal = ctx.createRadialGradient(cx - 13, cy - 17, 2, cx, cy, 67);
    crystal.addColorStop(0, '#ffffff');
    crystal.addColorStop(0.22, '#94edff');
    crystal.addColorStop(0.55, '#a25cff');
    crystal.addColorStop(1, '#261449');
    ctx.fillStyle = crystal;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = i % 2 === 0 ? 76 : 49;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(225,241,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx, h - 8);
    ctx.moveTo(26, cy);
    ctx.lineTo(w - 26, cy);
    ctx.stroke();
    ctx.fillStyle = '#fffbd0';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  });

  smoothTexture(scene, 'boss-singularity', 192, 150, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(-0.24);
    ctx.shadowColor = '#9a79ff';
    ctx.shadowBlur = 22;
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(${110 + i * 18},${70 + i * 14},255,${0.24 + i * 0.1})`;
      ctx.lineWidth = 11 - i;
      ctx.beginPath();
      ctx.ellipse(0, 0, 84 - i * 8, 39 - i * 4, 0, 0.25, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const hole = ctx.createRadialGradient(-9, -8, 1, 0, 0, 37);
    hole.addColorStop(0, '#020106');
    hole.addColorStop(0.62, '#03030a');
    hole.addColorStop(0.86, '#5842b4');
    hole.addColorStop(1, 'rgba(150,115,255,0)');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(0, 0, 39, 0, Math.PI * 2);
    ctx.fill();
  });

  smoothTexture(scene, 'boss-snail', 218, 162, (ctx) => {
    const shellX = 125;
    const shellY = 78;
    ctx.shadowColor = '#ef88ff';
    ctx.shadowBlur = 18;
    const shell = ctx.createRadialGradient(shellX - 19, shellY - 18, 4, shellX, shellY, 67);
    shell.addColorStop(0, '#f8d5ff');
    shell.addColorStop(0.3, '#ba6bdb');
    shell.addColorStop(0.68, '#573187');
    shell.addColorStop(1, '#17162f');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(shellX, shellY, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#efc1ff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(shellX, shellY, 45, -0.4, Math.PI * 1.65);
    ctx.arc(shellX, shellY, 25, -0.4, Math.PI * 1.62);
    ctx.stroke();
    const skin = ctx.createLinearGradient(0, 40, 92, 135);
    skin.addColorStop(0, '#d8ffb0');
    skin.addColorStop(0.55, '#55c978');
    skin.addColorStop(1, '#1d654b');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(65, 112, 60, 33, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fe892';
    ctx.beginPath();
    ctx.ellipse(35, 77, 29, 35, -0.2, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#74d984';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(31 + side * 10, 52);
      ctx.lineTo(28 + side * 17, 17);
      ctx.stroke();
      ctx.fillStyle = '#f6fdff';
      ctx.beginPath();
      ctx.arc(28 + side * 17, 15, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1533';
      ctx.beginPath();
      ctx.arc(28 + side * 17, 15, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  smoothTexture(scene, 'part-pod', 38, 38, (ctx, w, h) => {
    const g = ctx.createRadialGradient(14, 12, 2, w / 2, h / 2, 18);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#a5ffbe');
    g.addColorStop(0.72, '#32a871');
    g.addColorStop(1, '#10283c');
    ctx.shadowColor = '#7bffb5';
    ctx.shadowBlur = 11;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8ffe6';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  smoothTexture(scene, 'part-vane', 34, 58, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#eaf9ff');
    g.addColorStop(0.35, '#5bb7d1');
    g.addColorStop(1, '#17243c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w - 3, 17);
    ctx.lineTo(w - 10, h - 4);
    ctx.lineTo(w / 2, h - 15);
    ctx.lineTo(10, h - 4);
    ctx.lineTo(3, 17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9cecff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  smoothTexture(scene, 'part-corona', 46, 46, (ctx, w, h) => {
    ctx.shadowColor = '#ff7a2f';
    ctx.shadowBlur = 13;
    ctx.fillStyle = '#ff8a32';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 15 : 22;
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3a4';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  smoothTexture(scene, 'part-flarecannon', 36, 62, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2a172b');
    g.addColorStop(0.5, '#f06a52');
    g.addColorStop(1, '#27152d');
    ctx.fillStyle = g;
    ctx.fillRect(7, 10, w - 14, h - 14);
    ctx.fillStyle = '#ffd39a';
    ctx.fillRect(12, 1, w - 24, 28);
    ctx.strokeStyle = '#ff9a74';
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 10, w - 14, h - 14);
  });
  smoothTexture(scene, 'part-shard', 42, 54, (ctx, w, h) => {
    const g = ctx.createLinearGradient(5, 4, w - 4, h);
    g.addColorStop(0, '#f1ffff');
    g.addColorStop(0.38, '#82dfff');
    g.addColorStop(1, '#6637b4');
    ctx.shadowColor = '#a580ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w - 3, h * 0.42);
    ctx.lineTo(w * 0.62, h - 2);
    ctx.lineTo(4, h * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e5f5ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  smoothTexture(scene, 'part-arc', 58, 34, (ctx, w, h) => {
    ctx.strokeStyle = '#b994ff';
    ctx.shadowColor = '#7355ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(w / 2, h + 4, 27, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.strokeStyle = '#ecddff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  smoothTexture(scene, 'part-eyestalk', 32, 64, (ctx, w, h) => {
    ctx.strokeStyle = '#71d883';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.bezierCurveTo(6, 44, 27, 27, w / 2, 15);
    ctx.stroke();
    ctx.fillStyle = '#f6ffff';
    ctx.beginPath();
    ctx.arc(w / 2, 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#302250';
    ctx.beginPath();
    ctx.arc(w / 2, 12, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function modernPlanetTextures(scene: Phaser.Scene): void {
  const makePlanet = (
    key: string,
    atmosphere: string,
    stops: [number, string][],
    decorate: (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void,
  ) => {
    smoothTexture(scene, key, 210, 210, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const r = 78;
      ctx.shadowColor = atmosphere;
      ctx.shadowBlur = 28;
      const surface = ctx.createRadialGradient(cx - 28, cy - 31, 4, cx, cy, r);
      for (const [at, color] of stops) surface.addColorStop(at, color);
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.clip();
      decorate(ctx, cx, cy, r);
      const night = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      night.addColorStop(0, 'rgba(2,5,18,0)');
      night.addColorStop(0.58, 'rgba(2,5,18,0.04)');
      night.addColorStop(1, 'rgba(2,5,18,0.76)');
      ctx.fillStyle = night;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = atmosphere;
      ctx.globalAlpha = 0.78;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  };

  makePlanet(
    'planet-ocean',
    '#63e8ff',
    [
      [0, '#dcffff'],
      [0.26, '#2bd9ea'],
      [0.65, '#126aa8'],
      [1, '#071c4b'],
    ],
    (ctx, cx, cy, r) => {
      ctx.strokeStyle = 'rgba(235,255,255,0.65)';
      ctx.lineWidth = 8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(cx - 8, cy + i * 25, r * 0.9, 12, -0.12, 0.3, Math.PI * 1.72);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(78,220,144,0.72)';
      ctx.beginPath();
      ctx.ellipse(cx - 25, cy - 9, 24, 13, -0.35, 0, Math.PI * 2);
      ctx.ellipse(cx + 12, cy + 29, 17, 9, 0.42, 0, Math.PI * 2);
      ctx.fill();
    },
  );
  makePlanet(
    'planet-ice',
    '#b9f8ff',
    [
      [0, '#ffffff'],
      [0.3, '#c6f7ff'],
      [0.68, '#65bde0'],
      [1, '#17396d'],
    ],
    (ctx, cx, cy, r) => {
      ctx.strokeStyle = 'rgba(60,142,200,0.74)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        const a = i * 1.73;
        const x = cx + Math.cos(a) * r * 0.55;
        const y = cy + Math.sin(a) * r * 0.58;
        ctx.beginPath();
        ctx.moveTo(x - 17, y - 9);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x + 12, y - 18);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(244,255,255,0.72)';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 61, 54, 23, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  );
  makePlanet(
    'planet-volcanic',
    '#ff6633',
    [
      [0, '#ffd36a'],
      [0.28, '#b83b24'],
      [0.68, '#3d1820'],
      [1, '#100b15'],
    ],
    (ctx, cx, cy, r) => {
      ctx.strokeStyle = '#ffb12f';
      ctx.shadowColor = '#ff4b20';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 5;
      for (let i = 0; i < 10; i++) {
        const a = i * 1.94;
        const x = cx + Math.cos(a) * r * 0.58;
        const y = cy + Math.sin(a) * r * 0.58;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 13);
        ctx.lineTo(x - 4, y + 2);
        ctx.lineTo(x + 7, y - 3);
        ctx.lineTo(x + 16, y + 17);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(30,10,18,0.75)';
      ctx.beginPath();
      ctx.arc(cx - 19, cy - 28, 14, 0, Math.PI * 2);
      ctx.arc(cx + 29, cy + 19, 10, 0, Math.PI * 2);
      ctx.fill();
    },
  );
  makePlanet(
    'planet-desert',
    '#ffc978',
    [
      [0, '#fff1b0'],
      [0.3, '#dda252'],
      [0.68, '#9a4e2d'],
      [1, '#381d29'],
    ],
    (ctx, cx, cy, r) => {
      ctx.strokeStyle = 'rgba(255,226,154,0.6)';
      ctx.lineWidth = 9;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.bezierCurveTo(cx - r, cy + i * 19, cx - 18, cy + i * 19 - 19, cx + r, cy + i * 19 + 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(87,40,35,0.42)';
      ctx.beginPath();
      ctx.ellipse(cx + 11, cy - 24, 28, 9, 0.26, 0, Math.PI * 2);
      ctx.fill();
    },
  );
  makePlanet(
    'planet-rock',
    '#aab8c9',
    [
      [0, '#e4e9eb'],
      [0.3, '#8b939d'],
      [0.68, '#414957'],
      [1, '#171b28'],
    ],
    (ctx, cx, cy, r) => {
      for (let i = 0; i < 17; i++) {
        const a = i * 2.23;
        const rr = r * (0.15 + ((i * 37) % 70) / 100);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        const cr = 4 + (i % 5) * 2;
        const crater = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, cr);
        crater.addColorStop(0, 'rgba(30,35,45,0.82)');
        crater.addColorStop(0.72, 'rgba(62,69,79,0.48)');
        crater.addColorStop(1, 'rgba(230,235,238,0.42)');
        ctx.fillStyle = crater;
        ctx.beginPath();
        ctx.arc(x, y, cr, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  );
}

/**
 * Production FX contract: every texture is transparent, centre-origin friendly and pre-rendered.
 * Large-area layers are designed for NORMAL/SCREEN, emissive cores for ADD, and may be tinted.
 * Keeping the detail in cached canvases avoids per-frame Graphics path construction on mobile.
 */
function productionFxTextures(scene: Phaser.Scene): void {
  // Volcanic warning set: irregular ground fissure + expanding elliptical heat front + vent mouth.
  smoothTexture(scene, 'hazard-volcanic-crack', 360, 128, (ctx, w, h) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = w / 2;
    const groundY = h * 0.68;

    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(1, 0.34);
    const heat = ctx.createRadialGradient(0, 0, 4, 0, 0, 176);
    heat.addColorStop(0, 'rgba(255,245,184,0.5)');
    heat.addColorStop(0.28, 'rgba(255,125,32,0.27)');
    heat.addColorStop(0.68, 'rgba(180,32,18,0.1)');
    heat.addColorStop(1, 'rgba(40,5,9,0)');
    ctx.fillStyle = heat;
    ctx.fillRect(-180, -180, 360, 360);
    ctx.restore();

    const cracks: Array<Array<[number, number]>> = [
      [
        [180, 83],
        [145, 76],
        [118, 84],
        [88, 78],
        [54, 92],
        [14, 89],
      ],
      [
        [181, 84],
        [212, 74],
        [240, 82],
        [272, 73],
        [304, 88],
        [350, 83],
      ],
      [
        [145, 77],
        [132, 61],
        [109, 54],
        [94, 39],
      ],
      [
        [118, 84],
        [101, 99],
        [78, 105],
        [63, 121],
      ],
      [
        [213, 74],
        [225, 57],
        [248, 48],
        [258, 29],
      ],
      [
        [272, 73],
        [286, 101],
        [318, 110],
        [330, 126],
      ],
    ];
    const strokeCracks = (color: string, width: number, blur: number): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      for (const crack of cracks) {
        const first = crack[0];
        if (!first) continue;
        ctx.moveTo(first[0], first[1]);
        for (let i = 1; i < crack.length; i++) {
          const point = crack[i];
          if (point) ctx.lineTo(point[0], point[1]);
        }
      }
      ctx.stroke();
    };
    strokeCracks('rgba(35,5,10,0.78)', 17, 0);
    strokeCracks('rgba(255,68,19,0.78)', 8, 16);
    strokeCracks('rgba(255,215,92,0.96)', 3, 8);
    strokeCracks('rgba(255,255,224,0.9)', 1.1, 3);
    ctx.shadowBlur = 0;
  });

  smoothTexture(scene, 'hazard-volcanic-thermal-ring', 288, 144, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h * 0.55;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.shadowColor = '#ff6b25';
    ctx.shadowBlur = 20;
    for (const [rx, ry, width, alpha] of [
      [126, 48, 10, 0.16],
      [104, 38, 5, 0.38],
      [78, 28, 2.5, 0.86],
    ] as const) {
      ctx.strokeStyle = `rgba(255,${Math.round(120 + alpha * 100)},62,${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,236,164,0.72)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([9, 13]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 116, 43, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 27;
      const lift = 12 + (i % 3) * 7;
      ctx.strokeStyle = `rgba(255,${128 + i * 8},72,${0.18 + (i % 2) * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, cy + 5);
      ctx.bezierCurveTo(x - 8, cy - lift, x + 11, cy - lift * 1.4, x + 2, cy - lift * 2);
      ctx.stroke();
    }
  });

  smoothTexture(scene, 'hazard-volcanic-vent', 192, 120, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h * 0.67;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.38);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 82);
    glow.addColorStop(0, 'rgba(255,255,208,0.95)');
    glow.addColorStop(0.26, 'rgba(255,117,27,0.82)');
    glow.addColorStop(0.62, 'rgba(105,25,20,0.48)');
    glow.addColorStop(1, 'rgba(15,5,12,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,7,12,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,185,74,0.86)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(51, 84);
    ctx.lineTo(30, 101);
    ctx.moveTo(70, 91);
    ctx.lineTo(58, 115);
    ctx.moveTo(141, 85);
    ctx.lineTo(166, 101);
    ctx.moveTo(122, 91);
    ctx.lineTo(136, 116);
    ctx.stroke();
  });

  const drawProminence = (
    key: string,
    width: number,
    height: number,
    filamentsOnly: boolean,
  ): void => {
    smoothTexture(scene, key, width, height, (ctx, w, h) => {
      const mid = h / 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!filamentsOnly) {
        const haze = ctx.createLinearGradient(0, 0, w, 0);
        haze.addColorStop(0, 'rgba(255,250,194,0.9)');
        haze.addColorStop(0.24, 'rgba(255,152,47,0.76)');
        haze.addColorStop(0.72, 'rgba(255,48,61,0.42)');
        haze.addColorStop(1, 'rgba(255,20,72,0)');
        ctx.shadowColor = '#ff4c32';
        ctx.shadowBlur = h * 0.18;
        ctx.fillStyle = haze;
        ctx.beginPath();
        ctx.moveTo(0, mid - h * 0.23);
        ctx.bezierCurveTo(w * 0.18, 0, w * 0.3, mid + h * 0.1, w * 0.47, h * 0.14);
        ctx.bezierCurveTo(w * 0.62, -h * 0.03, w * 0.78, mid + h * 0.04, w, mid - h * 0.02);
        ctx.lineTo(w, mid + h * 0.18);
        ctx.bezierCurveTo(w * 0.77, h * 1.02, w * 0.64, mid + h * 0.08, w * 0.45, h * 0.86);
        ctx.bezierCurveTo(w * 0.27, h * 1.05, w * 0.17, mid - h * 0.08, 0, mid + h * 0.25);
        ctx.closePath();
        ctx.fill();

        const middle = ctx.createLinearGradient(0, mid, w, mid);
        middle.addColorStop(0, 'rgba(255,255,224,0.98)');
        middle.addColorStop(0.34, 'rgba(255,191,63,0.92)');
        middle.addColorStop(0.78, 'rgba(255,76,41,0.64)');
        middle.addColorStop(1, 'rgba(255,30,70,0)');
        ctx.fillStyle = middle;
        ctx.beginPath();
        ctx.moveTo(0, mid - h * 0.09);
        ctx.bezierCurveTo(
          w * 0.2,
          mid - h * 0.35,
          w * 0.31,
          mid + h * 0.19,
          w * 0.5,
          mid - h * 0.1,
        );
        ctx.bezierCurveTo(w * 0.67, mid - h * 0.37, w * 0.8, mid + h * 0.25, w, mid - h * 0.02);
        ctx.lineTo(w, mid + h * 0.08);
        ctx.bezierCurveTo(
          w * 0.79,
          mid + h * 0.34,
          w * 0.67,
          mid - h * 0.13,
          w * 0.49,
          mid + h * 0.14,
        );
        ctx.bezierCurveTo(w * 0.3, mid + h * 0.38, w * 0.2, mid - h * 0.13, 0, mid + h * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const [offset, color, lineWidth, alpha] of [
        [-0.11, '#fffbd8', 3.6, 0.95],
        [0.03, '#ffd05e', 2.5, 0.84],
        [0.16, '#ff6b3d', 2, 0.56],
        [-0.22, '#ff4568', 1.4, 0.42],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        ctx.shadowColor = color;
        ctx.shadowBlur = lineWidth * 3;
        ctx.beginPath();
        ctx.moveTo(2, mid + h * offset);
        ctx.bezierCurveTo(
          w * 0.22,
          mid - h * (0.2 + offset),
          w * 0.33,
          mid + h * (0.22 - offset),
          w * 0.52,
          mid - h * (0.08 + offset),
        );
        ctx.bezierCurveTo(
          w * 0.7,
          mid - h * (0.3 - offset),
          w * 0.82,
          mid + h * (0.2 + offset),
          w - 2,
          mid - h * offset * 0.4,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });
  };
  // Preserve the live key's 190x86 footprint while replacing its flat ribbon artwork.
  drawProminence('hazard-prominence', 190, 86, false);
  drawProminence('hazard-prominence-ribbon', 320, 128, false);
  drawProminence('hazard-prominence-filament', 320, 128, true);

  smoothTexture(scene, 'hazard-corona', 320, 320, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const halo = ctx.createRadialGradient(cx, cy, 76, cx, cy, 157);
    halo.addColorStop(0, 'rgba(255,246,178,0)');
    halo.addColorStop(0.46, 'rgba(255,152,45,0.09)');
    halo.addColorStop(0.74, 'rgba(255,72,44,0.2)');
    halo.addColorStop(1, 'rgba(255,28,78,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const radius = 94 + (i % 6) * 9;
      const start = i * 1.47;
      const length = 0.32 + (i % 4) * 0.15;
      const color = i % 3 === 0 ? '#fff2ae' : i % 3 === 1 ? '#ff9b3b' : '#ff4760';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.32 + (i % 5) * 0.09;
      ctx.lineWidth = 1.2 + (i % 3) * 0.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.19;
      const inner = 105 + (i % 3) * 6;
      const outer = 138 + (i % 4) * 8;
      const x1 = cx + Math.cos(angle) * inner;
      const y1 = cy + Math.sin(angle) * inner;
      const x2 = cx + Math.cos(angle + 0.18) * outer;
      const y2 = cy + Math.sin(angle + 0.18) * outer;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,218,112,0.62)' : 'rgba(255,80,72,0.48)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(
        cx + Math.cos(angle - 0.22) * outer,
        cy + Math.sin(angle - 0.22) * outer,
        cx + Math.cos(angle + 0.45) * outer,
        cy + Math.sin(angle + 0.45) * outer,
        x2,
        y2,
      );
      ctx.stroke();
    }
  });

  // Disaster kit: each sprite can be layered independently and tinted per sector.
  smoothTexture(scene, 'hazard-disaster-shockwave', 256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const wash = ctx.createRadialGradient(cx, cy, 34, cx, cy, 126);
    wash.addColorStop(0, 'rgba(255,247,210,0)');
    wash.addColorStop(0.55, 'rgba(255,158,65,0.08)');
    wash.addColorStop(0.76, 'rgba(255,100,41,0.26)');
    wash.addColorStop(1, 'rgba(72,42,42,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const [radius, width, color] of [
      [112, 9, 'rgba(255,109,45,0.2)'],
      [102, 3.5, 'rgba(255,230,157,0.86)'],
      [89, 2, 'rgba(184,203,220,0.46)'],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.shadowColor = color;
      ctx.shadowBlur = width * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  });

  smoothTexture(scene, 'hazard-disaster-rock', 112, 112, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const points: Array<[number, number]> = [
      [52, 5],
      [75, 12],
      [95, 29],
      [107, 52],
      [96, 78],
      [78, 101],
      [51, 108],
      [25, 96],
      [8, 76],
      [3, 50],
      [17, 24],
      [34, 10],
    ];
    const rockPath = (): void => {
      const first = points[0];
      if (!first) return;
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < points.length; i++) {
        const point = points[i];
        if (point) ctx.lineTo(point[0], point[1]);
      }
      ctx.closePath();
    };
    ctx.shadowColor = '#ff5a24';
    ctx.shadowBlur = 13;
    const body = ctx.createRadialGradient(39, 31, 4, cx, cy, 57);
    body.addColorStop(0, '#b98766');
    body.addColorStop(0.34, '#6d493e');
    body.addColorStop(0.72, '#35252d');
    body.addColorStop(1, '#12121c');
    ctx.fillStyle = body;
    rockPath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    rockPath();
    ctx.clip();
    ctx.fillStyle = 'rgba(235,170,115,0.18)';
    ctx.beginPath();
    ctx.moveTo(16, 25);
    ctx.lineTo(53, 8);
    ctx.lineTo(45, 51);
    ctx.lineTo(8, 57);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(7,8,15,0.34)';
    ctx.beginPath();
    ctx.moveTo(46, 52);
    ctx.lineTo(96, 29);
    ctx.lineTo(106, 71);
    ctx.lineTo(69, 77);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#14131c';
    ctx.lineWidth = 4;
    rockPath();
    ctx.stroke();
    ctx.strokeStyle = '#ff9c45';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#ff5a24';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(37, 18);
    ctx.lineTo(48, 43);
    ctx.lineTo(41, 65);
    ctx.lineTo(55, 83);
    ctx.moveTo(48, 43);
    ctx.lineTo(70, 52);
    ctx.lineTo(82, 73);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  smoothTexture(scene, 'hazard-disaster-smoke', 192, 192, (ctx) => {
    const puffs: Array<[number, number, number, number]> = [
      [95, 128, 57, 0.82],
      [58, 120, 42, 0.68],
      [132, 112, 48, 0.72],
      [83, 78, 43, 0.64],
      [124, 66, 37, 0.58],
      [97, 37, 29, 0.46],
      [48, 77, 27, 0.42],
    ];
    for (const [x, y, radius, alpha] of puffs) {
      const puff = ctx.createRadialGradient(x - radius * 0.24, y - radius * 0.28, 2, x, y, radius);
      puff.addColorStop(0, `rgba(119,124,132,${alpha})`);
      puff.addColorStop(0.38, `rgba(58,62,72,${alpha * 0.82})`);
      puff.addColorStop(0.76, `rgba(28,29,39,${alpha * 0.48})`);
      puff.addColorStop(1, 'rgba(13,14,22,0)');
      ctx.fillStyle = puff;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const ember = ctx.createRadialGradient(96, 153, 1, 96, 153, 66);
    ember.addColorStop(0, 'rgba(255,132,43,0.42)');
    ember.addColorStop(0.5, 'rgba(255,57,31,0.12)');
    ember.addColorStop(1, 'rgba(255,35,24,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(25, 82, 142, 110);
  });

  smoothTexture(scene, 'hazard-disaster-flame', 96, 160, (ctx, w, h) => {
    const flame = (inset: number, top: number, colorStops: Array<[number, string]>): void => {
      const gradient = ctx.createLinearGradient(0, top, 0, h - inset);
      for (const [stop, color] of colorStops) gradient.addColorStop(stop, color);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(w / 2, top);
      ctx.bezierCurveTo(w * 0.62, top + 26, w * 0.88 - inset, h * 0.51, w - inset, h - inset);
      ctx.bezierCurveTo(w * 0.7, h - inset * 0.45, w * 0.58, h * 0.88, w / 2, h - inset * 0.2);
      ctx.bezierCurveTo(w * 0.36, h * 0.9, w * 0.18, h - inset * 0.3, inset, h - inset);
      ctx.bezierCurveTo(w * 0.17, h * 0.56, w * 0.4, top + 30, w / 2, top);
      ctx.closePath();
      ctx.fill();
    };
    ctx.shadowColor = '#ff5229';
    ctx.shadowBlur = 18;
    flame(5, 4, [
      [0, 'rgba(255,57,36,0)'],
      [0.25, 'rgba(255,68,28,0.82)'],
      [1, 'rgba(128,18,18,0.22)'],
    ]);
    ctx.shadowBlur = 8;
    flame(20, 33, [
      [0, 'rgba(255,235,138,0.12)'],
      [0.35, 'rgba(255,178,51,0.96)'],
      [1, 'rgba(255,66,20,0.64)'],
    ]);
    ctx.shadowBlur = 0;
    flame(34, 68, [
      [0, 'rgba(255,255,238,0.25)'],
      [0.5, 'rgba(255,251,194,0.98)'],
      [1, 'rgba(255,162,42,0.72)'],
    ]);
  });

  // Pilot overlays extend around the shared craft and deliberately alter its outer silhouette.
  const pilotOverlay = (
    key: string,
    glowColor: string,
    drawAttachments: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void,
  ): void => {
    smoothTexture(scene, key, 96, 112, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h * 0.48;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
      drawAttachments(ctx, cx, cy);
      ctx.shadowBlur = 0;
      const cockpit = ctx.createRadialGradient(cx - 2, cy - 10, 1, cx, cy - 8, 13);
      cockpit.addColorStop(0, 'rgba(255,255,255,0.92)');
      cockpit.addColorStop(0.34, glowColor);
      cockpit.addColorStop(1, 'rgba(5,12,28,0)');
      ctx.fillStyle = cockpit;
      ctx.fillRect(cx - 15, cy - 23, 30, 30);
      const engine = ctx.createLinearGradient(cx, cy + 16, cx, h - 2);
      engine.addColorStop(0, glowColor);
      engine.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = engine;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 13);
      ctx.lineTo(cx + 5, cy + 13);
      ctx.lineTo(cx, h - 2);
      ctx.closePath();
      ctx.fill();
    });
  };

  pilotOverlay('ship-overlay-jungjioo', '#73e9ff', (ctx, cx, cy) => {
    const blade = ctx.createLinearGradient(8, cy, cx, cy);
    blade.addColorStop(0, 'rgba(107,230,255,0.18)');
    blade.addColorStop(0.55, '#43bfe3');
    blade.addColorStop(1, '#d9fbff');
    ctx.fillStyle = blade;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(-7, -15);
      ctx.quadraticCurveTo(33, -31, 43, -4);
      ctx.quadraticCurveTo(26, -12, 13, 13);
      ctx.lineTo(5, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = '#dffcff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 24, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  });

  pilotOverlay('ship-overlay-parksulhee', '#ff62cf', (ctx, cx, cy) => {
    const wing = ctx.createLinearGradient(6, cy, 90, cy);
    wing.addColorStop(0, '#7a1f67');
    wing.addColorStop(0.5, '#ff64cc');
    wing.addColorStop(1, '#7a1f67');
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 18);
    ctx.lineTo(6, cy - 5);
    ctx.lineTo(19, cy + 12);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.lineTo(77, cy + 12);
    ctx.lineTo(90, cy - 5);
    ctx.lineTo(cx + 7, cy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd9f3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx - 28, cy - 3, 12, 20, -0.7, 0, Math.PI * 2);
    ctx.ellipse(cx + 28, cy - 3, 12, 20, 0.7, 0, Math.PI * 2);
    ctx.stroke();
  });

  pilotOverlay('ship-overlay-youngjioo', '#64ef9a', (ctx, cx, cy) => {
    const feather = ctx.createLinearGradient(0, cy, cx, cy);
    feather.addColorStop(0, '#0e6e4d');
    feather.addColorStop(0.65, '#43d983');
    feather.addColorStop(1, '#caffdc');
    ctx.fillStyle = feather;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(cx, cy - 8 + i * 10);
        ctx.scale(side, 1);
        ctx.beginPath();
        ctx.moveTo(1, -7);
        ctx.quadraticCurveTo(24 + i * 5, -18, 44 - i * 4, -6 + i * 4);
        ctx.quadraticCurveTo(25, 1 + i * 3, 4, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = '#dffff0';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 33);
    ctx.lineTo(cx - 6, cy - 14);
    ctx.lineTo(cx + 6, cy - 14);
    ctx.closePath();
    ctx.fill();
  });

  pilotOverlay('ship-overlay-keunaebi', '#f2c25f', (ctx, cx, cy) => {
    const armor = ctx.createLinearGradient(8, cy, 88, cy);
    armor.addColorStop(0, '#5d3c16');
    armor.addColorStop(0.5, '#e5b24e');
    armor.addColorStop(1, '#5d3c16');
    ctx.fillStyle = armor;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 19);
    ctx.lineTo(12, cy - 5);
    ctx.lineTo(4, cy + 19);
    ctx.lineTo(cx - 6, cy + 10);
    ctx.lineTo(cx + 6, cy + 10);
    ctx.lineTo(92, cy + 19);
    ctx.lineTo(84, cy - 5);
    ctx.lineTo(cx + 8, cy - 19);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff0b0';
    ctx.lineWidth = 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 20, cy - 3);
      ctx.quadraticCurveTo(cx + side * 42, cy - 21, cx + side * 39, cy + 20);
      ctx.stroke();
    }
    ctx.fillStyle = '#5f421c';
    ctx.fillRect(cx - 16, cy + 9, 32, 11);
  });

  // Tintable super layers. Use fixed-to-camera placement and ADD/SCREEN blending.
  smoothTexture(scene, 'super-speedlines', GAME_WIDTH, GAME_HEIGHT, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h * 0.51;
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2 + ((i * 17) % 11) * 0.011;
      const inner = 62 + (i % 7) * 13;
      const outer = 290 + (i % 6) * 44;
      const width = 0.8 + (i % 5) * 0.62;
      const x1 = cx + Math.cos(angle) * inner;
      const y1 = cy + Math.sin(angle) * inner * 1.62;
      const x2 = cx + Math.cos(angle) * outer;
      const y2 = cy + Math.sin(angle) * outer * 1.62;
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, 'rgba(220,247,255,0)');
      gradient.addColorStop(0.35, `rgba(190,235,255,${0.18 + (i % 4) * 0.07})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      const px = -Math.sin(angle) * width;
      const py = Math.cos(angle) * width;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x1 - px * 0.25, y1 - py * 0.25);
      ctx.lineTo(x2 - px, y2 - py);
      ctx.lineTo(x2 + px, y2 + py);
      ctx.lineTo(x1 + px * 0.25, y1 + py * 0.25);
      ctx.closePath();
      ctx.fill();
    }
  });

  smoothTexture(scene, 'super-impact-burst', 256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const inner = 18 + (i % 3) * 4;
      const outer = 84 + (i % 5) * 8;
      const half = 0.018 + (i % 4) * 0.006;
      const ray = ctx.createLinearGradient(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
      );
      ray.addColorStop(0, 'rgba(255,255,255,0.94)');
      ray.addColorStop(0.42, 'rgba(154,229,255,0.54)');
      ray.addColorStop(1, 'rgba(89,178,255,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle - half) * inner, Math.sin(angle - half) * inner);
      ctx.lineTo(Math.cos(angle - half) * outer, Math.sin(angle - half) * outer);
      ctx.lineTo(Math.cos(angle + half) * outer, Math.sin(angle + half) * outer);
      ctx.lineTo(Math.cos(angle + half) * inner, Math.sin(angle + half) * inner);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 68);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.16, 'rgba(219,250,255,0.92)');
    core.addColorStop(0.48, 'rgba(101,211,255,0.3)');
    core.addColorStop(1, 'rgba(58,143,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
  });

  smoothTexture(scene, 'super-shockwave', 320, 320, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const wash = ctx.createRadialGradient(cx, cy, 48, cx, cy, 158);
    wash.addColorStop(0, 'rgba(255,255,255,0)');
    wash.addColorStop(0.56, 'rgba(178,236,255,0.06)');
    wash.addColorStop(0.8, 'rgba(111,206,255,0.2)');
    wash.addColorStop(1, 'rgba(65,142,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const [radius, width, alpha] of [
      [142, 10, 0.12],
      [126, 4, 0.7],
      [110, 1.6, 0.42],
    ] as const) {
      ctx.strokeStyle = `rgba(218,249,255,${alpha})`;
      ctx.lineWidth = width;
      ctx.shadowColor = '#78dfff';
      ctx.shadowBlur = width * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  });
}

export function generateTextures(scene: Phaser.Scene): void {
  modernEnemySheet(scene, 'az-small', 48, 48, 'light');
  modernEnemySheet(scene, 'az-medium', 96, 48, 'medium');
  modernEnemySheet(scene, 'az-big', 96, 96, 'heavy');
  modernInterfaceTextures(scene);
  // 함선
  addCanvasTexture(scene, 'ship-player', enhance(pixmap(PLAYER_MAP, PLAYER_PAL, 2)));
  addCanvasTexture(scene, 'ship-e1', enhance(pixmap(E1_MAP, E1_PAL, 2)));
  addCanvasTexture(scene, 'ship-e2', enhance(pixmap(E2_MAP, E2_PAL, 2)));
  addCanvasTexture(scene, 'ship-e3', enhance(pixmap(E3_MAP, E3_PAL, 2)));
  addCanvasTexture(scene, 'ship-boss', enhance(pixmap(BOSS_MAP, BOSS_PAL, 3)));
  // 환영 함선(Jungjioo 러시): 플레이어 실루엣 청백 틴트
  addCanvasTexture(scene, 'ship-ghost', tinted(PLAYER_MAP, 2, 'rgb(150,225,255)', 0.88));

  // L1~L3 신규 적 (신규 맵 + 팔레트 스왑 변형)
  addCanvasTexture(scene, 'ship-wisp', enhance(pixmap(WISP_MAP, WISP_PAL, 2)));
  addCanvasTexture(scene, 'ship-spore', enhance(pixmap(SPORE_MAP, SPORE_PAL, 2)));
  addCanvasTexture(
    scene,
    'ship-mite',
    pixmap(E1_MAP, { O: '#08282a', W: '#c8fff4', R: '#3ac8b8', r: '#1f8a80', d: '#0c4a48' }, 1),
  );
  addCanvasTexture(scene, 'ship-ember', enhance(pixmap(EMBER_MAP, EMBER_PAL, 2)));
  addCanvasTexture(
    scene,
    'ship-shard',
    pixmap(E3_MAP, { O: '#2a0424', W: '#ffd8f4', Y: '#ff8ad8', o: '#c83a9a', d: '#701858' }, 2),
  );
  addCanvasTexture(scene, 'ship-orbiter', enhance(pixmap(ORBITER_MAP, ORBITER_PAL, 2)));
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
  addCanvasTexture(scene, 'ship-prominence', enhance(pixmap(PROM_MAP, PROM_PAL, 2)));
  addCanvasTexture(scene, 'boss-amoeba', enhance(pixmap(AMOEBA_MAP, AMOEBA_PAL, 3)));
  addCanvasTexture(scene, 'boss-protocore', enhance(pixmap(PROTOCORE_MAP, PROTOCORE_PAL, 3)));
  addCanvasTexture(scene, 'boss-helios', enhance(pixmap(HELIOS_MAP, HELIOS_PAL, 3)));

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
  addCanvasTexture(scene, 'boss-crimson', enhance(pixmap(CRIMSON_MAP, CRIMSON_PAL, 4)));
  addCanvasTexture(scene, 'boss-nova', enhance(pixmap(NOVA_MAP, NOVA_PAL, 4)));
  addCanvasTexture(scene, 'boss-singularity', enhance(pixmap(SING_MAP, SING_PAL, 4)));
  addCanvasTexture(scene, 'part-pod', enhance(pixmap(POD_MAP, POD_PAL, 3)));
  addCanvasTexture(scene, 'part-vane', enhance(pixmap(VANE_MAP, VANE_PAL, 3)));
  addCanvasTexture(scene, 'part-corona', enhance(pixmap(CORONA_MAP, CORONA_PAL, 3)));
  addCanvasTexture(scene, 'part-flarecannon', enhance(pixmap(CANNON_MAP, CANNON_PAL, 3)));
  addCanvasTexture(scene, 'part-shard', enhance(pixmap(SHARDP_MAP, SHARDP_PAL, 3)));
  addCanvasTexture(scene, 'part-arc', enhance(pixmap(ARC_MAP, ARC_PAL, 3)));
  addCanvasTexture(scene, 'boss-snail', enhance(pixmap(SNAIL_MAP, SNAIL_PAL, 4)));
  addCanvasTexture(scene, 'part-eyestalk', enhance(pixmap(EYESTALK_MAP, EYESTALK_PAL, 3)));
  modernBossTextures(scene);
  capitalPartTextures(scene);
  modernPlanetTextures(scene);
  addCanvasTexture(scene, 'prop-eye', enhance(pixmap(EYE_MAP, EYE_PAL, 4)));
  addCanvasTexture(
    scene,
    'prop-shellswirl',
    enhance(
      pixmap(
        SNAIL_MAP.slice(0, 13).map((r) => r.slice(8, 24)),
        SNAIL_PAL,
        3,
      ),
    ),
  );
  // 박슬희 기체 (마젠타 팔레트 스왑)
  addCanvasTexture(
    scene,
    'ship-player-ps',
    enhance(
      pixmap(
        PLAYER_MAP,
        {
          O: '#260a1c',
          W: '#ffe8f4',
          C: '#ff9ad8',
          B: '#d6479a',
          D: '#701c4e',
          G: '#ffd8ec',
          g: '#f06ab8',
          E: '#ffd75e',
          e: '#b8862a',
        },
        2,
      ),
    ),
  );

  // 거대 배드민턴 채 (박슬희 필살기)
  {
    const [c, ctx] = canvas(100, 240);
    // 그립
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(43, 190, 14, 46);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(45, 192, 10, 42);
    ctx.fillStyle = '#c89a5a';
    for (let y = 196; y < 230; y += 8) ctx.fillRect(45, y, 10, 3);
    // 샤프트
    ctx.fillStyle = '#d84a3a';
    ctx.fillRect(46, 118, 8, 76);
    // 헤드 림
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#d84a3a';
    ctx.beginPath();
    ctx.ellipse(50, 65, 42, 58, 0, 0, 7);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff8a6a';
    ctx.beginPath();
    ctx.ellipse(50, 65, 42, 58, 0, 0, 7);
    ctx.stroke();
    // 스트링
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(50, 65, 38, 54, 0, 0, 7);
    ctx.clip();
    ctx.strokeStyle = 'rgba(240,248,255,0.85)';
    ctx.lineWidth = 2;
    for (let x = 14; x <= 90; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 130);
      ctx.stroke();
    }
    for (let y = 8; y <= 126; y += 9) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(100, y);
      ctx.stroke();
    }
    ctx.restore();
    addCanvasTexture(scene, 'racket', c);
  }

  // 블랙홀 내부 왜곡 링 (요상한 배경 장식)
  {
    const [c, ctx] = canvas(320, 320);
    for (const [rx, ry, col, w] of [
      [140, 105, 'rgba(220,80,200,0.35)', 5],
      [110, 140, 'rgba(120,255,160,0.28)', 4],
      [80, 70, 'rgba(150,120,255,0.3)', 3],
    ] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.ellipse(160, 160, rx, ry, 0.6, 0, 7);
      ctx.stroke();
    }
    addCanvasTexture(scene, 'decor-warpring', c);
  }

  // 기계형 적기 — Kenney Pixel Shmup 헐 (CC0) 색상화. 로드 실패 시 위의 절차 생성 유지.
  kenneyShip(scene, 'ship-e1', 'kship_18', '#e64a4a');
  kenneyShip(scene, 'ship-e2', 'kship_14', '#9a6ae0');
  kenneyShip(scene, 'ship-e3', 'kship_19', '#ffb347');
  kenneyShip(scene, 'ship-sentinel', 'kship_15', '#e0a03a');
  kenneyShip(scene, 'ship-furnace', 'kship_12', '#e05028');
  kenneyShip(scene, 'ship-gazer', 'kship_16', '#7a5ac8');
  kenneyShip(scene, 'ship-lancer', 'kship_22', '#3aa8e0');
  kenneyShip(scene, 'ship-ember', 'kship_23', '#ff8a3a');
  kenneyShip(scene, 'ship-cinder', 'kship_20', '#c8401a');
  // 박설희 전용기 — ansimuz 함선 마젠타 변형
  azSheetVariant(scene, 'az-ship-ps', 'az-ship', '#ff5ad8', 16, 24);
  // 어린지우 전용기 — 초록 변형
  azSheetVariant(scene, 'az-ship-jw', 'az-ship', '#63d97a', 16, 24);
  // 지우큰애비 전용기 — 황금빛 변형
  azSheetVariant(scene, 'az-ship-kb', 'az-ship', '#e0b060', 16, 24);
  // 미사일 탄 (박설희 시그니처)
  {
    const MISSILE_MAP = ['..w..', '.www.', '.ooo.', '.ooo.', 'gooog', 'gooog', '.fff.', '..f..'];
    const PAL: Record<string, string> = {
      w: '#f0f4ff',
      o: '#ff9a5a',
      g: '#9aa6b8',
      f: '#ffd23a',
    };
    addCanvasTexture(scene, 'b-missile', enhance(pixmap(MISSILE_MAP, PAL, 2)));
  }
  // 앵무새떼 + 초록 산 (어린지우 필살기)
  parrotTexture(scene, 'parrot-g', '#32d678', '#08704e', '#f05748');
  parrotTexture(scene, 'parrot-r', '#ff654b', '#a42638', '#4dc9ef');
  addCanvasTexture(scene, 'jw-mountains', jwMountains());

  // 뼈다귀 (지우큰애비 후방무기) — 벽에 튕기는 리코셰
  {
    const BONE_MAP = ['ww.......ww', 'wwwwwwwwwww', 'ww.......ww'];
    addCanvasTexture(scene, 'b-bone', enhance(pixmap(BONE_MAP, { w: '#f0ead8' }, 2)));
  }

  // 스테이지 기믹 텍스처 (M-기믹)
  {
    // 성운 안개 구름 — 부드러운 타원 라디얼
    const [c, ctx] = canvas(160, 90);
    const g2 = ctx.createRadialGradient(80, 45, 4, 80, 45, 78);
    g2.addColorStop(0, 'rgba(190,160,235,0.85)');
    g2.addColorStop(0.6, 'rgba(150,120,210,0.45)');
    g2.addColorStop(1, 'rgba(120,90,190,0)');
    ctx.save();
    ctx.scale(1, 0.56);
    ctx.translate(0, 35);
    ctx.fillStyle = g2;
    ctx.fillRect(0, -80, 160, 260);
    ctx.restore();
    addCanvasTexture(scene, 'fog-cloud', c);
  }
  {
    // 열 분출 기둥 — 아래가 진한 세로 그라디언트
    const [c, ctx] = canvas(36, 330);
    const g2 = ctx.createLinearGradient(0, 0, 0, 330);
    g2.addColorStop(0, 'rgba(255,220,120,0)');
    g2.addColorStop(0.25, 'rgba(255,170,60,0.55)');
    g2.addColorStop(0.8, 'rgba(255,110,30,0.95)');
    g2.addColorStop(1, 'rgba(255,235,160,1)');
    ctx.fillStyle = g2;
    ctx.fillRect(6, 0, 24, 330);
    ctx.fillStyle = 'rgba(255,140,40,0.5)';
    ctx.fillRect(0, 40, 36, 290);
    addCanvasTexture(scene, 'vent-pillar', c);
  }
  {
    // 태양풍 줄기
    const [c, ctx] = canvas(30, 3);
    const g2 = ctx.createLinearGradient(0, 0, 30, 0);
    g2.addColorStop(0, 'rgba(255,240,200,0)');
    g2.addColorStop(1, 'rgba(255,240,200,0.9)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 30, 3);
    addCanvasTexture(scene, 'wind-streak', c);
  }
  {
    // 열파 불꽃 구슬
    const [c, ctx] = canvas(26, 26);
    const g2 = ctx.createRadialGradient(13, 13, 1, 13, 13, 13);
    g2.addColorStop(0, 'rgba(255,240,180,1)');
    g2.addColorStop(0.5, 'rgba(255,150,50,0.85)');
    g2.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 26, 26);
    addCanvasTexture(scene, 'heat-flame', c);
  }
  {
    // Faceted ice shard with a bright, readable core.
    const [c, ctx] = canvas(30, 54);
    ctx.shadowColor = '#73e9ff';
    ctx.shadowBlur = 10;
    const g2 = ctx.createLinearGradient(4, 4, 26, 50);
    g2.addColorStop(0, '#efffff');
    g2.addColorStop(0.32, '#80eaff');
    g2.addColorStop(1, '#2355a8');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(15, 1);
    ctx.lineTo(27, 20);
    ctx.lineTo(19, 52);
    ctx.lineTo(4, 31);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(235,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 3);
    ctx.lineTo(14, 39);
    ctx.lineTo(5, 30);
    ctx.stroke();
    addCanvasTexture(scene, 'hazard-ice', c);
  }
  {
    // Molten volcanic ejecta: dark rock shell, emissive cracks and tail.
    const [c, ctx] = canvas(54, 74);
    const tail = ctx.createLinearGradient(27, 73, 27, 28);
    tail.addColorStop(0, 'rgba(255,70,15,0)');
    tail.addColorStop(0.55, 'rgba(255,94,20,0.5)');
    tail.addColorStop(1, 'rgba(255,220,95,0.95)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(15, 72);
    ctx.lineTo(22, 25);
    ctx.lineTo(34, 25);
    ctx.lineTo(40, 72);
    ctx.lineTo(28, 55);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#ff6b1f';
    ctx.shadowBlur = 14;
    const rock = ctx.createRadialGradient(23, 18, 2, 27, 24, 21);
    rock.addColorStop(0, '#fff09a');
    rock.addColorStop(0.35, '#ff7a21');
    rock.addColorStop(0.7, '#762514');
    rock.addColorStop(1, '#1c1115');
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.arc(27, 24, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd067';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 20);
    ctx.lineTo(25, 27);
    ctx.lineTo(21, 39);
    ctx.moveTo(31, 7);
    ctx.lineTo(29, 20);
    ctx.lineTo(42, 25);
    ctx.stroke();
    addCanvasTexture(scene, 'hazard-fireball', c);
  }
  {
    // Coolant pickup deliberately reads as an item, not another enemy bullet.
    const [c, ctx] = canvas(42, 54);
    ctx.shadowColor = '#52f4ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#062b48';
    ctx.fillRect(8, 10, 26, 37);
    ctx.fillStyle = '#9ff9ff';
    ctx.fillRect(12, 14, 18, 29);
    ctx.fillStyle = '#22a9dd';
    ctx.fillRect(17, 17, 8, 23);
    ctx.fillStyle = '#eaffff';
    ctx.fillRect(17, 3, 8, 9);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#efffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 10, 26, 37);
    ctx.beginPath();
    ctx.moveTo(13, 28);
    ctx.lineTo(29, 28);
    ctx.moveTo(21, 20);
    ctx.lineTo(21, 36);
    ctx.stroke();
    addCanvasTexture(scene, 'coolant-item', c);
  }
  {
    // Long solar prominence used as a side-on contact hazard.
    const [c, ctx] = canvas(190, 86);
    const g2 = ctx.createLinearGradient(0, 43, 190, 43);
    g2.addColorStop(0, 'rgba(255,246,165,0.98)');
    g2.addColorStop(0.35, 'rgba(255,135,35,0.92)');
    g2.addColorStop(0.75, 'rgba(255,45,55,0.62)');
    g2.addColorStop(1, 'rgba(255,25,70,0)');
    ctx.shadowColor = '#ff4a32';
    ctx.shadowBlur = 18;
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.bezierCurveTo(48, 1, 71, 32, 104, 13);
    ctx.bezierCurveTo(135, -5, 151, 31, 190, 39);
    ctx.bezierCurveTo(145, 51, 133, 85, 95, 67);
    ctx.bezierCurveTo(52, 46, 31, 83, 0, 68);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,245,190,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(5, 39);
    ctx.bezierCurveTo(55, 20, 105, 57, 177, 38);
    ctx.stroke();
    addCanvasTexture(scene, 'hazard-prominence', c);
  }
  {
    // Electric storm strike, wide enough to remain visible under bloom.
    const [c, ctx] = canvas(46, 230);
    ctx.shadowColor = '#91eaff';
    ctx.shadowBlur = 13;
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(31, 48);
    ctx.lineTo(15, 82);
    ctx.lineTo(29, 125);
    ctx.lineTo(12, 166);
    ctx.lineTo(26, 230);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#4ecbff';
    ctx.lineWidth = 2;
    ctx.stroke();
    addCanvasTexture(scene, 'hazard-lightning', c);
  }

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

  // 오브 P(파워)/S(슈퍼)/R(후방무기) — 함선과 같은 픽셀 밀도의 플랫 셰이딩 (2px 그리드)
  for (const [key, pal, letter, dark] of [
    ['orb-P', { O: '#04300f', A: '#2fae4a', B: '#59e659', H: '#d8ffd8' }, 'P', '#043012'],
    ['orb-S', { O: '#2a1048', A: '#7a4ac8', B: '#b48aff', H: '#eadcff' }, 'S', '#2a1048'],
    ['orb-R', { O: '#48260a', A: '#c8742a', B: '#ffb347', H: '#ffe8c8' }, 'R', '#48260a'],
    ['orb-W', { O: '#083038', A: '#2a92a8', B: '#5ad8e8', H: '#d8f8ff' }, 'W', '#083038'],
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
  {
    const [c, ctx] = canvas(48, 48);
    const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    addCanvasTexture(scene, 'impact-core', c);
  }
  {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 20, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvasTexture(scene, 'impact-ring', c);
  }
  {
    const [c, ctx] = canvas(32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    addCanvasTexture(scene, 'trail-soft', c);
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

  // 테마별 배경 그라디언트 언더레이 — 스테이지 색 정체성 (피드백: 배경 균일함)
  const grads: Record<string, [string, string, string]> = {
    nebula: ['#0a0618', '#120c2c', '#0a0618'],
    protostar: ['#160a06', '#2c1408', '#120806'],
    mainseq: ['#12100a', '#2a220c', '#141008'],
    asteroids: ['#0a0a0e', '#181820', '#0a0a0e'],
    redgiant: ['#1a0606', '#340c08', '#160404'],
    supernova: ['#140820', '#301238', '#180a24'],
    blackhole: ['#040408', '#0c0818', '#020204'],
    inside: ['#160a24', '#0a241c', '#1e0a1e'],
  };
  for (const [theme, cols] of Object.entries(grads)) {
    const [c, ctx] = canvas(GAME_WIDTH, GAME_HEIGHT);
    const g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.5, cols[1]);
    g.addColorStop(1, cols[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    addCanvasTexture(scene, `bg-grad-${theme}`, c);
  }

  /* ---------- 대형 지형 구조물 (티리안식 흘러가는 지물) ---------- */
  const snap2 = (v: number) => Math.round(v / 2) * 2;
  const bigRock = (key: string, base: string, mid: string, hi: string, crack?: string) => {
    const [c, ctx] = canvas(96, 96);
    const cx = 48;
    const cy = 48;
    const r = 38;
    const verts: [number, number][] = [];
    const n = 11;
    const seed = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = seed + (i / n) * Math.PI * 2;
      const rr = r * (0.72 + Math.random() * 0.4);
      verts.push([snap2(cx + Math.cos(a) * rr), snap2(cy + Math.sin(a) * rr)]);
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
    ctx.fillStyle = '#0a0a12';
    poly(3, 4, 1);
    ctx.fill();
    ctx.fillStyle = base;
    poly(0, 0, 1);
    ctx.fill();
    ctx.fillStyle = mid;
    poly(-r * 0.1, -r * 0.14, 0.74);
    ctx.fill();
    ctx.fillStyle = hi;
    poly(-r * 0.18, -r * 0.24, 0.42);
    ctx.fill();
    for (let k = 0; k < 4; k++) {
      const ca = Math.random() * 6.28;
      const cd = r * 0.5 * Math.random();
      ctx.fillStyle = 'rgba(10,8,14,0.5)';
      ctx.beginPath();
      ctx.arc(snap2(cx + Math.cos(ca) * cd), snap2(cy + Math.sin(ca) * cd), 4 + r * 0.12, 0, 7);
      ctx.fill();
    }
    if (crack) {
      ctx.strokeStyle = crack;
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const a0 = Math.random() * 6.28;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * r * 0.2, cy + Math.sin(a0) * r * 0.2);
        ctx.lineTo(cx + Math.cos(a0 + 0.5) * r * 0.6, cy + Math.sin(a0 + 0.5) * r * 0.6);
        ctx.lineTo(cx + Math.cos(a0 + 0.3) * r * 0.9, cy + Math.sin(a0 + 0.3) * r * 0.9);
        ctx.stroke();
      }
    }
    addCanvasTexture(scene, key, c);
  };
  bigRock('prop-rock', '#584a40', '#7a685a', '#948270');
  bigRock('prop-emberrock', '#4a2018', '#7a3020', '#a84828', '#ff8a3a');
  {
    // 수정 성단 (성운 테마)
    const [c, ctx] = canvas(90, 100);
    const crystal = (cx: number, cy: number, w2: number, h2: number, rot: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = '#1a3a4a';
      ctx.beginPath();
      ctx.moveTo(0, -h2);
      ctx.lineTo(w2, 0);
      ctx.lineTo(0, h2);
      ctx.lineTo(-w2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a8a9a';
      ctx.beginPath();
      ctx.moveTo(0, -h2);
      ctx.lineTo(w2 * 0.6, -h2 * 0.1);
      ctx.lineTo(0, h2 * 0.6);
      ctx.lineTo(-w2 * 0.6, -h2 * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8ae8e8';
      ctx.fillRect(-2, -h2 + 4, 3, h2 * 0.8);
      ctx.restore();
    };
    crystal(45, 55, 14, 42, 0);
    crystal(24, 62, 10, 28, -0.5);
    crystal(66, 64, 9, 26, 0.45);
    crystal(38, 74, 7, 18, -0.2);
    addCanvasTexture(scene, 'prop-crystal', c);
  }
  {
    // 난파선 잔해 (블랙홀 테마)
    const rows = [
      '....OOOOOO..........',
      '..OOhhhhhhOO...OOO..',
      '.OhhHHHHhhhhO.OhhhO.',
      'OhhHHwwHHhhhhOhhhhhO',
      'OhhHwwwwHhhhhhhhhhhO',
      '.OhhHHHHhhhOOOhhhhO.',
      '..OOhhhhOO...OOhhO..',
      '....OOOO.......OO...',
      '.......O..O.........',
      '......OhOOhO........',
      '......OOOOOO........',
    ];
    const pal = { O: '#0c0c14', h: '#3a3a4a', H: '#5a5a70', w: '#8a93b0' };
    addCanvasTexture(scene, 'prop-derelict', enhance(pixmap(rows, pal, 4)));
  }
  // 마지막에 등록해 기존 라이브 키는 개선본으로 교체하고 신규 FX 계약은 한곳에서 보장한다.
  productionFxTextures(scene);
}
