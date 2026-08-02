#!/usr/bin/env node
// M3 캠페인 스크린샷: StageIntro + L1~L3 전투/보스 6장.
// 사용: node scripts/shots-m3.mjs <outDir> [url]
import puppeteer from 'puppeteer';

const outDir = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:5173';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });

async function waitBoot(sceneKey) {
  for (let i = 0; i < 120; i++) {
    const ok = await page
      .evaluate((k) => !!window.__game?.scene?.isActive?.(k), sceneKey)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`boot timeout: ${sceneKey}`);
}

const step = (frames) =>
  page.evaluate((n) => {
    const g = window.__game;
    let t = g.loop.now;
    for (let i = 0; i < n; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  }, frames);

const stepUntil = (cond, maxSteps = 30000) =>
  page.evaluate(
    (condSrc, max) => {
      const g = window.__game;
      const fn = new Function('sc', 'g', `return (${condSrc})`);
      let t = g.loop.now;
      for (let i = 0; i < max; i++) {
        t += 1000 / 60;
        g.loop.step(t);
        const sc = g.scene.getScene('Game');
        if (fn(sc, g)) return true;
      }
      return false;
    },
    cond,
    maxSteps,
  );

const jumpLevel = (level) =>
  page.evaluate((lv) => {
    const g = window.__game;
    const sc = g.scene.getScene('Game');
    sc.session.level = lv;
    sc.session.levelWave = 0;
    sc.session.campaignDone = false;
    sc.session.superN = 0; // 보스 캡처 때 슈퍼 연출이 화면을 덮지 않게
    sc.scene.restart({ session: sc.session });
    let t = g.loop.now;
    for (let i = 0; i < 10; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
  }, level);

// 타이틀 → 출격 → StageIntro 캡처
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(30);
await page.evaluate(() => {
  const g = window.__game;
  g.scene.getScene('Title').startGame();
});
await step(50);
await page.screenshot({ path: `${outDir}/m3-intro.png` });

// L1 전투 (auto 봇으로 전환 불가 — god만 켜고 수동 스텝, 적 등장 시점 캡처)
await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
await waitBoot('Game');
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.touchOn = true;
  sc.touchTx = 180;
  sc.touchTy = 500;
});
await stepUntil('sc && sc.enemies.length >= 4');
await step(30);
await page.screenshot({ path: `${outDir}/m3-l1-combat.png` });
await stepUntil('sc.boss && sc.boss.y > 90', 60000);
await step(40);
await page.screenshot({ path: `${outDir}/m3-l1-boss.png` });

// L2
await jumpLevel(2);
await stepUntil('sc && sc.enemies.length >= 3', 40000);
await step(30);
await page.screenshot({ path: `${outDir}/m3-l2-combat.png` });
await stepUntil('sc.boss && sc.boss.y > 90', 80000);
await step(40);
await page.screenshot({ path: `${outDir}/m3-l2-boss.png` });

// L3
await jumpLevel(3);
await stepUntil('sc && sc.enemies.length >= 3', 40000);
await step(30);
await page.screenshot({ path: `${outDir}/m3-l3-combat.png` });
await stepUntil('sc.boss && sc.boss.y > 90', 80000);
await step(40);
await page.screenshot({ path: `${outDir}/m3-l3-boss.png` });

console.log('done:', outDir);
await browser.close();
