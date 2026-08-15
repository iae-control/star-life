import { describe, expect, it } from 'vitest';

import rawBosses from '../src/data/bosses.json';
import rawLevels from '../src/data/levels.json';
import { bossesSchema, levelsSchema } from '../src/data/schemas';

const BOSSES = bossesSchema.parse(rawBosses).bosses;
const LEVELS = levelsSchema.parse(rawLevels).levels;

const GAME_WIDTH = 360;
/** GameScene.WARSHIP_FOCUS_Y — 스테이지 게이트 파트가 놓이는 화면 Y. */
const FOCUS_Y = 210;
/** GameScene.WARSHIP_MAX_HULL_Y — 선체 중심이 내려올 수 있는 하한. */
const MAX_HULL_Y = 340;
/**
 * 플레이어 탄이 소멸하는 높이(GameScene 의 컬링 경계).
 * 이보다 위에 있는 파트는 탄이 닿기 전에 사라져 물리적으로 명중이 불가능하다.
 * 예전 레이아웃이 정확히 이 선을 넘겨서 보스 진행이 막혔다 — 이 파일의 핵심 회귀 테스트.
 */
const PLAYER_BULLET_CULL_Y = -30;
/** 게이트 파트가 실전에서 들어와야 하는 세로 범위. */
const GATE_Y_RANGE = [56, 470] as const;
const EDGE_MARGIN = 4;

type EdgeMap = Map<string, string[]>;
type ParsedBoss = NonNullable<(typeof BOSSES)[string]>;
type ParsedPart = NonNullable<ParsedBoss['parts']>[number];

