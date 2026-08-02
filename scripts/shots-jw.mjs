#!/usr/bin/env node
// 어린지우 필살기 검증 샷: 말풍선 / 앵무새떼 절정 / 종료 복귀
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

// 어린지우 저장 + 타이틀 확인
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await page.evaluate(() => {
  const raw = localStorage.getItem('starlife.save.v1');
  const s = raw ? JSON.parse(raw) : null;
  if (s) {
    s.settings.pilot = 'youngjioo';
    localStorage.setItem('starlife.save.v1', JSON.stringify(s));
  } else {
    localStorage.setItem(
      'starlife.save.v1',
      JSON.stringify({
        v: 1,
        best: 0,
        endlessBest: 0,
        settings: {
          lang: 'ko',
          muted: false,
          difficulty: 'normal',
          musicVol: 0.8,
          sfxVol: 0.9,
          vibration: true,
          pilot: 'youngjioo',
        },
        progress: { unlockedLevel: 1, endlessUnlocked: false, tutorialDone: true },
      }),
    );
  }
});
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(40);
await page.screenshot({ path: `${outDir}/jw-title.png` });

// 인게임 필살기
await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
await waitBoot('Game');
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.touchOn = true;
  sc.touchTx = 180;
  sc.touchTy = 520;
});
await stepUntil('sc.enemies.length >= 4');
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.superN = 2;
  sc.startSuper();
});
await step(30); // t≈0.5 말풍선
await page.screenshot({ path: `${outDir}/jw-bubble.png` });
await step(80); // t≈1.8 떼 절정
await page.screenshot({ path: `${outDir}/jw-flock.png` });
await step(60); // t≈2.8 후반
await page.screenshot({ path: `${outDir}/jw-late.png` });
await stepUntil('!sc.jw', 1200);
await step(30);
await page.screenshot({ path: `${outDir}/jw-after.png` });
const state = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  return {
    jw: !!sc.jw,
    superN: sc.session.superN,
    enemies: sc.enemies.length,
    children: sc.children.length,
  };
});
console.log(JSON.stringify(state));
console.log('done');
await browser.close();
