import { findPath, manhattanDistance, tileCoordinates, tileIndexAt } from "./pathfinding.js";
import { keyedRandomU32, keyedRandomUnit } from "./rng.js";
import {
  TILE_FIXED_UNITS,
  type ActionKind,
  type ActiveAction,
  type CreatureState,
  type DecisionCandidate,
  type DecisionRecord,
  type DecisionSwitchReason,
  type DomainEvent,
  type DomainEventType,
  type EpisodicMemory,
  type GroupState,
  type HistoricalEventType,
  type Inventory,
  type MemoryKind,
  type PlayerCommand,
  type RelationshipEdge,
  type RenderSnapshot,
  type ResourceKind,
  type ResourceNode,
  type ScheduledPlayerCommand,
  type SimulationState,
  type StructureState,
  type UtilityFactor,
} from "./types.js";
import { createPetriWorld, populateInitialWorld } from "./world.js";

export const TICKS_PER_SECOND = 10;
const SCHEMA_VERSION = 1;
const UNIT_MAX = 10_000;
const HISTORY_TICKS_PER_MINUTE = 10;
const HISTORY_MINUTES_PER_DAY = 24 * 60;
const MOVEMENT_SPEED = 128;

const ACTION_DURATION: Record<ActionKind, number> = {
  EXPLORE: 2,
  GATHER_FOOD: 11,
  GATHER_MATERIAL: 13,
  EAT: 4,
  REST: 22,
  SHARE: 4,
  KEEP: 10,
  STEAL: 5,
  DEPOSIT: 4,
  WITHDRAW: 4,
  BUILD_STORAGE: 14,
  GUARD: 34,
  ATTACK: 4,
  FLEE: 3,
  JOIN_GROUP: 5,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function clampUnit(value: number): number {
  return clamp(value, 0, UNIT_MAX);
}

function inventoryTotal(inventory: Inventory): number {
  return inventory.food + inventory.material;
}

function inventorySpace(inventory: Inventory): number {
  return Math.max(0, inventory.capacity - inventoryTotal(inventory));
}

function getCreature(state: SimulationState, id: number): CreatureState | null {
  return state.creatures.find((creature) => creature.id === id) ?? null;
}

function getResourceNode(state: SimulationState, id: number): ResourceNode | null {
  return state.resourceNodes.find((node) => node.id === id) ?? null;
}

function getStructure(state: SimulationState, id: number): StructureState | null {
  return state.structures.find((structure) => structure.id === id) ?? null;
}

function getGroup(state: SimulationState, id: number): GroupState | null {
  return state.groups.find((group) => group.id === id) ?? null;
}

function tileCenter(
  state: SimulationState,
  tileIndex: number,
): { x: number; y: number } {
  const point = tileCoordinates(state.world, tileIndex);
  return {
    x: point.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
    y: point.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
  };
}

function entityTile(state: SimulationState, entityId: number): number | null {
  const creature = getCreature(state, entityId);
  if (creature) {
    return creature.tileIndex;
  }
  const resource = getResourceNode(state, entityId);
  if (resource) {
    return resource.tileIndex;
  }
  const structure = getStructure(state, entityId);
  return structure?.tileIndex ?? null;
}

function isWalkableTile(state: SimulationState, tileIndex: number): boolean {
  const tile = state.world.tiles[tileIndex];
  return Boolean(tile && !tile.blocked);
}

interface DomainEventInput {
  type: DomainEventType;
  actorIds?: number[];
  targetIds?: number[];
  groupIds?: number[];
  locationTileIndex?: number | null;
  resourceKind?: ResourceKind | null;
  quantity?: number;
  causedByEventIds?: number[];
  decisionRecordIds?: number[];
  importance?: number;
  summary: string;
}

function historicallyProtectedEventIds(state: SimulationState): Set<number> {
  const protectedIds = new Set<number>();
  for (const history of state.historyEvents) {
    for (const id of history.sourceEventIds) {
      protectedIds.add(id);
    }
  }
  for (const memory of state.memories) {
    for (const id of memory.sourceEventIds) {
      protectedIds.add(id);
    }
  }
  for (const group of state.groups) {
    for (const id of group.majorEventIds) {
      protectedIds.add(id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of state.domainEvents) {
      if (!protectedIds.has(event.id)) {
        continue;
      }
      for (const causeId of event.causedByEventIds) {
        if (!protectedIds.has(causeId)) {
          protectedIds.add(causeId);
          changed = true;
        }
      }
    }
  }
  return protectedIds;
}

function emitDomainEvent(
  state: SimulationState,
  input: DomainEventInput,
): DomainEvent {
  const event: DomainEvent = {
    id: state.nextEventId++,
    tick: state.tick,
    type: input.type,
    actorIds: input.actorIds ? [...input.actorIds] : [],
    targetIds: input.targetIds ? [...input.targetIds] : [],
    groupIds: input.groupIds ? [...input.groupIds] : [],
    locationTileIndex: input.locationTileIndex ?? null,
    resourceKind: input.resourceKind ?? null,
    quantity: input.quantity ?? 0,
    causedByEventIds: input.causedByEventIds
      ? [...input.causedByEventIds]
      : [],
    decisionRecordIds: input.decisionRecordIds
      ? [...input.decisionRecordIds]
      : [],
    importance: input.importance ?? 10,
    summary: input.summary,
  };
  state.domainEvents.push(event);
  while (state.domainEvents.length > state.configuration.maxDomainEvents) {
    const protectedIds = historicallyProtectedEventIds(state);
    for (const retained of state.domainEvents) {
      for (const causeId of retained.causedByEventIds) {
        protectedIds.add(causeId);
      }
    }
    const removableIndex = state.domainEvents.findIndex(
      (candidate) => !protectedIds.has(candidate.id),
    );
    state.domainEvents.splice(removableIndex < 0 ? 0 : removableIndex, 1);
  }
  return event;
}

function addHistory(
  state: SimulationState,
  type: HistoricalEventType,
  title: string,
  summary: string,
  sourceEventIds: number[],
  actorIds: number[],
  groupIds: number[],
  importance: number,
): void {
  state.historyEvents.push({
    id: state.nextHistoryId++,
    tick: state.tick,
    type,
    title,
    summary,
    sourceEventIds: [...sourceEventIds],
    actorIds: [...actorIds],
    groupIds: [...groupIds],
    importance,
  });
  if (state.historyEvents.length > state.configuration.maxHistoryEvents) {
    state.historyEvents.splice(
      0,
      state.historyEvents.length - state.configuration.maxHistoryEvents,
    );
  }
}

function relationshipFrom(
  state: SimulationState,
  fromId: number,
  toId: number,
): RelationshipEdge | null {
  return (
    state.relationships.find(
      (edge) => edge.fromId === fromId && edge.toId === toId,
    ) ?? null
  );
}

function ensureRelationship(
  state: SimulationState,
  fromId: number,
  toId: number,
): RelationshipEdge {
  const existing = relationshipFrom(state, fromId, toId);
  if (existing) {
    return existing;
  }
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
  return edge;
}

function enforceRelationshipBound(state: SimulationState, ownerId: number): void {
  const owned = state.relationships.filter((edge) => edge.fromId === ownerId);
  const excess =
    owned.length - state.configuration.maxRelationshipsPerCreature;
  if (excess <= 0) {
    return;
  }
  owned.sort((left, right) => {
    const leftValue =
      Math.abs(left.trust) + left.fear + left.rivalry + left.familiarity;
    const rightValue =
      Math.abs(right.trust) + right.fear + right.rivalry + right.familiarity;
    return leftValue - rightValue || left.lastInteractionTick - right.lastInteractionTick;
  });
  const removeIds = new Set(owned.slice(0, excess).map((edge) => edge.id));
  state.relationships = state.relationships.filter(
    (edge) => !removeIds.has(edge.id),
  );
}

interface RelationshipDelta {
  trust?: number;
  fear?: number;
  familiarity?: number;
  rivalry?: number;
}

function changeRelationship(
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
    if (edge.significantEventIds.length > 8) {
      edge.significantEventIds.shift();
    }
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

function addMemory(
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

function currentDecisionIds(creature: CreatureState): number[] {
  return creature.activeGoal ? [creature.activeGoal.decisionRecordId] : [];
}

export function createSimulation(seed = 4_182): SimulationState {
  const normalizedSeed = seed >>> 0;
  const state: SimulationState = {
    schemaVersion: SCHEMA_VERSION,
    seed: normalizedSeed,
    tick: 0,
    nextEntityId: 1,
    nextCommandId: 1,
    nextEventId: 1,
    nextHistoryId: 1,
    nextDecisionId: 1,
    nextMemoryId: 1,
    nextRelationshipId: 1,
    nextGroupId: 1,
    randomState: (normalizedSeed ^ 0xa5a5a5a5) >>> 0,
    world: createPetriWorld(),
    creatures: [],
    resourceNodes: [],
    structures: [],
    groups: [],
    relationships: [],
    memories: [],
    commandQueue: [],
    domainEvents: [],
    historyEvents: [],
    decisionRecords: [],
    metrics: {
      foodGathered: 0,
      foodShared: 0,
      thefts: 0,
      witnessedThefts: 0,
      attacks: 0,
      groupsFormed: 0,
      storagesCompleted: 0,
      playerInterventions: 0,
      invalidPathFailures: 0,
    },
    configuration: {
      ticksPerSecond: TICKS_PER_SECOND,
      maxDomainEvents: 2_000,
      maxHistoryEvents: 500,
      maxDecisionRecords: 512,
      maxMemoriesPerCreature: 48,
      maxRelationshipsPerCreature: 32,
    },
  };
  populateInitialWorld(state);
  emitDomainEvent(state, {
    type: "SIMULATION_STARTED",
    importance: 30,
    summary: `The Petri world began with seed ${normalizedSeed}.`,
  });
  return state;
}

function resolveCommandTile(
  state: SimulationState,
  command: PlayerCommand,
): number {
  if (typeof command.tileIndex === "number") {
    return command.tileIndex;
  }
  if (typeof command.x === "number" && typeof command.y === "number") {
    return tileIndexAt(state.world, Math.floor(command.x), Math.floor(command.y));
  }
  if (command.type === "ADD_FOOD" || command.type === "REMOVE_FOOD") {
    return tileIndexAt(state.world, 10, 7);
  }
  return tileIndexAt(state.world, 24, 15);
}

export function queuePlayerCommand(
  state: SimulationState,
  command: PlayerCommand,
): ScheduledPlayerCommand {
  let tileIndex = resolveCommandTile(state, command);
  if (tileIndex < 0 || tileIndex >= state.world.tiles.length) {
    throw new RangeError(`Player command targets invalid tile ${tileIndex}.`);
  }
  if (command.type === "ADD_FOOD" && !isWalkableTile(state, tileIndex)) {
    tileIndex = findNearestWalkable(state, tileIndex);
  }
  const applyAtTick = Math.max(
    state.tick,
    Math.floor(command.applyAtTick ?? state.tick),
  );
  const scheduled: ScheduledPlayerCommand = {
    commandId: state.nextCommandId++,
    applyAtTick,
    type: command.type,
    tileIndex,
    amount:
      command.type === "ADD_FOOD" || command.type === "REMOVE_FOOD"
        ? Math.max(1, Math.floor(command.amount ?? 12))
        : 0,
    blocked:
      command.type === "TOGGLE_OBSTACLE" && typeof command.blocked === "boolean"
        ? command.blocked
        : null,
  };
  state.commandQueue.push(scheduled);
  state.commandQueue.sort(
    (left, right) =>
      left.applyAtTick - right.applyAtTick || left.commandId - right.commandId,
  );
  return scheduled;
}

function applyScheduledCommands(state: SimulationState): void {
  const ready = state.commandQueue.filter(
    (command) => command.applyAtTick === state.tick,
  );
  state.commandQueue = state.commandQueue.filter(
    (command) => command.applyAtTick > state.tick,
  );
  for (const command of ready) {
    state.metrics.playerInterventions += 1;
    if (command.type === "ADD_FOOD") {
      let node =
        state.resourceNodes.find(
          (candidate) =>
            candidate.kind === "FOOD" &&
            candidate.tileIndex === command.tileIndex,
        ) ?? null;
      if (!node) {
        node = {
          id: state.nextEntityId++,
          kind: "FOOD",
          tileIndex: command.tileIndex,
          currentStock: 0,
          maximumStock: Math.max(40, command.amount),
          regenerationEveryTicks: 40,
          regenerationAmount: 1,
        };
        state.resourceNodes.push(node);
      }
      node.maximumStock = Math.max(node.maximumStock, node.currentStock + command.amount);
      node.currentStock += command.amount;
      const event = emitDomainEvent(state, {
        type: "PLAYER_ADDED_FOOD",
        targetIds: [node.id],
        locationTileIndex: command.tileIndex,
        resourceKind: "FOOD",
        quantity: command.amount,
        importance: 55,
        summary: `The observer added ${command.amount} food units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Food appeared",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else if (command.type === "REMOVE_FOOD") {
      let remaining = command.amount;
      let removed = 0;
      for (const node of state.resourceNodes) {
        if (
          node.kind !== "FOOD" ||
          node.tileIndex !== command.tileIndex ||
          remaining <= 0
        ) {
          continue;
        }
        const quantity = Math.min(remaining, node.currentStock);
        node.currentStock -= quantity;
        remaining -= quantity;
        removed += quantity;
      }
      const event = emitDomainEvent(state, {
        type: "PLAYER_REMOVED_FOOD",
        locationTileIndex: command.tileIndex,
        resourceKind: "FOOD",
        quantity: removed,
        importance: 55,
        summary: `The observer removed ${removed} food units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Food vanished",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else {
      const tile = state.world.tiles[command.tileIndex];
      if (!tile) {
        continue;
      }
      const nextBlocked = command.blocked ?? !tile.blocked;
      const occupied =
        state.creatures.some(
          (creature) => creature.alive && creature.tileIndex === command.tileIndex,
        ) ||
        state.resourceNodes.some(
          (node) => node.tileIndex === command.tileIndex,
        ) ||
        state.structures.some(
          (structure) => structure.tileIndex === command.tileIndex,
        );
      if (nextBlocked && occupied) {
        const event = emitDomainEvent(state, {
          type: "PLAYER_TOGGLED_OBSTACLE",
          locationTileIndex: command.tileIndex,
          quantity: 0,
          importance: 20,
          summary:
            "A barrier could not form on a tile occupied by a creature, resource, or structure.",
        });
        addHistory(
          state,
          "INTERVENTION",
          "A barrier placement was obstructed",
          event.summary,
          [event.id],
          [],
          [],
          20,
        );
        continue;
      }
      tile.blocked = nextBlocked;
      tile.terrain = nextBlocked ? "ROCK" : "GROUND";
      tile.walkCost = 10;
      state.world.navigationRevision += 1;
      tile.navigationRevision = state.world.navigationRevision;
      const event = emitDomainEvent(state, {
        type: "PLAYER_TOGGLED_OBSTACLE",
        locationTileIndex: command.tileIndex,
        quantity: nextBlocked ? 1 : 0,
        importance: 60,
        summary: `The observer ${nextBlocked ? "closed" : "opened"} a passage.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        nextBlocked ? "A passage closed" : "A passage opened",
        event.summary,
        [event.id],
        [],
        [],
        60,
      );
    }
  }
}

function updateNeeds(state: SimulationState): void {
  for (const creature of state.creatures) {
    if (!creature.alive) {
      continue;
    }
    const moving = creature.activeAction?.phase === "MOVING";
    creature.needs.hunger = clampUnit(creature.needs.hunger + 4);
    creature.needs.fatigue = clampUnit(
      creature.needs.fatigue + (moving ? 4 : creature.activeAction ? 3 : 1),
    );
    if (creature.needs.hunger >= 9_400) {
      creature.health = clamp(creature.health - 2, 1_200, UNIT_MAX);
    }
    if (creature.needs.fatigue >= 9_500) {
      creature.health = clamp(creature.health - 1, 1_200, UNIT_MAX);
    }
  }
}

function regenerateResources(state: SimulationState): void {
  for (const node of state.resourceNodes) {
    if (
      node.regenerationEveryTicks > 0 &&
      state.tick > 0 &&
      state.tick % node.regenerationEveryTicks === 0
    ) {
      node.currentStock = Math.min(
        node.maximumStock,
        node.currentStock + node.regenerationAmount,
      );
    }
  }
}

function updateProximityRelationships(state: SimulationState): void {
  if (state.tick % 10 !== 0) {
    return;
  }
  for (let leftIndex = 0; leftIndex < state.creatures.length; leftIndex += 1) {
    const left = state.creatures[leftIndex];
    if (!left?.alive) {
      continue;
    }
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < state.creatures.length;
      rightIndex += 1
    ) {
      const right = state.creatures[rightIndex];
      if (!right?.alive) {
        continue;
      }
      if (manhattanDistance(state.world, left.tileIndex, right.tileIndex) <= 4) {
        changeRelationship(state, left.id, right.id, {
          familiarity: 34,
        });
        changeRelationship(state, right.id, left.id, {
          familiarity: 34,
        });
      }
    }
  }
}

function findNearestWalkable(
  state: SimulationState,
  preferredTileIndex: number,
): number {
  if (isWalkableTile(state, preferredTileIndex)) {
    return preferredTileIndex;
  }
  const preferred = tileCoordinates(state.world, preferredTileIndex);
  for (let radius = 1; radius <= 8; radius += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        if (Math.abs(xOffset) !== radius && Math.abs(yOffset) !== radius) {
          continue;
        }
        const candidate = tileIndexAt(
          state.world,
          preferred.x + xOffset,
          preferred.y + yOffset,
        );
        if (candidate >= 0 && isWalkableTile(state, candidate)) {
          return candidate;
        }
      }
    }
  }
  return preferredTileIndex;
}

function groupName(state: SimulationState, id: number): string {
  const first = ["Moss", "River", "Amber", "Fern", "Stone", "Reed"];
  const second = ["bank", "hollow", "reach", "rest", "bend", "gate"];
  const firstIndex =
    keyedRandomU32(state.seed, "group-name-a", state.tick, id) % first.length;
  const secondIndex =
    keyedRandomU32(state.seed, "group-name-b", state.tick, id) % second.length;
  return `${first[firstIndex] ?? "Moss"}${second[secondIndex] ?? "bank"}`;
}

function leaderSupport(
  state: SimulationState,
  creature: CreatureState,
  members: CreatureState[],
): number {
  let relationshipSupport = 0;
  for (const member of members) {
    if (member.id === creature.id) {
      continue;
    }
    relationshipSupport +=
      relationshipFrom(state, member.id, creature.id)?.trust ?? 0;
  }
  return (
    creature.traits.sociability * 2 +
    creature.traits.generosity +
    creature.traits.loyalty +
    creature.skills.foraging +
    creature.skills.combat / 2 +
    relationshipSupport +
    (keyedRandomUnit(
      state.seed,
      "leader-support",
      state.tick - (state.tick % 50),
      creature.id,
    ) -
      5_000) /
      8
  );
}

function selectLeader(
  state: SimulationState,
  group: GroupState,
  recordHistory: boolean,
): void {
  const members = group.memberIds
    .map((id) => getCreature(state, id))
    .filter((creature): creature is CreatureState => Boolean(creature?.alive));
  if (members.length === 0) {
    group.leaderId = null;
    return;
  }
  const ranked = members
    .map((creature) => ({
      creature,
      support: leaderSupport(state, creature, members),
    }))
    .sort(
      (left, right) =>
        right.support - left.support || left.creature.id - right.creature.id,
    );
  const selected = ranked[0]?.creature ?? members[0];
  if (!selected || group.leaderId === selected.id) {
    return;
  }
  const previous = group.leaderId;
  group.leaderId = selected.id;
  const event = emitDomainEvent(state, {
    type: "LEADER_SELECTED",
    actorIds: [selected.id],
    targetIds: previous === null ? [] : [previous],
    groupIds: [group.id],
    locationTileIndex: group.homeTileIndex,
    importance: 65,
    summary:
      previous === null
        ? `${selected.name} became the first leader of ${group.name}.`
        : `${selected.name} replaced ${getCreature(state, previous)?.name ?? "the former leader"} as leader of ${group.name}.`,
  });
  group.majorEventIds.push(event.id);
  if (recordHistory) {
    addHistory(
      state,
      "LEADERSHIP",
      `${selected.name} became leader`,
      event.summary,
      [event.id],
      previous === null ? [selected.id] : [selected.id, previous],
      [group.id],
      65,
    );
  }
}

function formGroup(state: SimulationState, members: CreatureState[]): void {
  let sumX = 0;
  let sumY = 0;
  for (const member of members) {
    const point = tileCoordinates(state.world, member.tileIndex);
    sumX += point.x;
    sumY += point.y;
  }
  const home = findNearestWalkable(
    state,
    tileIndexAt(
      state.world,
      Math.round(sumX / members.length),
      Math.round(sumY / members.length),
    ),
  );
  const id = state.nextGroupId++;
  const group: GroupState = {
    id,
    name: groupName(state, id),
    stage: "PROVISIONAL",
    foundedTick: state.tick,
    memberIds: members.map((member) => member.id).sort((a, b) => a - b),
    leaderId: null,
    homeTileIndex: home,
    storageStructureId: null,
    cohesion: 5_000,
    sharingNorm: 1_000,
    majorEventIds: [],
  };
  state.groups.push(group);
  for (const member of members) {
    member.groupId = id;
  }
  state.metrics.groupsFormed += 1;
  const event = emitDomainEvent(state, {
    type: "GROUP_FOUNDED",
    actorIds: group.memberIds,
    groupIds: [id],
    locationTileIndex: home,
    importance: 80,
    summary: `${members.map((member) => member.name).join(", ")} formed the ${group.name} group around repeated sharing and sustained proximity.`,
  });
  group.majorEventIds.push(event.id);
  for (const member of members) {
    addMemory(
      state,
      member,
      "GROUP_FOUNDED",
      null,
      home,
      4_000,
      7_500,
      [event.id],
    );
  }
  addHistory(
    state,
    "GROUP_FORMED",
    `The ${group.name} group formed`,
    event.summary,
    [event.id],
    group.memberIds,
    [id],
    80,
  );
  selectLeader(state, group, true);
}

function updateGroups(state: SimulationState): void {
  if (state.tick % 50 !== 0) {
    return;
  }

  const eligible = state.creatures
    .filter(
      (creature) =>
        creature.alive &&
        creature.groupId === null &&
        creature.traits.sociability >= 3_500,
    )
    .sort((left, right) => left.id - right.id);
  const unvisited = new Set(eligible.map((creature) => creature.id));
  for (const seed of eligible) {
    if (!unvisited.has(seed.id)) {
      continue;
    }
    const memberIds: number[] = [];
    const frontier = [seed.id];
    unvisited.delete(seed.id);
    while (frontier.length > 0) {
      const currentId = frontier.shift();
      if (currentId === undefined) {
        break;
      }
      memberIds.push(currentId);
      for (const candidate of eligible) {
        if (!unvisited.has(candidate.id)) {
          continue;
        }
        const forward = relationshipFrom(state, currentId, candidate.id);
        const backward = relationshipFrom(state, candidate.id, currentId);
        const familiar =
          (forward?.familiarity ?? 0) >= 300 &&
          (backward?.familiarity ?? 0) >= 300;
        const safe =
          (forward?.trust ?? 0) > -500 && (backward?.trust ?? 0) > -500;
        if (familiar && safe) {
          unvisited.delete(candidate.id);
          frontier.push(candidate.id);
        }
      }
    }
    const cooperativeEvents = state.domainEvents.filter(
      (event) =>
        event.type === "FOOD_SHARED" &&
        event.tick >= state.tick - 500 &&
        event.actorIds.some((id) => memberIds.includes(id)) &&
        event.targetIds.some((id) => memberIds.includes(id)),
    ).length;
    if (memberIds.length >= 3 && cooperativeEvents >= 2) {
      const members = memberIds
        .map((id) => getCreature(state, id))
        .filter((creature): creature is CreatureState => Boolean(creature));
      formGroup(state, members);
    }
  }

  for (const group of state.groups) {
    const members = group.memberIds
      .map((id) => getCreature(state, id))
      .filter((creature): creature is CreatureState => Boolean(creature?.alive));
    let trustTotal = 0;
    let trustCount = 0;
    for (const member of members) {
      for (const other of members) {
        if (member.id === other.id) {
          continue;
        }
        const edge = relationshipFrom(state, member.id, other.id);
        if (edge) {
          trustTotal += edge.trust + edge.familiarity / 2;
          trustCount += 1;
        }
      }
      if (group.leaderId === member.id) {
        member.role = "LEADER";
      } else if (member.actionCounts.GUARD > member.actionCounts.GATHER_FOOD) {
        member.role = "GUARD";
      } else if (
        member.actionCounts.BUILD_STORAGE >
        member.actionCounts.GATHER_FOOD
      ) {
        member.role = "BUILDER";
      } else {
        member.role = "FORAGER";
      }
    }
    group.cohesion = clampUnit(
      4_000 + (trustCount === 0 ? 0 : trustTotal / trustCount),
    );
    if (group.leaderId === null || state.tick % 200 === 0) {
      selectLeader(state, group, false);
    }
  }
}

function factor(
  key: string,
  contribution: number,
  evidenceEventIds: number[] = [],
): UtilityFactor {
  return {
    key,
    contribution: Math.round(contribution),
    evidenceEventIds: [...evidenceEventIds],
  };
}

function scoredCandidate(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: number | null,
  targetTileIndex: number | null,
  factors: UtilityFactor[],
): DecisionCandidate {
  const noise =
    (keyedRandomUnit(
      state.seed,
      `decision-${action}`,
      state.tick,
      creature.id,
      targetEntityId ?? targetTileIndex ?? 0,
    ) %
      161) -
    80;
  const allFactors = [...factors, factor("bounded decision variation", noise)];
  return {
    action,
    targetEntityId,
    targetTileIndex,
    utility: allFactors.reduce(
      (total, utilityFactor) => total + utilityFactor.contribution,
      0,
    ),
    factors: allFactors,
  };
}

function groupStorage(
  state: SimulationState,
  groupId: number | null,
): StructureState | null {
  if (groupId === null) {
    return null;
  }
  const group = getGroup(state, groupId);
  return group?.storageStructureId === null || group?.storageStructureId === undefined
    ? null
    : getStructure(state, group.storageStructureId);
}

function nearestResourceCandidates(
  state: SimulationState,
  creature: CreatureState,
  kind: ResourceKind,
): ResourceNode[] {
  return state.resourceNodes
    .filter((node) => node.kind === kind && node.currentStock > 0)
    .sort(
      (left, right) =>
        manhattanDistance(state.world, creature.tileIndex, left.tileIndex) -
          manhattanDistance(state.world, creature.tileIndex, right.tileIndex) ||
        left.id - right.id,
    )
    .slice(0, 2);
}

function recentEvidence(edge: RelationshipEdge | null): number[] {
  if (!edge || edge.significantEventIds.length === 0) {
    return [];
  }
  return edge.significantEventIds.slice(-2);
}

function findFleeTile(
  state: SimulationState,
  creature: CreatureState,
  threat: CreatureState,
): number {
  const position = tileCoordinates(state.world, creature.tileIndex);
  const threatPosition = tileCoordinates(state.world, threat.tileIndex);
  const xDirection = position.x >= threatPosition.x ? 1 : -1;
  const yDirection = position.y >= threatPosition.y ? 1 : -1;
  const preferred = tileIndexAt(
    state.world,
    clamp(position.x + xDirection * 7, 1, state.world.width - 2),
    clamp(position.y + yDirection * 5, 1, state.world.height - 2),
  );
  return findNearestWalkable(state, preferred);
}

function ticksSinceActorEvent(
  state: SimulationState,
  type: DomainEventType,
  actorId: number,
  targetId: number | null = null,
): number {
  for (let index = state.domainEvents.length - 1; index >= 0; index -= 1) {
    const event = state.domainEvents[index];
    if (
      event?.type === type &&
      event.actorIds.includes(actorId) &&
      (targetId === null || event.targetIds.includes(targetId))
    ) {
      return state.tick - event.tick;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function generateCandidates(
  state: SimulationState,
  creature: CreatureState,
): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = [];
  const hunger = creature.needs.hunger;
  const fatigue = creature.needs.fatigue;
  const space = inventorySpace(creature.inventory);
  const ownGroup = getGroup(state, creature.groupId ?? -1);
  const ownStorage = groupStorage(state, creature.groupId);

  if (creature.inventory.food > 0 && hunger >= 2_000) {
    candidates.push(
      scoredCandidate(state, creature, "EAT", null, creature.tileIndex, [
        factor("eating opportunity", 900),
        factor("personal hunger", (hunger * 11) / 10),
        factor("low health", (UNIT_MAX - creature.health) / 4),
      ]),
    );
  }

  if (space > 0 && (hunger >= 2_500 || creature.inventory.food === 0)) {
    for (const node of nearestResourceCandidates(state, creature, "FOOD")) {
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        node.tileIndex,
      );
      candidates.push(
        scoredCandidate(state, creature, "GATHER_FOOD", node.id, node.tileIndex, [
          factor("survival work", 1_300),
          factor("personal hunger", (hunger * 4) / 5),
          factor("empty food reserve", creature.inventory.food === 0 ? 1_300 : 0),
          factor("foraging confidence", creature.skills.foraging / 5),
          factor("known stock", Math.min(1_000, node.currentStock * 35)),
          factor("travel cost", -distance * 52),
        ]),
      );
    }
  }

  if (fatigue >= 2_400) {
    const restTile = ownGroup?.homeTileIndex ?? creature.tileIndex;
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      restTile,
    );
    candidates.push(
      scoredCandidate(state, creature, "REST", null, restTile, [
        factor("need for rest", fatigue),
        factor("familiar home", ownGroup ? 700 : 100),
        factor("travel cost", -distance * 35),
        factor("urgent hunger", hunger > 8_000 ? -2_500 : 0),
      ]),
    );
  }

  if (creature.inventory.food > 0) {
    const recipients = state.creatures
      .filter(
        (other) =>
          other.alive &&
          other.id !== creature.id &&
          other.needs.hunger >= 5_300 &&
          (creature.traits.generosity >= 3_200 ||
            (relationshipFrom(state, creature.id, other.id)?.trust ?? 0) >=
              2_500) &&
          manhattanDistance(
            state.world,
            creature.tileIndex,
            other.tileIndex,
          ) <= 7,
      )
      .sort(
        (left, right) =>
          right.needs.hunger - left.needs.hunger || left.id - right.id,
      )
      .slice(0, 2);
    for (const recipient of recipients) {
      const edge = relationshipFrom(state, creature.id, recipient.id);
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        recipient.tileIndex,
      );
      candidates.push(
        scoredCandidate(
          state,
          creature,
          "SHARE",
          recipient.id,
          recipient.tileIndex,
          [
            factor("sharing opportunity", 450),
            factor("generous disposition", (creature.traits.generosity * 2) / 5),
            factor("recipient hunger", (recipient.needs.hunger * 2) / 5),
            factor("trust in recipient", (edge?.trust ?? 0) / 5, recentEvidence(edge)),
            factor("communal expectation", (ownGroup?.sharingNorm ?? 0) / 4),
            factor("own hunger", (-hunger * 7) / 20),
            factor("travel cost", -distance * 45),
          ],
        ),
      );
    }
    candidates.push(
      scoredCandidate(state, creature, "KEEP", null, creature.tileIndex, [
        factor("keep a reserve", 550),
        factor("personal hunger", hunger / 2),
        factor("private preference", (UNIT_MAX - creature.traits.generosity) / 4),
        factor("communal expectation", -(ownGroup?.sharingNorm ?? 0) / 6),
      ]),
    );
  }

  const storageComplete = ownStorage?.kind === "STORAGE" ? ownStorage : null;
  if (
    storageComplete &&
    creature.inventory.food >= 2 &&
    storageComplete.inventory.food < storageComplete.inventory.capacity
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "DEPOSIT",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("communal contribution", 1_000),
          factor("group loyalty", (creature.traits.loyalty * 2) / 5),
          factor("sharing norm", (ownGroup?.sharingNorm ?? 0) / 3),
          factor("surplus food", creature.inventory.food * 350),
          factor("own hunger", (-hunger * 3) / 10),
          factor("travel cost", -distance * 40),
        ],
      ),
    );
  }
  if (
    storageComplete &&
    creature.inventory.food === 0 &&
    hunger >= 5_800 &&
    storageComplete.inventory.food > 0
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "WITHDRAW",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("authorized access", 1_200),
          factor("personal hunger", hunger),
          factor("available group food", storageComplete.inventory.food * 180),
          factor("travel cost", -distance * 45),
        ],
      ),
    );
  }

  if (ownGroup && (!ownStorage || ownStorage.kind === "STORAGE_SITE")) {
    if (space > 0 && creature.inventory.material < 3) {
      for (const node of nearestResourceCandidates(state, creature, "MATERIAL").slice(0, 1)) {
        const distance = manhattanDistance(
          state.world,
          creature.tileIndex,
          node.tileIndex,
        );
        candidates.push(
          scoredCandidate(
            state,
            creature,
            "GATHER_MATERIAL",
            node.id,
            node.tileIndex,
            [
              factor("group needs a store", 2_500),
              factor("group loyalty", (creature.traits.loyalty * 2) / 5),
              factor("material opportunity", 1_000),
              factor("urgent hunger", hunger > 7_000 ? -3_500 : 0),
              factor("travel cost", -distance * 40),
            ],
          ),
        );
      }
    }
    const siteReadyForWork =
      ownStorage?.kind === "STORAGE_SITE" &&
      (ownStorage.material >= ownStorage.materialRequired ||
        creature.inventory.material > 0);
    if (creature.inventory.material > 0 || siteReadyForWork) {
      const targetTile = ownStorage?.tileIndex ?? ownGroup.homeTileIndex;
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        targetTile,
      );
      candidates.push(
        scoredCandidate(
          state,
          creature,
          "BUILD_STORAGE",
          ownStorage?.id ?? null,
          targetTile,
          [
            factor("shared storage opportunity", 2_800),
            factor("carried material", creature.inventory.material * 650),
            factor("group loyalty", (creature.traits.loyalty * 2) / 5),
            factor("construction progress", (ownStorage?.progress ?? 0) / 5),
            factor("urgent hunger", hunger > 7_500 ? -4_000 : 0),
            factor("travel cost", -distance * 42),
          ],
        ),
      );
    }
  }

  const completedStorages = state.structures
    .filter(
      (structure) =>
        structure.kind === "STORAGE" && structure.inventory.food > 0,
    )
    .sort(
      (left, right) =>
        manhattanDistance(state.world, creature.tileIndex, left.tileIndex) -
          manhattanDistance(state.world, creature.tileIndex, right.tileIndex) ||
        left.id - right.id,
    );
  const theftCoolingDown =
    ticksSinceActorEvent(state, "THEFT_COMMITTED", creature.id) < 1_800;
  if (
    inventorySpace(creature.inventory) > 0 &&
    hunger >= 1_200 &&
    (creature.traits.aggression >= 4_500 || hunger >= 7_500) &&
    !theftCoolingDown &&
    completedStorages.length > 0
  ) {
    const target = completedStorages[0];
    if (target) {
      const targetGroup = getGroup(state, target.groupId);
      const unauthorized = creature.groupId !== target.groupId;
      if (unauthorized || hunger >= 8_300) {
        const witnesses = state.creatures.filter(
          (other) =>
            other.alive &&
            other.id !== creature.id &&
            other.groupId === target.groupId &&
            manhattanDistance(state.world, other.tileIndex, target.tileIndex) <= 5,
        );
        const guardPenalty = target.guardIds.length > 0 ? 1_800 : 0;
        const groupFear = Math.max(
          0,
          ...(targetGroup?.memberIds.map(
            (memberId) =>
              relationshipFrom(state, creature.id, memberId)?.fear ?? 0,
          ) ?? []),
        );
        const distance = manhattanDistance(
          state.world,
          creature.tileIndex,
          target.tileIndex,
        );
        candidates.push(
          scoredCandidate(state, creature, "STEAL", target.id, target.tileIndex, [
            factor("desperation", (hunger * 3) / 4),
            factor(
              "aggressive opportunism",
              (creature.traits.aggression * 9) / 20,
            ),
            factor("food in storage", Math.min(2_200, target.inventory.food * 300)),
            factor("outsider access", unauthorized ? 1_800 : -900),
            factor("visible witnesses", -witnesses.length * 180),
            factor("active guard", -Math.min(1_200, guardPenalty)),
            factor("fear of defenders", -groupFear),
            factor("injury risk", -(UNIT_MAX - creature.health) / 2),
            factor("group loyalty", unauthorized ? 0 : -creature.traits.loyalty / 2),
            factor("travel cost", -distance * 48),
          ]),
        );
      }
    }
  }

  if (
    storageComplete &&
    (storageComplete.inventory.food >= 2 || state.tick - storageComplete.completedTick! < 500) &&
    creature.traits.loyalty >= 4_000 &&
    (storageComplete.guardIds.length < 2 ||
      storageComplete.guardIds.includes(creature.id))
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "GUARD",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("protect shared storage", 1_250),
          factor("group loyalty", creature.traits.loyalty / 3),
          factor("stored wealth", storageComplete.inventory.food * 170),
          factor("guard already present", -storageComplete.guardIds.length * 900),
          factor("personal fatigue", -fatigue / 4),
          factor("urgent hunger", hunger > 7_000 ? -3_000 : 0),
          factor("travel cost", -distance * 35),
        ],
      ),
    );
  }

  for (const edge of state.relationships) {
    if (edge.fromId !== creature.id || edge.rivalry < 900) {
      continue;
    }
    const target = getCreature(state, edge.toId);
    if (!target?.alive) {
      continue;
    }
    const attackCoolingDown =
      ticksSinceActorEvent(state, "CREATURE_ATTACKED", creature.id, target.id) <
      90;
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      target.tileIndex,
    );
    if (distance > 8) {
      continue;
    }
    if (
      !attackCoolingDown &&
      creature.health > 3_000 &&
      target.health > 2_500
    ) {
      candidates.push(
        scoredCandidate(state, creature, "ATTACK", target.id, target.tileIndex, [
          factor("aggressive disposition", (creature.traits.aggression * 2) / 5),
          factor("remembered grievance", edge.rivalry, recentEvidence(edge)),
          factor(
            "defend the group",
            creature.groupId !== null && creature.groupId !== target.groupId
              ? 1_800
              : 0,
            recentEvidence(edge),
          ),
          factor("confidence in combat", creature.skills.combat / 5),
          factor("fear of target", -edge.fear / 3, recentEvidence(edge)),
          factor("poor health", -(UNIT_MAX - creature.health) / 2),
          factor("travel cost", -distance * 55),
        ]),
      );
    }
    if (edge.fear >= 1_600 || creature.health < 5_000) {
      const fleeTile = findFleeTile(state, creature, target);
      candidates.push(
        scoredCandidate(state, creature, "FLEE", target.id, fleeTile, [
          factor("fear of aggressor", (edge.fear * 3) / 5, recentEvidence(edge)),
          factor("injury", UNIT_MAX - creature.health),
          factor("escape route", 1_200),
          factor("aggressive disposition", -creature.traits.aggression / 4),
        ]),
      );
    }
  }

  if (creature.groupId === null && creature.traits.sociability >= 3_500) {
    for (const group of state.groups) {
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        group.homeTileIndex,
      );
      if (distance > 14) {
        continue;
      }
      let affinity = 0;
      for (const memberId of group.memberIds) {
        affinity += relationshipFrom(state, creature.id, memberId)?.trust ?? 0;
      }
      candidates.push(
        scoredCandidate(
          state,
          creature,
          "JOIN_GROUP",
          group.id,
          group.homeTileIndex,
          [
            factor("social disposition", creature.traits.sociability / 2),
            factor("known member affinity", affinity / Math.max(1, group.memberIds.length)),
            factor("group safety", group.cohesion / 4),
            factor("loss of autonomy", -(UNIT_MAX - creature.traits.loyalty) / 5),
            factor("travel cost", -distance * 55),
          ],
        ),
      );
    }
  }

  if (candidates.length === 0) {
    const point = tileCoordinates(state.world, creature.tileIndex);
    const xOffset =
      (keyedRandomU32(state.seed, "explore-x", state.tick, creature.id) % 15) - 7;
    const yOffset =
      (keyedRandomU32(state.seed, "explore-y", state.tick, creature.id) % 11) - 5;
    const target = findNearestWalkable(
      state,
      tileIndexAt(
        state.world,
        clamp(point.x + xOffset, 1, state.world.width - 2),
        clamp(point.y + yOffset, 1, state.world.height - 2),
      ),
    );
    candidates.push(
      scoredCandidate(state, creature, "EXPLORE", null, target, [
        factor("no pressing need", 900),
        factor("nearby novelty", 400),
        factor("fatigue", -fatigue / 8),
      ]),
    );
  }

  if (creature.activeGoal) {
    for (const candidate of candidates) {
      if (
        candidate.action === creature.activeGoal.kind &&
        candidate.targetEntityId === creature.activeGoal.targetEntityId
      ) {
        const completion = creature.activeAction?.progress ?? 0;
        const continuation = Math.round(500 + completion / 8);
        candidate.factors.push(factor("goal continuity", continuation));
        candidate.utility += continuation;
      }
    }
  }

  return candidates
    .sort(
      (left, right) =>
        right.utility - left.utility ||
        (left.action < right.action ? -1 : left.action > right.action ? 1 : 0) ||
        (left.targetEntityId ?? -1) - (right.targetEntityId ?? -1),
    )
    .slice(0, 10);
}

function targetTileForCandidate(
  state: SimulationState,
  candidate: DecisionCandidate,
): number | null {
  if (candidate.targetTileIndex !== null) {
    return candidate.targetTileIndex;
  }
  if (candidate.targetEntityId === null) {
    return null;
  }
  if (candidate.action === "JOIN_GROUP") {
    return getGroup(state, candidate.targetEntityId)?.homeTileIndex ?? null;
  }
  return entityTile(state, candidate.targetEntityId);
}

function beginAction(
  state: SimulationState,
  creature: CreatureState,
  candidate: DecisionCandidate,
  decisionId: number,
): boolean {
  const targetTile = targetTileForCandidate(state, candidate) ?? creature.tileIndex;
  const path = findPath(state.world, creature.tileIndex, targetTile);
  if (path.length === 0) {
    state.metrics.invalidPathFailures += 1;
    creature.activeGoal = null;
    creature.activeAction = null;
    creature.nextDecisionTick = state.tick + 3;
    return false;
  }
  const decisionInterval =
    12 +
    (keyedRandomU32(
      state.seed,
      "decision-interval",
      state.tick,
      creature.id,
      candidate.targetEntityId ?? targetTile,
    ) %
      13);
  creature.activeGoal = {
    kind: candidate.action,
    targetEntityId: candidate.targetEntityId,
    targetTileIndex: targetTile,
    selectedAtTick: state.tick,
    minimumCommitUntilTick: state.tick + Math.min(18, decisionInterval),
    nextReconsiderationTick: state.tick + decisionInterval,
    expectedUtility: candidate.utility,
    decisionRecordId: decisionId,
  };
  const phase = path.length <= 1 ? "WORKING" : "MOVING";
  creature.activeAction = {
    kind: candidate.action,
    phase,
    startedAtTick: state.tick,
    targetEntityId: candidate.targetEntityId,
    targetTileIndex: targetTile,
    path,
    pathIndex: path.length <= 1 ? path.length : 1,
    progress: 0,
    workRequired: UNIT_MAX,
    navigationRevision: state.world.navigationRevision,
  };
  if (candidate.action === "GUARD" && candidate.targetEntityId !== null) {
    const structure = getStructure(state, candidate.targetEntityId);
    if (structure && !structure.guardIds.includes(creature.id)) {
      if (structure.guardIds.length >= 2) {
        creature.activeAction = null;
        creature.activeGoal = null;
        creature.nextDecisionTick = state.tick + 4;
        return false;
      }
      structure.guardIds.push(creature.id);
      structure.guardIds.sort((left, right) => left - right);
    }
  }
  creature.nextDecisionTick = state.tick + decisionInterval;
  emitDomainEvent(state, {
    type: "ACTION_STARTED",
    actorIds: [creature.id],
    targetIds:
      candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
    groupIds: creature.groupId === null ? [] : [creature.groupId],
    locationTileIndex: creature.tileIndex,
    decisionRecordIds: [decisionId],
    importance: 2,
    summary: `${creature.name} began ${candidate.action.toLowerCase().replaceAll("_", " ")}.`,
  });
  return true;
}

function recordDecision(
  state: SimulationState,
  creature: CreatureState,
  candidates: DecisionCandidate[],
  switchReason: DecisionSwitchReason,
): DecisionRecord | null {
  const selected = candidates[0];
  if (!selected) {
    return null;
  }
  const record: DecisionRecord = {
    id: state.nextDecisionId++,
    tick: state.tick,
    actorId: creature.id,
    previousAction: creature.activeGoal?.kind ?? null,
    selectedAction: selected.action,
    selectedTargetId: selected.targetEntityId,
    switchReason,
    candidates: candidates.slice(0, 5).map((candidate) => ({
      action: candidate.action,
      targetEntityId: candidate.targetEntityId,
      targetTileIndex: candidate.targetTileIndex,
      utility: candidate.utility,
      factors: candidate.factors.map((item) => ({
        key: item.key,
        contribution: item.contribution,
        evidenceEventIds: [...item.evidenceEventIds],
      })),
    })),
  };
  state.decisionRecords.push(record);
  while (
    state.decisionRecords.length > state.configuration.maxDecisionRecords
  ) {
    const protectedEventIds = historicallyProtectedEventIds(state);
    const protectedDecisionIds = new Set<number>();
    for (const event of state.domainEvents) {
      if (protectedEventIds.has(event.id)) {
        for (const decisionId of event.decisionRecordIds) {
          protectedDecisionIds.add(decisionId);
        }
      }
    }
    const removableIndex = state.decisionRecords.findIndex(
      (candidate) => !protectedDecisionIds.has(candidate.id),
    );
    state.decisionRecords.splice(removableIndex < 0 ? 0 : removableIndex, 1);
  }
  return record;
}

function hasEmergency(creature: CreatureState): boolean {
  if (!creature.activeGoal) {
    return false;
  }
  const survivalAction =
    creature.activeGoal.kind === "EAT" ||
    creature.activeGoal.kind === "GATHER_FOOD" ||
    creature.activeGoal.kind === "WITHDRAW" ||
    creature.activeGoal.kind === "STEAL" ||
    creature.activeGoal.kind === "FLEE";
  return creature.needs.hunger >= 9_200 && !survivalAction;
}

function decideCreature(
  state: SimulationState,
  creature: CreatureState,
): void {
  if (!creature.alive) {
    return;
  }
  const emergency = hasEmergency(creature);
  if (
    creature.activeGoal &&
    !emergency &&
    state.tick < creature.activeGoal.minimumCommitUntilTick
  ) {
    creature.nextDecisionTick = creature.activeGoal.minimumCommitUntilTick;
    return;
  }
  const candidates = generateCandidates(state, creature);
  const selected = candidates[0];
  if (!selected) {
    creature.nextDecisionTick = state.tick + 10;
    return;
  }

  if (creature.activeGoal && !emergency) {
    const sameChoice =
      creature.activeGoal.kind === selected.action &&
      creature.activeGoal.targetEntityId === selected.targetEntityId;
    if (
      sameChoice ||
      selected.utility <= creature.activeGoal.expectedUtility + 1_100
    ) {
      creature.nextDecisionTick = state.tick + 12;
      creature.activeGoal.nextReconsiderationTick = creature.nextDecisionTick;
      return;
    }
  }

  const switchReason: DecisionSwitchReason = emergency
    ? "EMERGENCY_INTERRUPT"
    : creature.activeGoal
      ? "NEW_OPTION_EXCEEDED_HYSTERESIS"
      : creature.lastActionKind
        ? "GOAL_COMPLETED"
        : "NO_ACTIVE_GOAL";
  const record = recordDecision(state, creature, candidates, switchReason);
  if (!record) {
    creature.nextDecisionTick = state.tick + 10;
    return;
  }
  if (creature.activeAction?.kind === "GUARD") {
    removeGuardAssignment(state, creature);
  }
  creature.activeAction = null;
  creature.activeGoal = null;
  beginAction(state, creature, selected, record.id);
}

function runScheduledDecisions(state: SimulationState): void {
  const ordered = [...state.creatures].sort((left, right) => left.id - right.id);
  for (const creature of ordered) {
    if (creature.alive && state.tick >= creature.nextDecisionTick) {
      decideCreature(state, creature);
    }
  }
}

function removeGuardAssignment(
  state: SimulationState,
  creature: CreatureState,
): void {
  for (const structure of state.structures) {
    structure.guardIds = structure.guardIds.filter((id) => id !== creature.id);
  }
}

function refreshMovingTarget(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (
    action.targetEntityId === null ||
    action.kind === "FLEE" ||
    action.kind === "JOIN_GROUP"
  ) {
    return true;
  }
  const currentTargetTile = entityTile(state, action.targetEntityId);
  if (currentTargetTile === null) {
    return false;
  }
  if (currentTargetTile !== action.targetTileIndex && action.phase === "MOVING") {
    const path = findPath(state.world, creature.tileIndex, currentTargetTile);
    if (path.length === 0) {
      return false;
    }
    action.targetTileIndex = currentTargetTile;
    action.path = path;
    action.pathIndex = path.length <= 1 ? path.length : 1;
    action.navigationRevision = state.world.navigationRevision;
    if (path.length <= 1) {
      action.phase = "WORKING";
      action.progress = 0;
    }
  }
  return true;
}

function moveCreatureAlongPath(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (action.navigationRevision !== state.world.navigationRevision) {
    const path = findPath(
      state.world,
      creature.tileIndex,
      action.targetTileIndex ?? creature.tileIndex,
    );
    if (path.length === 0) {
      return false;
    }
    action.path = path;
    action.pathIndex = path.length <= 1 ? path.length : 1;
    action.navigationRevision = state.world.navigationRevision;
    if (path.length <= 1) {
      action.phase = "WORKING";
      action.progress = 0;
      return true;
    }
  }

  const nextTile = action.path[action.pathIndex];
  if (nextTile === undefined) {
    action.phase = "WORKING";
    action.progress = 0;
    return true;
  }
  const target = tileCenter(state, nextTile);
  const speed = Math.max(
    64,
    Math.floor(
      (MOVEMENT_SPEED * (7_500 + creature.health / 4)) / UNIT_MAX,
    ),
  );
  const deltaX = target.x - creature.x;
  const deltaY = target.y - creature.y;
  if (Math.abs(deltaX) <= speed && Math.abs(deltaY) <= speed) {
    creature.x = target.x;
    creature.y = target.y;
    creature.tileIndex = nextTile;
    action.pathIndex += 1;
    if (action.pathIndex >= action.path.length) {
      action.phase = "WORKING";
      action.progress = 0;
    }
  } else if (deltaX !== 0) {
    creature.x += Math.sign(deltaX) * Math.min(speed, Math.abs(deltaX));
  } else if (deltaY !== 0) {
    creature.y += Math.sign(deltaY) * Math.min(speed, Math.abs(deltaY));
  }
  return true;
}

function finishCreatureAction(
  state: SimulationState,
  creature: CreatureState,
): void {
  const action = creature.activeAction;
  if (!action) {
    return;
  }
  resolveAction(state, creature, action);
  creature.actionCounts[action.kind] += 1;
  creature.lastActionKind = action.kind;
  creature.lastActionTick = state.tick;
  if (action.kind === "GUARD") {
    removeGuardAssignment(state, creature);
  }
  creature.activeAction = null;
  creature.activeGoal = null;
  creature.nextDecisionTick = state.tick + 1;
}

function executeActiveActions(state: SimulationState): void {
  const ordered = [...state.creatures].sort((left, right) => left.id - right.id);
  for (const creature of ordered) {
    const action = creature.activeAction;
    if (!creature.alive || !action) {
      continue;
    }
    if (!refreshMovingTarget(state, creature, action)) {
      if (action.kind === "GUARD") {
        removeGuardAssignment(state, creature);
      }
      creature.activeAction = null;
      creature.activeGoal = null;
      creature.nextDecisionTick = state.tick + 1;
      continue;
    }
    if (action.phase === "MOVING") {
      if (!moveCreatureAlongPath(state, creature, action)) {
        state.metrics.invalidPathFailures += 1;
        creature.activeAction = null;
        creature.activeGoal = null;
        creature.nextDecisionTick = state.tick + 3;
      }
      continue;
    }
    if (action.kind === "GUARD" && action.targetEntityId !== null) {
      const structure = getStructure(state, action.targetEntityId);
      if (structure && !structure.guardIds.includes(creature.id)) {
        structure.guardIds.push(creature.id);
        structure.guardIds.sort((a, b) => a - b);
      }
    }
    action.progress = Math.min(
      action.workRequired,
      action.progress + Math.ceil(UNIT_MAX / ACTION_DURATION[action.kind]),
    );
    if (action.progress >= action.workRequired) {
      finishCreatureAction(state, creature);
    }
  }
}

function gatherResource(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
  kind: ResourceKind,
): void {
  const node =
    action.targetEntityId === null
      ? null
      : getResourceNode(state, action.targetEntityId);
  if (!node || node.kind !== kind || node.currentStock <= 0) {
    return;
  }
  const capacity = inventorySpace(creature.inventory);
  if (capacity <= 0) {
    return;
  }
  const skillBonus =
    kind === "FOOD" && creature.skills.foraging >= 6_000 ? 1 : 0;
  const quantity = Math.min(node.currentStock, capacity, 2 + skillBonus);
  node.currentStock -= quantity;
  if (kind === "FOOD") {
    creature.inventory.food += quantity;
    creature.skills.foraging = clampUnit(creature.skills.foraging + 5);
    state.metrics.foodGathered += quantity;
    emitDomainEvent(state, {
      type: "FOOD_GATHERED",
      actorIds: [creature.id],
      targetIds: [node.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: node.tileIndex,
      resourceKind: kind,
      quantity,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} gathered ${quantity} food.`,
    });
  } else {
    creature.inventory.material += quantity;
    emitDomainEvent(state, {
      type: "MATERIAL_GATHERED",
      actorIds: [creature.id],
      targetIds: [node.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: node.tileIndex,
      resourceKind: kind,
      quantity,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} gathered ${quantity} material.`,
    });
  }
}

function shareFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const recipient = targetId === null ? null : getCreature(state, targetId);
  if (!recipient?.alive || creature.inventory.food <= 0) {
    return;
  }
  if (inventorySpace(recipient.inventory) <= 0) {
    return;
  }
  creature.inventory.food -= 1;
  recipient.inventory.food += 1;
  state.metrics.foodShared += 1;
  const event = emitDomainEvent(state, {
    type: "FOOD_SHARED",
    actorIds: [creature.id],
    targetIds: [recipient.id],
    groupIds:
      creature.groupId !== null && creature.groupId === recipient.groupId
        ? [creature.groupId]
        : [],
    locationTileIndex: creature.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    importance: recipient.needs.hunger > 8_000 ? 32 : 18,
    summary: `${creature.name} shared food with ${recipient.name}.`,
  });
  changeRelationship(
    state,
    recipient.id,
    creature.id,
    {
      trust: 1_050 + Math.floor(recipient.needs.hunger / 20),
      familiarity: 450,
    },
    event.id,
  );
  changeRelationship(
    state,
    creature.id,
    recipient.id,
    { trust: 180, familiarity: 300 },
    event.id,
  );
  addMemory(
    state,
    recipient,
    "HELP_RECEIVED",
    creature.id,
    creature.tileIndex,
    4_500,
    5_500 + recipient.needs.hunger / 4,
    [event.id],
  );
  const group = getGroup(state, creature.groupId ?? -1);
  if (group && recipient.groupId === group.id) {
    group.sharingNorm = clamp(group.sharingNorm + 90, -UNIT_MAX, UNIT_MAX);
  }
}

function witnessTheft(
  state: SimulationState,
  thief: CreatureState,
  theftEvent: DomainEvent,
  targetGroupId: number | null,
): void {
  const witnesses = state.creatures.filter(
    (observer) =>
      observer.alive &&
      observer.id !== thief.id &&
      manhattanDistance(
        state.world,
        observer.tileIndex,
        theftEvent.locationTileIndex ?? thief.tileIndex,
      ) <=
        (observer.groupId === targetGroupId ? 5 : 3),
  );
  if (witnesses.length === 0) {
    return;
  }
  state.metrics.witnessedThefts += 1;
  const witnessEvent = emitDomainEvent(state, {
    type: "THEFT_WITNESSED",
    actorIds: witnesses.map((witness) => witness.id),
    targetIds: [thief.id],
    groupIds: targetGroupId === null ? [] : [targetGroupId],
    locationTileIndex: theftEvent.locationTileIndex,
    resourceKind: "FOOD",
    quantity: theftEvent.quantity,
    causedByEventIds: [theftEvent.id],
    decisionRecordIds: theftEvent.decisionRecordIds,
    importance: 58,
    summary: `${witnesses.map((witness) => witness.name).join(", ")} witnessed ${thief.name}'s theft.`,
  });
  for (const witness of witnesses) {
    changeRelationship(
      state,
      witness.id,
      thief.id,
      {
        trust: -2_300,
        fear: 350 + thief.traits.aggression / 20,
        rivalry: 3_500,
        familiarity: 400,
      },
      witnessEvent.id,
    );
    addMemory(
      state,
      witness,
      "THEFT_OBSERVED",
      thief.id,
      theftEvent.locationTileIndex,
      -7_000,
      8_000,
      [theftEvent.id, witnessEvent.id],
    );
    witness.nextDecisionTick = Math.min(witness.nextDecisionTick, state.tick + 1);
  }
}

function stealFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  if (targetId === null || inventorySpace(creature.inventory) <= 0) {
    return;
  }
  const structure = getStructure(state, targetId);
  const victim = getCreature(state, targetId);
  let targetGroupId: number | null = null;
  let location = creature.tileIndex;
  let victimIds: number[] = [];
  if (structure?.kind === "STORAGE" && structure.inventory.food > 0) {
    structure.inventory.food -= 1;
    targetGroupId = structure.groupId;
    location = structure.tileIndex;
    victimIds = [structure.id];
  } else if (victim?.alive && victim.inventory.food > 0) {
    victim.inventory.food -= 1;
    targetGroupId = victim.groupId;
    location = victim.tileIndex;
    victimIds = [victim.id];
  } else {
    return;
  }
  creature.inventory.food += 1;
  state.metrics.thefts += 1;
  const event = emitDomainEvent(state, {
    type: "THEFT_COMMITTED",
    actorIds: [creature.id],
    targetIds: victimIds,
    groupIds: targetGroupId === null ? [] : [targetGroupId],
    locationTileIndex: location,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    importance: 62,
    summary: `${creature.name} took food without permission.`,
  });
  addMemory(
    state,
    creature,
    "RESOURCE_FOUND",
    targetId,
    location,
    1_000,
    4_000,
    [event.id],
  );
  const targetGroup = targetGroupId === null ? null : getGroup(state, targetGroupId);
  if (targetGroup) {
    targetGroup.sharingNorm = clamp(
      targetGroup.sharingNorm + 140,
      -UNIT_MAX,
      UNIT_MAX,
    );
  }
  addHistory(
    state,
    "THEFT",
    `${creature.name} stole from ${targetGroup?.name ?? "another creature"}`,
    event.summary,
    [event.id],
    [creature.id],
    targetGroupId === null ? [] : [targetGroupId],
    62,
  );
  witnessTheft(state, creature, event, targetGroupId);
}

function ensureStorageSite(
  state: SimulationState,
  group: GroupState,
): StructureState {
  const existing = groupStorage(state, group.id);
  if (existing) {
    return existing;
  }
  const site: StructureState = {
    id: state.nextEntityId++,
    kind: "STORAGE_SITE",
    tileIndex: group.homeTileIndex,
    groupId: group.id,
    material: 0,
    materialRequired: 12,
    progress: 0,
    workRequired: UNIT_MAX,
    inventory: {
      capacity: 80,
      food: 0,
      material: 0,
    },
    guardIds: [],
    completedTick: null,
  };
  state.structures.push(site);
  group.storageStructureId = site.id;
  const event = emitDomainEvent(state, {
    type: "STORAGE_SITE_STARTED",
    groupIds: [group.id],
    targetIds: [site.id],
    locationTileIndex: site.tileIndex,
    importance: 42,
    summary: `The ${group.name} group began a shared store.`,
  });
  group.majorEventIds.push(event.id);
  return site;
}

function buildStorage(
  state: SimulationState,
  creature: CreatureState,
): void {
  const group =
    creature.groupId === null ? null : getGroup(state, creature.groupId);
  if (!group) {
    return;
  }
  const site = ensureStorageSite(state, group);
  if (site.kind !== "STORAGE_SITE") {
    return;
  }
  const materialNeeded = Math.max(0, site.materialRequired - site.material);
  const deposited = Math.min(creature.inventory.material, materialNeeded);
  if (deposited > 0) {
    creature.inventory.material -= deposited;
    site.material += deposited;
    emitDomainEvent(state, {
      type: "MATERIAL_DEPOSITED",
      actorIds: [creature.id],
      targetIds: [site.id],
      groupIds: [group.id],
      locationTileIndex: site.tileIndex,
      resourceKind: "MATERIAL",
      quantity: deposited,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} added ${deposited} material to the shared store.`,
    });
  }
  site.progress = clampUnit(
    site.progress + 1_250 + Math.floor(creature.traits.loyalty / 12),
  );
  if (
    site.material >= site.materialRequired &&
    site.progress >= site.workRequired
  ) {
    site.kind = "STORAGE";
    site.completedTick = state.tick;
    group.stage = "PERSISTENT";
    state.metrics.storagesCompleted += 1;
    const event = emitDomainEvent(state, {
      type: "STORAGE_COMPLETED",
      actorIds: [creature.id],
      targetIds: [site.id],
      groupIds: [group.id],
      locationTileIndex: site.tileIndex,
      importance: 85,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `The ${group.name} group completed its first shared store.`,
    });
    group.majorEventIds.push(event.id);
    addHistory(
      state,
      "STORAGE_BUILT",
      `${group.name}'s shared store was completed`,
      event.summary,
      [event.id],
      group.memberIds,
      [group.id],
      85,
    );
  }
}

function depositFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const storage = targetId === null ? null : getStructure(state, targetId);
  if (
    storage?.kind !== "STORAGE" ||
    creature.groupId !== storage.groupId ||
    creature.inventory.food <= 0 ||
    inventorySpace(storage.inventory) <= 0
  ) {
    return;
  }
  const quantity = Math.min(
    Math.max(1, creature.inventory.food - 1),
    inventorySpace(storage.inventory),
  );
  creature.inventory.food -= quantity;
  storage.inventory.food += quantity;
  const group = getGroup(state, storage.groupId);
  const event = emitDomainEvent(state, {
    type: "FOOD_DEPOSITED",
    actorIds: [creature.id],
    targetIds: [storage.id],
    groupIds: [storage.groupId],
    locationTileIndex: storage.tileIndex,
    resourceKind: "FOOD",
    quantity,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} deposited ${quantity} food in the shared store.`,
  });
  if (group) {
    group.sharingNorm = clamp(
      group.sharingNorm + 70 * quantity,
      -UNIT_MAX,
      UNIT_MAX,
    );
  }
  for (const memberId of group?.memberIds ?? []) {
    if (memberId !== creature.id) {
      changeRelationship(
        state,
        memberId,
        creature.id,
        { trust: 80 * quantity, familiarity: 25 },
        event.id,
      );
    }
  }
}

function withdrawFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const storage = targetId === null ? null : getStructure(state, targetId);
  if (
    storage?.kind !== "STORAGE" ||
    creature.groupId !== storage.groupId ||
    storage.inventory.food <= 0 ||
    inventorySpace(creature.inventory) <= 0
  ) {
    return;
  }
  storage.inventory.food -= 1;
  creature.inventory.food += 1;
  emitDomainEvent(state, {
    type: "FOOD_WITHDRAWN",
    actorIds: [creature.id],
    targetIds: [storage.id],
    groupIds: [storage.groupId],
    locationTileIndex: storage.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} withdrew food under the group's hunger rule.`,
  });
}

function attackCreature(
  state: SimulationState,
  attacker: CreatureState,
  targetId: number | null,
): void {
  const target = targetId === null ? null : getCreature(state, targetId);
  if (!target?.alive) {
    return;
  }
  const hitRoll = keyedRandomUnit(
    state.seed,
    "combat-hit",
    state.tick,
    attacker.id,
    target.id,
    attacker.actionCounts.ATTACK,
  );
  const hitThreshold = clamp(
    5_200 +
      attacker.skills.combat / 4 -
      target.skills.combat / 5 +
      (attacker.health - target.health) / 10,
    1_800,
    8_600,
  );
  const hit = hitRoll <= hitThreshold;
  const damage = hit
    ? 420 +
      (keyedRandomU32(
        state.seed,
        "combat-damage",
        state.tick,
        attacker.id,
        target.id,
        attacker.actionCounts.ATTACK,
      ) %
        760) +
      Math.floor(attacker.skills.combat / 28)
    : 0;
  target.health = clamp(target.health - damage, 1_200, UNIT_MAX);
  state.metrics.attacks += 1;
  const evidence =
    relationshipFrom(state, attacker.id, target.id)?.significantEventIds.slice(-2) ??
    [];
  const event = emitDomainEvent(state, {
    type: "CREATURE_ATTACKED",
    actorIds: [attacker.id],
    targetIds: [target.id],
    groupIds: [attacker.groupId, target.groupId].filter(
      (groupId): groupId is number => groupId !== null,
    ),
    locationTileIndex: attacker.tileIndex,
    quantity: damage,
    causedByEventIds: evidence,
    decisionRecordIds: currentDecisionIds(attacker),
    importance: 55 + Math.floor(damage / 100),
    summary: hit
      ? `${attacker.name} struck ${target.name}, causing ${damage} injury.`
      : `${attacker.name} confronted ${target.name}, but the blow missed.`,
  });
  changeRelationship(
    state,
    target.id,
    attacker.id,
    {
      trust: -1_400,
      fear: 1_100 + damage,
      rivalry: 1_250,
      familiarity: 250,
    },
    event.id,
  );
  changeRelationship(
    state,
    attacker.id,
    target.id,
    { rivalry: -3_200, familiarity: 100 },
    event.id,
  );
  addMemory(
    state,
    target,
    "HARM_RECEIVED",
    attacker.id,
    attacker.tileIndex,
    -8_000,
    8_500,
    [event.id],
  );
  target.nextDecisionTick = Math.min(target.nextDecisionTick, state.tick + 1);
  const existingFight = state.historyEvents.some(
    (history) =>
      history.type === "CONFRONTATION" &&
      state.tick - history.tick < 120 &&
      (history.actorIds.includes(attacker.id) ||
        history.actorIds.includes(target.id)),
  );
  if (!existingFight) {
    addHistory(
      state,
      "CONFRONTATION",
      `${attacker.name} confronted ${target.name}`,
      event.summary,
      [event.id, ...evidence],
      [attacker.id, target.id],
      [attacker.groupId, target.groupId].filter(
        (groupId): groupId is number => groupId !== null,
      ),
      58,
    );
  }
}

function joinGroup(
  state: SimulationState,
  creature: CreatureState,
  groupId: number | null,
): void {
  if (groupId === null || creature.groupId !== null) {
    return;
  }
  const group = getGroup(state, groupId);
  if (!group || creature.traits.sociability < 3_500) {
    return;
  }
  let acceptance = creature.skills.foraging + creature.traits.sociability;
  for (const memberId of group.memberIds) {
    acceptance += relationshipFrom(state, memberId, creature.id)?.trust ?? 0;
  }
  if (acceptance < 4_000) {
    return;
  }
  creature.groupId = group.id;
  group.memberIds.push(creature.id);
  group.memberIds.sort((a, b) => a - b);
  const event = emitDomainEvent(state, {
    type: "CREATURE_JOINED_GROUP",
    actorIds: [creature.id],
    groupIds: [group.id],
    locationTileIndex: group.homeTileIndex,
    decisionRecordIds: currentDecisionIds(creature),
    importance: 45,
    summary: `${creature.name} joined the ${group.name} group.`,
  });
  group.majorEventIds.push(event.id);
}

function resolveAction(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): void {
  switch (action.kind) {
    case "EXPLORE":
    case "KEEP":
      break;
    case "GATHER_FOOD":
      gatherResource(state, creature, action, "FOOD");
      break;
    case "GATHER_MATERIAL":
      gatherResource(state, creature, action, "MATERIAL");
      break;
    case "EAT":
      if (creature.inventory.food > 0) {
        creature.inventory.food -= 1;
        creature.needs.hunger = clampUnit(creature.needs.hunger - 5_300);
        creature.health = clampUnit(creature.health + 180);
        emitDomainEvent(state, {
          type: "FOOD_EATEN",
          actorIds: [creature.id],
          groupIds: creature.groupId === null ? [] : [creature.groupId],
          locationTileIndex: creature.tileIndex,
          resourceKind: "FOOD",
          quantity: 1,
          decisionRecordIds: currentDecisionIds(creature),
          summary: `${creature.name} ate one food.`,
        });
      }
      break;
    case "REST":
      creature.needs.fatigue = clampUnit(creature.needs.fatigue - 5_200);
      creature.health = clampUnit(creature.health + 120);
      break;
    case "SHARE":
      shareFood(state, creature, action.targetEntityId);
      break;
    case "STEAL":
      stealFood(state, creature, action.targetEntityId);
      break;
    case "DEPOSIT":
      depositFood(state, creature, action.targetEntityId);
      break;
    case "WITHDRAW":
      withdrawFood(state, creature, action.targetEntityId);
      break;
    case "BUILD_STORAGE":
      buildStorage(state, creature);
      break;
    case "GUARD": {
      const structure =
        action.targetEntityId === null
          ? null
          : getStructure(state, action.targetEntityId);
      emitDomainEvent(state, {
        type: "CREATURE_GUARDED",
        actorIds: [creature.id],
        targetIds: structure ? [structure.id] : [],
        groupIds: creature.groupId === null ? [] : [creature.groupId],
        locationTileIndex: structure?.tileIndex ?? creature.tileIndex,
        decisionRecordIds: currentDecisionIds(creature),
        summary: `${creature.name} completed a watch at the shared store.`,
      });
      break;
    }
    case "ATTACK":
      attackCreature(state, creature, action.targetEntityId);
      break;
    case "FLEE": {
      const threat =
        action.targetEntityId === null
          ? null
          : getCreature(state, action.targetEntityId);
      emitDomainEvent(state, {
        type: "CREATURE_FLED",
        actorIds: [creature.id],
        targetIds: threat ? [threat.id] : [],
        groupIds: creature.groupId === null ? [] : [creature.groupId],
        locationTileIndex: creature.tileIndex,
        decisionRecordIds: currentDecisionIds(creature),
        importance: 28,
        summary: `${creature.name} fled${threat ? ` from ${threat.name}` : ""}.`,
      });
      break;
    }
    case "JOIN_GROUP":
      joinGroup(state, creature, action.targetEntityId);
      break;
  }
}

function maintainBoundedSocialState(state: SimulationState): void {
  if (state.tick === 0 || state.tick % 100 !== 0) {
    return;
  }
  for (const memory of state.memories) {
    memory.strength = clampUnit((memory.strength * 9_850) / UNIT_MAX);
  }
  for (const edge of state.relationships) {
    edge.rivalry = clampUnit((edge.rivalry * 9_200) / UNIT_MAX);
    edge.fear = clampUnit((edge.fear * 9_700) / UNIT_MAX);
  }
  const expiredIds = new Set(
    state.memories
      .filter(
        (memory) =>
          memory.strength < 180 &&
          memory.importance < 6_000 &&
          state.tick - memory.createdTick > 1_000,
      )
      .map((memory) => memory.id),
  );
  if (expiredIds.size > 0) {
    state.memories = state.memories.filter(
      (memory) => !expiredIds.has(memory.id),
    );
    for (const creature of state.creatures) {
      creature.memoryIds = creature.memoryIds.filter(
        (id) => !expiredIds.has(id),
      );
    }
  }
}

function validateAuthoritativeInvariants(state: SimulationState): void {
  for (const creature of state.creatures) {
    creature.inventory.food = Math.max(0, Math.floor(creature.inventory.food));
    creature.inventory.material = Math.max(
      0,
      Math.floor(creature.inventory.material),
    );
    const overflow = inventoryTotal(creature.inventory) - creature.inventory.capacity;
    if (overflow > 0) {
      const materialReduction = Math.min(overflow, creature.inventory.material);
      creature.inventory.material -= materialReduction;
      const remaining = overflow - materialReduction;
      creature.inventory.food = Math.max(0, creature.inventory.food - remaining);
    }
  }
  for (const node of state.resourceNodes) {
    node.currentStock = clamp(node.currentStock, 0, node.maximumStock);
  }
  for (const structure of state.structures) {
    structure.inventory.food = Math.max(0, structure.inventory.food);
    structure.inventory.material = Math.max(0, structure.inventory.material);
  }
}

export function advanceSimulation(
  state: SimulationState,
  ticks = 1,
): SimulationState {
  const tickCount = Math.max(0, Math.floor(ticks));
  for (let iteration = 0; iteration < tickCount; iteration += 1) {
    applyScheduledCommands(state);
    updateNeeds(state);
    regenerateResources(state);
    updateProximityRelationships(state);
    executeActiveActions(state);
    updateGroups(state);
    runScheduledDecisions(state);
    maintainBoundedSocialState(state);
    validateAuthoritativeInvariants(state);
    state.tick += 1;
  }
  return state;
}

export function formatSimulationTime(tick: number): string {
  const totalMinutes = Math.max(
    0,
    Math.floor(tick / HISTORY_TICKS_PER_MINUTE),
  );
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

function canonicalStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStringify(record[key])}`,
      )
      .join(",")}}`;
  }
  return "null";
}

export function hashSimulationState(state: SimulationState): string {
  const serialized = canonicalStringify(state);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt((code >>> 8) & 0xff);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
