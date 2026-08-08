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
  type LifeRecord,
  type PlayerCommand,
  type RenderSnapshot,
  type RenderStructure,
  type SimulationState,
  type UtilityFactor,
} from "@tiny-civ/sim-core";
import type {
  CandidateView,
  CreatureView,
  EntityId,
  GroupView,
  InventoryView,
  InterventionTool,
  LifeRecordView,
  MemorialView,
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

type LifeRecordProjectionSource = Readonly<Omit<LifeRecord, "majorEventIds">> & {
  readonly majorEventIds: readonly number[];
};

export function makeLifeRecordViews(
  records: readonly LifeRecordProjectionSource[],
  living: readonly {
    readonly id: EntityId;
    readonly motherId?: EntityId | null | undefined;
    readonly fatherId?: EntityId | null | undefined;
  }[] = [],
): LifeRecordView[] {
  const identities = [...living, ...records];
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    color: record.color,
    sex: record.sex,
    ...(record.motherId === null ? {} : { motherId: record.motherId }),
    ...(record.fatherId === null ? {} : { fatherId: record.fatherId }),
    childIds: identities
      .filter(
        (candidate) => candidate.motherId === record.id || candidate.fatherId === record.id,
      )
      .map((candidate) => candidate.id),
    birthTick: record.birthTick,
    deathTick: record.deathTick,
    ageTicks: record.ageTicks,
    finalLifeStage: record.finalLifeStage,
    deathCause: record.deathCause,
    ...(record.finalGroupId === null ? {} : { finalGroupId: record.finalGroupId }),
    inheritedTraits: Object.entries(traitLabels).map(([key, label]) => ({
      key,
      label,
      value: percent(record.traitPotential[key as keyof typeof traitLabels]),
    })),
    skillPotential: Object.entries(skillLabels).map(([key, label]) => ({
      key,
      label,
      value: percent(record.skillPotential[key as keyof typeof skillLabels]),
    })),
    majorEventIds: [...record.majorEventIds],
    ...(record.heirId === null ? {} : { heirId: record.heirId }),
  }));
}

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

const skillLabels = {
  foraging: "Foraging",
  combat: "Combat",
} as const;

const MAX_VISIBLE_FACTORS_PER_CANDIDATE = 3;
const ROUTINE_WATER_DRINKING_CLUSTER_KEY = "presentation:water-drinking:routine";
const FIRST_WATER_SHARE_CLUSTER_KEY = "presentation:water-share:first";
const CONTINUED_WATER_SHARE_CLUSTER_KEY = "presentation:water-share:continued";

function domainEventTitle(event: DomainEvent): string {
  if (event.clusterKey === ROUTINE_WATER_DRINKING_CLUSTER_KEY) {
    return "Routine drinking";
  }
  if (event.clusterKey === FIRST_WATER_SHARE_CLUSTER_KEY) {
    return "First water sharing";
  }
  if (event.clusterKey === CONTINUED_WATER_SHARE_CLUSTER_KEY) {
    return "Water sharing continued";
  }
  return humanize(event.type);
}

function domainEventAttention(event: DomainEvent): DomainEvent["attentionTier"] {
  return event.clusterKey === FIRST_WATER_SHARE_CLUSTER_KEY
    ? "SIGNIFICANT"
    : event.attentionTier;
}

