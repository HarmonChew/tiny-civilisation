type UnknownRecord = Record<string, unknown>;

export interface EventCounts {
  sharingEvents: number;
  theftEvents: number;
  conflictEvents: number;
  storageEvents: number;
}

export interface SimulationMetrics extends EventCounts {
  finalTick: number;
  finalHash: string;
  simulationTime: string;
  population: number;
  groups: number;
}

const EVENT_COLLECTION_KEYS = [
  "recentDomainEvents",
  "domainEvents",
  "eventLog",
  "recentEvents",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readNumber(record: UnknownRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function collectionValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value instanceof Map) {
    return [...value.values()];
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["items", "entities", "records", "values", "byId"] as const) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested;
    }

    if (nested instanceof Map) {
      return [...nested.values()];
    }

    if (isRecord(nested)) {
      return Object.values(nested);
    }
  }

  return Object.values(value);
}

function countEntities(value: unknown, aliveOnly: boolean): number {
  const entities = collectionValues(value);

  if (!aliveOnly) {
    return entities.length;
  }

  return entities.filter((entity) => {
    if (!isRecord(entity)) {
      return true;
    }

    return entity.alive !== false;
  }).length;
}

function eventType(event: unknown): string | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  for (const key of ["type", "kind", "eventType", "name"] as const) {
    const value = event[key];
    if (typeof value === "string") {
      return value.toUpperCase();
    }
  }

  return undefined;
}

function eventIdentity(event: unknown, type: string): string {
  if (!isRecord(event)) {
    return `${type}:${String(event)}`;
  }

  const id = event.id ?? event.eventId ?? event.sequence ?? event.eventSequence;
  if (typeof id === "string" || typeof id === "number") {
    return `${type}:${String(id)}`;
  }

  const tick = readNumber(event, ["tick", "createdTick", "occurredAtTick"]) ?? -1;
  const actor = event.actorId ?? event.actorIds ?? "";
  const target = event.targetId ?? event.targetIds ?? "";
  const quantity = event.quantity ?? "";

  return `${tick}:${type}:${JSON.stringify(actor)}:${JSON.stringify(target)}:${String(quantity)}`;
}

function classifyEvent(type: string): keyof EventCounts | undefined {
  if (
    type.includes("THEFT") ||
    type.includes("STOLEN") ||
    type.includes("UNAUTHORIZED")
  ) {
    return "theftEvents";
  }

  if (
    type.includes("FIGHT") ||
    type.includes("ATTACK") ||
    type.includes("DAMAGE") ||
    type.includes("CONFLICT") ||
    type.includes("CONFRONT")
  ) {
    return "conflictEvents";
  }

  if (
    type.includes("STORAGE") &&
    (type.includes("BUILT") ||
      type.includes("COMPLETED") ||
      type.includes("CONSTRUCTED"))
  ) {
    return "storageEvents";
  }

  if (type.includes("SHARE") || type.includes("SHARING")) {
    return "sharingEvents";
  }

  return undefined;
}

function readCounter(record: UnknownRecord, keys: readonly string[]): number {
  return Math.max(0, Math.trunc(readNumber(record, keys) ?? 0));
}

export class EventCounter {
  readonly counts: EventCounts = {
    sharingEvents: 0,
    theftEvents: 0,
    conflictEvents: 0,
    storageEvents: 0,
  };

  private readonly seen = new Set<string>();
  private observedEventCollection = false;

  observe(state: unknown): void {
    if (!isRecord(state)) {
      return;
    }

    for (const key of EVENT_COLLECTION_KEYS) {
      const collection = state[key];
      if (collection === undefined) {
        continue;
      }

      this.observedEventCollection = true;

      for (const event of collectionValues(collection)) {
        const type = eventType(event);
        if (type === undefined) {
          continue;
        }

        const identity = eventIdentity(event, type);
        if (this.seen.has(identity)) {
          continue;
        }
        this.seen.add(identity);

        const category = classifyEvent(type);
        if (category !== undefined) {
          this.counts[category]++;
        }
      }
    }
  }

  resolveFinalCounts(state: unknown): EventCounts {
    if (!isRecord(state)) {
      return { ...this.counts };
    }

    const metrics = isRecord(state.metrics)
      ? state.metrics
      : isRecord(state.statistics)
        ? state.statistics
        : undefined;

    if (metrics !== undefined) {
      return {
        sharingEvents: readCounter(metrics, [
          "foodShared",
          "sharingEvents",
          "shares",
        ]),
        theftEvents: readCounter(metrics, ["thefts", "theftEvents"]),
        conflictEvents: readCounter(metrics, [
          "attacks",
          "conflictEvents",
          "conflicts",
          "fights",
        ]),
        storageEvents: readCounter(metrics, [
          "storagesCompleted",
          "storageEvents",
          "storagesBuilt",
          "storageCompleted",
        ]),
      };
    }

    if (this.observedEventCollection) {
      return { ...this.counts };
    }

    return { ...this.counts };
  }
}

export function readFinalTick(state: unknown): number {
  if (!isRecord(state)) {
    return 0;
  }

  return Math.max(0, Math.trunc(readNumber(state, ["tick", "currentTick"]) ?? 0));
}

export function readPopulation(state: unknown): number {
  if (!isRecord(state)) {
    return 0;
  }

  return countEntities(state.creatures, true);
}

export function readGroupCount(state: unknown): number {
  if (!isRecord(state)) {
    return 0;
  }

  return countEntities(state.groups, false);
}
