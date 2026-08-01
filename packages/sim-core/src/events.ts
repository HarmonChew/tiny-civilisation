import type {
  CommandOutcomeCode,
  CommandRejectionReason,
  DomainEvent,
  DomainEventType,
  HistoricalEventType,
  ResourceKind,
  SimulationState,
} from "./types.js";
import { classifyAttentionTier, createEventClusterKey } from "./event-attention.js";

export interface DomainEventInput {
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
  commandId?: number | null;
  commandOutcome?: CommandOutcomeCode | null;
  commandRejectionReason?: CommandRejectionReason;
  summary: string;
}

interface EventRetentionContext {
  readonly causeReferenceCounts: Map<number, number>;
  rootIds: Set<number> | null;
  protectedEventIds: Set<number> | null;
  protectedDecisionIds: Set<number> | null;
}

const activeRetentionContexts = new WeakMap<SimulationState, EventRetentionContext>();

export function beginEventRetentionContext(state: SimulationState): void {
  const causeReferenceCounts = new Map<number, number>();
  for (const event of state.domainEvents) {
    for (const causeId of event.causedByEventIds) {
      causeReferenceCounts.set(causeId, (causeReferenceCounts.get(causeId) ?? 0) + 1);
    }
  }
  activeRetentionContexts.set(state, {
    causeReferenceCounts,
    rootIds: null,
    protectedEventIds: null,
    protectedDecisionIds: null,
  });
}

export function endEventRetentionContext(state: SimulationState): void {
  activeRetentionContexts.delete(state);
}

function historicalRootEventIds(state: SimulationState): Set<number> {
  const protectedIds = new Set<number>();
  for (const history of state.historyEvents) {
    for (const id of history.sourceEventIds) protectedIds.add(id);
  }
  for (const memory of state.memories) {
    for (const id of memory.sourceEventIds) protectedIds.add(id);
  }
  for (const group of state.groups) {
    for (const id of group.majorEventIds) protectedIds.add(id);
  }
  return protectedIds;
}

function equalSets(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function closeProtectedEventIds(
  state: SimulationState,
  rootIds: ReadonlySet<number>,
): Set<number> {
  const protectedIds = new Set(rootIds);
  if (protectedIds.size === 0) return protectedIds;

  // Causes precede their consequences in authoritative runs, so walking the
  // retained event log backwards normally closes the graph in one pass. The
  // outer loop preserves exact closure semantics for valid imported states
  // whose retained array order differs.
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = state.domainEvents.length - 1; index >= 0; index -= 1) {
      const event = state.domainEvents[index]!;
      if (!protectedIds.has(event.id)) continue;
      for (const causeId of event.causedByEventIds) {
        if (protectedIds.has(causeId)) continue;
        protectedIds.add(causeId);
        changed = true;
      }
    }
  }
  return protectedIds;
}

function protectedRetentionSets(state: SimulationState): {
  eventIds: ReadonlySet<number>;
  decisionIds: ReadonlySet<number>;
} {
  const rootIds = historicalRootEventIds(state);
  const context = activeRetentionContexts.get(state);
  if (
    context?.rootIds &&
    context.protectedEventIds &&
    context.protectedDecisionIds &&
    equalSets(rootIds, context.rootIds)
  ) {
    return {
      eventIds: context.protectedEventIds,
      decisionIds: context.protectedDecisionIds,
    };
  }

  const eventIds = closeProtectedEventIds(state, rootIds);
  const decisionIds = new Set<number>();
  for (const event of state.domainEvents) {
    if (!eventIds.has(event.id)) continue;
    for (const decisionId of event.decisionRecordIds) decisionIds.add(decisionId);
  }
  if (context) {
    context.rootIds = rootIds;
    context.protectedEventIds = eventIds;
    context.protectedDecisionIds = decisionIds;
  }
  return { eventIds, decisionIds };
}

