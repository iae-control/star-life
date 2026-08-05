#!/usr/bin/env node
// 파일럿 무기 특성화 + 지우큰애비(푸들 필살기) + 상점 개편 검증 샷
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
  page.evaluate((pp) => {
    const raw = localStorage.getItem('starlife.save.v1');
    const s = raw
      ? JSON.parse(raw)
      : {
          v: 1,
          best: 0,
          endlessBest: 0,
          settings: {
            lang: 'ko',
            muted: true,
            difficulty: 'normal',
            musicVol: 0.8,
            sfxVol: 0.9,
            vibration: false,
            pilot: pp,
          },
          progress: { unlockedLevel: 1, endlessUnlocked: false, tutorialDone: true },
        };
    s.settings.pilot = pp;
    localStorage.setItem('starlife.save.v1', JSON.stringify(s));
  }, pilot);
const startGame = async () => {
  await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
  await waitBoot('Game');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    sc.touchOn = true;
    sc.touchTx = 180;
    sc.touchTy = 520;
  });
};

await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');

// 타이틀: 지우큰애비 (황금 함선)
await setPilot('keunaebi');
await page.goto(base, { waitUntil: 'load' });
await waitBoot('Title');
await step(40);
await page.screenshot({ path: `${outDir}/pl-title-kb.png` });

// 지우큰애비 필살기: 말풍선 → 푸들 돌진
await startGame();
await stepUntil('sc.enemies.length >= 3');
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.superN = 2;
  sc.startSuper();
});
await step(35);
await page.screenshot({ path: `${outDir}/pl-kb-bubble.png` });
await step(45); // 첫 패스 중반
await page.screenshot({ path: `${outDir}/pl-kb-poodle.png` });
await stepUntil('!sc.kb', 1000);
const kbState = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  return { superN: sc.session.superN, cur: sc.session.cur, alive: sc.alive };
});
console.log('kb after:', JSON.stringify(kbState));

// 박설희: 미사일 + 스플래시
await setPilot('parksulhee');
await startGame();
await stepUntil('sc.enemies.length >= 3 && sc.bullets.length >= 1');
await step(4);
await page.screenshot({ path: `${outDir}/pl-missile.png` });
const msState = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  return { cur: sc.session.cur, splash: sc.bullets[0]?.splash ?? null };
});
console.log('missile:', JSON.stringify(msState));

// 어린지우: 프로톤 (동그란 탄) — P오브로 강화한 고레벨 패턴
await setPilot('youngjioo');
await startGame();
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.weapons[sc.session.cur] = 8;
});
await stepUntil('sc.bullets.length >= 5');
await page.screenshot({ path: `${outDir}/pl-proton.png` });

// 상점: FRONT 제거 + 무기 정보 패널
await page.evaluate(() => {
  const g = window.__game;
  const sc = g.scene.getScene('Game');
  sc.session.credits = 9000;
  sc.scene.start('Shop', { session: sc.session });
  let t = g.loop.now;
  for (let i = 0; i < 10; i++) {
    t += 1000 / 60;
    g.loop.step(t);
  }
});
await page.screenshot({ path: `${outDir}/pl-shop.png` });

console.log('done');
await browser.close();