function shouldPresentDomainEvent(event: DomainEvent): boolean {
  return (
    event.type.startsWith("PLAYER_") ||
    event.type === "SIMULATION_STARTED" ||
    event.clusterKey === ROUTINE_WATER_DRINKING_CLUSTER_KEY ||
    (event.type !== "ACTION_STARTED" && event.attentionTier !== "ROUTINE")
  );
}

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
            ...(factor.fact.unit === null ? {} : { factUnit: factor.fact.unit }),
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
    { kind: "water", quantity: creature.inventory.water },
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
  if (
    /LIFECYCLE|LIFE_STAGE|CRITICAL_HEALTH|BIRTH|BORN|PREGNAN|FAMILY|CARE|ADULT|ELDER|DEATH|DIED|MOURN|MEMORIAL|ESTATE|INHERIT|EXTINCT|SUCCESSION/i.test(
      type,
    )
  ) {
    return "lifecycle";
  }
  if (/FIGHT|ATTACK|DAMAGE|HARM|THEFT|CONFLICT|CONFRONT|FLEE|FLED/i.test(type)) {
    return "conflict";
  }
  if (
    /GROUP|LEADER|JOIN|LEAVE|STORAGE|FOUNDED|SHELTER|SETTLEMENT|RELOCAT|ABANDON/i.test(type)
  ) {
    return "group";
  }
  if (/FOOD|WATER|THIRST|GATHER|RESOURCE|DEPOSIT|WITHDRAW|MATERIAL/i.test(type)) {
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
  if (!playerCaused && !shouldPresentDomainEvent(event)) {
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
    title: domainEventTitle(event),
    detail: event.summary,
    ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
    actorIds: [...event.actorIds],
    targetIds: [...event.targetIds],
    groupIds: [...event.groupIds],
    causedByEventIds: [...event.causedByEventIds],
    importance: event.importance,
    attentionTier: domainEventAttention(event),
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
    groupIds: [...event.groupIds],
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
  tool: Exclude<InterventionTool, "inspect">,
  tile: TileView,
): SimulationState => {
  const common = { applyAtTick: state.tick, tileIndex: tile.index };
  let command: PlayerCommand;
  switch (tool) {
    case "add-food":
      command = { ...common, type: "ADD_FOOD", amount: 12 };
      break;
    case "remove-food":
      command = { ...common, type: "REMOVE_FOOD", amount: 12 };
      break;
    case "add-material":
      command = { ...common, type: "ADD_MATERIAL", amount: 12 };
      break;
    case "remove-material":
      command = { ...common, type: "REMOVE_MATERIAL", amount: 12 };
      break;
    case "replenish-water":
      command = { ...common, type: "REPLENISH_WATER", amount: 12 };
      break;
    case "drain-water":
      command = { ...common, type: "DRAIN_WATER", amount: 12 };
      break;
    case "obstacle":
      command = { ...common, type: "TOGGLE_OBSTACLE", blocked: !tile.blocked };
      break;
    default: {
      const unhandled: never = tool;
      throw new Error(`Unknown intervention tool: ${String(unhandled)}`);
    }
  }
  queuePlayerCommand(state, command);
  return state;
};

function mapStructure(
  structure: RenderStructure,
  width: number,
  storageCapacity?: number,
): StructureView {
  const shelter = structure.condition !== null;
  return {
    id: structure.id,
    kind: structure.kind,
    ...pointForTile(structure.tileIndex, width),
    groupId: structure.groupId,
    progress: percent(structure.progress),
    stored: structure.food,
    capacity: shelter
      ? (structure.baseCapacity ?? structure.effectiveCapacity ?? 0)
      : (structure.storageCapacity ??
        storageCapacity ??
        Math.max(structure.food, structure.storedMaterial, 20)),
    materialDeposited: structure.material,
    materialRequired: structure.materialRequired,
    workRequired: structure.workRequired,
    storedMaterial: structure.storedMaterial,
    ...(structure.condition === null
      ? {}
      : {
          condition: percent(structure.condition),
          baseCapacity: structure.baseCapacity ?? 0,
          effectiveCapacity: structure.effectiveCapacity ?? 0,
          reservedSpaces: structure.reservedSpaces,
          restingCreatures: structure.restingCreatures,
          memberOccupancy: structure.memberOccupancy,
          guestOccupancy: structure.guestOccupancy,
          upkeepNeeded: structure.upkeepNeeded,
          ...(structure.siteAssessment === null
            ? {}
            : { siteAssessment: { ...structure.siteAssessment } }),
          ...(structure.builtFromShelterId === null
            ? {}
            : { builtFromShelterId: structure.builtFromShelterId }),
        }),
  };
}

function tileViewsFromSnapshot(
  snapshot: Pick<RenderSnapshot, "tiles" | "width">,
): TileView[] {
  return snapshot.tiles.map((tile, index) => ({
    ...tile,
    index,
    x: index % snapshot.width,
    y: Math.floor(index / snapshot.width),
    fertility: 0,
    hazard: 0,
  }));
}

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
  const tiles = tileViewsFromSnapshot(snapshot);

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
      sex: creature.sex,
      ageTicks: creature.ageTicks,
      lifeStage: creature.lifeStage,
      naturalLifespanTicks: creature.naturalLifespanTicks,
      birthTick: creature.birthTick,
      ...(creature.motherId === null ? {} : { motherId: creature.motherId }),
      ...(creature.fatherId === null ? {} : { fatherId: creature.fatherId }),
      childIds: [...state.creatures, ...state.lifeRecords]
        .filter(
          (candidate) =>
            candidate.motherId === creature.id || candidate.fatherId === creature.id,
        )
        .map((candidate) => candidate.id),
      ...(creature.caregiverId === null ? {} : { caregiverId: creature.caregiverId }),
      dependent:
        creature.lifeStage === "JUVENILE" &&
        creature.dependentUntilTick !== null &&
        creature.dependentUntilTick > state.tick,
      pregnant: creature.pregnancy !== null,
      ...(creature.pregnancy === null
        ? {}
        : { pregnancyDueTick: creature.pregnancy.dueTick }),
      ...(creature.criticalSinceTick === null
        ? {}
        : { criticalSinceTick: creature.criticalSinceTick }),
      mourning: creature.activeAction?.kind === "MOURN",
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
      ...(rendered?.waterAccess === null || rendered?.waterAccess === undefined
        ? {}
        : { waterAccess: { ...rendered.waterAccess } }),
      ...(rendered?.shelterAccess === null || rendered?.shelterAccess === undefined
        ? {}
        : {
            shelterAccess: {
              ...rendered.shelterAccess,
              condition:
                rendered.shelterAccess.condition === null
                  ? null
                  : percent(rendered.shelterAccess.condition),
            },
          }),
      health: percent(creature.health),
      hunger: percent(creature.needs.hunger),
      fatigue: percent(creature.needs.fatigue),
      thirst: percent(creature.needs.thirst),
      traits: mapTraits(state, creature.id),
      inheritedTraits: Object.entries(traitLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.traitPotential[key as keyof typeof traitLabels]),
      })),
      skillPotential: Object.entries(skillLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.skillPotential[key as keyof typeof skillLabels]),
      })),
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
    ...(resource.waterAccess === null ? {} : { access: { ...resource.waterAccess } }),
  }));

  const structures: StructureView[] = snapshot.structures.map((structure) =>
    mapStructure(
      structure,
      width,
      state.structures.find((candidate) => candidate.id === structure.id)?.inventory
        .capacity,
    ),
  );

  const groups: GroupView[] = snapshot.groups.map((group) => ({
    id: group.id,
    name: group.name,
    stage: group.stage,
    status: group.status,
    ...(group.extinctTick === null ? {} : { extinctTick: group.extinctTick }),
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
    ...(group.activeShelterId === null ? {} : { activeShelterId: group.activeShelterId }),
    ...(group.pendingShelterId === null
      ? {}
      : { pendingShelterId: group.pendingShelterId }),
    shelterRelocations: group.shelterRelocations,
    shelterCommitUntilTick: group.shelterCommitUntilTick,
    ...(group.shelterRelocationCandidate === null
      ? {}
      : { shelterRelocationCandidate: { ...group.shelterRelocationCandidate } }),
  }));

  const memorials: MemorialView[] = snapshot.memorials.map((memorial) => {
    const { heirId, ...retained } = memorial;
    return {
      ...retained,
      ...pointForTile(memorial.tileIndex, width),
      ...(heirId === null ? {} : { heirId }),
    };
  });
  const lifeRecords = makeLifeRecordViews(state.lifeRecords, state.creatures);

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
    memorials,
    lifeRecords,
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
      ? tileViewsFromSnapshot(snapshot)
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
      sex: creature.sex,
      ageTicks: creature.ageTicks,
      lifeStage: creature.lifeStage,
      birthTick: creature.birthTick,
      naturalLifespanTicks: creature.naturalLifespanTicks,
      ...(creature.motherId === null ? {} : { motherId: creature.motherId }),
      ...(creature.fatherId === null ? {} : { fatherId: creature.fatherId }),
      childIds: snapshot.creatures
        .filter(
          (candidate) =>
            candidate.motherId === creature.id || candidate.fatherId === creature.id,
        )
        .map((candidate) => candidate.id),
      dependent:
        creature.lifeStage === "JUVENILE" &&
        creature.dependentUntilTick !== null &&
        creature.dependentUntilTick > snapshot.tick,
      ...(creature.caregiverId === null ? {} : { caregiverId: creature.caregiverId }),
      pregnant: creature.pregnant,
      ...(creature.pregnancyDueTick === null
        ? {}
        : { pregnancyDueTick: creature.pregnancyDueTick }),
      ...(creature.criticalSinceTick === null
        ? {}
        : { criticalSinceTick: creature.criticalSinceTick }),
      mourning: creature.action === "MOURN",
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
      ...(creature.waterAccess === null
        ? {}
        : { waterAccess: { ...creature.waterAccess } }),
      ...(creature.shelterAccess === null
        ? {}
        : {
            shelterAccess: {
              ...creature.shelterAccess,
              condition:
                creature.shelterAccess.condition === null
                  ? null
                  : percent(creature.shelterAccess.condition),
            },
          }),
      health: percent(creature.health),
      hunger: percent(creature.hunger),
      fatigue: percent(creature.fatigue),
      thirst: percent(creature.thirst),
      traits: Object.entries(traitLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.traits[key as keyof typeof traitLabels]),
      })),
      inheritedTraits: Object.entries(traitLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.traitPotential[key as keyof typeof traitLabels]),
      })),
      skillPotential: Object.entries(skillLabels).map(([key, label]) => ({
        key,
        label,
        value: percent(creature.skillPotential[key as keyof typeof skillLabels]),
      })),
      inventory: [
        { kind: "food", quantity: creature.inventory.food },
        { kind: "material", quantity: creature.inventory.material },
        { kind: "water", quantity: creature.inventory.water },
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
    ...(resource.waterAccess === null ? {} : { access: { ...resource.waterAccess } }),
  }));
  const structures: StructureView[] = snapshot.structures.map((structure) =>
    mapStructure(structure, width),
  );
  const groups: GroupView[] = snapshot.groups.map((group) => ({
    id: group.id,
    name: group.name,
    stage: group.stage,
    status: group.status,
    ...(group.extinctTick === null ? {} : { extinctTick: group.extinctTick }),
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
    ...(group.activeShelterId === null ? {} : { activeShelterId: group.activeShelterId }),
    ...(group.pendingShelterId === null
      ? {}
      : { pendingShelterId: group.pendingShelterId }),
    shelterRelocations: group.shelterRelocations,
    shelterCommitUntilTick: group.shelterCommitUntilTick,
    ...(group.shelterRelocationCandidate === null
      ? {}
      : { shelterRelocationCandidate: { ...group.shelterRelocationCandidate } }),
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
      groupIds: [...event.groupIds],
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
    .filter(shouldPresentDomainEvent)
    .map((event) => {
      const playerCaused = event.type.startsWith("PLAYER_");
      const decision = decisionForEvent(event.decisionRecordIds, event.causedByEventIds);
      return {
        id: event.id,
        tick: event.tick,
        category: eventCategory(event.type, playerCaused),
        type: event.type,
        title: domainEventTitle(event),
        detail: event.summary,
        ...(reasonFromDecision(decision) ? { reason: reasonFromDecision(decision) } : {}),
        actorIds: [...event.actorIds],
        targetIds: [...event.targetIds],
        groupIds: [...event.groupIds],
        causedByEventIds: [...event.causedByEventIds],
        importance: event.importance,
        attentionTier: domainEventAttention(event),
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
  const memorials: MemorialView[] = snapshot.memorials.map((memorial) => {
    const { heirId, ...retained } = memorial;
    return {
      ...retained,
      ...pointForTile(memorial.tileIndex, width),
      ...(heirId === null ? {} : { heirId }),
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
    memorials,
    lifeRecords: [],
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
