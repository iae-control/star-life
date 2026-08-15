// 레벨 웨이브 빌더 — levels.json의 그룹 시퀀스를 스폰 타임라인으로 해석 (vitest 대상).
// 그룹은 순차 실행: 각 그룹의 duration이 지난 뒤 다음 그룹이 시작된다 (데모 buildWave 방식).
import { GAME_WIDTH } from '../../config';
import { SPAWN } from './balance';
import { DATA } from '../../data';
import type { WaveGroup } from '../../data/schemas';

export type SpawnEvent =
  | { t: number; kind: 'boss' }
  | {
      t: number;
      kind: 'enemy';
      type: string;
      x: number;
      opt: { amp?: number; vx?: number; y?: number };
    };

const rnd = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

/**
 * 편성 규모·템포를 밀도 노브로 부풀린다. 웨이브 데이터를 다시 쓰지 않고
 * 화면에 동시에 떠 있는 적 수를 끌어올리는 단일 지점이다.
 */
function scaleGroup(g: WaveGroup, density: number): WaveGroup {
  const count =
    'count' in g
      ? Math.max(1, Math.min(SPAWN.maxPerGroup, Math.round(g.count * SPAWN.countScale * density)))
      : undefined;
  return {
    ...g,
    ...(count !== undefined ? { count } : {}),
    ...('interval' in g ? { interval: g.interval * SPAWN.intervalScale } : {}),
    duration: g.duration * SPAWN.durationScale,
  } as WaveGroup;
}

function emitGroup(q: SpawnEvent[], g: WaveGroup, t0: number, rng: () => number): number {
  if (g.kind === 'column') {
    const bx = rnd(rng, g.xMin, g.xMax);
    const amp = rnd(rng, g.ampMin, g.ampMax);
    for (let i = 0; i < g.count; i++)
      q.push({ t: t0 + i * g.interval, kind: 'enemy', type: g.enemy, x: bx, opt: { amp } });
  } else if (g.kind === 'sideRush') {
    const side = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < g.count; i++) {
      q.push({
        t: t0 + i * g.interval,
        kind: 'enemy',
        type: g.enemy,
        x: side < 0 ? -18 : GAME_WIDTH + 18,
        opt: { vx: -side * rnd(rng, g.vxMin, g.vxMax), y: g.rowYBase + i * g.rowYStep },
      });
    }
  } else if (g.kind === 'drop') {
    for (let i = 0; i < g.count; i++)
      q.push({
        t: t0 + i * g.interval,
        kind: 'enemy',
        type: g.enemy,
        x: rnd(rng, g.xMin, g.xMax),
        opt: {},
      });
  } else if (g.kind === 'row') {
    const span = GAME_WIDTH - g.xMargin * 2;
    for (let i = 0; i < g.count; i++)
      q.push({
        t: t0,
        kind: 'enemy',
        type: g.enemy,
        x: g.xMargin + (span * (i + 0.5)) / g.count,
        opt: {},
      });
  } else if (g.kind === 'single') {
    q.push({ t: t0, kind: 'enemy', type: g.enemy, x: g.x, opt: {} });
  } else {
    // V자 편대: 중앙 선두, 좌우 후열이 시차를 두고 직선 강하
    const cx = rnd(rng, g.xMin, g.xMax);
    for (let i = 0; i < g.count; i++) {
      const k = i - (g.count - 1) / 2;
      q.push({
        t: t0 + Math.abs(k) * g.interval,
        kind: 'enemy',
        type: g.enemy,
        x: cx + k * g.spacing,
        opt: { amp: 0 },
      });
    }
  }
  return t0 + g.duration;
}

/** 장기 경로에 포함된 전투 구간 수. GameScene의 보스 전환 기준과 같은 단일 출처다. */
export function levelWaveCount(levelIdx: number): number {
  return DATA.levels.levels[levelIdx]?.waveRoute.length ?? 0;
}

/** route 위치를 실제 waves 콘텐츠 인덱스로 해석한다. */
export function contentWaveIndex(levelIdx: number, routeWaveIdx: number): number | null {
  if (routeWaveIdx < 0) return null;
  return DATA.levels.levels[levelIdx]?.waveRoute[routeWaveIdx] ?? null;
}

/**
 * levelIdx: 0-based 레벨 인덱스, waveIdx: waveRoute 내 0-based 진행 인덱스.
 * waveIdx가 waveRoute를 소진하면 보스 이벤트를 반환한다.
 */
export function buildLevelWave(
  levelIdx: number,
  waveIdx: number,
  rng: () => number = Math.random,
  density = 1,
): SpawnEvent[] {
  const level = DATA.levels.levels[levelIdx];
  const q: SpawnEvent[] = [];
  if (!level || waveIdx < 0) return q;
  if (waveIdx >= level.waveRoute.length) {
    q.push({ t: 1.0 + DATA.levels.bossDelay, kind: 'boss' });
    return q;
  }
  const contentIdx = level.waveRoute[waveIdx];
  if (contentIdx === undefined) return q;
  let t = 1.0;
  for (const g of level.waves[contentIdx] ?? []) t = emitGroup(q, scaleGroup(g, density), t, rng);
  return q;
}
