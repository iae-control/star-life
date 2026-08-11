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
