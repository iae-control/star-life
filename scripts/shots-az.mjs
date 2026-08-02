#!/usr/bin/env node
// ansimuz 에셋 통합 확인 샷: 타이틀(양 조종사) / L1·L2·L5·L6 전투 / 폭발 프레임
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

const setPilot = (pilot) =>
  page.evaluate((p) => {
    const raw = localStorage.getItem('starlife.save.v1');
    const s = raw
      ? JSON.parse(raw)
      : {
          v: 1,
          best: 0,
          endlessBest: 0,
          settings: { lang: 'ko', muted: false, difficulty: 'normal' },
          progress: { unlockedLevel: 1, endlessUnlocked: false },
        };
    s.settings.pilot = p;
    localStorage.setItem('starlife.save.v1', JSON.stringify(s));
  }, pilot);

// 타이틀 — 정지우 / 박설희
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await setPilot('jungjioo');
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(40);
await page.screenshot({ path: `${outDir}/az-title.png` });
await setPilot('parksulhee');
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(40);
await page.screenshot({ path: `${outDir}/az-title-ps.png` });
await setPilot('jungjioo');

// 레벨 전투 — 적 등장 + 폭발 순간
for (const lv of [1, 2, 5, 6]) {
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
  await stepUntil('sc.enemies.length >= 3');
  await step(50);
  await page.screenshot({ path: `${outDir}/az-l${lv}.png` });
  if (lv === 1) {
    await stepUntil('sc.booms.length > 0');
    await step(4);
    await page.screenshot({ path: `${outDir}/az-boom.png` });
  }
}

// 박설희 인게임
await setPilot('parksulhee');
await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
await waitBoot('Game');
await stepUntil('sc.enemies.length >= 2');
await step(40);
await page.screenshot({ path: `${outDir}/az-ps-game.png` });

console.log('done');
await browser.close();
