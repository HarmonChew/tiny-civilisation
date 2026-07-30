import * as SimCoreNamespace from "@tiny-civ/sim-core";
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

type UnknownRecord = Record<string, unknown>;

interface CoreModule {
  createSimulation?: (seed: number) => unknown;
  advanceSimulation?: (state: unknown, ticks?: number) => unknown;
  queuePlayerCommand?: (state: unknown, command: unknown) => unknown;
  createRenderSnapshot?: (state: unknown) => unknown;
  hashSimulationState?: (state: unknown) => string;
  formatSimulationTime?: (tick: number) => string;
  TICKS_PER_SECOND?: number;
}

const core = SimCoreNamespace as unknown as CoreModule;

export const ticksPerSecond =
  typeof core.TICKS_PER_SECOND === "number" && core.TICKS_PER_SECOND > 0
    ? core.TICKS_PER_SECOND
    : 10;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const first = (record: UnknownRecord, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asInteger = (value: unknown, fallback = 0): number =>
  Math.trunc(asNumber(value, fallback));

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const humanize = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());

const percent = (value: unknown, fallback = 0): number => {
  const number = asNumber(value, fallback);
  return Math.max(0, Math.min(100, number / 100));
};

const signedUnit = (value: unknown): number => {
  const number = asNumber(value);
  return Math.max(-1, Math.min(1, number / 10_000));
};

const collection = (value: unknown): UnknownRecord[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];

  for (const key of ["items", "values", "records", "entities", "list", "all"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }

  const byId = first(value, "byId", "recordsById", "entitiesById");
  if (isRecord(byId)) return Object.values(byId).filter(isRecord);

  const ownValues = Object.values(value);
  if (ownValues.length > 0 && ownValues.every(isRecord)) {
    return ownValues as UnknownRecord[];
  }

  return [];
};

const readId = (record: UnknownRecord, fallback = 0): number =>
  asInteger(first(record, "id", "entityId", "groupId", "eventId"), fallback);

const readPoint = (
  record: UnknownRecord,
  width: number,
  height: number,
  tileSize = 256,
): Point => {
  const position = asRecord(first(record, "position", "pos", "location", "homePosition"));
  let x = asNumber(first(position, "x", "tileX"), asNumber(first(record, "x", "tileX")));
  let y = asNumber(first(position, "y", "tileY"), asNumber(first(record, "y", "tileY")));
  const tileIndex = asInteger(first(record, "tileIndex", "tile"), -1);

  if (tileIndex >= 0 && x === 0 && y === 0 && width > 0) {
    x = tileIndex % width;
    y = Math.floor(tileIndex / width);
  }

  if (x > width * 2 || y > height * 2) {
    x /= tileSize;
    y /= tileSize;
  }

  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  };
};

const findCollection = (roots: UnknownRecord[], ...keys: string[]): UnknownRecord[] => {
  for (const root of roots) {
    for (const key of keys) {
      const found = collection(root[key]);
      if (found.length > 0) return found;
    }
  }
  return [];
};

const traitLabels: Record<string, string> = {
  generosity: "Generosity",
  aggression: "Aggression",
  sociability: "Sociability",
  loyalty: "Loyalty",
  diligence: "Diligence",
  riskTolerance: "Risk tolerance",
};

const readTraits = (creature: UnknownRecord): TraitView[] => {
  const traits = asRecord(first(creature, "traits", "personality"));
  return Object.entries(traitLabels)
    .filter(([key]) => traits[key] !== undefined)
    .map(([key, label]) => ({ key, label, value: percent(traits[key]) }));
};

const readInventory = (creature: UnknownRecord): InventoryView[] => {
  const inventory = asRecord(creature.inventory);
  const stacks = collection(first(inventory, "stacks", "items", "contents"));
  if (stacks.length > 0) {
    return stacks
      .map((stack) => ({
        kind: asString(first(stack, "kind", "resourceKind", "type"), "Unknown"),
        quantity: asInteger(first(stack, "quantity", "amount", "count")),
      }))
      .filter((stack) => stack.quantity > 0);
  }

  return ["food", "water", "material"]
    .filter((kind) => inventory[kind] !== undefined)
    .map((kind) => ({ kind, quantity: asInteger(inventory[kind]) }))
    .filter((stack) => stack.quantity > 0);
};