function findCycle(nodes: Iterable<string>, edges: EdgeMap): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (node: string): string[] | null => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    path.push(node);
    for (const dependency of edges.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

const campaignBossIds = (): string[] => [...new Set(LEVELS.map((level) => level.boss))];

const warshipEntries = (): [string, ParsedBoss][] =>
  Object.entries(BOSSES).filter(([, boss]) =>
    ['warship', 'scrolling-warship'].includes(boss.presentation?.kind ?? ''),
  );

/** GameScene.warshipSwayLimit() 과 같은 공식 — 파트가 화면에 남는 최대 좌우 진폭. */
function swayLimit(boss: ParsedBoss): number {
  const parts = boss.parts ?? [];
  if (!parts.length) return 0;
  return Math.max(
    0,
    parts.reduce(
      (limit, part) =>
        Math.min(limit, GAME_WIDTH / 2 - EDGE_MARGIN - Math.abs(part.dx) - part.hitbox.w / 2),
      46,
    ),
  );
}

/** GameScene.warshipStageHullY() 과 같은 공식 — 해당 스테이지에서의 선체 중심 Y. */
function hullYForStage(boss: ParsedBoss, stageIndex: number): number {
  // 달팽이는 스테이지마다 전진하지 않고 제자리에서 배회한다.
  if (boss.presentation?.kind === 'snail') return boss.entryY;
  const stages = boss.stages ?? [];
  const gate = stages[Math.min(stageIndex, stages.length - 1)]?.advanceWhenDestroyed ?? [];
  const dys = gate
    .map((id) => (boss.parts ?? []).find((part) => part.id === id)?.dy)
    .filter((dy): dy is number => dy !== undefined);
  if (!dys.length) return boss.entryY;
  return Math.min(MAX_HULL_Y, FOCUS_Y - dys.reduce((sum, dy) => sum + dy, 0) / dys.length);
}

/** 파트가 소속된 스테이지 인덱스 — 게이트면 그 스테이지, 아니면 노출 조건에서 역산. */
function stageIndexOf(boss: ParsedBoss, part: ParsedPart): number {
  const stages = boss.stages ?? [];
  const gateIndex = stages.findIndex((stage) => stage.advanceWhenDestroyed?.includes(part.id));
  if (gateIndex >= 0) return gateIndex;
  const gatedBy = part.exposedBy ?? [];
  if (!gatedBy.length) return 0;
  const previous = stages.findIndex((stage) =>
    gatedBy.every((id) => stage.advanceWhenDestroyed?.includes(id)),
  );
  return previous >= 0 ? previous + 1 : 0;
}

describe('boss v2 data integrity', () => {
  it('uses unique part and stage ids within every boss', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const partIds = (boss.parts ?? []).map((part) => part.id);
      const stageIds = (boss.stages ?? []).map((stage) => stage.id);

      expect(new Set(partIds).size, `${bossId} duplicate part id`).toBe(partIds.length);
      expect(new Set(stageIds).size, `${bossId} duplicate stage id`).toBe(stageIds.length);
      expect(partIds, `${bossId} reserves "core" for the root body`).not.toContain('core');
    }
  });

  it('keeps part and stage counts within the supported runtime budget', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const partCount = boss.parts?.length ?? 0;
      const stageCount = boss.stages?.length ?? 0;

      expect(partCount, `${bossId} part budget`).toBeLessThanOrEqual(32);
      expect(stageCount, `${bossId} stage budget`).toBeLessThanOrEqual(5);
      if (boss.layoutVersion === 2) {
        expect(partCount, `${bossId} v2 parts`).toBeGreaterThan(0);
        expect(stageCount, `${bossId} v2 stages`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('resolves parent, protection, exposure, active-stage, and stage-advance references', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const parts = boss.parts ?? [];
      const partIds = new Set(parts.map((part) => part.id));
      const targetIds = new Set(['core', ...partIds]);
      const stageIds = new Set((boss.stages ?? []).map((stage) => stage.id));

      for (const part of parts) {
        if (part.parentId) {
          expect(
            targetIds.has(part.parentId),
            `${bossId}.${part.id} parentId -> ${part.parentId}`,
          ).toBe(true);
        }
        for (const targetId of part.protects ?? []) {
          expect(targetIds.has(targetId), `${bossId}.${part.id} protects -> ${targetId}`).toBe(
            true,
          );
        }
        for (const dependencyId of part.exposedBy ?? []) {
          expect(
            partIds.has(dependencyId),
            `${bossId}.${part.id} exposedBy -> ${dependencyId}`,
          ).toBe(true);
        }
        for (const stageId of part.activeStages ?? []) {
          expect(stageIds.has(stageId), `${bossId}.${part.id} activeStages -> ${stageId}`).toBe(
            true,
          );
        }
      }

      for (const stage of boss.stages ?? []) {
        for (const partId of stage.advanceWhenDestroyed ?? []) {
          expect(
            partIds.has(partId),
            `${bossId}.${stage.id} advanceWhenDestroyed -> ${partId}`,
          ).toBe(true);
        }
      }
    }
  });

  it('contains no hierarchy or combat-dependency cycles', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const parts = boss.parts ?? [];
      const partIds = new Set(parts.map((part) => part.id));
      const hierarchy: EdgeMap = new Map();
      const combatDependencies: EdgeMap = new Map();

      for (const part of parts) {
        hierarchy.set(part.id, part.parentId && partIds.has(part.parentId) ? [part.parentId] : []);
        combatDependencies.set(part.id, [...(part.exposedBy ?? [])]);
      }

      // If A protects B, B also depends on A being destroyed before it can be exposed.
      for (const protector of parts) {
        for (const protectedId of protector.protects ?? []) {
          if (!partIds.has(protectedId)) continue;
          const dependencies = combatDependencies.get(protectedId) ?? [];
          dependencies.push(protector.id);
          combatDependencies.set(protectedId, dependencies);
        }
      }

      const hierarchyCycle = findCycle(partIds, hierarchy);
      const combatCycle = findCycle(partIds, combatDependencies);
      expect(
        hierarchyCycle,
        `${bossId} hierarchy cycle: ${hierarchyCycle?.join(' -> ')}`,
      ).toBeNull();
      expect(
        combatCycle,
        `${bossId} combat dependency cycle: ${combatCycle?.join(' -> ')}`,
      ).toBeNull();
    }
  });

  // ── 사거리 회귀 테스트 ────────────────────────────────────────────────
  // 이전 레이아웃은 1스테이지 게이트 파트를 화면 위(y = -72 ~ -276)에 두었다.
  // 플레이어 탄이 y < -30 에서 소멸하므로 그 파트들은 명중 자체가 불가능했고,
  // coreTargetable=false 라 보스 진행이 통째로 막혔다. 아래 셋이 그 재발을 막는다.

  it('keeps every stage gate inside the player firing lane', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const stages = boss.stages ?? [];
      const sway = swayLimit(boss);
      stages.forEach((stage, stageIndex) => {
        const hullY = hullYForStage(boss, stageIndex);
        for (const gateId of stage.advanceWhenDestroyed ?? []) {
          const part = (boss.parts ?? []).find((candidate) => candidate.id === gateId);
          expect(part, `${bossId}.${gateId} exists`).toBeDefined();
          if (!part) continue;

          const y = hullY + part.dy;
          const label = `${bossId}.${stage.id}/${gateId}`;
          expect(y, `${label} would be culled before player fire reaches it`).toBeGreaterThan(
            PLAYER_BULLET_CULL_Y + part.hitbox.h / 2,
          );
          expect(y, `${label} above the playfield`).toBeGreaterThanOrEqual(GATE_Y_RANGE[0]);
          expect(y, `${label} below the playfield`).toBeLessThanOrEqual(GATE_Y_RANGE[1]);

          const left = GAME_WIDTH / 2 - sway + part.dx - part.hitbox.w / 2;
          const right = GAME_WIDTH / 2 + sway + part.dx + part.hitbox.w / 2;
          expect(left, `${label} off the left edge`).toBeGreaterThanOrEqual(0);
          expect(right, `${label} off the right edge`).toBeLessThanOrEqual(GAME_WIDTH);
        }
      });
    }
  });

  it('leaves every capital ship enough lateral room to keep moving', () => {
    for (const [bossId, boss] of warshipEntries()) {
      expect(swayLimit(boss), `${bossId} lateral travel`).toBeGreaterThanOrEqual(10);
    }
  });

  it('destroys capital-ship sections from the bottom up', () => {
    for (const [bossId, boss] of warshipEntries()) {
      const stages = boss.stages ?? [];
      expect(stages.length, `${bossId} destruction stages`).toBeGreaterThanOrEqual(3);

      const gateDepths = stages.map((stage) => {
        const dys = (stage.advanceWhenDestroyed ?? [])
          .map((id) => (boss.parts ?? []).find((part) => part.id === id)?.dy)
          .filter((dy): dy is number => dy !== undefined);
        return dys.reduce((sum, dy) => sum + dy, 0) / Math.max(1, dys.length);
      });

      for (let i = 1; i < gateDepths.length; i++) {
        expect(
          gateDepths[i],
          `${bossId} stage ${i} (${stages[i]?.id}) must sit above stage ${i - 1}`,
        ).toBeLessThan(gateDepths[i - 1] ?? 0);
      }

      // 아래에서 위로 올라가려면 선체가 스테이지마다 화면 아래로 전진해야 한다.
      for (let i = 1; i < stages.length; i++) {
        expect(
          hullYForStage(boss, i),
          `${bossId} hull must advance into stage ${i}`,
        ).toBeGreaterThan(hullYForStage(boss, i - 1));
      }
    }
  });

  it('derives part placement and hitboxes from the hull artwork crop', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const presentation = boss.presentation;
      const cropped = (boss.parts ?? []).filter((part) => part.crop);
      if (!cropped.length) continue;

      expect(presentation?.artWidth, `${bossId} art width`).toBeGreaterThan(0);
      expect(presentation?.artHeight, `${bossId} art height`).toBeGreaterThan(0);
      if (!presentation?.artWidth || !presentation.artHeight) continue;

      const sx = presentation.displayWidth / presentation.artWidth;
      const sy = presentation.displayHeight / presentation.artHeight;

      for (const part of cropped) {
        const crop = part.crop;
        if (!crop) continue;
        const label = `${bossId}.${part.id}`;
        expect(crop.x + crop.w, `${label} crop past art right edge`).toBeLessThanOrEqual(
          presentation.artWidth,
        );
        expect(crop.y + crop.h, `${label} crop past art bottom edge`).toBeLessThanOrEqual(
          presentation.artHeight,
        );

        // 위치와 판정이 전부 크롭에서 유도되므로 파트가 선체 밖으로 새어나갈 수 없다.
        expect(part.dx, `${label} dx follows its crop`).toBeCloseTo(
          (crop.x + crop.w / 2 - presentation.artWidth / 2) * sx,
          0,
        );
        expect(part.dy, `${label} dy follows its crop`).toBeCloseTo(
          (crop.y + crop.h / 2 - presentation.artHeight / 2) * sy,
          0,
        );
        expect(part.hitbox.w, `${label} hitbox width matches art`).toBeCloseTo(crop.w * sx, 0);
        expect(part.hitbox.h, `${label} hitbox height matches art`).toBeCloseTo(crop.h * sy, 0);
      }
    }
  });

  it('presents every pre-finale campaign boss as a distinct capital warship', () => {
    const sprites = new Set<string>();
    const scripts = new Set<string>();

    for (const level of LEVELS.slice(0, -1)) {
      const boss = BOSSES[level.boss];
      if (!boss?.presentation) continue;
      expect(['warship', 'scrolling-warship'], `${level.boss} presentation`).toContain(
        boss.presentation.kind,
      );
      expect(sprites.has(boss.sprite), `${level.boss} unique hull art`).toBe(false);
      expect(
        scripts.has(boss.presentation.movementScript),
        `${level.boss} unique movement script`,
      ).toBe(false);
      sprites.add(boss.sprite);
      scripts.add(boss.presentation.movementScript);
    }
  });

  it('scales each hull to the production art aspect ratio', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const presentation = boss.presentation;
      if (!presentation?.artWidth || !presentation.artHeight) continue;

      const artRatio = presentation.artWidth / presentation.artHeight;
      const displayRatio = presentation.displayWidth / presentation.displayHeight;
      expect(displayRatio, `${bossId} hull is stretched`).toBeCloseTo(artRatio, 2);

      // 거대 함선 연출 — 함선이 화면 폭에 준하거나 그 이상이어야 압도적으로 읽힌다.
      if (['warship', 'scrolling-warship'].includes(presentation.kind)) {
        expect(presentation.displayWidth, `${bossId} capital ship scale`).toBeGreaterThanOrEqual(
          GAME_WIDTH,
        );
      }
      expect(boss.envelope?.w, `${bossId} envelope width`).toBe(presentation.displayWidth);
      expect(boss.envelope?.h, `${bossId} envelope height`).toBe(presentation.displayHeight);
    }
  });

  it('starts every scaled hull fully off-screen so it scrolls into view', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const presentation = boss.presentation;
      if (!presentation) continue;
      const spawnY = -presentation.displayHeight / 2 - 40;
      expect(
        spawnY + presentation.displayHeight / 2,
        `${bossId} spawns already visible`,
      ).toBeLessThan(0);
      expect(boss.entryY, `${bossId} entry target is below its spawn point`).toBeGreaterThan(
        spawnY,
      );
    }
  });

  it('gives every campaign assembly the full set of combat roles', () => {
    for (const bossId of campaignBossIds()) {
      const boss = BOSSES[bossId];
      const parts = boss?.parts ?? [];
      if (!parts.length || boss?.layoutVersion !== 2) continue;
      // 함선은 추진부가 1스테이지 표적이라 engine 이 필수다. 달팽이는 엔진이 없다.
      const requiredRoles =
        boss.presentation?.kind === 'snail'
          ? (['armor', 'turret', 'weakpoint'] as const)
          : (['armor', 'turret', 'engine', 'weakpoint'] as const);
      const roles = new Set(parts.map((part) => part.role));
      for (const role of requiredRoles) {
        expect(roles.has(role), `${bossId} role ${role}`).toBe(true);
      }
      // crop 파트는 선체 그림에 정확히 겹쳐져야 하므로 흔들리는 모션을 붙이면 이음매가 드러난다.
      for (const part of parts) {
        if (part.crop)
          expect(part.motion, `${bossId}.${part.id} crop part must not drift`).toBeUndefined();
      }
    }
  });

  it('gates the core behind every stage and opens it on the final section', () => {
    for (const bossId of campaignBossIds()) {
      const boss = BOSSES[bossId];
      const stages = boss?.stages ?? [];
      if (!stages.length || boss?.layoutVersion !== 2) continue;

      stages.forEach((stage, index) => {
        const isFinal = index === stages.length - 1;
        expect(stage.coreTargetable, `${bossId}.${stage.id} core access`).toBe(isFinal);
        expect(
          stage.advanceWhenDestroyed?.length ?? 0,
          `${bossId}.${stage.id} needs a destruction gate`,
        ).toBeGreaterThan(0);
      });

      // 코어를 막는 것은 스테이지 게이트뿐 — 게이트가 아닌 파트가 진행을 막으면 안 된다.
      const gateIds = new Set(stages.flatMap((stage) => stage.advanceWhenDestroyed ?? []));
      for (const part of boss?.parts ?? []) {
        if (gateIds.has(part.id)) continue;
        expect(
          part.shield || (part.protects?.includes('core') ?? false),
          `${bossId}.${part.id} is optional and must not gate the core`,
        ).toBe(false);
      }
    }
  });

  it('places the killer snail gates over its illustrated body', () => {
    const snail = BOSSES.snail;
    expect(snail, 'killer snail boss data').toBeDefined();
    if (!snail?.presentation) return;

    // 달팽이는 눈 → 껍데기 → 심장 순서가 확정 설계라 아래→위 규칙에서 제외한다.
    const stageIds = (snail.stages ?? []).map((stage) => stage.id);
    expect(stageIds, 'snail keeps its authored destruction order').toEqual([
      'gaze',
      'shell-break',
      'soft-heart',
    ]);

    const eyes = (snail.parts ?? []).filter((part) => part.id.startsWith('eye'));
    expect(eyes.length, 'snail eyes').toBe(2);
    for (const eye of eyes) {
      // 눈은 머리(아트 상단)에 있어야 한다.
      expect(eye.dy, `${eye.id} sits on the head`).toBeLessThan(0);
      expect(snail.entryY + eye.dy, `${eye.id} must be reachable on screen`).toBeGreaterThanOrEqual(
        GATE_Y_RANGE[0],
      );
    }

    const heart = (snail.parts ?? []).find((part) => part.role === 'weakpoint');
    expect(heart, 'snail weakpoint').toBeDefined();
    expect(heart && snail.entryY + heart.dy, 'snail heart stays on screen').toBeLessThanOrEqual(
      GATE_Y_RANGE[1],
    );
  });

  it('retains the killer snail finale with both unavoidable signature attacks authored in data', () => {
    const snail = BOSSES.snail;
    expect(snail, 'killer snail boss data').toBeDefined();
    if (!snail) return;
    const specials = snail.snailSpecials;

    expect(snail.presentation?.kind).toBe('snail');
    expect(snail.sprite).toBe('boss-snail');
    expect(specials, 'killer snail specials').toBeDefined();
    if (!specials) return;

    expect(specials.rageChargeMs, 'shell-rage charge lasts 1-2 seconds').toBeGreaterThanOrEqual(
      1000,
    );
    expect(specials.rageChargeMs).toBeLessThanOrEqual(2000);
    expect(specials.rageForcedDamage, 'rage barrage forces damage').toBeGreaterThan(0);
    expect(specials.barrageCount, 'rage barrage fills the screen').toBeGreaterThanOrEqual(120);
    expect(specials.huntForcedDamage, 'high-speed hunt forces damage').toBeGreaterThan(0);
    expect(
      specials.huntDashCount,
      'high-speed hunt crosses the screen repeatedly',
    ).toBeGreaterThanOrEqual(5);
    expect(specials.speech).toBe("I'll......... kill..............you!!!");

    for (const level of LEVELS.slice(0, -1)) {
      const boss = BOSSES[level.boss];
      expect(boss, `${level.boss} campaign boss`).toBeDefined();
      expect(boss?.snailSpecials, `${level.boss} is not the finale creature`).toBeUndefined();
    }
  });

  it('keeps every shielded campaign stage routable through exposed proxy parts', () => {
    for (const bossId of campaignBossIds()) {
      const boss = BOSSES[bossId];
      if (!boss) continue;
      const parts = boss.parts ?? [];
      const alive = new Set(parts.map((part) => part.id));

      for (const stage of boss.stages ?? []) {
        const active = (part: (typeof parts)[number]): boolean =>
          !part.activeStages || part.activeStages.includes(stage.id);
        const exposed = (part: (typeof parts)[number]): boolean =>
          (part.exposedBy ?? []).every((id) => !alive.has(id)) &&
          !parts.some(
            (protector) =>
              alive.has(protector.id) && active(protector) && protector.protects?.includes(part.id),
          );
        const candidates = parts.filter(
          (part) => alive.has(part.id) && active(part) && exposed(part),
        );
        const protectors = candidates.filter(
          (part) => part.shield || part.protects?.includes('core'),
        );
        const gateIds = new Set(stage.advanceWhenDestroyed ?? []);
        const stageGates = candidates.filter((part) => gateIds.has(part.id));
        const proxies =
          protectors.length > 0 ? protectors : stageGates.length > 0 ? stageGates : candidates;
        const coreShielded =
          !stage.coreTargetable ||
          parts.some(
            (part) =>
              alive.has(part.id) &&
              active(part) &&
              (part.shield || part.protects?.includes('core')),
          );

        if (coreShielded) {
          expect(proxies.length, `${bossId}.${stage.id} damage proxy`).toBeGreaterThan(0);
        }
        for (const gateId of gateIds) {
          expect(
            stageGates.some((part) => part.id === gateId),
            `${bossId}.${stage.id} exposed gate ${gateId}`,
          ).toBe(true);
          alive.delete(gateId);
        }
      }

      const stages = boss.stages ?? [];
      const finalStage = stages[stages.length - 1];
      if (!finalStage) continue;
      for (const part of parts) {
        if (
          alive.has(part.id) &&
          (!part.activeStages || part.activeStages.includes(finalStage.id)) &&
          (part.shield || part.protects?.includes('core'))
        ) {
          alive.delete(part.id);
        }
      }
      expect(
        parts.some(
          (part) =>
            alive.has(part.id) &&
            (!part.activeStages || part.activeStages.includes(finalStage.id)) &&
            (part.shield || part.protects?.includes('core')),
        ),
        `${bossId} core opens after final protectors`,
      ).toBe(false);
    }
  });

  it('keeps every optional hardpoint reachable once its section is exposed', () => {
    for (const [bossId, boss] of Object.entries(BOSSES)) {
      const sway = swayLimit(boss);
      for (const part of boss.parts ?? []) {
        const hullY = hullYForStage(boss, stageIndexOf(boss, part));
        const y = hullY + part.dy;
        const label = `${bossId}.${part.id}`;
        expect(y, `${label} sits above the bullet cull line`).toBeGreaterThan(
          PLAYER_BULLET_CULL_Y + part.hitbox.h / 2,
        );
        expect(
          GAME_WIDTH / 2 - sway + part.dx - part.hitbox.w / 2,
          `${label} off the left edge`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          GAME_WIDTH / 2 + sway + part.dx + part.hitbox.w / 2,
          `${label} off the right edge`,
        ).toBeLessThanOrEqual(GAME_WIDTH);
      }
    }
  });

  it('caps campaign part HP, projectile cadence, and destruction score budgets', () => {
    for (const bossId of campaignBossIds()) {
      const boss = BOSSES[bossId];
      const parts = boss?.parts ?? [];
      if (!boss || !parts.length) continue;

      const partBaseHp = parts.reduce((sum, part) => sum + part.hp.base, 0);
      const partWaveHp = parts.reduce((sum, part) => sum + part.hp.perWave, 0);
      expect(partBaseHp, `${bossId} base part HP budget`).toBeLessThanOrEqual(boss.hp.base * 1.1);
      expect(partWaveHp, `${bossId} wave part HP budget`).toBeLessThanOrEqual(
        boss.hp.perWave * 1.75,
      );

      for (const part of parts) {
        if (part.fireEvery !== undefined) {
          expect(part.fireEvery, `${bossId}.${part.id} cadence floor`).toBeGreaterThanOrEqual(1.5);
        }
        expect(part.destroyScore ?? 0, `${bossId}.${part.id} score`).toBeLessThanOrEqual(1200);
      }
    }
  });
});
