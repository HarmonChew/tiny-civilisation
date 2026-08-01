import type {
  ActionKind,
  DecisionSwitchReason,
  DomainEventType,
  HistoricalEventType,
  MemoryKind,
  ResourceKind,
  SimulationState,
  StructureKind,
} from "./types.js";
import { CAUSAL_EVIDENCE_SCHEMA_VERSION, SIMULATION_BEHAVIOR_VERSION } from "./versions.js";

export type CausalEvidenceRef =
  | { readonly kind: "event"; readonly id: number }
  | { readonly kind: "decision"; readonly id: number }
  | { readonly kind: "memory"; readonly id: number }
  | { readonly kind: "relationship"; readonly id: number }
  | { readonly kind: "history"; readonly id: number }
  | { readonly kind: "creature"; readonly id: number }
  | { readonly kind: "group"; readonly id: number }
  | { readonly kind: "structure"; readonly id: number }
  | { readonly kind: "resource"; readonly id: number }
  | { readonly kind: "tile"; readonly id: number };

export type CausalEvidenceRelation =
  | "CAUSED_BY"
  | "EXPLAINED_BY"
  | "SUPPORTED_BY"
  | "ACTOR"
  | "TARGET"
  | "LOCATED_AT"
  | "INVOLVES_GROUP"
  | "OWNED_BY"
  | "ABOUT"
  | "REMEMBERS"
  | "SHAPED_BY"
  | "FROM"
  | "TO"
  | "SUMMARIZES"
  | "HAS_MEMORY"
  | "HAS_RELATIONSHIP"
  | "MEMBER_OF"
  | "HAS_MEMBER"
  | "GUARDED_BY";

export interface DecisionFactorEvidenceV1 {
  readonly key: string;
  readonly contribution: number;
  readonly evidence: readonly Extract<CausalEvidenceRef, { kind: "event" }>[];
}

export interface DecisionCandidateEvidenceV1 {
  readonly action: ActionKind;
  readonly target: CausalEvidenceRef | null;
  readonly targetTileIndex: number | null;
  readonly utility: number;
  readonly factors: readonly DecisionFactorEvidenceV1[];
}

export type CausalEvidenceDetailV1 =
  | {
      readonly kind: "event";
      readonly eventType: DomainEventType;
      readonly quantity: number;
      readonly importance: number;
    }
  | {
      readonly kind: "decision";
      readonly actorId: number;
      readonly previousAction: ActionKind | null;
      readonly selectedAction: ActionKind;
      readonly selectedTarget: CausalEvidenceRef | null;
      readonly switchReason: DecisionSwitchReason;
      readonly candidates: readonly DecisionCandidateEvidenceV1[];
    }
  | {
      readonly kind: "memory";
      readonly memoryKind: MemoryKind;
      readonly valence: number;
      readonly importance: number;
      readonly strength: number;
    }
  | {
      readonly kind: "relationship";
      readonly trust: number;
      readonly fear: number;
      readonly familiarity: number;
      readonly rivalry: number;
    }
  | {
      readonly kind: "history";
      readonly historyType: HistoricalEventType;
      readonly importance: number;
    }
  | {
      readonly kind: "creature";
      readonly alive: boolean;
      readonly groupId: number | null;
    }
  | {
      readonly kind: "group";
      readonly stage: "PROVISIONAL" | "PERSISTENT";
      readonly cohesion: number;
      readonly sharingNorm: number;
    }
  | {
      readonly kind: "structure";
      readonly structureKind: StructureKind;
      readonly completedTick: number | null;
    }
  | {
      readonly kind: "resource";
      readonly resourceKind: ResourceKind;
      readonly currentStock: number;
      readonly maximumStock: number;
    }
  | {
      readonly kind: "tile";
      readonly x: number;
      readonly y: number;
      readonly blocked: boolean;
    };

export interface CausalEvidenceNodeV1 {
  readonly ref: CausalEvidenceRef;
  readonly label: string;
  readonly tick: number | null;
  readonly summary: string;
  readonly detail: CausalEvidenceDetailV1;
}