const readFactors = (candidate: UnknownRecord): CandidateView["factors"] =>
  collection(first(candidate, "factors", "contributions", "reasons")).map((factor) => {
    const key = asString(first(factor, "key", "name", "reason"), "factor");
    return {
      key,
      label: humanize(key),
      contribution: asNumber(first(factor, "contribution", "value", "score")),
      evidenceEventIds: Array.isArray(factor.evidenceEventIds)
        ? factor.evidenceEventIds.map((id) => asInteger(id)).filter((id) => id > 0)
        : [],
    };
  });

const readCandidates = (
  creature: UnknownRecord,
  roots: UnknownRecord[],
  creatureId: EntityId,
): CandidateView[] => {
  const directDecision = asRecord(
    first(creature, "latestDecision", "decisionRecord", "currentDecision"),
  );
  let decision = directDecision;

  if (Object.keys(decision).length === 0) {
    const allDecisions = findCollection(
      roots,
      "decisionRecords",
      "recentDecisionRecords",
      "decisions",
    )
      .filter((item) => asInteger(first(item, "actorId", "creatureId", "entityId")) === creatureId)
      .sort((a, b) => asInteger(first(b, "tick", "id")) - asInteger(first(a, "tick", "id")));
    decision = allDecisions[0] ?? {};
  }

  return candidatesFromDecision(decision);
};

const candidatesFromDecision = (decision: UnknownRecord): CandidateView[] => {
  const selectedAction = asString(first(decision, "selectedAction", "action", "selected"));
  const selectedTargetValue = first(
    decision,
    "selectedTargetId",
    "selectedTargetEntityId",
    "targetId",
  );
  const selectedTargetId =
    selectedTargetValue == null ? null : asInteger(selectedTargetValue);
  let hasMarkedSelection = false;
  return collection(first(decision, "candidates", "alternatives", "scores"))
    .map((candidate) => {
      const actionRecord = asRecord(candidate.action);
      const action = asString(
        first(candidate, "actionName", "kind"),
        asString(first(actionRecord, "kind", "type"), asString(candidate.action, "Unknown")),
      );
      const targetValue = first(candidate, "targetId", "targetEntityId");
      const candidateTargetId = targetValue == null ? null : asInteger(targetValue);
      const matchesRecordedSelection =
        action === selectedAction && candidateTargetId === selectedTargetId;
      const explicitlySelected =
        Boolean(candidate.selected) || asInteger(candidate.rank, -1) === 0;
      const selected =
        !hasMarkedSelection && (explicitlySelected || matchesRecordedSelection);
      if (selected) hasMarkedSelection = true;
      return {
        action,
        targetId: candidateTargetId === null ? undefined : candidateTargetId,
        utility: asNumber(first(candidate, "utility", "finalUtility", "rawUtility", "score")),
        factors: readFactors(candidate),
        selected,
      };
    })
    .sort((a, b) => b.utility - a.utility)
    .slice(0, 5);
};

