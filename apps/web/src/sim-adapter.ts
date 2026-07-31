import {
  SIMULATION_BEHAVIOR_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  TICKS_PER_SECOND,
  advanceSimulation,
  createRenderSnapshot,
  createSimulation,
  formatSimulationTime,
  hashSimulationState,
  queuePlayerCommand,
  type DecisionRecord,
  type DomainEvent,
  type HistoricalEvent,
  type PlayerCommand,
  type SimulationState,
  type UtilityFactor,
} from "@tiny-civ/sim-core";
import type {
  CandidateView,
  CreatureView,
  EntityId,
  GroupView,
  InventoryView,
  MemoryView,
  Point,
  RelationshipView,
  ResourceView,
  StructureView,
  TileView,
  TimelineCategory,
  TimelineEventView,
  TraitView,
  WorldView,
} from "./model";

export const ticksPerSecond = TICKS_PER_SECOND;

const humanize = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());

const percent = (value: number): number => Math.max(0, Math.min(100, value / 100));

const signedUnit = (value: number): number => Math.max(-1, Math.min(1, value / 10_000));

const pointForTile = (tileIndex: number, width: number): Point => ({
  x: tileIndex % width,
  y: Math.floor(tileIndex / width),
});

const traitLabels = {
  generosity: "Generosity",
  aggression: "Aggression",
  sociability: "Sociability",
  loyalty: "Loyalty",
} as const;

function mapFactors(factors: readonly UtilityFactor[]): CandidateView["factors"] {
  return factors.map((factor) => ({
    key: factor.key,
    label: humanize(factor.key),
    contribution: factor.contribution,
    evidenceEventIds: [...factor.evidenceEventIds],
  }));
}

function candidatesFromDecision(decision: DecisionRecord): CandidateView[] {
  let selectedMarked = false;
  return decision.candidates
    .map((candidate) => {
      const matchesSelection =
        candidate.action === decision.selectedAction &&
        candidate.targetEntityId === decision.selectedTargetId;
      const selected = matchesSelection && !selectedMarked;
      if (selected) selectedMarked = true;
      return {
        action: candidate.action,
        ...(candidate.targetEntityId === null
          ? {}
          : { targetId: candidate.targetEntityId }),
        utility: candidate.utility,
        factors: mapFactors(candidate.factors),
        selected,
      };
    })
    .sort((left, right) => right.utility - left.utility)
    .slice(0, 5);
}

function latestDecisionFor(
  state: SimulationState,
  creatureId: EntityId,
): DecisionRecord | undefined {
  for (let index = state.decisionRecords.length - 1; index >= 0; index -= 1) {
    const decision = state.decisionRecords[index];
    if (decision?.actorId === creatureId) return decision;
  }
  return undefined;
}

function mapTraits(state: SimulationState, creatureId: EntityId): TraitView[] {
  const creature = state.creatures.find((candidate) => candidate.id === creatureId);
  if (!creature) return [];
  return Object.entries(traitLabels).map(([key, label]) => ({
    key,
    label,
    value: percent(creature.traits[key as keyof typeof traitLabels]),
  }));
}

function mapInventory(state: SimulationState, creatureId: EntityId): InventoryView[] {
  const creature = state.creatures.find((candidate) => candidate.id === creatureId);
  if (!creature) return [];
  return [
    { kind: "food", quantity: creature.inventory.food },
    { kind: "material", quantity: creature.inventory.material },
  ].filter((stack) => stack.quantity > 0);
}

function mapMemories(state: SimulationState, creatureId: EntityId): MemoryView[] {
  const creature = state.creatures.find((candidate) => candidate.id === creatureId);
  if (!creature) return [];
  const memoryIds = new Set(creature.memoryIds);
  return state.memories
    .filter((memory) => memory.ownerId === creatureId || memoryIds.has(memory.id))
    .map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      ...(memory.subjectEntityId === null ? {} : { subjectId: memory.subjectEntityId }),
      strength: percent(memory.strength),
      valence: signedUnit(memory.valence),
      ageTicks: Math.max(0, state.tick - memory.createdTick),
      sourceEventIds: [...memory.sourceEventIds],
    }))
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 12);
}

