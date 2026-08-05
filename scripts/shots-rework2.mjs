#!/usr/bin/env node
// 푸들 단일돌진+스핀 / 뼈다귀 리코셰 / P·S·R·W 오브 검증
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
const boot = async (pilot) => {
  await page.goto(base, { waitUntil: 'load' });
  await waitBoot('Title');
  await page.evaluate((pp) => {
    localStorage.setItem(
      'starlife.save.v1',
      JSON.stringify({
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
      }),
    );
  }, pilot);
  await page.goto(`${base}/?scene=Game&god=1`, { waitUntil: 'load' });
  await waitBoot('Game');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Game');
    sc.touchOn = true;
    sc.touchTx = 180;
    sc.touchTy = 520;
  });
};

// 1) 푸들: 느린 초반(플레이어 근처) → 스핀 피날레
await boot('keunaebi');
await stepUntil('sc.enemies.length >= 3');
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.superN = 2;
  sc.startSuper();
});
await stepUntil("sc.kb && sc.kb.phase === 'flight' && sc.kb.img.visible && sc.kb.vy < 400");
await step(2);
await page.screenshot({ path: `${outDir}/rw-kb-slow.png` });
await stepUntil("sc.kb && sc.kb.phase === 'spin' && sc.kb.phaseT > 0.4");
await step(2);
await page.screenshot({ path: `${outDir}/rw-kb-spin.png` });
await stepUntil('!sc.kb', 1000);
console.log('kb single-pass done');

// 2) 뼈다귀 리코셰 (rearLv 5 — 속도·유지 풀강)
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.rear = 'bone';
  sc.session.rearLv = 5;
});
await stepUntil('sc.bones.length >= 3', 60000);
await step(30);
await page.screenshot({ path: `${outDir}/rw-bones.png` });
const boneState = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  return { bones: sc.bones.length, lives: sc.bones.map((b) => Math.round(b.life * 10) / 10) };
});
console.log('bones:', JSON.stringify(boneState));

// 3) 오브 3종 낙하 (P/R/S)
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  sc.session.orbCount = 0;
  sc.dropOrb(80, 200); // 1 → P
  sc.dropOrb(140, 200); // 2 → P
  sc.dropOrb(200, 200); // 3 → R
  sc.session.orbCount = 8;
  sc.dropOrb(280, 200); // 9 → S
});
await step(3);
await page.screenshot({ path: `${outDir}/rw-orbs.png` });
// 픽업 효과 검증
const orbFx = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  const s = sc.session;
  const before = { superN: s.superN, rear: s.rear, rearLv: s.rearLv };
  s.rear = null;
  s.rearLv = 1;
  s.orbCount = 2;
  sc.dropOrb(sc.px, sc.py - 30); // 3번째 → R → 즉시 픽업권
  let t = window.__game.loop.now;
  for (let i = 0; i < 40; i++) {
    t += 1000 / 60;
    window.__game.loop.step(t);
  }
  const afterR = { rear: s.rear, rearLv: s.rearLv };
  s.orbCount = 8;
  const superBefore = s.superN;
  sc.dropOrb(sc.px, sc.py - 30); // 9번째 → S
  for (let i = 0; i < 40; i++) {
    t += 1000 / 60;
    window.__game.loop.step(t);
  }
  return { before, afterR, superBefore, superAfter: s.superN };
});
console.log('orbFx:', JSON.stringify(orbFx));

console.log('done');
await browser.close();
