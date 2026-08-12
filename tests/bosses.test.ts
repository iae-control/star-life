import { describe, expect, it } from 'vitest';

import rawBosses from '../src/data/bosses.json';
import rawLevels from '../src/data/levels.json';
import { bossesSchema, levelsSchema } from '../src/data/schemas';

const BOSSES = bossesSchema.parse(rawBosses).bosses;
const LEVELS = levelsSchema.parse(rawLevels).levels;

type EdgeMap = Map<string, string[]>;

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

type ParsedBoss = NonNullable<(typeof BOSSES)[string]>;

function partWorldAnchor(boss: ParsedBoss, partId: string): { x: number; y: number } {
  const parts = boss.parts ?? [];
  const partById = new Map(parts.map((part) => [part.id, part]));
  const memo = new Map<string, { x: number; y: number }>();

  const resolve = (id: string): { x: number; y: number } => {
    const cached = memo.get(id);
    if (cached) return cached;
    const part = partById.get(id);
    if (!part) throw new Error(`Unknown boss part: ${id}`);
    const parent =
      !part.parentId || part.parentId === 'core' ? { x: 0, y: 0 } : resolve(part.parentId);
    const anchor = { x: parent.x + part.dx, y: parent.y + part.dy };
    memo.set(id, anchor);
    return anchor;
  };

  return resolve(partId);
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

        const dependencies = [...(part.exposedBy ?? [])];
        combatDependencies.set(part.id, dependencies);
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

  it('builds every campaign boss from 12-16 hierarchical parts and exactly three stages', () => {
    const campaignBossIds = new Set(LEVELS.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
      const boss = BOSSES[bossId];
      expect(boss, `campaign boss ${bossId}`).toBeDefined();
      if (!boss) continue;

      const parts = boss.parts ?? [];
      expect(parts.length, `${bossId} campaign part minimum`).toBeGreaterThanOrEqual(12);
      expect(parts.length, `${bossId} campaign part maximum`).toBeLessThanOrEqual(16);
      expect(boss.stages?.length ?? 0, `${bossId} campaign stage count`).toBe(3);
      expect(
        parts.every((part) => Boolean(part.parentId)),
        `${bossId} every part belongs to the assembly hierarchy`,
      ).toBe(true);
      expect(
        parts.filter((part) => part.parentId !== 'core').length,
        `${bossId} nested child parts`,
      ).toBeGreaterThanOrEqual(6);
    }
  });

  it('presents every pre-finale campaign boss as a distinct capital warship', () => {
    const campaignBossIds = LEVELS.map((level) => level.boss);
    const finalBossId = campaignBossIds[campaignBossIds.length - 1];
    const warshipIds = campaignBossIds.slice(0, -1);
    const sprites = new Set<string>();
    const scripts = new Set<string>();
    const obsoleteOrganicNames =
      /amoeba|membrane|nucleus|spore|flagellum|protocore|coolant|corona|prominence|novaHeart|compressionNode/i;

    expect(finalBossId, 'campaign finale remains the killer snail').toBe('snail');
    for (const bossId of warshipIds) {
      const boss = BOSSES[bossId];
      expect(boss?.presentation, `${bossId} presentation`).toBeDefined();
      if (!boss?.presentation) continue;

      expect(['warship', 'scrolling-warship'], `${bossId} capital-ship presentation`).toContain(
        boss.presentation.kind,
      );
      expect(boss.presentation.displayWidth, `${bossId} imposing beam`).toBeGreaterThanOrEqual(288);
      expect(boss.presentation.displayHeight, `${bossId} imposing length`).toBeGreaterThanOrEqual(
        240,
      );
      expect(boss.sprite, `${bossId} authored warship sprite key`).toMatch(/^boss-warship-/);
      expect(sprites.has(boss.sprite), `${bossId} unique hull silhouette`).toBe(false);
      expect(
        scripts.has(boss.presentation.movementScript),
        `${bossId} unique movement script`,
      ).toBe(false);
      sprites.add(boss.sprite);
      scripts.add(boss.presentation.movementScript);

      const assemblyNames = [
        ...(boss.parts ?? []).map((part) => part.id),
        ...(boss.stages ?? []).map((stage) => stage.id),
      ].join(' ');
      expect(assemblyNames, `${bossId} mechanical assembly naming`).not.toMatch(
        obsoleteOrganicNames,
      );
    }
  });

  it('matches the production art aspect ratios and keeps tall hulls parked above the player lane', () => {
    const expectedDimensions: Record<string, [number, number]> = {
      amoeba: [288, 430],
      protocore: [326, 470],
      helios: [318, 460],
      crimson: [342, 760],
      nova: [350, 510],
      snail: [270, 405],
    };

    for (const [bossId, [width, height]] of Object.entries(expectedDimensions)) {
      const boss = BOSSES[bossId];
      expect(boss?.presentation?.displayWidth, `${bossId} art width`).toBe(width);
      expect(boss?.presentation?.displayHeight, `${bossId} art height`).toBe(height);
      if (!boss?.presentation) continue;

      // The resting body must not cover the lower combat lane where the player normally flies.
      expect(
        boss.entryY + boss.presentation.displayHeight / 2,
        `${bossId} resting hull bottom`,
      ).toBeLessThanOrEqual(340);
    }
  });

  it('includes a screen-spanning hull-crawl set piece with sequential destruction gates', () => {
    const campaignBosses = LEVELS.slice(0, -1)
      .map((level) => BOSSES[level.boss])
      .filter((boss): boss is NonNullable<typeof boss> => boss !== undefined);
    const setPieces = campaignBosses.filter(
      (boss) => boss.presentation?.kind === 'scrolling-warship',
    );

    expect(setPieces.length, 'at least one scrolling capital ship').toBeGreaterThanOrEqual(1);
    for (const boss of setPieces) {
      expect(boss.presentation?.movementScript).toBe('hull-crawl');
      expect(
        boss.presentation?.displayHeight ?? 0,
        'hull extends beyond one screen',
      ).toBeGreaterThanOrEqual(640);
      expect(boss.stages?.length ?? 0, 'sequential hull sections').toBeGreaterThanOrEqual(3);
      expect(
        boss.stages?.slice(0, -1).every((stage) => (stage.advanceWhenDestroyed?.length ?? 0) > 0),
        'every pre-reactor section has a destruction gate',
      ).toBe(true);
    }
  });

  it('spreads capital-ship hardpoints across the authored hull instead of stacking at center', () => {
    const warshipIds = LEVELS.slice(0, -1).map((level) => level.boss);

    for (const bossId of warshipIds) {
      const boss = BOSSES[bossId];
      expect(boss, `${bossId} campaign boss`).toBeDefined();
      if (!boss?.presentation) continue;
      const parts = boss.parts ?? [];
      const anchors = parts.map((part) => ({ part, ...partWorldAnchor(boss, part.id) }));
      const ys = anchors.map(({ y }) => y);
      const hullSpan = Math.max(...ys) - Math.min(...ys);
      const spanRatio = hullSpan / boss.presentation.displayHeight;

      if (boss.presentation.kind === 'scrolling-warship') {
        expect(spanRatio, `${bossId} scrolling hull coverage`).toBeGreaterThanOrEqual(0.6);
        expect(spanRatio, `${bossId} scrolling hull coverage`).toBeLessThanOrEqual(0.72);
      } else {
        expect(spanRatio, `${bossId} hull coverage`).toBeGreaterThanOrEqual(0.45);
        expect(spanRatio, `${bossId} hull coverage`).toBeLessThanOrEqual(0.6);
      }

      for (const { part, x, y } of anchors) {
        const motionX =
          part.motion?.type === 'orbit'
            ? part.motion.radiusX
            : part.motion?.axis === 'x'
              ? part.motion.amplitude
              : 0;
        const motionY =
          part.motion?.type === 'orbit'
            ? part.motion.radiusY
            : part.motion?.axis === 'y'
              ? part.motion.amplitude
              : 0;
        expect(
          Math.abs(x) + part.hitbox.w / 2 + motionX,
          `${bossId}.${part.id} remains on the visible hull horizontally`,
        ).toBeLessThanOrEqual(boss.presentation.displayWidth / 2);
        expect(
          Math.abs(y) + part.hitbox.h / 2 + motionY,
          `${bossId}.${part.id} remains on the visible hull vertically`,
        ).toBeLessThanOrEqual(boss.presentation.displayHeight / 2);
      }
    }
  });

  it('aligns the scrolling dreadnought gates with front, midship, and aft hull sections', () => {
    const boss = BOSSES.crimson;
    expect(boss?.presentation?.kind).toBe('scrolling-warship');
    if (!boss) return;
    const stages = boss.stages ?? [];
    const firstStage = stages[0];
    const secondStage = stages[1];
    const finalStage = stages[2];

    for (const id of firstStage?.advanceWhenDestroyed ?? []) {
      const part = boss.parts?.find((candidate) => candidate.id === id);
      const { y } = partWorldAnchor(boss, id);
      expect(y, `${id} sits in the forward battery zone`).toBeGreaterThanOrEqual(-240);
      expect(y, `${id} sits in the forward battery zone`).toBeLessThanOrEqual(-150);
      expect(part?.activeStages, `${id} belongs to the forward stage`).toContain(firstStage?.id);
    }
    for (const id of secondStage?.advanceWhenDestroyed ?? []) {
      const { y } = partWorldAnchor(boss, id);
      expect(y, `${id} sits in the midship zone`).toBeGreaterThanOrEqual(-70);
      expect(y, `${id} sits in the midship zone`).toBeLessThanOrEqual(80);
    }

    const aftParts = (boss.parts ?? []).filter(
      (part) => part.role === 'engine' || part.role === 'weakpoint',
    );
    expect(aftParts.length, 'aft engine/reactor targets').toBeGreaterThanOrEqual(3);
    for (const part of aftParts) {
      const { y } = partWorldAnchor(boss, part.id);
      expect(y, `${part.id} sits in the aft zone`).toBeGreaterThanOrEqual(170);
      expect(y, `${part.id} sits in the aft zone`).toBeLessThanOrEqual(260);
      expect(part.activeStages, `${part.id} activates during the reactor run`).toContain(
        finalStage?.id,
      );
    }
  });

  it('aligns each regular warship gate with forward, midship, and aft art sections', () => {
    const bossIds = ['amoeba', 'protocore', 'helios', 'nova'];

    for (const bossId of bossIds) {
      const boss = BOSSES[bossId];
      expect(boss, `${bossId} campaign boss`).toBeDefined();
      if (!boss) continue;
      const stages = boss.stages ?? [];
      const first = stages[0];
      const second = stages[1];
      const final = stages[2];

      for (const id of first?.advanceWhenDestroyed ?? []) {
        const part = boss.parts?.find((candidate) => candidate.id === id);
        const { y } = partWorldAnchor(boss, id);
        expect(y, `${bossId}.${id} forward gate`).toBeLessThanOrEqual(-80);
        expect(part?.activeStages, `${bossId}.${id} forward stage ownership`).toContain(first?.id);
      }
      for (const id of second?.advanceWhenDestroyed ?? []) {
        const { y } = partWorldAnchor(boss, id);
        expect(y, `${bossId}.${id} midship gate lower bound`).toBeGreaterThanOrEqual(-36);
        expect(y, `${bossId}.${id} midship gate upper bound`).toBeLessThanOrEqual(12);
      }

      const aftSystems = (boss.parts ?? []).filter(
        (part) => part.role === 'engine' || part.role === 'weakpoint',
      );
      expect(aftSystems.length, `${bossId} aft systems`).toBeGreaterThanOrEqual(3);
      for (const part of aftSystems) {
        expect(
          partWorldAnchor(boss, part.id).y,
          `${bossId}.${part.id} aft placement`,
        ).toBeGreaterThanOrEqual(70);
        expect(part.activeStages, `${bossId}.${part.id} final stage ownership`).toContain(
          final?.id,
        );
      }
    }
  });

  it('places the killer snail face forward and shell combat gates over the illustrated shell', () => {
    const snail = BOSSES.snail;
    expect(snail, 'killer snail data').toBeDefined();
    if (!snail) return;
    const parts = new Map((snail.parts ?? []).map((part) => [part.id, part]));

    for (const id of ['eyeL', 'eyeR', 'feeler']) {
      const y = partWorldAnchor(snail, id).y;
      expect(y, `snail ${id} face placement`).toBeGreaterThanOrEqual(-150);
      expect(y, `snail ${id} face placement`).toBeLessThanOrEqual(-95);
    }
    for (const id of ['shellL', 'shellR', 'shellTop', 'shellBottom', 'softHeart']) {
      const y = partWorldAnchor(snail, id).y;
      expect(y, `snail ${id} shell placement`).toBeGreaterThanOrEqual(20);
      expect(y, `snail ${id} shell placement`).toBeLessThanOrEqual(130);
    }

    expect(parts.get('eyeL')?.protects).toContain('core');
    expect(parts.get('eyeR')?.protects).toContain('core');
    for (const id of ['shellL', 'shellR', 'shellTop', 'shellBottom']) {
      expect(parts.get(id)?.exposedBy, `snail ${id} gaze gate`).toEqual(
        expect.arrayContaining(['eyeL', 'eyeR']),
      );
    }
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

  it('gives every campaign assembly all combat roles and both supported motions', () => {
    const requiredRoles = ['armor', 'shield', 'turret', 'engine', 'weakpoint'] as const;
    const campaignBossIds = new Set(LEVELS.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
      const boss = BOSSES[bossId];
      if (!boss) continue;
      const parts = boss.parts ?? [];

      for (const role of requiredRoles) {
        expect(
          parts.some((part) => part.role === role),
          `${bossId} role ${role}`,
        ).toBe(true);
      }
      expect(
        parts.some((part) => part.motion?.type === 'orbit'),
        `${bossId} orbit motion`,
      ).toBe(true);
      expect(
        parts.some((part) => part.motion?.type === 'oscillate'),
        `${bossId} oscillate motion`,
      ).toBe(true);
    }
  });

  it('uses two destruction gates followed by a protected final weakpoint', () => {
    const campaignBossIds = new Set(LEVELS.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
      const boss = BOSSES[bossId];
      if (!boss) continue;
      const parts = boss.parts ?? [];
      const partById = new Map(parts.map((part) => [part.id, part]));
      const stages = boss.stages ?? [];
      const first = stages[0];
      const second = stages[1];
      const final = stages[2];

      expect(first?.coreTargetable, `${bossId} stage 1 core gate`).toBe(false);
      expect(second?.coreTargetable, `${bossId} stage 2 core gate`).toBe(false);
      expect(final?.coreTargetable, `${bossId} final core access`).toBe(true);
      expect(
        first?.advanceWhenDestroyed?.length ?? 0,
        `${bossId} stage 1 gate parts`,
      ).toBeGreaterThan(0);
      expect(
        second?.advanceWhenDestroyed?.length ?? 0,
        `${bossId} stage 2 gate parts`,
      ).toBeGreaterThan(0);
      expect(
        final?.advanceWhenDestroyed,
        `${bossId} final stage has no fourth gate`,
      ).toBeUndefined();
      expect(first?.coolScale ?? 0, `${bossId} stage 1 cadence`).toBeGreaterThan(
        second?.coolScale ?? 0,
      );
      expect(second?.coolScale ?? 0, `${bossId} stage 2 cadence`).toBeGreaterThan(
        final?.coolScale ?? 0,
      );

      const firstGateIds = first?.advanceWhenDestroyed ?? [];
      const secondGateIds = second?.advanceWhenDestroyed ?? [];
      for (const partId of firstGateIds) {
        const part = partById.get(partId);
        expect(part?.role, `${bossId}.${partId} first gate role`).toBe('shield');
        expect(part?.protects ?? [], `${bossId}.${partId} protects core`).toContain('core');
        expect(part?.destroyScore ?? 0, `${bossId}.${partId} gate score`).toBeGreaterThanOrEqual(
          300,
        );
        expect(part?.destroyScore ?? 0, `${bossId}.${partId} gate score`).toBeLessThanOrEqual(500);
      }
      for (const partId of secondGateIds) {
        const part = partById.get(partId);
        expect(part?.role, `${bossId}.${partId} second gate role`).toBe('armor');
        expect(part?.activeStages ?? [], `${bossId}.${partId} active in stage 2`).toContain(
          second?.id,
        );
        for (const firstGateId of firstGateIds) {
          expect(part?.exposedBy ?? [], `${bossId}.${partId} follows stage 1`).toContain(
            firstGateId,
          );
        }
        expect(part?.destroyScore ?? 0, `${bossId}.${partId} gate score`).toBeGreaterThanOrEqual(
          300,
        );
        expect(part?.destroyScore ?? 0, `${bossId}.${partId} gate score`).toBeLessThanOrEqual(500);
      }

      const weakpoints = parts.filter(
        (part) => part.role === 'weakpoint' && part.protects?.includes('core'),
      );
      expect(weakpoints.length, `${bossId} final weakpoint`).toBeGreaterThanOrEqual(1);
      for (const weakpoint of weakpoints) {
        expect(
          weakpoint.activeStages ?? [],
          `${bossId}.${weakpoint.id} final-stage activation`,
        ).toContain(final?.id);
        for (const secondGateId of secondGateIds) {
          expect(weakpoint.exposedBy ?? [], `${bossId}.${weakpoint.id} follows stage 2`).toContain(
            secondGateId,
          );
        }
      }
    }
  });

  it('keeps every shielded campaign stage routable through exposed proxy parts', () => {
    const campaignBossIds = new Set(LEVELS.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
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

  it('caps campaign part HP, projectile cadence, and destruction score budgets', () => {
    const campaignBossIds = new Set(LEVELS.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
      const boss = BOSSES[bossId];
      if (!boss) continue;
      const parts = boss.parts ?? [];
      const stageGateIds = new Set(
        (boss.stages ?? []).flatMap((stage) => stage.advanceWhenDestroyed ?? []),
      );
      for (const part of parts) {
        if (part.role === 'weakpoint' && part.protects?.includes('core')) stageGateIds.add(part.id);
      }

      const partBaseHp = parts.reduce((sum, part) => sum + part.hp.base, 0);
      const partWaveHp = parts.reduce((sum, part) => sum + part.hp.perWave, 0);
      expect(partBaseHp, `${bossId} base part HP budget`).toBeLessThanOrEqual(boss.hp.base * 1.1);
      expect(partWaveHp, `${bossId} wave part HP budget`).toBeLessThanOrEqual(
        boss.hp.perWave * 1.75,
      );

      let projectilesPerSecond = 0;
      for (const part of parts) {
        const phase = part.phase;
        if (!phase || !part.fireEvery) continue;
        const projectiles =
          phase.type === 'fan' || phase.type === 'ring' || phase.type === 'spawn'
            ? phase.count
            : phase.type === 'spiral'
              ? phase.arms
              : 1;
        projectilesPerSecond += projectiles / part.fireEvery;
      }
      expect(projectilesPerSecond, `${bossId} part projectile budget`).toBeLessThanOrEqual(6);

      for (const part of parts) {
        const score = part.destroyScore ?? 0;
        if (stageGateIds.has(part.id)) {
          expect(score, `${bossId}.${part.id} major gate score`).toBeGreaterThanOrEqual(300);
          expect(score, `${bossId}.${part.id} major gate score`).toBeLessThanOrEqual(500);
        } else {
          expect(score, `${bossId}.${part.id} minor part score`).toBeGreaterThanOrEqual(80);
          expect(score, `${bossId}.${part.id} minor part score`).toBeLessThanOrEqual(200);
        }
      }
    }
  });
});
