// 임시 에셋 절차 생성 — 전부 자체 제작(원작·Tyrian 무관), M3에서 정식 아트로 교체.
// 캔버스 2D로 그라디언트를 프리렌더해 WebGL 스프라이트로 쓴다(데모의 룩 유지 + 성능).
import Phaser from 'phaser';

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
  const w = rows[0]?.length ?? 0;
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

const PLAYER_MAP = [
  '.....WW.....',
  '....WGGW....',
  '....WGGW....',
  '...WCBBCW...',
  '...WCBBCW...',
  '..WCBBBBCW..',
  '.WCBBGGBBCW.',
  '.WCBBGGBBCW.',
  'WCCBBBBBBCCW',
  'WCBBCWWCBBCW',
  'WBBCW..WCBBW',
  'WBCW....WCBW',
  '.WW..EE..WW.',
  '.....EE.....',
];
const PLAYER_PAL = {
  W: '#e8f4ff',
  C: '#8fd3ff',
  B: '#2a6bd4',
  G: '#bff6ff',
  E: '#ffb347',
};

const E1_MAP = [
  '....WW....',
  '...WRRW...',
  '..WRPPRW..',
  '.WRPDDPRW.',
  'WRPDDDDPRW',
  'WRPDDDDPRW',
  '.WRPDDPRW.',
  '..WRPPRW..',
  '..WR..RW..',
  '.WR....RW.',
];
const E1_PAL = { W: '#ffd8d8', R: '#e64a4a', P: '#a82838', D: '#5e1420' };

const E2_MAP = [
  '..WWWWWWWW..',
  '.WPPLLLLPPW.',
  'WPLLGGGGLLPW',
  'WPLGGDDGGLPW',
  'WPLGDDDDGLPW',
  'WPLGDDDDGLPW',
  'WPLGGDDGGLPW',
  'WPLLGGGGLLPW',
  '.WPPLLLLPPW.',
  '..WWCWWCWW..',
  '...WC..CW...',
];
const E2_PAL = {
  W: '#e0d0ff',
  P: '#8a5ad4',
  L: '#5a3a9a',
  G: '#3a2468',
  D: '#1c1038',
  C: '#ffb347',
};

const E3_MAP = [
  '....WW....',
  '...WYYW...',
  '...WYYW...',
  '..WYOOYW..',
  '..WYOOYW..',
  '.WYOODOYW.',
  '.WYODDOYW.',
  'WYOD..DOYW',
  'WYW....WYW',
  'WW......WW',
];
const E3_PAL = { W: '#fff2c8', Y: '#ffd76a', O: '#e6862a', D: '#8a4a10' };

function tinted(rows: string[], scale: number, color: string, alpha: number): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
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

