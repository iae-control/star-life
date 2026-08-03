#!/usr/bin/env node
// 기믹 6종 + 아날로그 스틱 + 달팽이 눈 위치 검증 샷
import puppeteer from 'puppeteer';

const outDir = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:5173';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });

async function waitBoot(k) {
  for (let i = 0; i < 120; i++) {
    const ok = await page
      .evaluate((key) => !!window.__game?.scene?.isActive?.(key), k)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('boot timeout ' + k);
}
const step = (n) =>
  page.evaluate((f) => {
    const g = window.__game;
    let t = g.loop.now;
    for (let i = 0; i < f; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  }, n);
const stepUntil = (cond, max = 30000) =>
  page.evaluate(
    (c, m) => {
      const g = window.__game;
      const fn = new Function('sc', 'g', `return (${c})`);
      let t = g.loop.now;
      for (let i = 0; i < m; i++) {
        t += 1000 / 60;
        g.loop.step(t);
        const sc = g.scene.getScene('Game');
        if (fn(sc, g)) return true;
      }
      return false;
    },
    cond,
    max,
  );
const gotoLevel = async (lv) => {
  await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
  await waitBoot('Game');
  await page.evaluate((L) => {
    const g = window.__game;
    const sc = g.scene.getScene('Game');
    sc.session.level = L;
    sc.scene.restart({ session: sc.session });
    let t = g.loop.now;
    for (let i = 0; i < 10; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  }, lv);
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    sc.touchOn = true;
    sc.touchTx = 180;
    sc.touchTy = 520;
  });
};

// L1 안개 / L2 분출구 / L3 태양풍 / L4 열파 / L5 잔해
const conds = {
  1: 'sc.fogs.length >= 2 && sc.fogs.some(f => f.img.y > 100 && f.img.y < 400)',
  2: 'sc.vents.length > 0 && sc.vents[0].img',
  3: 'sc.windT > 2 && sc.sparks.length > 3',
  4: 'sc.heatwaves.length > 0 && sc.heatwaves[0].y < 500 && sc.heatwaves[0].y > 250',
  5: "sc.enemies.filter(e => e.type === 'sn_boulder' || e.type === 'sn_pebble').length >= 2",
};
for (const lv of [1, 2, 3, 4, 5]) {
  await gotoLevel(lv);
  const ok = await stepUntil(conds[lv], 60000);
  await step(3);
  await page.screenshot({ path: `${outDir}/gim-l${lv}.png` });
  console.log(`L${lv} gimmick: ${ok}`);
}

// L6: warp 역류 펄스 + 적탄 순환 상태
await gotoLevel(6);
const warpOk = await stepUntil('sc.scrollRev > 0.5', 80000);
await step(3);
await page.screenshot({ path: `${outDir}/gim-l6-warp.png` });
console.log(`L6 warp pulse: ${warpOk}`);

// L6 살인달팽이 — 두 눈이 모두 본체 밖에서 보이는지 + 실드 상태 점검
await gotoLevel(6);
await page.evaluate(() => {
  const g = window.__game;
  const sc = g.scene.getScene('Game');
  sc.session.levelWave = 99;
  sc.scene.restart({ session: sc.session });
  let t = g.loop.now;
  for (let i = 0; i < 10; i++) {
    t += 1000 / 60;
    g.loop.step(t);
  }
});
await stepUntil('sc.boss && sc.boss.entered');
await step(60);
const snail = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  const B = sc.boss;
  return {
    shielded: sc.coreShielded(B),
    parts: B.parts.map((p) => ({ id: p.def.id, dx: p.def.dx, dy: p.def.dy, alive: p.alive })),
  };
});
console.log('snail:', JSON.stringify(snail));
await page.screenshot({ path: `${outDir}/gim-snail.png` });

// 아메바/헬리오스 코어 실드 확인
for (const [lv, name] of [
  [1, 'amoeba'],
  [3, 'helios'],
]) {
  await gotoLevel(lv);
  await page.evaluate(() => {
    const g = window.__game;
    const sc = g.scene.getScene('Game');
    sc.session.levelWave = 99;
    sc.scene.restart({ session: sc.session });
    let t = g.loop.now;
    for (let i = 0; i < 10; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  });
  await stepUntil('sc.boss && sc.boss.entered');
  const shielded = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    return sc.coreShielded(sc.boss);
  });
  console.log(`${name} core shielded: ${shielded}`);
}

// 아날로그 스틱 — 잡은 상태 비주얼
await gotoLevel(1);
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.touchOn = false;
  sc.stickOn = true;
  sc.stickBaseX = 62;
  sc.stickBaseY = 566;
  sc.stickDx = 34;
  sc.stickDy = -18;
  sc.updateStickVisual();
});
await step(45);
await page.screenshot({ path: `${outDir}/gim-stick.png` });

console.log('done');
await browser.close();
