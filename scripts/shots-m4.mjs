#!/usr/bin/env node
// M4 스크린샷: 타이틀 메뉴 / 상점 4섹션 / L4~L6 보스
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
const stepUntil = (cond, max = 60000) =>
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

// 타이틀 메뉴 (엔들리스 해금 상태 시뮬)
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await page.evaluate(() => {
  localStorage.setItem(
    'starlife.save.v1',
    JSON.stringify({
      v: 1,
      best: 189360,
      endlessBest: 0,
      settings: { lang: 'ko', muted: false, difficulty: 'normal' },
      progress: { unlockedLevel: 4, endlessUnlocked: true },
    }),
  );
});
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(40);
await page.screenshot({ path: `${outDir}/m4-title.png` });

// 상점 (자금 넉넉히 + 장비 일부 보유 상태)
await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
await waitBoot('Game');
await step(30);
await page.evaluate(() => {
  const g = window.__game;
  const sc = g.scene.getScene('Game');
  const s = sc.session;
  s.credits = 15000;
  s.weapons = { pulse: 3, vulcan: 1 };
  s.cur = 'vulcan';
  s.rear = 'tailgun';
  s.level = 3;
  sc.scene.start('Shop', { session: s });
  let t = g.loop.now;
  for (let i = 0; i < 10; i++) {
    t += 1000 / 60;
    g.loop.step(t);
  }
});
await page.screenshot({ path: `${outDir}/m4-shop.png` });

// L4~L6 보스
for (const [lv, name] of [
  [4, 'crimson'],
  [5, 'nova'],
  [6, 'singularity'],
]) {
  await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
  await waitBoot('Game');
  await page.evaluate((L) => {
    const g = window.__game;
    const sc = g.scene.getScene('Game');
    sc.session.level = L;
    sc.session.levelWave = 99;
    sc.session.superN = 0;
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
  await stepUntil('sc.boss && sc.boss.entered');
  await step(100);
  await page.screenshot({ path: `${outDir}/m4-l${lv}-${name}.png` });
}
console.log('done');
await browser.close();