function mapRelationships(
  state: SimulationState,
  creatureId: EntityId,
  names: ReadonlyMap<EntityId, string>,
): RelationshipView[] {
  return state.relationships
    .filter((edge) => edge.fromId === creatureId || edge.toId === creatureId)
    .map((edge) => {
      const direction = edge.fromId === creatureId ? "toward" : "from";
      const otherId = direction === "toward" ? edge.toId : edge.fromId;
      return {
        otherId,
        otherName: names.get(otherId) ?? `Creature ${otherId}`,
        direction,
        trust: signedUnit(edge.trust),
        fear: percent(edge.fear),
        familiarity: percent(edge.familiarity),
        rivalry: percent(edge.rivalry),
      } satisfies RelationshipView;
    })
    .filter((relationship) => relationship.otherId !== creatureId)
    .sort(
      (left, right) =>
        Math.max(Math.abs(right.trust), right.fear / 100, right.rivalry / 100) -
        Math.max(Math.abs(left.trust), left.fear / 100, left.rivalry / 100),
    )
    .slice(0, 12);
}

function eventCategory(
  type: string,
  playerCaused: boolean,
): Exclude<TimelineCategory, "all"> {
  if (playerCaused || /PLAYER|INTERVENTION|TERRAIN/i.test(type)) return "player";
  if (/FIGHT|ATTACK|DAMAGE|HARM|THEFT|CONFLICT|CONFRONT|FLEE|FLED/i.test(type)) {
    return "conflict";
  }
  if (/GROUP|LEADER|JOIN|LEAVE|STORAGE|FOUNDED/i.test(type)) return "group";
  if (/FOOD|GATHER|RESOURCE|DEPOSIT|WITHDRAW|MATERIAL/i.test(type)) {
    return "resources";
  }
  return "social";
}

function linkedDecisionForEvent(
  state: SimulationState,
  decisionIds: readonly number[],
  sourceEventIds: readonly number[],
): DecisionRecord | undefined {
  for (const decisionId of decisionIds) {
    const decision = state.decisionRecords.find((item) => item.id === decisionId);
    if (decision) return decision;
  }
  // Historical source IDs are ordered from the immediate trigger outward.
  for (const sourceEventId of sourceEventIds) {
    const source = state.domainEvents.find((event) => event.id === sourceEventId);
    if (!source) continue;
    for (const decisionId of source.decisionRecordIds) {
      const decision = state.decisionRecords.find((item) => item.id === decisionId);
      if (decision) return decision;
    }
  }
  return undefined;
}

function mapDomainEvent(
  state: SimulationState,
  event: DomainEvent,
): TimelineEventView | null {
  const playerCaused = event.type.startsWith("PLAYER_");
  if (
    !playerCaused &&
    event.type !== "SIMULATION_STARTED" &&
    (event.type === "ACTION_STARTED" || event.importance < 18)
  ) {
    return null;
  }
  const decision = linkedDecisionForEvent(
    state,
    event.decisionRecordIds,
    event.causedByEventIds,
  );
  return {
    id: event.id,
    tick: event.tick,
    category: eventCategory(event.type, playerCaused),
    type: event.type,
    title: humanize(event.type),
    detail: event.summary,
    actorIds: [...event.actorIds],
    targetIds: [...event.targetIds],
    causedByEventIds: [...event.causedByEventIds],
    importance: event.importance,
    playerCaused,
    ...(decision
      ? {
          decisionActorId: decision.actorId,
          decisionCandidates: candidatesFromDecision(decision),
        }
      : {}),
  };
}

function mapHistoricalEvent(
  state: SimulationState,
  event: HistoricalEvent,
): TimelineEventView {
  const playerCaused = event.type === "INTERVENTION";
  const decision = linkedDecisionForEvent(state, [], event.sourceEventIds);
  return {
    id: 1_000_000 + event.id,
    tick: event.tick,
    category: eventCategory(event.type, playerCaused),
    type: event.type,
    title: event.title,
    detail: event.summary,
    actorIds: [...event.actorIds],
    targetIds: [],
    causedByEventIds: [...event.sourceEventIds],
    importance: event.importance,
    playerCaused,
    ...(decision
      ? {
          decisionActorId: decision.actorId,
          decisionCandidates: candidatesFromDecision(decision),
        }
      : {}),
  };
}

export const createSimulationState = (seed: number): SimulationState =>
  createSimulation(seed);

export const advanceSimulationTicks = (
  state: SimulationState,
  ticks: number,
): SimulationState => advanceSimulation(state, ticks);

export const queueIntervention = (
  state: SimulationState,
  tool: "add-food" | "remove-food" | "obstacle",
  tile: TileView,
): SimulationState => {
  const common = { applyAtTick: state.tick, tileIndex: tile.index };
  const command: PlayerCommand =
    tool === "add-food"
      ? { ...common, type: "ADD_FOOD", amount: 12 }
      : tool === "remove-food"
        ? { ...common, type: "REMOVE_FOOD", amount: 12 }
        : { ...common, type: "TOGGLE_OBSTACLE", blocked: !tile.blocked };
  queuePlayerCommand(state, command);
  return state;
};