export interface CausalEvidenceEdgeV1 {
  readonly from: CausalEvidenceRef;
  readonly to: CausalEvidenceRef;
  readonly relation: CausalEvidenceRelation;
  readonly factorKey: string | null;
  readonly contribution: number | null;
}

export interface CausalEvidenceProjectionV1 {
  readonly schemaVersion: typeof CAUSAL_EVIDENCE_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly stateTick: number;
  readonly focus: CausalEvidenceRef;
  readonly nodes: readonly CausalEvidenceNodeV1[];
  readonly edges: readonly CausalEvidenceEdgeV1[];
  readonly immediateCauses: readonly Extract<CausalEvidenceRef, { kind: "event" }>[];
  readonly laterConsequences: readonly Extract<CausalEvidenceRef, { kind: "event" }>[];
  readonly missingRefs: readonly CausalEvidenceRef[];
  readonly truncated: boolean;
}

export interface CausalEvidenceQueryOptions {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

const refKey = (ref: CausalEvidenceRef): string => `${ref.kind}:${ref.id.toString()}`;

function compareRefs(left: CausalEvidenceRef, right: CausalEvidenceRef): number {
  return left.kind.localeCompare(right.kind) || left.id - right.id;
}

function eventRef(id: number): Extract<CausalEvidenceRef, { kind: "event" }> {
  return { kind: "event", id };
}

function entityRef(state: SimulationState, id: number): CausalEvidenceRef | null {
  if (state.creatures.some((creature) => creature.id === id)) {
    return { kind: "creature", id };
  }
  if (state.structures.some((structure) => structure.id === id)) {
    return { kind: "structure", id };
  }
  if (state.resourceNodes.some((resource) => resource.id === id)) {
    return { kind: "resource", id };
  }
  return null;
}

function decisionCandidate(
  state: SimulationState,
  candidate: SimulationState["decisionRecords"][number]["candidates"][number],
): DecisionCandidateEvidenceV1 {
  return {
    action: candidate.action,
    target:
      candidate.targetEntityId === null ? null : entityRef(state, candidate.targetEntityId),
    targetTileIndex: candidate.targetTileIndex,
    utility: candidate.utility,
    factors: candidate.factors.map((factor) => ({
      key: factor.key,
      contribution: factor.contribution,
      evidence: factor.evidenceEventIds.map(eventRef),
    })),
  };
}

function resolveNode(
  state: SimulationState,
  ref: CausalEvidenceRef,
): CausalEvidenceNodeV1 | null {
  switch (ref.kind) {
    case "event": {
      const event = state.domainEvents.find((candidate) => candidate.id === ref.id);
      return event
        ? {
            ref,
            label: event.type.replaceAll("_", " ").toLowerCase(),
            tick: event.tick,
            summary: event.summary,
            detail: {
              kind: "event",
              eventType: event.type,
              quantity: event.quantity,
              importance: event.importance,
            },
          }
        : null;
    }
    case "decision": {
      const decision = state.decisionRecords.find((candidate) => candidate.id === ref.id);
      return decision
        ? {
            ref,
            label: `${decision.selectedAction.replaceAll("_", " ").toLowerCase()} decision`,
            tick: decision.tick,
            summary: `Selected ${decision.selectedAction.toLowerCase().replaceAll("_", " ")} via ${decision.switchReason.toLowerCase().replaceAll("_", " ")}.`,
            detail: {
              kind: "decision",
              actorId: decision.actorId,
              previousAction: decision.previousAction,
              selectedAction: decision.selectedAction,
              selectedTarget:
                decision.selectedTargetId === null
                  ? null
                  : entityRef(state, decision.selectedTargetId),
              switchReason: decision.switchReason,
              candidates: decision.candidates.map((candidate) =>
                decisionCandidate(state, candidate),
              ),
            },
          }
        : null;
    }
    case "memory": {
      const memory = state.memories.find((candidate) => candidate.id === ref.id);
      return memory
        ? {
            ref,
            label: memory.kind.replaceAll("_", " ").toLowerCase(),
            tick: memory.createdTick,
            summary: `Memory held by creature ${memory.ownerId.toString()}.`,
            detail: {
              kind: "memory",
              memoryKind: memory.kind,
              valence: memory.valence,
              importance: memory.importance,
              strength: memory.strength,
            },
          }
        : null;
    }
    case "relationship": {
      const edge = state.relationships.find((candidate) => candidate.id === ref.id);
      return edge
        ? {
            ref,
            label: `relationship ${edge.fromId.toString()} -> ${edge.toId.toString()}`,
            tick: edge.lastInteractionTick,
            summary: `Trust ${edge.trust.toString()}, fear ${edge.fear.toString()}, familiarity ${edge.familiarity.toString()}.`,
            detail: {
              kind: "relationship",
              trust: edge.trust,
              fear: edge.fear,
              familiarity: edge.familiarity,
              rivalry: edge.rivalry,
            },
          }
        : null;
    }
    case "history": {
      const history = state.historyEvents.find((candidate) => candidate.id === ref.id);
      return history
        ? {
            ref,
            label: history.title,
            tick: history.tick,
            summary: history.summary,
            detail: {
              kind: "history",
              historyType: history.type,
              importance: history.importance,
            },
          }
        : null;
    }
    case "creature": {
      const creature = state.creatures.find((candidate) => candidate.id === ref.id);
      return creature
        ? {
            ref,
            label: creature.name,
            tick: creature.lastActionTick < 0 ? null : creature.lastActionTick,
            summary: `${creature.name} is ${creature.alive ? "alive" : "dead"} and currently ${creature.lastActionKind?.toLowerCase().replaceAll("_", " ") ?? "idle"}.`,
            detail: {
              kind: "creature",
              alive: creature.alive,
              groupId: creature.groupId,
            },
          }
        : null;
    }
    case "group": {
      const group = state.groups.find((candidate) => candidate.id === ref.id);
      return group
        ? {
            ref,
            label: group.name,
            tick: group.foundedTick,
            summary: `${group.name} has ${group.memberIds.length.toString()} members.`,
            detail: {
              kind: "group",
              stage: group.stage,
              cohesion: group.cohesion,
              sharingNorm: group.sharingNorm,
            },
          }
        : null;
    }
    case "structure": {
      const structure = state.structures.find((candidate) => candidate.id === ref.id);
      return structure
        ? {
            ref,
            label: structure.kind.replaceAll("_", " ").toLowerCase(),
            tick: structure.completedTick,
            summary: `Structure for group ${structure.groupId.toString()} at tile ${structure.tileIndex.toString()}.`,
            detail: {
              kind: "structure",
              structureKind: structure.kind,
              completedTick: structure.completedTick,
            },
          }
        : null;
    }
    case "resource": {
      const resource = state.resourceNodes.find((candidate) => candidate.id === ref.id);
      return resource
        ? {
            ref,
            label: `${resource.kind.toLowerCase()} resource`,
            tick: null,
            summary: `${resource.currentStock.toString()} of ${resource.maximumStock.toString()} units remain.`,
            detail: {
              kind: "resource",
              resourceKind: resource.kind,
              currentStock: resource.currentStock,
              maximumStock: resource.maximumStock,
            },
          }
        : null;
    }
    case "tile": {
      const tile = state.world.tiles[ref.id];
      return tile
        ? {
            ref,
            label: `tile ${tile.x.toString()},${tile.y.toString()}`,
            tick: null,
            summary: `${tile.terrain.toLowerCase().replaceAll("_", " ")} tile.`,
            detail: {
              kind: "tile",
              x: tile.x,
              y: tile.y,
              blocked: tile.blocked,
            },
          }
        : null;
    }
  }
}

function outgoingEdges(
  state: SimulationState,
  ref: CausalEvidenceRef,
): CausalEvidenceEdgeV1[] {
  const edges: CausalEvidenceEdgeV1[] = [];
  const add = (
    to: CausalEvidenceRef | null,
    relation: CausalEvidenceRelation,
    factorKey: string | null = null,
    contribution: number | null = null,
  ): void => {
    if (to) edges.push({ from: ref, to, relation, factorKey, contribution });
  };

  switch (ref.kind) {
    case "event": {
      const event = state.domainEvents.find((candidate) => candidate.id === ref.id);
      if (!event) break;
      for (const id of event.causedByEventIds) add(eventRef(id), "CAUSED_BY");
      for (const id of event.decisionRecordIds) {
        add({ kind: "decision", id }, "EXPLAINED_BY");
      }
      for (const id of event.actorIds) add({ kind: "creature", id }, "ACTOR");
      for (const id of event.targetIds) add(entityRef(state, id), "TARGET");
      for (const id of event.groupIds) add({ kind: "group", id }, "INVOLVES_GROUP");
      if (event.locationTileIndex !== null) {
        add({ kind: "tile", id: event.locationTileIndex }, "LOCATED_AT");
      }
      break;
    }
    case "decision": {
      const decision = state.decisionRecords.find((candidate) => candidate.id === ref.id);
      if (!decision) break;
      add({ kind: "creature", id: decision.actorId }, "ACTOR");
      if (decision.selectedTargetId !== null) {
        add(entityRef(state, decision.selectedTargetId), "TARGET");
      }
      for (const candidate of decision.candidates) {
        if (candidate.targetTileIndex !== null) {
          add({ kind: "tile", id: candidate.targetTileIndex }, "LOCATED_AT");
        }
        for (const factor of candidate.factors) {
          for (const eventId of factor.evidenceEventIds) {
            add(eventRef(eventId), "SUPPORTED_BY", factor.key, factor.contribution);
          }
        }
      }
      break;
    }
    case "memory": {
      const memory = state.memories.find((candidate) => candidate.id === ref.id);
      if (!memory) break;
      add({ kind: "creature", id: memory.ownerId }, "OWNED_BY");
      if (memory.subjectEntityId !== null) {
        add(entityRef(state, memory.subjectEntityId), "ABOUT");
      }
      for (const eventId of memory.sourceEventIds) add(eventRef(eventId), "REMEMBERS");
      if (memory.locationTileIndex !== null) {
        add({ kind: "tile", id: memory.locationTileIndex }, "LOCATED_AT");
      }
      break;
    }
    case "relationship": {
      const relationship = state.relationships.find((candidate) => candidate.id === ref.id);
      if (!relationship) break;
      add({ kind: "creature", id: relationship.fromId }, "FROM");
      add({ kind: "creature", id: relationship.toId }, "TO");
      for (const eventId of relationship.significantEventIds) {
        add(eventRef(eventId), "SHAPED_BY");
      }
      break;
    }
    case "history": {
      const history = state.historyEvents.find((candidate) => candidate.id === ref.id);
      if (!history) break;
      for (const eventId of history.sourceEventIds) add(eventRef(eventId), "SUMMARIZES");
      for (const actorId of history.actorIds) {
        add({ kind: "creature", id: actorId }, "ACTOR");
      }
      for (const groupId of history.groupIds) {
        add({ kind: "group", id: groupId }, "INVOLVES_GROUP");
      }
      break;
    }
    case "creature": {
      const creature = state.creatures.find((candidate) => candidate.id === ref.id);
      if (!creature) break;
      for (const memoryId of creature.memoryIds) {
        add({ kind: "memory", id: memoryId }, "HAS_MEMORY");
      }
      for (const relationship of state.relationships) {
        if (relationship.fromId === creature.id) {
          add({ kind: "relationship", id: relationship.id }, "HAS_RELATIONSHIP");
        }
      }
      if (creature.groupId !== null) {
        add({ kind: "group", id: creature.groupId }, "MEMBER_OF");
      }
      break;
    }
    case "group": {
      const group = state.groups.find((candidate) => candidate.id === ref.id);
      if (!group) break;
      for (const memberId of group.memberIds) {
        add({ kind: "creature", id: memberId }, "HAS_MEMBER");
      }
      for (const eventId of group.majorEventIds) add(eventRef(eventId), "SHAPED_BY");
      if (group.storageStructureId !== null) {
        add({ kind: "structure", id: group.storageStructureId }, "TARGET");
      }
      add({ kind: "tile", id: group.homeTileIndex }, "LOCATED_AT");
      break;
    }
    case "structure": {
      const structure = state.structures.find((candidate) => candidate.id === ref.id);
      if (!structure) break;
      add({ kind: "group", id: structure.groupId }, "INVOLVES_GROUP");
      add({ kind: "tile", id: structure.tileIndex }, "LOCATED_AT");
      for (const guardId of structure.guardIds) {
        add({ kind: "creature", id: guardId }, "GUARDED_BY");
      }
      break;
    }
    case "resource": {
      const resource = state.resourceNodes.find((candidate) => candidate.id === ref.id);
      if (resource) add({ kind: "tile", id: resource.tileIndex }, "LOCATED_AT");
      break;
    }
    case "tile":
      break;
  }
  return edges;
}

function assertQueryRef(ref: CausalEvidenceRef): void {
  if (
    ![
      "event",
      "decision",
      "memory",
      "relationship",
      "history",
      "creature",
      "group",
      "structure",
      "resource",
      "tile",
    ].includes(ref.kind) ||
    !Number.isSafeInteger(ref.id) ||
    ref.id < (ref.kind === "tile" ? 0 : 1)
  ) {
    throw new Error("Causal evidence focus is invalid.");
  }
}

export function createCausalEvidenceProjection(
  state: SimulationState,
  focus: CausalEvidenceRef,
  options: CausalEvidenceQueryOptions = {},
): CausalEvidenceProjectionV1 {
  assertQueryRef(focus);
  const maxDepth = options.maxDepth ?? 2;
  const maxNodes = options.maxNodes ?? 100;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) {
    throw new Error("Causal evidence maxDepth must be between 0 and 5.");
  }
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 500) {
    throw new Error("Causal evidence maxNodes must be between 1 and 500.");
  }

  const nodes = new Map<string, CausalEvidenceNodeV1>();
  const edges = new Map<string, CausalEvidenceEdgeV1>();
  const missing = new Map<string, CausalEvidenceRef>();
  const queued = new Set<string>([refKey(focus)]);
  const queue: { ref: CausalEvidenceRef; depth: number }[] = [{ ref: focus, depth: 0 }];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const key = refKey(current.ref);
    const node = resolveNode(state, current.ref);
    if (!node) {
      missing.set(key, current.ref);
      continue;
    }
    if (nodes.size >= maxNodes) {
      truncated = true;
      break;
    }
    nodes.set(key, node);
    if (current.depth >= maxDepth) continue;
    for (const edge of outgoingEdges(state, current.ref)) {
      const edgeKey = `${refKey(edge.from)}>${edge.relation}>${refKey(edge.to)}>${edge.factorKey ?? ""}`;
      edges.set(edgeKey, edge);
      const targetKey = refKey(edge.to);
      if (!queued.has(targetKey)) {
        queued.add(targetKey);
        queue.push({ ref: edge.to, depth: current.depth + 1 });
      }
    }
  }
  if (queue.length > 0) truncated = true;

  const focusEvent =
    focus.kind === "event"
      ? state.domainEvents.find((event) => event.id === focus.id)
      : undefined;
  const focusHistory =
    focus.kind === "history"
      ? state.historyEvents.find((history) => history.id === focus.id)
      : undefined;
  const immediateCauses = (
    focusHistory?.sourceEventIds ??
    focusEvent?.causedByEventIds ??
    []
  )
    .map(eventRef)
    .sort(compareRefs);
  const consequenceSources = new Set(
    focusEvent ? [focusEvent.id] : (focusHistory?.sourceEventIds ?? []),
  );
  const laterConsequences = state.domainEvents
    .filter((event) =>
      event.causedByEventIds.some((eventId) => consequenceSources.has(eventId)),
    )
    .map((event) => eventRef(event.id))
    .sort(compareRefs);

  return {
    schemaVersion: CAUSAL_EVIDENCE_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateTick: state.tick,
    focus: { ...focus },
    nodes: [...nodes.values()].sort((left, right) => compareRefs(left.ref, right.ref)),
    edges: [...edges.values()].sort(
      (left, right) =>
        compareRefs(left.from, right.from) ||
        left.relation.localeCompare(right.relation) ||
        compareRefs(left.to, right.to) ||
        (left.factorKey ?? "").localeCompare(right.factorKey ?? ""),
    ),
    immediateCauses,
    laterConsequences,
    missingRefs: [...missing.values()].sort(compareRefs),
    truncated,
  };
}
