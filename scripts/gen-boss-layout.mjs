// 보스 파트 레이아웃 생성기 — src/data/bosses.json 의 parts/stages/presentation/entryY 를 재작성한다.
//
// 왜 생성기인가: 파트 좌표를 손으로 적으면 선체 밖으로 새어나가 "맞출 수 없는 파트"가 생긴다
// (실제로 그렇게 됐다). 여기서는 파트를 **본체 일러스트의 크롭 사각형**으로만 정의하고,
// 화면 좌표·히트박스·표시 크기를 전부 그 사각형에서 유도한다. 어긋날 수가 없다.
//
// 실행: node scripts/gen-boss-layout.mjs [--check]
//   --check 를 주면 파일을 쓰지 않고 검증 표만 출력한다.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOSSES = resolve(ROOT, 'src/data/bosses.json');

const GAME_WIDTH = 360;

/** 스테이지 게이트 파트를 올려놓을 화면 Y — 플레이어 사거리의 한가운데. */
const FOCUS_Y = 210;
/** 선체 중심이 내려올 수 있는 하한. 더 내려가면 플레이어와 본체가 겹친다. */
const MAX_HULL_Y = 340;
/** 게이트 파트가 반드시 들어와야 하는 화면 세로 범위. */
const SAFE_Y = [56, 470];
/** 파트가 화면 가장자리에서 최소한 남겨야 하는 여백. */
const EDGE_MARGIN = 4;
/** 좌우 이동 폭이 이보다 좁으면 보스가 얼어붙은 것처럼 보인다. */
const MIN_SWAY = 10;

/**
 * 함선이 좌우로 흔들려도 모든 파트가 화면 안에 남는 최대 진폭.
 * GameScene.warshipSwayLimit() 과 같은 공식이어야 한다.
 */
function swayLimit(parts) {
  return parts.reduce(
    (limit, p) =>
      Math.min(limit, GAME_WIDTH / 2 - EDGE_MARGIN - Math.abs(p.dx) - p.hitbox.w / 2),
    Infinity,
  );
}

const hp = (base, perWave) => ({ base, perWave });

/**
 * 파트 정의 축약형:
 *   [id, [cropX, cropY, cropW, cropH], role, [hpBase, hpPerWave], score, extra?]
 * crop 은 원본 일러스트 픽셀 좌표. 그 외 좌표는 전부 여기서 계산한다.
 */