const readMemories = (
  creature: UnknownRecord,
  currentTick: number,
  roots: UnknownRecord[],
): MemoryView[] => {
  const memoryState = asRecord(first(creature, "memory", "memories"));
  let memories = Array.isArray(creature.memories)
    ? collection(creature.memories)
    : collection(first(memoryState, "episodic", "episodes", "records", "items"));
  if (memories.length === 0) {
    const memoryIds = new Set(
      Array.isArray(creature.memoryIds)
        ? creature.memoryIds.map((value) => asInteger(value))
        : [],
    );
    const ownerId = readId(creature);
    memories = findCollection(roots, "memories", "episodicMemories").filter(
      (memory) =>
        memoryIds.has(readId(memory)) ||
        asInteger(first(memory, "ownerId", "creatureId")) === ownerId,
    );
  }

  return memories
    .map((memory, index) => {
      const createdTick = asInteger(first(memory, "createdTick", "tick"));
      return {
        id: readId(memory, index + 1),
        kind: asString(first(memory, "kind", "type"), "MEMORY"),
        subjectId:
          first(memory, "subjectEntityId", "subjectId", "sourceEntityId") == null
            ? undefined
            : asInteger(first(memory, "subjectEntityId", "subjectId", "sourceEntityId")),
        strength: percent(first(memory, "strength", "importance")),
        valence: signedUnit(memory.valence),
        ageTicks: Math.max(0, currentTick - createdTick),
        sourceEventIds: Array.isArray(memory.sourceEventIds)
          ? memory.sourceEventIds.map((id) => asInteger(id)).filter((id) => id > 0)
          : [],
      };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 12);
};

const relationshipName = (id: number, names: Map<number, string>): string =>
  names.get(id) ?? `Creature ${id}`;

const readRelationships = (
  creature: UnknownRecord,
  creatureId: number,
  roots: UnknownRecord[],
  names: Map<number, string>,
): RelationshipView[] => {
  const direct = collection(first(creature, "relationships", "relationshipEdges"));
  const global = findCollection(roots, "relationships", "relationshipEdges", "socialEdges");
  const source = direct.length > 0 ? direct : global;
  const output: RelationshipView[] = [];

  for (const edge of source) {
    const fromId = asInteger(first(edge, "fromId", "sourceId", "actorId"), creatureId);
    const toId = asInteger(first(edge, "toId", "targetId", "otherId"));
    if (fromId !== creatureId && toId !== creatureId) continue;
    const direction = fromId === creatureId ? "toward" : "from";
    const otherId = direction === "toward" ? toId : fromId;
    if (otherId <= 0 || otherId === creatureId) continue;
    output.push({
      otherId,
      otherName: relationshipName(otherId, names),
      direction,
      trust: signedUnit(edge.trust),
      fear: percent(edge.fear),
      familiarity: percent(edge.familiarity),
      rivalry: percent(edge.rivalry),
    });
  }

  return output
    .sort(
      (a, b) =>
        Math.max(Math.abs(b.trust), b.fear / 100, b.rivalry / 100) -
        Math.max(Math.abs(a.trust), a.fear / 100, a.rivalry / 100),
    )
    .slice(0, 12);
};

const eventCategory = (type: string, playerCaused: boolean): Exclude<TimelineCategory, "all"> => {
  if (playerCaused || /PLAYER|INTERVENTION|TERRAIN/i.test(type)) return "player";
  if (/FIGHT|ATTACK|DAMAGE|HARM|THEFT|CONFLICT|CONFRONT|FLEE|FLED/i.test(type)) {
    return "conflict";
  }
  if (/GROUP|LEADER|JOIN|LEAVE|STORAGE|FOUNDED/i.test(type)) return "group";
  if (/FOOD|GATHER|RESOURCE|DEPOSIT|WITHDRAW|MATERIAL/i.test(type)) return "resources";
  return "social";
};

const eventCopy = (event: UnknownRecord, type: string, actorIds: number[], targetIds: number[]) => {
  const providedTitle = asString(first(event, "title", "headline"));
  const providedDetail = asString(first(event, "summary", "detail", "description", "body"));
  if (providedTitle) return { title: providedTitle, detail: providedDetail };
  if (providedDetail) return { title: humanize(type), detail: providedDetail };

  const actor = actorIds[0] ? `Creature ${actorIds[0]}` : "A creature";
  const target = targetIds[0] ? `Creature ${targetIds[0]}` : "another creature";
  const normalized = humanize(type);
  const detail =
    /THEFT/i.test(type)
      ? `${actor} took an item without permission from ${target}.`
      : /SHAR/i.test(type)
        ? `${actor} shared resources with ${target}.`
        : /JOIN/i.test(type)
          ? `${actor} joined a social group.`
          : /DAMAGE|ATTACK|FIGHT/i.test(type)
            ? `${actor} entered a conflict involving ${target}.`
            : `${normalized} was recorded as a factual simulation event.`;
  return { title: normalized, detail };
};

export const createSimulationState = (seed: number): unknown => {
  if (!core.createSimulation) {
    throw new Error("The simulation package does not export createSimulation().");
  }
  return core.createSimulation(seed);
};

export const advanceSimulationTicks = (state: unknown, ticks: number): unknown => {
  if (!core.advanceSimulation) {
    throw new Error("The simulation package does not export advanceSimulation().");
  }
  const result = core.advanceSimulation(state, ticks);
  return result === undefined ? state : result;
};

export const queueIntervention = (
  state: unknown,
  tool: "add-food" | "remove-food" | "obstacle",
  tile: TileView,
): unknown => {
  if (!core.queuePlayerCommand) {
    throw new Error("The simulation package does not export queuePlayerCommand().");
  }

  const stateRecord = asRecord(state);
  const tick = asInteger(stateRecord.tick);
  const command =
    tool === "add-food"
      ? {
          applyAtTick: tick,
          type: "ADD_FOOD",
          tileIndex: tile.index,
          x: tile.x,
          y: tile.y,
          amount: 12,
        }
      : tool === "remove-food"
        ? {
            applyAtTick: tick,
            type: "REMOVE_FOOD",
            tileIndex: tile.index,
            x: tile.x,
            y: tile.y,
            amount: 12,
          }
        : {
            applyAtTick: tick,
            type: "TOGGLE_OBSTACLE",
            tileIndex: tile.index,
            x: tile.x,
            y: tile.y,
            blocked: !tile.blocked,
          };

  core.queuePlayerCommand(state, command);
  return state;
};

export const makeWorldView = (state: unknown): WorldView => {
  const stateRecord = asRecord(state);
  let snapshotRecord: UnknownRecord = {};
  if (core.createRenderSnapshot) {
    snapshotRecord = asRecord(core.createRenderSnapshot(state));
  }

  const world = asRecord(first(stateRecord, "world", "map"));
  const snapshotWorld = asRecord(first(snapshotRecord, "world", "map"));
  const roots = [snapshotRecord, stateRecord, snapshotWorld, world];
  const rawTiles = findCollection(roots, "tiles", "tileStates", "terrain");
  const width = Math.max(
    1,
    asInteger(
      first(snapshotRecord, "width", "worldWidth"),
      asInteger(first(snapshotWorld, "width", "worldWidth"), asInteger(first(world, "width", "worldWidth"), 48)),
    ),
  );
  const height = Math.max(
    1,
    asInteger(
      first(snapshotRecord, "height", "worldHeight"),
      asInteger(
        first(snapshotWorld, "height", "worldHeight"),
        asInteger(first(world, "height", "worldHeight"), 32),
      ),
    ),
  );
  const tick = asInteger(first(snapshotRecord, "tick"), asInteger(stateRecord.tick));

  const tiles: TileView[] =
    rawTiles.length > 0
      ? rawTiles.map((tile, index) => {
          const tileIndex = asInteger(first(tile, "index", "tileIndex", "id"), index);
          return {
            index: tileIndex,
            x: asInteger(first(tile, "x", "tileX"), tileIndex % width),
            y: asInteger(first(tile, "y", "tileY"), Math.floor(tileIndex / width)),
            terrain: asString(first(tile, "terrain", "kind", "type"), "GROUND"),
            blocked: Boolean(first(tile, "blocked", "isBlocked")) || /ROCK|DEEP|BARRIER/i.test(asString(tile.terrain)),
            fertility: percent(tile.fertility),
            hazard: percent(tile.hazard),
          };
        })
      : Array.from({ length: width * height }, (_, index) => ({
          index,
          x: index % width,
          y: Math.floor(index / width),
          terrain: "GROUND",
          blocked: false,
          fertility: 0,
          hazard: 0,
        }));

  const rawCreatures = findCollection(
    [stateRecord, snapshotRecord, world, snapshotWorld],
    "creatures",
    "creatureStates",
    "agents",
  );
  const names = new Map<number, string>();
  for (const creature of rawCreatures) {
    const id = readId(creature);
    names.set(
      id,
      asString(
        first(creature, "name", "displayName"),
        asString(first(asRecord(creature.identity), "name"), `Creature ${id}`),
      ),
    );
  }

  const creatures: CreatureView[] = rawCreatures.map((creature, index) => {
    const id = readId(creature, index + 1);
    const point = readPoint(creature, width, height);
    const needs = asRecord(creature.needs);
    const social = asRecord(creature.social);
    const activeGoal = asRecord(first(creature, "activeGoal", "goal"));
    const activeAction = asRecord(first(creature, "activeAction", "action"));
    const targetPoint = asRecord(first(activeGoal, "targetPosition", "position", "target"));
    const targetTileIndex = asInteger(
      first(activeGoal, "targetTileIndex"),
      asInteger(first(activeAction, "targetTileIndex"), -1),
    );
    const goalTarget =
      targetPoint.x === undefined && targetPoint.y === undefined
        ? targetTileIndex >= 0
          ? {
              x: (targetTileIndex % width) + 0.5,
              y: Math.floor(targetTileIndex / width) + 0.5,
            }
          : undefined
        : readPoint(targetPoint, width, height);
    const groupValue = first(social, "groupId", "group", "membershipId") ?? first(creature, "groupId");

    return {
      id,
      name: names.get(id) ?? `Creature ${id}`,
      color: asInteger(creature.color, 0),
      x: point.x,
      y: point.y,
      alive: creature.alive !== false,
      groupId: groupValue == null ? undefined : asInteger(groupValue),
      role: humanize(asString(first(creature, "role", "descriptiveRole"), "Unsettled")),
      goal: asString(first(activeGoal, "kind", "type"), asString(creature.currentGoal, "Observing")),
      action: asString(first(activeAction, "kind", "type"), "Considering"),
      goalTarget,
      health: percent(first(creature, "health", "vitality"), 10_000),
      hunger: percent(first(needs, "hunger", "food"), 0),
      fatigue: percent(first(needs, "fatigue", "rest"), 0),
      traits: readTraits(creature),
      inventory: readInventory(creature),
      candidates: readCandidates(creature, roots, id),
      memories: readMemories(creature, tick, roots),
      relationships: [],
    };
  });

  for (const creature of creatures) {
    const raw = rawCreatures.find((item, index) => readId(item, index + 1) === creature.id);
    if (raw) creature.relationships = readRelationships(raw, creature.id, roots, names);
  }

  const resources: ResourceView[] = findCollection(
    roots,
    "resourceNodes",
    "resources",
    "resourcePatches",
  ).map((resource, index) => {
    const point = readPoint(resource, width, height);
    const capacity = asInteger(first(resource, "maximumStock", "capacity", "maxStock"), 1);
    return {
      id: readId(resource, 10_000 + index),
      kind: asString(first(resource, "kind", "resourceKind", "type"), "FOOD"),
      x: point.x,
      y: point.y,
      stock: asInteger(first(resource, "currentStock", "stock", "quantity")),
      capacity,
    };
  });

  const structures: StructureView[] = findCollection(
    [stateRecord, snapshotRecord, world, snapshotWorld],
    "structures",
    "structureStates",
  ).map((structure, index) => {
    const point = readPoint(structure, width, height);
    const inventory = asRecord(structure.inventory);
    return {
      id: readId(structure, 20_000 + index),
      kind: asString(first(structure, "kind", "type"), "STRUCTURE"),
      x: point.x,
      y: point.y,
      groupId:
        first(structure, "groupId", "ownerGroupId") == null
          ? undefined
          : asInteger(first(structure, "groupId", "ownerGroupId")),
      progress: percent(first(structure, "progress", "completion"), 10_000),
      stored: asInteger(
        first(structure, "stored", "quantity", "stock", "food"),
        asInteger(inventory.food),
      ),
      capacity: asInteger(first(structure, "capacity", "maximumStock"), asInteger(inventory.capacity, 1)),
    };
  });

  const groups: GroupView[] = findCollection(roots, "groups", "groupStates").map(
    (group, index) => {
      const id = readId(group, index + 1);
      const memberIds = Array.isArray(first(group, "memberIds", "members"))
        ? (first(group, "memberIds", "members") as unknown[]).map((member) =>
            isRecord(member) ? readId(member) : asInteger(member),
          )
        : [];
      const homeRecord = asRecord(first(group, "homePosition", "home"));
      const homeTileIndex = asInteger(group.homeTileIndex, -1);
      return {
        id,
        name: asString(first(group, "name", "displayName"), `Group ${id}`),
        memberIds,
        leaderId:
          first(group, "leaderId", "leader") == null
            ? undefined
            : isRecord(first(group, "leaderId", "leader"))
              ? readId(asRecord(first(group, "leaderId", "leader")))
              : asInteger(first(group, "leaderId", "leader")),
        home:
          Object.keys(homeRecord).length > 0
            ? readPoint(homeRecord, width, height)
            : homeTileIndex >= 0
              ? {
                  x: (homeTileIndex % width) + 0.5,
                  y: Math.floor(homeTileIndex / width) + 0.5,
                }
              : undefined,
        cohesion: percent(group.cohesion),
        sharingNorm: signedUnit(group.sharingNorm),
        conflictNorm: signedUnit(group.conflictNorm),
        storageIds: Array.isArray(first(group, "storageStructureIds", "storageIds"))
          ? (first(group, "storageStructureIds", "storageIds") as unknown[]).map((value) =>
              asInteger(value),
            )
          : first(group, "storageStructureId") === null ||
              first(group, "storageStructureId") === undefined
            ? []
            : [asInteger(first(group, "storageStructureId"))],
      };
    },
  );

  const historicalRecords = findCollection(
    roots,
    "majorHistory",
    "historicalEvents",
    "historyEvents",
    "history",
  );
  const promotedDomainEventIds = new Set(
    historicalRecords.flatMap((event) =>
      Array.isArray(event.sourceEventIds)
        ? event.sourceEventIds
            .map((value) => asInteger(value))
            .filter((value) => value > 0)
        : [],
    ),
  );
  const domainRecords = findCollection(
    roots,
    "recentDomainEvents",
    "recentEvents",
    "domainEvents",
    "events",
  ).filter((event) => !promotedDomainEventIds.has(readId(event)));
  const rawEvents = [
    ...historicalRecords.map((event) => ({ event, historical: true })),
    ...domainRecords.map((event) => ({ event, historical: false })),
  ];
  const allDomainEvents = findCollection(
    [stateRecord, snapshotRecord],
    "domainEvents",
    "recentEvents",
    "recentDomainEvents",
    "events",
  );
  const allDecisionRecords = findCollection(
    [stateRecord, snapshotRecord],
    "decisionRecords",
    "recentDecisionRecords",
    "decisions",
  );
  const eventIds = new Set<string>();
  const events: TimelineEventView[] = [];
  for (let index = 0; index < rawEvents.length; index += 1) {
    const entry = rawEvents[index];
    if (!entry) continue;
    const { event, historical } = entry;
    const sourceId = readId(event, index + 1);
    const dedupeKey = `${historical ? "history" : "domain"}:${sourceId}`;
    if (eventIds.has(dedupeKey)) continue;
    eventIds.add(dedupeKey);
    const id = historical ? 1_000_000 + sourceId : sourceId;
    const type = asString(first(event, "type", "kind"), "EVENT");
    const actorIds = Array.isArray(first(event, "actorIds", "actors"))
      ? (first(event, "actorIds", "actors") as unknown[]).map((value) =>
          isRecord(value) ? readId(value) : asInteger(value),
        )
      : first(event, "actorId") === undefined
        ? []
        : [asInteger(event.actorId)];
    const targetIds = Array.isArray(first(event, "targetIds", "targets"))
      ? (first(event, "targetIds", "targets") as unknown[]).map((value) =>
          isRecord(value) ? readId(value) : asInteger(value),
        )
      : first(event, "targetId") === undefined
        ? []
        : [asInteger(event.targetId)];
    const playerCaused =
      Boolean(first(event, "playerCaused", "isPlayerIntervention")) ||
      /PLAYER|INTERVENTION/i.test(type);
    const importance = asNumber(first(event, "importance", "importanceHint"), 0);
    if (
      !historical &&
      !playerCaused &&
      type !== "SIMULATION_STARTED" &&
      (type === "ACTION_STARTED" || importance < 18)
    ) {
      continue;
    }
    const copy = eventCopy(event, type, actorIds, targetIds);
    const sourceEventIds = Array.isArray(event.sourceEventIds)
      ? event.sourceEventIds.map((value) => asInteger(value)).filter((value) => value > 0)
      : [];
    const directDecisionIds = Array.isArray(event.decisionRecordIds)
      ? event.decisionRecordIds
          .map((value) => asInteger(value))
          .filter((value) => value > 0)
      : [];
    let linkedDecision = directDecisionIds
      .map((decisionId) =>
        allDecisionRecords.find((candidate) => readId(candidate) === decisionId),
      )
      .find((candidate): candidate is UnknownRecord => candidate !== undefined);

    // Historical sourceEventIds are ordered from the immediate factual trigger
    // outward through earlier evidence. Preserve that order when choosing the
    // primary decision explanation instead of whichever record was stored first.
    if (!linkedDecision) {
      for (const sourceEventId of sourceEventIds) {
        const sourceEvent = allDomainEvents.find(
          (candidate) => readId(candidate) === sourceEventId,
        );
        if (!sourceEvent || !Array.isArray(sourceEvent.decisionRecordIds)) continue;
        linkedDecision = sourceEvent.decisionRecordIds
          .map((decisionId) =>
            allDecisionRecords.find(
              (candidate) => readId(candidate) === asInteger(decisionId),
            ),
          )
          .find((candidate): candidate is UnknownRecord => candidate !== undefined);
        if (linkedDecision) break;
      }
    }
    events.push({
      id,
      tick: asInteger(event.tick),
      category: eventCategory(type, playerCaused),
      type,
      title: copy.title,
      detail: copy.detail,
      actorIds,
      targetIds,
      causedByEventIds: Array.isArray(event.causedByEventIds)
        ? event.causedByEventIds.map((value) => asInteger(value)).filter((value) => value > 0)
        : sourceEventIds,
      importance,
      playerCaused,
      ...(linkedDecision
        ? {
            decisionActorId: asInteger(
              first(linkedDecision, "actorId", "creatureId", "entityId"),
            ),
            decisionCandidates: candidatesFromDecision(linkedDecision),
          }
        : {}),
    });
  }
  events.sort((a, b) => b.tick - a.tick || b.id - a.id);

  const hash = core.hashSimulationState ? core.hashSimulationState(state) : "";
  const timeLabel = core.formatSimulationTime
    ? core.formatSimulationTime(tick)
    : `T+${Math.floor(tick / ticksPerSecond)}s`;

  return {
    tick,
    timeLabel,
    hash,
    width,
    height,
    tiles,
    creatures,
    resources,
    structures,
    groups,
    events,
    population: creatures.filter((creature) => creature.alive).length,
    foodStock: resources
      .filter((resource) => /FOOD/i.test(resource.kind))
      .reduce((total, resource) => total + resource.stock, 0),
  };
};
