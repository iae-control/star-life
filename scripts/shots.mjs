#!/usr/bin/env node
// 주요 장면 스크린샷 캡처 (타이틀/전투/보스/슈퍼/상점) — 비주얼 리뷰·스토어 자료용.
// 사용: node scripts/shots.mjs <outDir> [url]
import puppeteer from 'puppeteer';

const outDir = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:5173';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });

async function stepUntil(cond, maxSteps = 20000) {
  return page.evaluate(
    (condSrc, max) => {
      const g = window.__game;
      const fn = new Function('sc', 'g', `return (${condSrc})`);
      let t = g.loop.now;
      let steps = 0;
      while (steps < max) {
        t += 1000 / 60;
        g.loop.step(t);
        steps++;
        const sc = g.scene.getScene('Game');
        if (fn(sc, g)) return { steps, ok: true };
      }
      return { steps, ok: false };
    },
    cond,
    maxSteps,
  );
}

// 타이틀
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene?.isActive?.('Title'), { timeout: 20000 });
await page.evaluate(() => {
  const g = window.__game;
  let t = g.loop.now;
  for (let i = 0; i < 90; i++) {
    t += 1000 / 60;
    g.loop.step(t);
  }
});
await page.screenshot({ path: `${outDir}/shot-title.png` });

// 전투 (auto)
await page.goto(`${base}/?scene=Game&auto=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene?.isActive?.('Game'), { timeout: 20000 });
await stepUntil('sc.enemies.length >= 3 && sc.bullets.length >= 3');
await page.screenshot({ path: `${outDir}/shot-combat.png` });

// 슈퍼 (말풍선 구간 — auto 봇이 20초에 발동하므로 보스보다 먼저 온다)
const sup = await stepUntil('sc.sp && sc.sp.t > 0.35 && sc.sp.t < 1.6', 40000);
if (sup.ok) await page.screenshot({ path: `${outDir}/shot-super.png` });

// 보스 (슈퍼 활성 여부와 무관하게 진입 완료 시점에 촬영)
const boss = await stepUntil('sc.boss && sc.boss.y > 100', 40000);
if (boss.ok) await page.screenshot({ path: `${outDir}/shot-boss.png` });

// 상점
await stepUntil('g.scene.isActive("Shop")', 60000);
await page.screenshot({ path: `${outDir}/shot-shop.png` });

console.log('done:', outDir);
await browser.close();
