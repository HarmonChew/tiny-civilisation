import type {
  DomainEvent,
  DomainEventType,
  HistoricalEventType,
  ResourceKind,
  SimulationState,
} from "./types.js";

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
  summary: string;
}

export function historicallyProtectedEventIds(state: SimulationState): Set<number> {
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
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of state.domainEvents) {
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

export function emitDomainEvent(
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
    causedByEventIds: input.causedByEventIds ? [...input.causedByEventIds] : [],
    decisionRecordIds: input.decisionRecordIds ? [...input.decisionRecordIds] : [],
    importance: input.importance ?? 10,
    summary: input.summary,
  };
  state.domainEvents.push(event);
  while (state.domainEvents.length > state.configuration.maxDomainEvents) {
    const protectedIds = historicallyProtectedEventIds(state);
    for (const retained of state.domainEvents) {
      for (const causeId of retained.causedByEventIds) protectedIds.add(causeId);
    }
    const removableIndex = state.domainEvents.findIndex(
      (candidate) => !protectedIds.has(candidate.id),
    );
    state.domainEvents.splice(removableIndex < 0 ? 0 : removableIndex, 1);
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
