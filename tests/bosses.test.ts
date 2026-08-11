import { describe, expect, it } from 'vitest';

import { DATA } from '../src/data';

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
    for (const [bossId, boss] of Object.entries(DATA.bosses.bosses)) {
      const partIds = (boss.parts ?? []).map((part) => part.id);
      const stageIds = (boss.stages ?? []).map((stage) => stage.id);

      expect(new Set(partIds).size, `${bossId} duplicate part id`).toBe(partIds.length);
      expect(new Set(stageIds).size, `${bossId} duplicate stage id`).toBe(stageIds.length);
      expect(partIds, `${bossId} reserves "core" for the root body`).not.toContain('core');
    }
  });

  it('keeps part and stage counts within the supported runtime budget', () => {
    for (const [bossId, boss] of Object.entries(DATA.bosses.bosses)) {
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
    for (const [bossId, boss] of Object.entries(DATA.bosses.bosses)) {
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
    for (const [bossId, boss] of Object.entries(DATA.bosses.bosses)) {
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

  it('gives every campaign boss at least eight destructible parts', () => {
    const campaignBossIds = new Set(DATA.levels.levels.map((level) => level.boss));

    for (const bossId of campaignBossIds) {
      const boss = DATA.bosses.bosses[bossId];
      expect(boss, `campaign boss ${bossId}`).toBeDefined();
      expect(boss?.parts?.length ?? 0, `${bossId} campaign part count`).toBeGreaterThanOrEqual(8);
    }
  });
});