const SPECS = {
  amoeba: {
    art: [576, 860],
    display: [432, 645],
    kind: 'scrolling-warship',
    movementScript: 'wing-sweep',
    parts: [
      ['driveL', [188, 742, 92, 118], 'engine', [46, 4], 420],
      ['driveR', [296, 742, 92, 118], 'engine', [46, 4], 420],
      ['wingPortL', [118, 648, 108, 98], 'turret', [38, 3], 260, { fire: 3.2, phase: fan(3) }],
      ['wingPortR', [350, 648, 108, 98], 'turret', [38, 3], 260, { fire: 3.2, phase: fan(3) }],
      ['reactor', [240, 528, 96, 100], 'weakpoint', [52, 4], 520, { dmgMul: 1.4 }],
      ['batteryL', [163, 352, 98, 94], 'turret', [26, 2], 160, { fire: 2.9, phase: aimed() }],
      ['batteryR', [315, 352, 98, 94], 'turret', [26, 2], 160, { fire: 2.9, phase: aimed() }],
      ['bridge', [228, 238, 120, 116], 'armor', [44, 3], 380],
      ['prow', [232, 14, 112, 150], 'structure', [22, 1], 120],
    ],
    stages: [
      ['engine-deck', ['driveL', 'driveR'], 1],
      ['wing-batteries', ['wingPortL', 'wingPortR'], 1.05],
      ['reactor-breach', ['reactor'], 1.12],
      ['bridge-assault', ['bridge'], 1.2],
    ],
  },

  protocore: {
    art: [652, 940],
    display: [489, 705],
    kind: 'scrolling-warship',
    movementScript: 'carrier-broadside',
    parts: [
      ['driveL', [210, 752, 105, 188], 'engine', [50, 4], 440],
      ['driveR', [337, 752, 105, 188], 'engine', [50, 4], 440],
      ['gunDeckL', [190, 528, 100, 100], 'turret', [40, 3], 270, { fire: 3.0, phase: fan(4) }],
      ['gunDeckR', [362, 528, 100, 100], 'turret', [40, 3], 270, { fire: 3.0, phase: fan(4) }],
      ['reactor', [278, 430, 96, 100], 'weakpoint', [56, 4], 540, { dmgMul: 1.4 }],
      ['hangarL', [125, 300, 120, 270], 'armor', [34, 3], 300, { spawn: 'e2' }],
      ['hangarR', [407, 300, 120, 270], 'armor', [34, 3], 300, { spawn: 'e2' }],
      ['bridge', [268, 150, 116, 120], 'armor', [46, 3], 400],
      ['turretUL', [140, 162, 112, 112], 'turret', [28, 2], 170, { fire: 3.4, phase: aimed() }],
      ['turretUR', [400, 162, 112, 112], 'turret', [28, 2], 170, { fire: 3.4, phase: aimed() }],
      ['prow', [248, 8, 156, 140], 'structure', [24, 1], 130],
    ],
    stages: [
      ['engine-deck', ['driveL', 'driveR'], 1],
      ['gun-deck', ['gunDeckL', 'gunDeckR'], 1.05],
      ['hangar-core', ['reactor'], 1.12],
      ['bridge-assault', ['bridge'], 1.2],
    ],
  },

  helios: {
    art: [636, 920],
    display: [477, 690],
    kind: 'scrolling-warship',
    movementScript: 'solar-lance',
    parts: [
      ['driveL', [212, 768, 92, 152], 'engine', [48, 4], 430],
      ['driveR', [332, 768, 92, 152], 'engine', [48, 4], 430],
      ['wingL', [115, 495, 100, 100], 'turret', [38, 3], 265, { fire: 3.1, phase: fan(3) }],
      ['wingR', [421, 495, 100, 100], 'turret', [38, 3], 265, { fire: 3.1, phase: fan(3) }],
      ['lanceCore', [272, 552, 92, 92], 'weakpoint', [54, 4], 530, { dmgMul: 1.45 }],
      ['lance', [272, 268, 92, 180], 'armor', [40, 3], 320],
      ['ringL', [130, 130, 110, 300], 'shield', [44, 3], 380, { fire: 2.6, phase: aimed(true) }],
      ['ringR', [396, 130, 110, 300], 'shield', [44, 3], 380, { fire: 2.6, phase: aimed(true) }],
      ['prow', [268, 8, 100, 175], 'structure', [22, 1], 120],
    ],
    // lanceCore 가 wing 보다 아래에 있으므로 아래→위 순서상 먼저 온다.
    stages: [
      ['engine-deck', ['driveL', 'driveR'], 1],
      ['lance-core', ['lanceCore'], 1.06],
      ['solar-wings', ['wingL', 'wingR'], 1.14],
      ['aegis-ring', ['ringL', 'ringR'], 1.22],
    ],
  },

  nova: {
    art: [700, 1020],
    display: [525, 765],
    kind: 'scrolling-warship',
    movementScript: 'fortress-assault',
    parts: [
      ['driveL', [150, 812, 172, 208], 'engine', [54, 5], 460],
      ['driveR', [378, 812, 172, 208], 'engine', [54, 5], 460],
      ['portL', [163, 718, 105, 105], 'turret', [42, 3], 280, { fire: 2.9, phase: fan(4) }],
      ['portR', [432, 718, 105, 105], 'turret', [42, 3], 280, { fire: 2.9, phase: fan(4) }],
      ['reactor', [292, 592, 120, 120], 'weakpoint', [60, 5], 560, { dmgMul: 1.4 }],
      ['bridge', [297, 250, 110, 150], 'armor', [48, 4], 420],
      ['turretUL', [150, 180, 112, 140], 'turret', [32, 2], 190, { fire: 3.2, phase: aimed(true) }],
      ['turretUR', [438, 180, 112, 140], 'turret', [32, 2], 190, { fire: 3.2, phase: aimed(true) }],
      // 함수 첨탑(아트 y≈80)은 765px 선체에서 사거리 위로 벗어난다 — 바로 아래 구획을 쓴다.
      ['foreSpire', [295, 120, 110, 150], 'structure', [26, 1], 140],
    ],
    stages: [
      ['engine-deck', ['driveL', 'driveR'], 1],
      ['spine-ports', ['portL', 'portR'], 1.06],
      ['fortress-reactor', ['reactor'], 1.14],
      ['bridge-assault', ['turretUL', 'turretUR'], 1.24],
    ],
  },

  crimson: {
    art: [684, 1520],
    display: [513, 1140],
    kind: 'scrolling-warship',
    movementScript: 'hull-crawl',
    parts: [
      // 추진 뱅크가 함폭 전체에 퍼져 있어 세 구획으로 나눠야 파괴 흔적이 제대로 읽힌다.
      ['driveL', [140, 1330, 145, 190], 'engine', [42, 3], 340],
      ['driveC', [287, 1340, 112, 180], 'engine', [42, 3], 340],
      ['driveR', [401, 1330, 145, 190], 'engine', [42, 3], 340],
      ['reactor', [292, 1128, 105, 105], 'weakpoint', [62, 5], 580, { dmgMul: 1.4 }],
      ['hullL', [195, 1015, 105, 105], 'armor', [40, 3], 290],
      ['hullR', [385, 1015, 105, 105], 'armor', [40, 3], 290],
      ['midTurretL', [200, 828, 105, 105], 'turret', [36, 3], 240, { fire: 2.8, phase: fan(4) }],
      ['midTurretR', [380, 828, 105, 105], 'turret', [36, 3], 240, { fire: 2.8, phase: fan(4) }],
      [
        'upperTurretL',
        [195, 538, 105, 105],
        'turret',
        [34, 3],
        220,
        { fire: 3.1, phase: aimed(true) },
      ],
      [
        'upperTurretR',
        [385, 538, 105, 105],
        'turret',
        [34, 3],
        220,
        { fire: 3.1, phase: aimed(true) },
      ],
      // 함교는 아트 상단(y≈340)에 있지만 1140px 선체에서는 사거리 밖으로 밀려난다.
      // 손이 닿는 척추 구획을 대신 표적으로 삼는다.
      ['commandSpine', [285, 690, 120, 120], 'structure', [30, 2], 200],
    ],
    stages: [
      ['engine-deck', ['driveL', 'driveC', 'driveR'], 1],
      ['reactor-breach', ['reactor'], 1.08],
      ['hull-crawl', ['midTurretL', 'midTurretR'], 1.16],
      ['bridge-assault', ['upperTurretL', 'upperTurretR'], 1.26],
    ],
  },

  // 살인달팽이는 눈 → 껍데기 순서가 기존 설계(사용자 확정)라 그대로 두고,
  // 크롭 아트로 바꾸면서 화면 밖으로 나가던 파트만 안으로 들인다.
  // 파트 전체 세로 폭이 화면 사거리에 맞아야 해서 확대는 1.12배까지만.
  // 확대 한계: 눈(머리 끝)과 심장(꼬리 끝)이 동시에 사거리에 들어와야 해서
  // 파트 세로 폭 + 배회 폭 <= 414px 이다. 원래 크기가 이미 그 한계다.
  snail: {
    art: [600, 900],
    display: [270, 405],
    kind: 'snail',
    movementScript: 'predator-drift',
    hullY: 266,
    entrySpd: 170,
    movement: { type: 'wander', speed: 22, minX: 150, maxX: 250, minY: 248, maxY: 288 },
    parts: [
      ['eyeL', [140, 0, 78, 82], 'shield', [40, 3], 360, { fire: 2.7, phase: aimed(true) }],
      ['eyeR', [348, 0, 78, 82], 'shield', [40, 3], 360, { fire: 2.7, phase: aimed(true) }],
      ['mouthGun', [240, 120, 120, 110], 'turret', [30, 2], 200, { fire: 2.4, phase: fan(5) }],
      ['shellTop', [205, 265, 180, 125], 'armor', [38, 3], 280],
      ['shellL', [88, 465, 120, 132], 'armor', [36, 3], 260],
      ['shellR', [392, 448, 120, 132], 'armor', [36, 3], 260],
      ['shellBottom', [198, 695, 150, 140], 'armor', [38, 3], 280],
      ['softHeart', [196, 798, 110, 100], 'weakpoint', [56, 4], 620, { dmgMul: 1.5 }],
    ],
    stages: [
      ['gaze', ['eyeL', 'eyeR'], 1],
      ['shell-break', ['shellTop', 'shellL', 'shellR', 'shellBottom'], 1.12],
      ['soft-heart', ['softHeart'], 1.24],
    ],
  },
};