export const makeWorldView = (state: SimulationState): WorldView => {
  const snapshot = createRenderSnapshot(state);
  if (
    snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    snapshot.behaviorVersion !== SIMULATION_BEHAVIOR_VERSION
  ) {
    throw new Error(
      `Incompatible render snapshot ${snapshot.schemaVersion}/${snapshot.behaviorVersion}.`,
    );
  }

  const width = snapshot.width;
  const names = new Map(state.creatures.map((creature) => [creature.id, creature.name]));
  const tiles: TileView[] = snapshot.tiles.map((tile) => ({
    ...tile,
    fertility: 0,
    hazard: 0,
  }));

  const creatures: CreatureView[] = state.creatures.map((creature) => {
    const rendered = snapshot.creatures.find((item) => item.id === creature.id);
    const targetTileIndex =
      creature.activeGoal?.targetTileIndex ??
      creature.activeAction?.targetTileIndex ??
      null;
    const decision = latestDecisionFor(state, creature.id);
    return {
      id: creature.id,
      name: creature.name,
      color: creature.color,
      x: rendered?.x ?? pointForTile(creature.tileIndex, width).x,
      y: rendered?.y ?? pointForTile(creature.tileIndex, width).y,
      alive: creature.alive,
      ...(creature.groupId === null ? {} : { groupId: creature.groupId }),
      role: humanize(creature.role),
      goal: creature.activeGoal?.kind ?? "Observing",
      action: creature.activeAction?.kind ?? "Considering",
      ...(targetTileIndex === null
        ? {}
        : {
            goalTarget: {
              x: (targetTileIndex % width) + 0.5,
              y: Math.floor(targetTileIndex / width) + 0.5,
            },
          }),
      health: percent(creature.health),
      hunger: percent(creature.needs.hunger),
      fatigue: percent(creature.needs.fatigue),
      traits: mapTraits(state, creature.id),
      inventory: mapInventory(state, creature.id),
      candidates: decision ? candidatesFromDecision(decision) : [],
      memories: mapMemories(state, creature.id),
      relationships: mapRelationships(state, creature.id, names),
    };
  });

  const resources: ResourceView[] = snapshot.resourceNodes.map((resource) => ({
    id: resource.id,
    kind: resource.kind,
    ...pointForTile(resource.tileIndex, width),
    stock: resource.currentStock,
    capacity: resource.maximumStock,
  }));

  const structures: StructureView[] = state.structures.map((structure) => ({
    id: structure.id,
    kind: structure.kind,
    ...pointForTile(structure.tileIndex, width),
    groupId: structure.groupId,
    progress: percent(structure.progress),
    stored: structure.inventory.food,
    capacity: structure.inventory.capacity,
  }));

  const groups: GroupView[] = snapshot.groups.map((group) => ({
    id: group.id,
    name: group.name,
    memberIds: [...group.memberIds],
    ...(group.leaderId === null ? {} : { leaderId: group.leaderId }),
    home: {
      x: (group.homeTileIndex % width) + 0.5,
      y: Math.floor(group.homeTileIndex / width) + 0.5,
    },
    cohesion: percent(group.cohesion),
    sharingNorm: signedUnit(group.sharingNorm),
    conflictNorm: 0,
    storageIds: group.storageStructureId === null ? [] : [group.storageStructureId],
  }));

  const promotedDomainEventIds = new Set(
    snapshot.historyEvents.flatMap((event) => event.sourceEventIds),
  );
  const events = [
    ...snapshot.historyEvents.map((event) => mapHistoricalEvent(state, event)),
    ...snapshot.recentEvents
      .filter((event) => !promotedDomainEventIds.has(event.id))
      .map((event) => mapDomainEvent(state, event))
      .filter((event): event is TimelineEventView => event !== null),
  ].sort((left, right) => right.tick - left.tick || right.id - left.id);

  return {
    tick: snapshot.tick,
    timeLabel: formatSimulationTime(snapshot.tick),
    hash: hashSimulationState(state),
    width,
    height: snapshot.height,
    tiles,
    creatures,
    resources,
    structures,
    groups,
    events,
    population: creatures.filter((creature) => creature.alive).length,
    foodStock: resources
      .filter((resource) => resource.kind === "FOOD")
      .reduce((total, resource) => total + resource.stock, 0),
  };
};
