#!/usr/bin/env node
// 보스 레이아웃 실측: 보스를 강제 소환해 스테이지별로 파트의 실제 화면 좌표를 재고
// 스크린샷을 남긴다. "화면 밖이라 못 맞춘다"를 코드가 아닌 렌더 결과로 확인한다.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? '.';
const BOSS = process.argv[3] ?? 'amoeba';
const URL = 'http://localhost:5173/?scene=Game&auto=1';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene?.isActive?.('Game'), { timeout: 20000 });
await new Promise((r) => setTimeout(r, 600));

const step = (frames) =>
  page.evaluate((n) => {
    const g = window.__game;
    let t = g.loop.now;
    for (let i = 0; i < n; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  }, frames);

// 보스 강제 소환
await page.evaluate((bossId) => {
  const sc = window.__game.scene.getScene('Game');
  sc.clearField?.();
  sc.spawnQ = [];
  sc.level.boss = bossId;
  sc.session.endless = false;
  sc.spawnBoss();
}, BOSS);

const probe = () =>
  page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const B = sc.boss;
    if (!B) return null;
    return {
      stage: B.stage,
      entered: B.entered,
      hullY: Math.round(B.y),
      hullX: Math.round(B.x),
      stageId: B.def.stages?.[B.stage]?.id ?? '-',
      parts: B.parts.map((p) => ({
        id: p.def.id,
        alive: p.alive,
        x: Math.round(p.x),
        y: Math.round(p.y),
        w: p.def.hitbox.w,
        h: p.def.hitbox.h,
        visible: p.img.visible,
        // 이 파트를 지금 때릴 수 있는가 (런타임 판정 그대로)
        targetable: p.alive && sc.partActive(p, B) && sc.partExposed(p, B),
      })),
    };
  });

const CULL_Y = -30;
const report = [];
let shot = 0;

for (let round = 0; round < 6; round++) {
  await step(round === 0 ? 420 : 170);
  const s = await probe();
  if (!s) break;
  await page.screenshot({ path: `${OUT}/${BOSS}-${shot++}-st${s.stage}.png` });

  const targets = s.parts.filter((p) => p.targetable);
  const unreachable = targets.filter(
    (p) => p.y - p.h / 2 < CULL_Y || p.x - p.w / 2 < 0 || p.x + p.w / 2 > 360,
  );
  report.push(
    `st${s.stage} (${s.stageId})  선체=(${s.hullX},${s.hullY})  표적 ${targets.length}개` +
      `  ${targets.map((p) => `${p.id}@${p.x},${p.y}`).join(' ')}` +
      (unreachable.length ? `\n   ✗ 사거리 밖: ${unreachable.map((p) => p.id).join(', ')}` : ''),
  );

  // 현재 스테이지 게이트를 강제로 파괴해 다음 단계로 넘긴다
  const advanced = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    const B = sc.boss;
    if (!B) return false;
    const gate = B.def.stages?.[B.stage]?.advanceWhenDestroyed ?? [];
    let hit = false;
    for (const id of gate) {
      const part = B.parts.find((p) => p.def.id === id);
      if (part?.alive) {
        sc.damagePart(part, B, 99999);
        hit = true;
      }
    }
    return hit;
  });
  if (!advanced) break;
}

console.log(`\n=== ${BOSS} ===`);
console.log(report.join('\n'));
if (errors.length) console.log('\n에러:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