export function generateTextures(scene: Phaser.Scene): void {
  // 함선들 (임시 자체 도트)
  addCanvasTexture(scene, 'ship-player', pixmap(PLAYER_MAP, PLAYER_PAL, 2));
  addCanvasTexture(scene, 'ship-e1', pixmap(E1_MAP, E1_PAL, 2));
  addCanvasTexture(scene, 'ship-e2', pixmap(E2_MAP, E2_PAL, 2));
  addCanvasTexture(scene, 'ship-e3', pixmap(E3_MAP, E3_PAL, 2));
  // 환영 함선(Jungjioo 러시): 플레이어 실루엣 청백 틴트 (데모 ghost)
  addCanvasTexture(scene, 'ship-ghost', tinted(PLAYER_MAP, 2, 'rgb(150,225,255)', 0.88));

  // 플레이어 탄
  {
    const [c, ctx] = canvas(5, 16); // pulse
    const g = ctx.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(140,240,255,0)');
    g.addColorStop(0.5, '#bff6ff');
    g.addColorStop(1, '#4db8ff');
    ctx.fillStyle = g;
    ctx.fillRect(1, 0, 3, 16);
    addCanvasTexture(scene, 'b-pulse', c);
  }
  {
    const [c, ctx] = canvas(3, 12); // vulcan
    ctx.fillStyle = '#ffe28a';
    ctx.fillRect(0, 0, 3, 12);
    ctx.fillStyle = '#fff8d8';
    ctx.fillRect(0, 0, 3, 4);
    addCanvasTexture(scene, 'b-vulcan', c);
  }
  {
    const [c, ctx] = canvas(11, 11); // proton
    const g = ctx.createRadialGradient(4, 4, 0.5, 5.5, 5.5, 5.2);
    g.addColorStop(0, '#eaffea');
    g.addColorStop(0.5, '#59e659');
    g.addColorStop(1, '#0a7f2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(5.5, 5.5, 5, 0, 7);
    ctx.fill();
    addCanvasTexture(scene, 'b-proton', c);
  }
  {
    const [c, ctx] = canvas(12, 22); // light (지그재그 번개)
    ctx.strokeStyle = '#aef4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9, 21);
    ctx.lineTo(4, 14);
    ctx.lineTo(8, 8);
    ctx.lineTo(3, 1);
    ctx.stroke();
    ctx.fillStyle = '#e8ffff';
    ctx.fillRect(5, 10, 2, 2);
    addCanvasTexture(scene, 'b-light', c);
  }
  {
    const [c, ctx] = canvas(7, 29); // laser
    ctx.fillStyle = 'rgba(255,80,80,0.5)';
    ctx.fillRect(0, 0, 7, 29);
    const g = ctx.createLinearGradient(0, 0, 0, 29);
    g.addColorStop(0, 'rgba(255,120,120,0)');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, 'rgba(255,60,60,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(2, 0, 3, 29);
    addCanvasTexture(scene, 'b-laser', c);
  }

  // 적탄
  for (const [key, r, col] of [
    ['eb-small', 3.2, '#ff5a5a'],
    ['eb-big', 4.4, '#ffb347'],
  ] as const) {
    const s = Math.ceil(r * 2 + 2);
    const [c, ctx] = canvas(s, s);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, r, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(s / 2 - 1, s / 2 - 1, 2, 2);
    addCanvasTexture(scene, key, c);
  }

  // 오브 P/S
  for (const [key, cols, letter, dark] of [
    ['orb-P', ['#f0fff0', '#59e659', '#0a7f2a'], 'P', '#043012'],
    ['orb-S', ['#eef8ff', '#54b4ff', '#0a4f9f'], 'S', '#062248'],
  ] as const) {
    const [c, ctx] = canvas(16, 16);
    const g = ctx.createRadialGradient(6, 6, 1, 8, 8, 7.5);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.55, cols[1]);
    g.addColorStop(1, cols[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(8, 8, 7.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(letter, 8, 11.5);
    addCanvasTexture(scene, key, c);
  }
  {
    const [c, ctx] = canvas(48, 48); // 오브 글로우
    const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(200,255,220,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    addCanvasTexture(scene, 'orb-glow', c);
  }

  // 폭발 (radial 그라디언트, 스케일/알파는 런타임)
  {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,220,0.95)');
    g.addColorStop(0.35, 'rgba(255,170,50,0.8)');
    g.addColorStop(0.75, 'rgba(255,60,10,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvasTexture(scene, 'boom', c);
  }
  {
    const [c, ctx] = canvas(3, 3);
    ctx.fillStyle = '#ffc860';
    ctx.fillRect(0, 0, 3, 3);
    addCanvasTexture(scene, 'spark', c);
  }

  // 블랙홀: 코어 + 글로우 + 회전 아크
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

  // 배경 타일(360x672 패널 그리드 — TileSprite 세로 스크롤)
  {
    const TW = 30,
      TH = 28;
    const [c, ctx] = canvas(360, 672);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, 360, 672);
    for (let ty = 0; ty < 672 / TH; ty++) {
      for (let tx = 0; tx < 360 / TW; tx++) {
        const v = Math.random();
        const base = 8 + Math.floor(v * 14);
        ctx.fillStyle = `rgb(${base - 4},${base},${base + 10})`;
        ctx.fillRect(tx * TW + 1, ty * TH + 1, TW - 2, TH - 2);
        if (v > 0.82) {
          ctx.fillStyle = 'rgba(120,180,255,0.16)';
          ctx.fillRect(tx * TW + 4, ty * TH + 4, TW - 8, 2);
        }
        if (v < 0.1) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(tx * TW + (((v * 200) | 0) % (TW - 4)), ty * TH + 6, 2, 2);
        }
      }
    }
    addCanvasTexture(scene, 'bg-tiles', c);
  }

  // 플레이어 엔진 화염
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
  // 슈퍼 발동 중 플레이어 오라
  {
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(160,220,255,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvasTexture(scene, 'super-aura', c);
  }
}
