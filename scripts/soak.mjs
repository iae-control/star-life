#!/usr/bin/env node
// 가속 소크 테스트: 게임 루프를 수동 스텝해 N분 분량을 몇 분 만에 시뮬레이션.
// 사용: node scripts/soak.mjs [simMinutes=30] [url=http://localhost:5173/?scene=Game&auto=1]
// 자동 봇(?auto=1)이 플레이하며, JS 예외·페이지 에러·힙 증가·엔티티 누수를 감시한다.
import puppeteer from 'puppeteer';

const simMinutes = Number(process.argv[2] ?? 30);
const url = process.argv[3] ?? 'http://localhost:5173/?scene=Game&auto=1';
const FRAME_MS = 1000 / 60;
const CHUNK_FRAMES = 1200; // 20초 분량씩 스텝
const totalFrames = Math.round((simMinutes * 60 * 1000) / FRAME_MS);

const errors = [];
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--mute-audio',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 700 });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error')
    errors.push(`[console.error] ${m.text()} @ ${m.location()?.url ?? '?'}`);
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene?.isActive?.('Game'), { timeout: 20000 });
// 실시간 rAF와 수동 스텝이 겹치지 않게 잠시 대기 후 시작
await new Promise((r) => setTimeout(r, 500));

const stats = [];
let superShotTaken = false;
let bossShotTaken = false;

for (let done = 0; done < totalFrames; done += CHUNK_FRAMES) {
  const n = Math.min(CHUNK_FRAMES, totalFrames - done);
  const s = await page.evaluate((frames) => {
    const g = window.__game;
    let t = g.loop.now;
    for (let i = 0; i < frames; i++) {
      t += 1000 / 60;
      g.loop.step(t);
    }
    const sc = g.scene.getScene('Game');
    const mem = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return {
      simT: Math.round((sc?.worldT ?? 0) * 10) / 10,
      wave: sc?.session?.wave ?? -1,
      score: sc?.session?.score ?? -1,
      alive: sc?.alive ?? null,
      bullets: sc?.bullets?.length ?? -1,
      ebullets: sc?.ebullets?.length ?? -1,
      enemies: sc?.enemies?.length ?? -1,
      booms: sc?.booms?.length ?? -1,
      sparks: sc?.sparks?.length ?? -1,
      orbs: sc?.orbs?.length ?? -1,
      texts: sc?.texts?.length ?? -1,
      phantoms: sc?.sp?.phantoms?.length ?? 0,
      superActive: !!sc?.sp,
      boss: !!sc?.boss,
      children: sc?.children?.length ?? -1,
      heapMB: Math.round(mem / 1048576),
      gameScene: !!sc && g.scene.isActive('Game'),
      shopActive: g.scene.isActive('Shop'),
      resultActive: g.scene.isActive('Result'),
      level: sc?.session?.level ?? -1,
      campaignDone: sc?.session?.campaignDone ?? false,
    };
  }, n);
  stats.push(s);

  if (!superShotTaken && s.superActive) {
    await page.screenshot({
      path: process.env.SOAK_SHOT_DIR ? `${process.env.SOAK_SHOT_DIR}/super.png` : 'soak-super.png',
    });
    superShotTaken = true;
  }
  if (!bossShotTaken && s.boss) {
    await page.screenshot({
      path: process.env.SOAK_SHOT_DIR ? `${process.env.SOAK_SHOT_DIR}/boss.png` : 'soak-boss.png',
    });
    bossShotTaken = true;
  }
  // 상점에 들어갔으면 즉시 출격 (자동 봇은 Game 씬에서만 동작)
  if (s.shopActive) {
    await page.evaluate(() => {
      const g = window.__game;
      const shop = g.scene.getScene('Shop');
      shop?.act?.(shop.rows?.length ?? 13); // 마지막 인덱스 = 출격
    });
  }
  const line = `[soak] ${Math.round(((done + n) / totalFrames) * 100)}% simT=${s.simT}s L${s.level} wave=${s.wave} score=${s.score} ent(b=${s.bullets},eb=${s.ebullets},e=${s.enemies},ph=${s.phantoms}) children=${s.children} heap=${s.heapMB}MB${s.boss ? ' BOSS' : ''}${s.superActive ? ' SUPER' : ''}`;
  console.log(line);
  if (s.campaignDone && s.resultActive) {
    console.log(
      `[soak] CAMPAIGN COMPLETE — 총 ${Math.round(((done + n) * FRAME_MS) / 1000)}초(시뮬) 소요`,
    );
    break;
  }
  if (errors.length) break;
}

const first = stats[0];
const last = stats[stats.length - 1];
console.log('--- SOAK RESULT ---');
console.log(
  `sim time: ${last?.simT}s, final wave: ${last?.wave}, score: ${last?.score}, alive: ${last?.alive}`,
);
console.log(`heap: ${first?.heapMB}MB -> ${last?.heapMB}MB`);
console.log(`display children: ${first?.children} -> ${last?.children}`);
console.log(`errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
await browser.close();
process.exit(errors.length ? 1 : 0);
