import {
  SIMULATION_BEHAVIOR_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  TICKS_PER_SECOND,
  advanceSimulation,
  createRenderSnapshot,
  createSimulation,
  formatSimulationTime,
  hashSimulationState,
  projectCreatureObservationSummary,
  queuePlayerCommand,
  reasonFactText,
  sameScenarioReference,
  type DecisionRecord,
  type DomainEvent,
  type HistoricalEvent,
  type PlayerCommand,
  type RenderSnapshot,
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
  ScenarioView,
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

function mapScenario(
  snapshot: RenderSnapshot,
  retainedScenario?: ScenarioView,
): ScenarioView {
  const canRetain =
    retainedScenario !== undefined &&
    sameScenarioReference(retainedScenario.reference, snapshot.scenario.reference) &&
    retainedScenario.compiledMapHash === snapshot.scenario.compiledMapHash;
  const retained = canRetain ? retainedScenario : undefined;
  return {
    reference: { ...snapshot.scenario.reference },
    compiledMapHash: snapshot.scenario.compiledMapHash,
    name: snapshot.scenario.name,
    role: snapshot.scenario.role || retained?.role || "",
    dramaticQuestion:
      snapshot.scenario.dramaticQuestion || retained?.dramaticQuestion || "",
    startingFacts:
      snapshot.scenario.startingFacts.length > 0
        ? [...snapshot.scenario.startingFacts]
        : [...(retained?.startingFacts ?? [])],
    observableTensions:
      snapshot.scenario.observableTensions.length > 0
        ? [...snapshot.scenario.observableTensions]
        : [...(retained?.observableTensions ?? [])],
    landmarks:
      snapshot.scenario.landmarks.length > 0
        ? snapshot.scenario.landmarks.map((landmark) => ({
            ...landmark,
            tileIndices: [...landmark.tileIndices],
          }))
        : (retained?.landmarks ?? []).map((landmark) => ({
            ...landmark,
            tileIndices: [...landmark.tileIndices],
          })),
  };
}

const traitLabels = {
  generosity: "Generosity",
  aggression: "Aggression",
  sociability: "Sociability",
  loyalty: "Loyalty",
} as const;

const MAX_VISIBLE_FACTORS_PER_CANDIDATE = 3;

function mapFactors(factors: readonly UtilityFactor[]): CandidateView["factors"] {
  return [...factors]
    .sort(
      (left, right) =>
        Math.abs(right.contribution) - Math.abs(left.contribution) ||
        left.key.localeCompare(right.key),
    )
    .slice(0, MAX_VISIBLE_FACTORS_PER_CANDIDATE)
    .map((factor) => ({
      key: factor.key,
      label: humanize(factor.key),
      contribution: factor.contribution,
      evidenceEventIds: [...factor.evidenceEventIds],
      ...(factor.fact
        ? {
            factLabel: factor.fact.label,
            ...(factor.fact.value === null ? {} : { factValue: factor.fact.value }),
          }
        : {}),
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
        desire: candidate.desire,
        plan: candidate.plan,
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

function reasonFromDecision(decision: DecisionRecord | undefined): string | undefined {
  return decision?.strongestReason
    ? `${reasonFactText(decision.strongestReason)}.`
    : undefined;
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
    ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
    actorIds: [...event.actorIds],
    targetIds: [...event.targetIds],
    causedByEventIds: [...event.causedByEventIds],
    importance: event.importance,
    attentionTier: event.attentionTier,
    clusterKey: event.clusterKey,
    ...(event.locationTileIndex === null
      ? {}
      : { locationTileIndex: event.locationTileIndex }),
    ...(event.commandId === null ? {} : { commandId: event.commandId }),
    ...(event.commandOutcome === null ? {} : { commandOutcome: event.commandOutcome }),
    ...(event.commandRejectionReason === null
      ? {}
      : { commandRejectionReason: event.commandRejectionReason }),
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
  const commandSource = event.sourceEventIds
    .map((sourceId) => state.domainEvents.find((source) => source.id === sourceId))
    .find((source) => source?.commandId !== null && source?.commandId !== undefined);
  const decision = linkedDecisionForEvent(state, [], event.sourceEventIds);
  return {
    id: 1_000_000 + event.id,
    tick: event.tick,
    category: eventCategory(event.type, playerCaused),
    type: event.type,
    title: event.title,
    detail: event.summary,
    ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
    actorIds: [...event.actorIds],
    targetIds: commandSource ? [...commandSource.targetIds] : [],
    causedByEventIds: [...event.sourceEventIds],
    importance: event.importance,
    attentionTier:
      event.importance >= 80
        ? "CRITICAL"
        : event.importance >= 50
          ? "SIGNIFICANT"
          : event.importance >= 18
            ? "NOTABLE"
            : "ROUTINE",
    clusterKey: `history:${event.type}:${event.actorIds.join(",")}:${event.groupIds.join(",")}`,
    ...(commandSource?.locationTileIndex === null || commandSource === undefined
      ? {}
      : { locationTileIndex: commandSource.locationTileIndex }),
    ...(commandSource?.commandId === null || commandSource === undefined
      ? {}
      : {
          commandId: commandSource.commandId,
          commandSourceEventId: commandSource.id,
        }),
    ...(commandSource?.commandOutcome === null || commandSource === undefined
      ? {}
      : { commandOutcome: commandSource.commandOutcome }),
    ...(commandSource?.commandRejectionReason === null || commandSource === undefined
      ? {}
      : { commandRejectionReason: commandSource.commandRejectionReason }),
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
    const observationSummary = projectCreatureObservationSummary(creature);
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
      desire: creature.activeDesire?.kind ?? "Considering",
      plan: creature.activePlan?.kind ?? "No settled plan",
      goal: creature.activeDesire?.kind ?? "Considering",
      action: creature.activeAction?.kind ?? "Considering",
      actionPhase: creature.activeAction?.phase ?? "CONSIDERING",
      reason: creature.activePlan?.strongestReason?.label ?? "Reconsidering",
      summary: {
        desire: observationSummary.desire.text,
        plan: observationSummary.plan.text,
        action: observationSummary.action.text,
        reason: observationSummary.reason.text,
      },
      ...(targetTileIndex === null
        ? {}
        : {
            goalTarget: {
              x: (targetTileIndex % width) + 0.5,
              y: Math.floor(targetTileIndex / width) + 0.5,
            },
          }),
      route: creature.recentRoute.map((sample) => ({
        tick: sample.tick,
        x: sample.x / 256,
        y: sample.y / 256,
      })),
      ...(creature.activeAction?.interactionClaim
        ? {
            interactionSlot: {
              x: creature.activeAction.interactionClaim.targetX / 256,
              y: creature.activeAction.interactionClaim.targetY / 256,
            },
          }
        : {}),
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
    scenario: mapScenario(snapshot),
    tick: snapshot.tick,
    timeLabel: formatSimulationTime(snapshot.tick),
    hash: hashSimulationState(state),
    hashTick: snapshot.tick,
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

/** Builds the live web view directly from the Worker observation projection. */
export const makeWorldViewFromSnapshot = (
  snapshot: RenderSnapshot,
  hash: string | null,
  retainedTiles: readonly TileView[] = [],
  hashTick: number | null = hash === null ? null : snapshot.tick,
  retainedScenario?: ScenarioView,
): WorldView => {
  if (
    snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    snapshot.behaviorVersion !== SIMULATION_BEHAVIOR_VERSION
  ) {
    throw new Error(
      `Incompatible render snapshot ${snapshot.schemaVersion}/${snapshot.behaviorVersion}.`,
    );
  }
  const width = snapshot.width;
  const names = new Map(snapshot.creatures.map((creature) => [creature.id, creature.name]));
  const tiles: TileView[] =
    snapshot.tiles.length > 0
      ? snapshot.tiles.map((tile) => ({ ...tile, fertility: 0, hazard: 0 }))
      : retainedTiles.map((tile) => ({ ...tile }));
  const decisions = snapshot.creatures
    .map((creature) => creature.latestDecision)
    .filter((decision): decision is DecisionRecord => decision !== null);
  const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
  const eventById = new Map(snapshot.recentEvents.map((event) => [event.id, event]));
  const decisionForEvent = (
    decisionIds: readonly number[],
    sourceEventIds: readonly number[],
  ): DecisionRecord | undefined => {
    for (const id of decisionIds) {
      const decision = decisionById.get(id);
      if (decision) return decision;
    }
    for (const sourceId of sourceEventIds) {
      const event = eventById.get(sourceId);
      if (!event) continue;
      for (const id of event.decisionRecordIds) {
        const decision = decisionById.get(id);
        if (decision) return decision;
      }
    }
    return undefined;
  };

  const creatures: CreatureView[] = snapshot.creatures.map((creature) => {
    const target =
      creature.destinationX !== null && creature.destinationY !== null
        ? { x: creature.destinationX, y: creature.destinationY }
        : creature.targetTileIndex === null
          ? undefined
          : {
              x: (creature.targetTileIndex % width) + 0.5,
              y: Math.floor(creature.targetTileIndex / width) + 0.5,
            };
    const relationships: RelationshipView[] = creature.relationships
      .map((edge) => {
        const direction = edge.fromId === creature.id ? "toward" : "from";
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
      .filter((relationship) => relationship.otherId !== creature.id)
      .sort(
        (left, right) =>
          Math.max(Math.abs(right.trust), right.fear / 100, right.rivalry / 100) -
          Math.max(Math.abs(left.trust), left.fear / 100, left.rivalry / 100),
      )
      .slice(0, 12);
    return {
      id: creature.id,
      name: creature.name,
      color: creature.color,
      x: creature.x,
      y: creature.y,
      alive: creature.alive,
      ...(creature.groupId === null ? {} : { groupId: creature.groupId }),
      role: humanize(creature.role),
      desire: creature.desire ?? "Considering",
      plan: creature.plan ?? "No settled plan",
      goal: creature.desire ?? "Considering",
      action: creature.action ?? "Considering",
      actionPhase: creature.actionPhase ?? "CONSIDERING",
      reason: creature.summary.reason.factRefs[0]?.label ?? "Reconsidering",
      summary: {
        desire: creature.summary.desire.text,
        plan: creature.summary.plan.text,
        action: creature.summary.action.text,
        reason: creature.summary.reason.text,
      },
      ...(target ? { goalTarget: target } : {}),
      route: creature.recentRoute.map((sample) => ({ ...sample })),
      ...(creature.destinationX === null || creature.destinationY === null
        ? {}
        : {
            interactionSlot: {
              x: creature.destinationX,
              y: creature.destinationY,
            },
          }),
      health: percent(creature.health),
      hunger: percent(creature.hunger),
      fatigue: percent(creature.fatigue),
      traits: Object.entries(traitLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.traits[key as keyof typeof traitLabels]),
      })),
      inventory: [
        { kind: "food", quantity: creature.inventory.food },
        { kind: "material", quantity: creature.inventory.material },
      ].filter((stack) => stack.quantity > 0),
      candidates: creature.latestDecision
        ? candidatesFromDecision(creature.latestDecision)
        : [],
      memories: creature.memories
        .map((memory) => ({
          id: memory.id,
          kind: memory.kind,
          ...(memory.subjectEntityId === null ? {} : { subjectId: memory.subjectEntityId }),
          strength: percent(memory.strength),
          valence: signedUnit(memory.valence),
          ageTicks: Math.max(0, snapshot.tick - memory.createdTick),
          sourceEventIds: [...memory.sourceEventIds],
        }))
        .sort((left, right) => right.strength - left.strength)
        .slice(0, 12),
      relationships,
    };
  });
  const resources: ResourceView[] = snapshot.resourceNodes.map((resource) => ({
    id: resource.id,
    kind: resource.kind,
    ...pointForTile(resource.tileIndex, width),
    stock: resource.currentStock,
    capacity: resource.maximumStock,
  }));
  const structures: StructureView[] = snapshot.structures.map((structure) => ({
    id: structure.id,
    kind: structure.kind,
    ...pointForTile(structure.tileIndex, width),
    groupId: structure.groupId,
    progress: percent(structure.progress),
    stored: structure.food,
    capacity: Math.max(structure.food, structure.material, 20),
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
  const promoted = new Set(snapshot.historyEvents.flatMap((event) => event.sourceEventIds));
  const historyViews: TimelineEventView[] = snapshot.historyEvents.map((event) => {
    const playerCaused = event.type === "INTERVENTION";
    const commandSource = event.sourceEventIds
      .map((sourceId) => eventById.get(sourceId))
      .find((source) => source?.commandId !== null && source?.commandId !== undefined);
    const decision = decisionForEvent([], event.sourceEventIds);
    const attentionTier =
      event.importance >= 80
        ? "CRITICAL"
        : event.importance >= 50
          ? "SIGNIFICANT"
          : event.importance >= 18
            ? "NOTABLE"
            : "ROUTINE";
    return {
      id: 1_000_000 + event.id,
      tick: event.tick,
      category: eventCategory(event.type, playerCaused),
      type: event.type,
      title: event.title,
      detail: event.summary,
      ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
      actorIds: [...event.actorIds],
      targetIds: commandSource ? [...commandSource.targetIds] : [],
      causedByEventIds: [...event.sourceEventIds],
      importance: event.importance,
      attentionTier,
      clusterKey: `history:${event.type}:${event.actorIds.join(",")}:${event.groupIds.join(",")}`,
      ...(commandSource?.locationTileIndex === null || commandSource === undefined
        ? {}
        : { locationTileIndex: commandSource.locationTileIndex }),
      ...(commandSource?.commandId === null || commandSource === undefined
        ? {}
        : {
            commandId: commandSource.commandId,
            commandSourceEventId: commandSource.id,
          }),
      ...(commandSource?.commandOutcome === null || commandSource === undefined
        ? {}
        : { commandOutcome: commandSource.commandOutcome }),
      ...(commandSource?.commandRejectionReason === null || commandSource === undefined
        ? {}
        : { commandRejectionReason: commandSource.commandRejectionReason }),
      playerCaused,
      ...(decision
        ? {
            decisionActorId: decision.actorId,
            decisionCandidates: candidatesFromDecision(decision),
          }
        : {}),
    };
  });
  const domainViews: TimelineEventView[] = snapshot.recentEvents
    .filter((event) => !promoted.has(event.id))
    .filter(
      (event) =>
        event.type.startsWith("PLAYER_") ||
        event.type === "SIMULATION_STARTED" ||
        (event.type !== "ACTION_STARTED" && event.attentionTier !== "ROUTINE"),
    )
    .map((event) => {
      const playerCaused = event.type.startsWith("PLAYER_");
      const decision = decisionForEvent(event.decisionRecordIds, event.causedByEventIds);
      return {
        id: event.id,
        tick: event.tick,
        category: eventCategory(event.type, playerCaused),
        type: event.type,
        title: humanize(event.type),
        detail: event.summary,
        ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
        actorIds: [...event.actorIds],
        targetIds: [...event.targetIds],
        causedByEventIds: [...event.causedByEventIds],
        importance: event.importance,
        attentionTier: event.attentionTier,
        clusterKey: event.clusterKey,
        ...(event.locationTileIndex === null
          ? {}
          : { locationTileIndex: event.locationTileIndex }),
        ...(event.commandId === null ? {} : { commandId: event.commandId }),
        ...(event.commandOutcome === null ? {} : { commandOutcome: event.commandOutcome }),
        ...(event.commandRejectionReason === null
          ? {}
          : { commandRejectionReason: event.commandRejectionReason }),
        playerCaused,
        ...(decision
          ? {
              decisionActorId: decision.actorId,
              decisionCandidates: candidatesFromDecision(decision),
            }
          : {}),
      };
    });
  return {
    scenario: mapScenario(snapshot, retainedScenario),
    tick: snapshot.tick,
    timeLabel: snapshot.timeLabel,
    hash: hash ?? "",
    ...(hash === null || hashTick === null ? {} : { hashTick }),
    width,
    height: snapshot.height,
    tiles,
    creatures,
    resources,
    structures,
    groups,
    events: [...historyViews, ...domainViews].sort(
      (left, right) => right.tick - left.tick || right.id - left.id,
    ),
    population: creatures.filter((creature) => creature.alive).length,
    foodStock: resources
      .filter((resource) => resource.kind === "FOOD")
      .reduce((total, resource) => total + resource.stock, 0),
  };
};