export function historicallyProtectedEventIds(state: SimulationState): Set<number> {
  return new Set(protectedRetentionSets(state).eventIds);
}

export function historicallyProtectedDecisionIds(state: SimulationState): Set<number> {
  const protectedIds = new Set(protectedRetentionSets(state).decisionIds);
  for (const creature of state.creatures) {
    const activeDesireDecisionId = creature.activeDesire?.selectedByDecisionId;
    const activePlanDecisionId = creature.activePlan?.selectedByDecisionId;
    const activeGoalDecisionId = creature.activeGoal?.decisionRecordId;
    if (activeDesireDecisionId !== undefined) protectedIds.add(activeDesireDecisionId);
    if (activePlanDecisionId !== undefined) protectedIds.add(activePlanDecisionId);
    if (activeGoalDecisionId !== undefined) protectedIds.add(activeGoalDecisionId);
  }
  return protectedIds;
}

function noteEventAdded(state: SimulationState, event: DomainEvent): void {
  const context = activeRetentionContexts.get(state);
  const counts = context?.causeReferenceCounts;
  if (!counts) return;
  for (const causeId of event.causedByEventIds) {
    counts.set(causeId, (counts.get(causeId) ?? 0) + 1);
  }
  if (context.rootIds?.has(event.id)) {
    context.protectedEventIds = null;
    context.protectedDecisionIds = null;
  }
}

function noteEventRemoved(state: SimulationState, event: DomainEvent): void {
  const context = activeRetentionContexts.get(state);
  const counts = context?.causeReferenceCounts;
  if (!counts) return;
  for (const causeId of event.causedByEventIds) {
    const next = (counts.get(causeId) ?? 0) - 1;
    if (next > 0) counts.set(causeId, next);
    else counts.delete(causeId);
  }
  if (context.protectedEventIds?.has(event.id)) {
    context.protectedEventIds = null;
    context.protectedDecisionIds = null;
  }
}

export function emitDomainEvent(
  state: SimulationState,
  input: DomainEventInput,
): DomainEvent {
  const importance = input.importance ?? 10;
  const attentionInput = {
    tick: state.tick,
    type: input.type,
    actorIds: input.actorIds ?? [],
    targetIds: input.targetIds ?? [],
    groupIds: input.groupIds ?? [],
    locationTileIndex: input.locationTileIndex ?? null,
    resourceKind: input.resourceKind ?? null,
    causedByEventIds: input.causedByEventIds ?? [],
    importance,
  };
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
    causedByEventIds: input.causedByEventIds ? [...input.causedByEventIds] : [],
    decisionRecordIds: input.decisionRecordIds ? [...input.decisionRecordIds] : [],
    importance,
    attentionTier: classifyAttentionTier(importance),
    clusterKey: createEventClusterKey(attentionInput),
    commandId: input.commandId ?? null,
    commandOutcome: input.commandOutcome ?? null,
    commandRejectionReason: input.commandRejectionReason ?? null,
    summary: input.summary,
  };
  state.domainEvents.push(event);
  noteEventAdded(state, event);
  while (state.domainEvents.length > state.configuration.maxDomainEvents) {
    const protectedIds = historicallyProtectedEventIds(state);
    const causeReferenceCounts = activeRetentionContexts.get(state)?.causeReferenceCounts;
    if (!causeReferenceCounts) {
      for (const retained of state.domainEvents) {
        for (const causeId of retained.causedByEventIds) protectedIds.add(causeId);
      }
    }
    const removableIndex = state.domainEvents.findIndex(
      (candidate) =>
        !protectedIds.has(candidate.id) &&
        (causeReferenceCounts?.get(candidate.id) ?? 0) === 0,
    );
    const [removed] = state.domainEvents.splice(removableIndex < 0 ? 0 : removableIndex, 1);
    if (removed) noteEventRemoved(state, removed);
  }
  return event;
}

export function addHistory(
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