function fan(count) {
  return { type: 'fan', count, angleStep: 0.28, speed: 128 };
}
function aimed(big = false) {
  return { type: 'aimed', speed: big ? 170 : 150, offsetX: 0, big };
}

/** 스테이지 게이트 파트를 FOCUS_Y 에 올려놓는 선체 중심 Y. */
function hullYForStage(parts, gateIds) {
  const gates = gateIds.map((id) => parts.find((p) => p.id === id)).filter(Boolean);
  const avgDy = gates.reduce((s, p) => s + p.dy, 0) / gates.length;
  return Math.min(MAX_HULL_Y, Math.round(FOCUS_Y - avgDy));
}

function buildBoss(spec) {
  const [artW, artH] = spec.art;
  const [dispW, dispH] = spec.display;
  const sx = dispW / artW;
  const sy = dispH / artH;

  const parts = spec.parts.map(([id, crop, role, [hpBase, hpPerWave], score, extra = {}]) => {
    const [cx, cy, cw, ch] = crop;
    const part = {
      id,
      sprite: spec.sprite,
      crop: { x: cx, y: cy, w: cw, h: ch },
      dx: round1((cx + cw / 2 - artW / 2) * sx),
      dy: round1((cy + ch / 2 - artH / 2) * sy),
      role,
      hp: hp(hpBase, hpPerWave),
      // 히트박스는 크롭 그대로. 파트가 화면에서 차지하는 넓이와 판정이 항상 일치한다.
      hitbox: { w: round1(cw * sx), h: round1(ch * sy) },
      shield: false,
      destroyScore: score,
    };
    if (extra.dmgMul) part.damageMultiplier = extra.dmgMul;
    if (extra.phase) part.phase = extra.phase;
    if (extra.fire) part.fireEvery = extra.fire;
    return part;
  });

  // 아래(dy 큰 쪽)부터 위로 파괴되도록, 각 스테이지 게이트가 이전 스테이지 게이트를 전제로 한다.
  const stages = spec.stages.map(([id, gate], i) => ({
    id,
    coreTargetable: i === spec.stages.length - 1,
    advanceWhenDestroyed: gate,
    coolScale: spec.stages[i][2],
  }));

  const gateOf = new Map();
  stages.forEach((s, i) => s.advanceWhenDestroyed.forEach((id) => gateOf.set(id, i)));

  // 게이트가 아닌 파트는 자기 높이에 가장 가까운 스테이지에 붙인다.
  for (const part of parts) {
    if (gateOf.has(part.id)) continue;
    let best = 0;
    let bestGap = Infinity;
    stages.forEach((s, i) => {
      const gy = hullYForStage(parts, s.advanceWhenDestroyed);
      const gap = Math.abs(gy + part.dy - FOCUS_Y);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    gateOf.set(part.id, best);
  }

  // 이전 스테이지 게이트가 전부 죽어야 노출된다 — 아래에서 위로 강제.
  // 코어를 막는 건 스테이지 게이트뿐이다. 게이트가 아닌 파트는 보너스 표적이라
  // 남겨둬도 진행이 막히지 않는다(예전엔 이것 때문에 진행 불능이 생겼다).
  for (const part of parts) {
    const stageIndex = gateOf.get(part.id) ?? 0;
    if (stageIndex > 0) part.exposedBy = stages[stageIndex - 1].advanceWhenDestroyed.slice();
    if (stages[stageIndex].advanceWhenDestroyed.includes(part.id)) {
      part.shield = true;
      part.protects = ['core'];
    }
  }

  // 파트 체력 합이 본체 체력을 넘지 않도록 비율을 유지한 채 정규화한다.
  // (손으로 적으면 보스마다 예산이 새서, 파트만 부수다 끝나는 전투가 된다)
  if (spec.bossHp) {
    const budget = [spec.bossHp.base * 1.05, spec.bossHp.perWave * 1.6];
    const totals = [
      parts.reduce((s, p) => s + p.hp.base, 0),
      parts.reduce((s, p) => s + p.hp.perWave, 0),
    ];
    const k = Math.min(1, budget[0] / totals[0], budget[1] / totals[1]);
    if (k < 1)
      for (const part of parts) {
        part.hp.base = Math.max(6, Math.round(part.hp.base * k));
        part.hp.perWave = Math.max(1, Math.round(part.hp.perWave * k * 10) / 10);
      }
  }

  const hullYs = stages.map((s) => hullYForStage(parts, s.advanceWhenDestroyed));

  return {
    parts,
    stages,
    hullYs,
    entryY: spec.hullY ?? hullYs[0],
    presentation: {
      kind: spec.kind,
      displayWidth: dispW,
      displayHeight: dispH,
      artWidth: artW,
      artHeight: artH,
      movementScript: spec.movementScript,
    },
    gateOf,
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

function validate(bossId, built, spec) {
  const problems = [];
  const rows = [];
  // 선체는 스테이지가 넘어갈 때마다 아래로 전진해야 한다. 뒤로 물러나면 연출이 깨진다.
  if (!spec.hullY)
    for (let i = 1; i < built.hullYs.length; i++)
      if (built.hullYs[i] <= built.hullYs[i - 1])
        problems.push(
          `${bossId}: 선체가 st${i - 1}(${built.hullYs[i - 1]}) → st${i}(${built.hullYs[i]}) 로 전진하지 않음`,
        );
  const sway = swayLimit(built.parts);
  if (sway < MIN_SWAY)
    problems.push(`${bossId}: 좌우 이동 여유가 ${sway.toFixed(0)}px 뿐 — 파트가 너무 바깥이다`);
  built.sway = sway;

  // 제자리에서 배회하는 보스는 배회 대역의 위·아래 끝에서도 파트가 사거리에 남아야 한다.
  const wander = spec.movement?.type === 'wander' ? spec.movement : null;

  for (const part of built.parts) {
    const stageIndex = built.gateOf.get(part.id) ?? 0;
    const hullY = spec.hullY ?? built.hullYs[stageIndex];
    if (wander) {
      const top = wander.minY + part.dy - part.hitbox.h / 2;
      const low = wander.maxY + part.dy + part.hitbox.h / 2;
      if (top < 0) problems.push(`${bossId}.${part.id}: 배회 상단에서 화면 위로 ${(-top).toFixed(0)}px 초과`);
      if (low > 640)
        problems.push(`${bossId}.${part.id}: 배회 하단에서 화면 아래로 ${(low - 640).toFixed(0)}px 초과`);
    }
    const y = hullY + part.dy;
    const bottom = y + part.hitbox.h / 2;
    const left = GAME_WIDTH / 2 - sway + part.dx - part.hitbox.w / 2;
    const right = GAME_WIDTH / 2 + sway + part.dx + part.hitbox.w / 2;
    const isGate = built.stages[stageIndex].advanceWhenDestroyed.includes(part.id);

    const flags = [];
    if (isGate && (y < SAFE_Y[0] || y > SAFE_Y[1])) flags.push(`게이트Y=${y.toFixed(0)}`);
    if (left < 0) flags.push(`좌초과 ${left.toFixed(0)}`);
    if (right > GAME_WIDTH) flags.push(`우초과 ${(right - GAME_WIDTH).toFixed(0)}`);
    if (isGate && bottom < 0) flags.push('완전화면밖');
    if (flags.length) problems.push(`${bossId}.${part.id}: ${flags.join(', ')}`);

    rows.push(
      `    ${isGate ? '◆' : ' '} ${part.id.padEnd(13)} st${stageIndex} ` +
        `dy=${String(part.dy).padStart(7)} y=${y.toFixed(0).padStart(4)} ` +
        `x=${left.toFixed(0).padStart(4)}~${right.toFixed(0).padStart(3)} ` +
        `${part.role.padEnd(10)}${flags.length ? '  ⚠ ' + flags.join(', ') : ''}`,
    );
  }
  return { problems, rows };
}

const check = process.argv.includes('--check');
const data = JSON.parse(readFileSync(BOSSES, 'utf8'));
const allProblems = [];

for (const [bossId, spec] of Object.entries(SPECS)) {
  const boss = data.bosses[bossId];
  if (!boss) {
    allProblems.push(`${bossId}: bosses.json 에 없음`);
    continue;
  }
  spec.sprite = boss.sprite;
  spec.bossHp = boss.hp;
  const built = buildBoss(spec);
  const { problems, rows } = validate(bossId, built, spec);
  allProblems.push(...problems);

  console.log(
    `\n${bossId}  (${boss.sprite})  아트 ${spec.art.join('x')} → 표시 ${spec.display.join('x')}` +
      `   선체Y: ${built.hullYs.join(' → ')}   좌우여유 ±${built.sway.toFixed(0)}`,
  );
  console.log(rows.join('\n'));

  boss.parts = built.parts;
  boss.stages = built.stages;
  boss.presentation = built.presentation;
  boss.entryY = built.entryY;
  // 선체 전체를 화면 위에서 흘려보내며 등장하므로 이동 거리가 길다 — 등장 속도를 올린다.
  boss.entrySpd = spec.entrySpd ?? 150;
  if (spec.movement) boss.movement = spec.movement;
  boss.envelope = { w: spec.display[0], h: spec.display[1] };
  boss.layoutVersion = 2;
}

if (allProblems.length) {
  console.error('\n검증 실패:');
  for (const p of allProblems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log('\n검증 통과 — 모든 게이트 파트가 사거리 안에 있음.');

if (!check) {
  writeFileSync(BOSSES, JSON.stringify(data, null, 2) + '\n');
  console.log(`기록: ${BOSSES}`);
}
