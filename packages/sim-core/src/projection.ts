import { TILE_FIXED_UNITS, type RenderSnapshot, type SimulationState } from "./types.js";
import { projectCreatureObservationSummary } from "./observation-summary.js";
import { SIMULATION_BEHAVIOR_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./versions.js";

const HISTORY_TICKS_PER_MINUTE = 10;
const HISTORY_MINUTES_PER_DAY = 24 * 60;
const MAX_PROJECTED_ROUTE_SAMPLES = 12;
const MAX_PROJECTED_MEMORIES_PER_CREATURE = 4;
const MAX_PROJECTED_RELATIONSHIPS_PER_CREATURE = 6;
const MAX_PROJECTED_ATTENTION_EVENTS = 24;

function relationshipSalience(relationship: SimulationState["relationships"][number]) {
  return Math.max(
    Math.abs(relationship.trust),
    relationship.fear,
    relationship.familiarity,
    relationship.rivalry,
  );
}

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

export function createRenderSnapshot(
  state: SimulationState,
  includeStaticWorld = true,
): RenderSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    tick: state.tick,
    timeLabel: formatSimulationTime(state.tick),
    width: state.world.width,
    height: state.world.height,
    navigationRevision: state.world.navigationRevision,
    tiles: includeStaticWorld
      ? state.world.tiles.map((tile) => ({
          index: tile.index,
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          blocked: tile.blocked,
        }))
      : [],
    creatures: state.creatures.map((creature) => ({
      id: creature.id,
      name: creature.name,
      color: creature.color,
      alive: creature.alive,
      x: creature.x / TILE_FIXED_UNITS,
      y: creature.y / TILE_FIXED_UNITS,
      tileIndex: creature.tileIndex,
      health: creature.health,
      hunger: creature.needs.hunger,
      fatigue: creature.needs.fatigue,
      groupId: creature.groupId,
      role: creature.role,
      traits: { ...creature.traits },
      skills: { ...creature.skills },
      inventory: { ...creature.inventory },
      desire: creature.activeDesire?.kind ?? null,
      plan: creature.activePlan?.kind ?? null,
      action: creature.activeAction?.kind ?? null,
      actionPhase: creature.activeAction?.phase ?? null,
      targetTileIndex: creature.activeAction?.targetTileIndex ?? null,
      destinationX:
        creature.activeAction?.interactionClaim?.targetX === undefined
          ? null
          : creature.activeAction.interactionClaim.targetX / TILE_FIXED_UNITS,
      destinationY:
        creature.activeAction?.interactionClaim?.targetY === undefined
          ? null
          : creature.activeAction.interactionClaim.targetY / TILE_FIXED_UNITS,
      recentRoute: creature.recentRoute
        .slice(-MAX_PROJECTED_ROUTE_SAMPLES)
        .map((sample) => ({
          tick: sample.tick,
          x: sample.x / TILE_FIXED_UNITS,
          y: sample.y / TILE_FIXED_UNITS,
        })),
      summary: projectCreatureObservationSummary(creature),
      latestDecision: (() => {
        const decision = [...state.decisionRecords]
          .reverse()
          .find((candidate) => candidate.actorId === creature.id);
        return decision
          ? {
              ...decision,
              strongestReason: decision.strongestReason
                ? {
                    ...decision.strongestReason,
                    sourceEventIds: [...decision.strongestReason.sourceEventIds],
                  }
                : null,
              candidates: decision.candidates.map((candidate) => ({
                ...candidate,
                factors: candidate.factors.map((factor) => ({
                  ...factor,
                  evidenceEventIds: [...factor.evidenceEventIds],
                  fact: factor.fact
                    ? {
                        ...factor.fact,
                        sourceEventIds: [...factor.fact.sourceEventIds],
                      }
                    : null,
                })),
              })),
            }
          : null;
      })(),
      memories: state.memories
        .filter((memory) => memory.ownerId === creature.id)
        .sort(
          (left, right) =>
            right.strength - left.strength ||
            right.importance - left.importance ||
            right.createdTick - left.createdTick ||
            left.id - right.id,
        )
        .slice(0, MAX_PROJECTED_MEMORIES_PER_CREATURE)
        .map((memory) => ({
          ...memory,
          sourceEventIds: [...memory.sourceEventIds],
        })),
      relationships: state.relationships
        .filter(
          (relationship) =>
            relationship.fromId === creature.id || relationship.toId === creature.id,
        )
        .sort(
          (left, right) =>
            relationshipSalience(right) - relationshipSalience(left) || left.id - right.id,
        )
        .slice(0, MAX_PROJECTED_RELATIONSHIPS_PER_CREATURE)
        .map((relationship) => ({
          ...relationship,
          significantEventIds: [...relationship.significantEventIds],
        })),
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
    recentEvents: state.domainEvents
      .filter(
        (event) =>
          event.attentionTier !== "ROUTINE" ||
          event.type === "SIMULATION_STARTED" ||
          event.type.startsWith("PLAYER_"),
      )
      .slice(-MAX_PROJECTED_ATTENTION_EVENTS)
      .map((event) => ({
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
