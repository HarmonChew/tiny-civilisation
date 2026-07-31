import { addHistory } from "./events.js";
import { manhattanDistance } from "./pathfinding.js";
import { getCreature, getRelationship, refreshRelationshipIndex } from "./tick-context.js";
import type {
  CreatureState,
  EpisodicMemory,
  MemoryKind,
  RelationshipEdge,
  SimulationState,
} from "./types.js";

const UNIT_MAX = 10_000;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));
const clampUnit = (value: number): number => clamp(value, 0, UNIT_MAX);

export function relationshipFrom(
  state: SimulationState,
  fromId: number,
  toId: number,
): RelationshipEdge | null {
  return getRelationship(state, fromId, toId);
}

function enforceRelationshipBound(state: SimulationState, ownerId: number): void {
  const owned = state.relationships.filter((edge) => edge.fromId === ownerId);
  const excess = owned.length - state.configuration.maxRelationshipsPerCreature;
  if (excess <= 0) return;
  owned.sort((left, right) => {
    const leftValue = Math.abs(left.trust) + left.fear + left.rivalry + left.familiarity;
    const rightValue =
      Math.abs(right.trust) + right.fear + right.rivalry + right.familiarity;
    return leftValue - rightValue || left.lastInteractionTick - right.lastInteractionTick;
  });
  const removeIds = new Set(owned.slice(0, excess).map((edge) => edge.id));
  state.relationships = state.relationships.filter((edge) => !removeIds.has(edge.id));
}

function ensureRelationship(
  state: SimulationState,
  fromId: number,
  toId: number,
): RelationshipEdge {
  const existing = relationshipFrom(state, fromId, toId);
  if (existing) return existing;
  const edge: RelationshipEdge = {
    id: state.nextRelationshipId++,
    fromId,
    toId,
    trust: 0,
    fear: 0,
    familiarity: 0,
    rivalry: 0,
    lastInteractionTick: state.tick,
    significantEventIds: [],
  };
  state.relationships.push(edge);
  enforceRelationshipBound(state, fromId);
  refreshRelationshipIndex(state);
  return edge;
}

export interface RelationshipDelta {
  trust?: number;
  fear?: number;
  familiarity?: number;
  rivalry?: number;
}

export function changeRelationship(
  state: SimulationState,
  fromId: number,
  toId: number,
  delta: RelationshipDelta,
  eventId = 0,
): RelationshipEdge {
  const edge = ensureRelationship(state, fromId, toId);
  const previousTrust = edge.trust;
  edge.trust = clamp(edge.trust + (delta.trust ?? 0), -UNIT_MAX, UNIT_MAX);
  edge.fear = clampUnit(edge.fear + (delta.fear ?? 0));
  edge.familiarity = clampUnit(edge.familiarity + (delta.familiarity ?? 0));
  edge.rivalry = clampUnit(edge.rivalry + (delta.rivalry ?? 0));
  edge.lastInteractionTick = state.tick;
  if (eventId > 0) {
    edge.significantEventIds.push(eventId);
    if (edge.significantEventIds.length > 8) edge.significantEventIds.shift();
  }
  if (previousTrust < 3_000 && edge.trust >= 3_000 && eventId > 0) {
    const from = getCreature(state, fromId);
    const to = getCreature(state, toId);
    if (from && to) {
      addHistory(
        state,
        "SOCIAL_BOND",
        `${from.name} came to trust ${to.name}`,
        `${from.name}'s trust in ${to.name} became durable after repeated help.`,
        [eventId],
        [fromId, toId],
        from.groupId === null ? [] : [from.groupId],
        35,
      );
    }
  }
  return edge;
}

export function addMemory(
  state: SimulationState,
  owner: CreatureState,
  kind: MemoryKind,
  subjectEntityId: number | null,
  locationTileIndex: number | null,
  valence: number,
  importance: number,
  sourceEventIds: number[],
): EpisodicMemory {
  const memory: EpisodicMemory = {
    id: state.nextMemoryId++,
    ownerId: owner.id,
    kind,
    createdTick: state.tick,
    subjectEntityId,
    locationTileIndex,
    valence,
    importance: clampUnit(importance),
    strength: clampUnit(importance),
    sourceEventIds: [...sourceEventIds],
  };
  state.memories.push(memory);
  owner.memoryIds.push(memory.id);
  if (owner.memoryIds.length > state.configuration.maxMemoriesPerCreature) {
    const owned = owner.memoryIds
      .map((id) => state.memories.find((item) => item.id === id))
      .filter((item): item is EpisodicMemory => Boolean(item))
      .sort(
        (left, right) =>
          left.importance + left.strength - (right.importance + right.strength) ||
          left.createdTick - right.createdTick,
      );
    const toRemove = owned[0];
    if (toRemove) {
      owner.memoryIds = owner.memoryIds.filter((id) => id !== toRemove.id);
      state.memories = state.memories.filter((item) => item.id !== toRemove.id);
    }
  }
  return memory;
}

export function currentDecisionIds(creature: CreatureState): number[] {
  return creature.activeGoal ? [creature.activeGoal.decisionRecordId] : [];
}

export function updateProximityRelationships(state: SimulationState): void {
  if (state.tick % 10 !== 0) return;
  for (let leftIndex = 0; leftIndex < state.creatures.length; leftIndex += 1) {
    const left = state.creatures[leftIndex];
    if (!left?.alive) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < state.creatures.length;
      rightIndex += 1
    ) {
      const right = state.creatures[rightIndex];
      if (!right?.alive) continue;
      if (manhattanDistance(state.world, left.tileIndex, right.tileIndex) <= 4) {
        changeRelationship(state, left.id, right.id, { familiarity: 34 });
        changeRelationship(state, right.id, left.id, { familiarity: 34 });
      }
    }
  }
}
