import { TILE_FIXED_UNITS, type RenderSnapshot, type SimulationState } from "./types.js";
import { SIMULATION_BEHAVIOR_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./versions.js";

const HISTORY_TICKS_PER_MINUTE = 10;
const HISTORY_MINUTES_PER_DAY = 24 * 60;

export function formatSimulationTime(tick: number): string {
  const totalMinutes = Math.max(0, Math.floor(tick / HISTORY_TICKS_PER_MINUTE));
  const day = Math.floor(totalMinutes / HISTORY_MINUTES_PER_DAY) + 1;
  const minutesInDay = totalMinutes % HISTORY_MINUTES_PER_DAY;
  const hour = Math.floor(minutesInDay / 60);
  const minute = minutesInDay % 60;
  return `Day ${day} · ${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

export function createRenderSnapshot(state: SimulationState): RenderSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    tick: state.tick,
    timeLabel: formatSimulationTime(state.tick),
    width: state.world.width,
    height: state.world.height,
    tiles: state.world.tiles.map((tile) => ({
      index: tile.index,
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain,
      blocked: tile.blocked,
    })),
    creatures: state.creatures.map((creature) => ({
      id: creature.id,
      name: creature.name,
      color: creature.color,
      x: creature.x / TILE_FIXED_UNITS,
      y: creature.y / TILE_FIXED_UNITS,
      tileIndex: creature.tileIndex,
      health: creature.health,
      hunger: creature.needs.hunger,
      fatigue: creature.needs.fatigue,
      food: creature.inventory.food,
      material: creature.inventory.material,
      groupId: creature.groupId,
      role: creature.role,
      action: creature.activeAction?.kind ?? null,
      targetTileIndex: creature.activeAction?.targetTileIndex ?? null,
    })),
    resourceNodes: state.resourceNodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      tileIndex: node.tileIndex,
      currentStock: node.currentStock,
      maximumStock: node.maximumStock,
    })),
    structures: state.structures.map((structure) => ({
      id: structure.id,
      kind: structure.kind,
      tileIndex: structure.tileIndex,
      groupId: structure.groupId,
      progress: structure.progress,
      food: structure.inventory.food,
      material: structure.material,
      guardIds: [...structure.guardIds],
    })),
    groups: state.groups.map((group) => ({
      ...group,
      memberIds: [...group.memberIds],
      majorEventIds: [...group.majorEventIds],
    })),
    recentEvents: state.domainEvents.slice(-80).map((event) => ({
      ...event,
      actorIds: [...event.actorIds],
      targetIds: [...event.targetIds],
      groupIds: [...event.groupIds],
      causedByEventIds: [...event.causedByEventIds],
      decisionRecordIds: [...event.decisionRecordIds],
    })),
    historyEvents: state.historyEvents.map((event) => ({
      ...event,
      sourceEventIds: [...event.sourceEventIds],
      actorIds: [...event.actorIds],
      groupIds: [...event.groupIds],
    })),
    metrics: { ...state.metrics },
  };
}
