import {
  MAX_PLAYER_COMMAND_AMOUNT,
  TILE_FIXED_UNITS,
  type ActionKind,
  type SimulationState,
} from "./types.js";
import { DESIRE_KINDS, PLAN_KINDS } from "./desires.js";
import { validateInteractionClaims } from "./interaction-slots.js";
import { SIMULATION_STATE_VERSION } from "./versions.js";

type UnknownRecord = Record<string, unknown>;

export const MAX_PERSISTED_JSON_CHARACTERS = 8_000_000;
export const MAX_PERSISTED_COLLECTION_ITEMS = 100_000;
export const MAX_PERSISTED_WORLD_TILES = 262_144;
export const MAX_PERSISTED_STRING_CHARACTERS = 4_096;

const ACTION_KINDS = [
  "EXPLORE",
  "GATHER_FOOD",
  "GATHER_MATERIAL",
  "EAT",
  "REST",
  "SHARE",
  "KEEP",
  "STEAL",
  "DEPOSIT",
  "WITHDRAW",
  "BUILD_STORAGE",
  "GUARD",
  "ATTACK",
  "FLEE",
  "JOIN_GROUP",
] as const satisfies readonly ActionKind[];

const ENTITY_KEYS = ["creatures", "resourceNodes", "structures"] as const;
const REASON_FACT_KINDS = [
  "NEED",
  "INVENTORY",
  "TRAIT",
  "ROLE",
  "GROUP",
  "MEMORY",
  "RELATIONSHIP",
  "RESOURCE",
  "STRUCTURE",
  "TRAVEL",
  "CROWDING",
  "INTERVENTION",
  "WORLD",
] as const;
const INTERACTION_PURPOSES = [
  "EXPLORE",
  "GATHER",
  "REST",
  "SOCIAL",
  "STORAGE_ACCESS",
  "CONSTRUCTION",
  "GUARD",
  "CONFLICT",
  "FLIGHT",
] as const;

function fail(path: string, message: string): never {
  throw new Error(`Invalid simulation state: ${path} ${message}.`);
}

function object(value: unknown, path: string, keys: readonly string[]): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not supported");
  }
  return record;
}

function array(
  value: unknown,
  path: string,
  maximum = MAX_PERSISTED_COLLECTION_ITEMS,
): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maximum) {
    fail(path, `exceeds the ${maximum.toString()} item limit`);
  }
  return value;
}

function finite(
  value: unknown,
  path: string,
  minimum = -Number.MAX_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  if (value < minimum || value > maximum) {
    fail(path, `must be between ${minimum.toString()} and ${maximum.toString()}`);
  }
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const number = finite(value, path, minimum, maximum);
  if (!Number.isInteger(number)) fail(path, "must be an integer");
  return number;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (!allowEmpty && value.length === 0) fail(path, "must not be empty");
  if (value.length > MAX_PERSISTED_STRING_CHARACTERS) {
    fail(path, `exceeds the ${MAX_PERSISTED_STRING_CHARACTERS.toString()} character limit`);
  }
  return value;
}

function literal<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(path, `must be one of ${values.join(", ")}`);
  }
  return value as T;
}

function nullableInteger(value: unknown, path: string, minimum = 0): number | null {
  return value === null ? null : integer(value, path, minimum);
}

function numberArray(value: unknown, path: string, minimum = 0): number[] {
  return array(value, path).map((item, index) =>
    integer(item, `${path}[${index.toString()}]`, minimum),
  );
}

function assertUnique(values: readonly number[], path: string): void {
  const seen = new Set<number>();
  for (const value of values) {
    if (seen.has(value)) fail(path, `contains duplicate ID ${value.toString()}`);
    seen.add(value);
  }
}

function sameInteractionClaim(
  left: UnknownRecord | null,
  right: UnknownRecord | null,
): boolean {
  if (left === null || right === null) return left === right;
  return [
    "anchorKind",
    "anchorId",
    "purpose",
    "slotIndex",
    "tileIndex",
    "targetX",
    "targetY",
    "claimedAtTick",
  ].every((key) => left[key] === right[key]);
}

function assertReferences(
  values: readonly number[],
  allowed: ReadonlySet<number>,
  path: string,
): void {
  for (const value of values) {
    if (!allowed.has(value)) fail(path, `references missing ID ${value.toString()}`);
  }
}

function validateInventory(value: unknown, path: string): void {
  const record = object(value, path, ["capacity", "food", "material"]);
  const capacity = integer(record.capacity, `${path}.capacity`);
  const food = integer(record.food, `${path}.food`);
  const material = integer(record.material, `${path}.material`);
  if (food + material > capacity) fail(path, "exceeds its capacity");
}

function validateReasonFact(value: unknown, path: string): void {
  if (value === null) return;
  const fact = object(value, path, [
    "kind",
    "key",
    "label",
    "value",
    "unit",
    "sourceEntityId",
    "sourceEventIds",
    "capturedAtTick",
  ]);
  literal(fact.kind, `${path}.kind`, REASON_FACT_KINDS);
  string(fact.key, `${path}.key`);
  string(fact.label, `${path}.label`);
  if (
    fact.value !== null &&
    typeof fact.value !== "string" &&
    typeof fact.value !== "number"
  ) {
    fail(`${path}.value`, "must be a number, string, or null");
  }
  if (typeof fact.value === "number") finite(fact.value, `${path}.value`);
  if (typeof fact.value === "string") string(fact.value, `${path}.value`, true);
  if (fact.unit !== null) {
    literal(fact.unit, `${path}.unit`, ["UNIT", "COUNT", "TILES", "TICKS", "LABEL"]);
  }
  nullableInteger(fact.sourceEntityId, `${path}.sourceEntityId`, 1);
  numberArray(fact.sourceEventIds, `${path}.sourceEventIds`, 1);
  integer(fact.capturedAtTick, `${path}.capturedAtTick`);
}

function validateInteractionClaim(
  value: unknown,
  path: string,
  tileCount: number,
  width: number,
  height: number,
): void {
  if (value === null) return;
  const claim = object(value, path, [
    "anchorKind",
    "anchorId",
    "purpose",
    "slotIndex",
    "tileIndex",
    "targetX",
    "targetY",
    "claimedAtTick",
  ]);
  literal(claim.anchorKind, `${path}.anchorKind`, [
    "RESOURCE",
    "STRUCTURE",
    "GROUP_HOME",
    "CREATURE",
    "TILE",
  ]);
  integer(claim.anchorId, `${path}.anchorId`, -Number.MAX_SAFE_INTEGER);
  literal(claim.purpose, `${path}.purpose`, INTERACTION_PURPOSES);
  integer(claim.slotIndex, `${path}.slotIndex`);
  integer(claim.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
  integer(claim.targetX, `${path}.targetX`, 0, width * TILE_FIXED_UNITS);
  integer(claim.targetY, `${path}.targetY`, 0, height * TILE_FIXED_UNITS);
  integer(claim.claimedAtTick, `${path}.claimedAtTick`);
}

function validateUtilityFactors(value: unknown, path: string): void {
  for (const [index, factorValue] of array(value, path).entries()) {
    const factorPath = `${path}[${index.toString()}]`;
    const factor = object(factorValue, factorPath, [
      "key",
      "contribution",
      "evidenceEventIds",
      "fact",
    ]);
    string(factor.key, `${factorPath}.key`);
    finite(factor.contribution, `${factorPath}.contribution`);
    numberArray(factor.evidenceEventIds, `${factorPath}.evidenceEventIds`, 1);
    validateReasonFact(factor.fact, `${factorPath}.fact`);
  }
}

function validateCandidate(value: unknown, path: string, tileCount: number): void {
  const candidate = object(value, path, [
    "action",
    "desire",
    "plan",
    "targetEntityId",
    "targetTileIndex",
    "utility",
    "factors",
  ]);
  literal(candidate.action, `${path}.action`, ACTION_KINDS);
  literal(candidate.desire, `${path}.desire`, DESIRE_KINDS);
  literal(candidate.plan, `${path}.plan`, PLAN_KINDS);
  nullableInteger(candidate.targetEntityId, `${path}.targetEntityId`, 1);
  const tileIndex = nullableInteger(candidate.targetTileIndex, `${path}.targetTileIndex`);
  if (tileIndex !== null && tileIndex >= tileCount) {
    fail(`${path}.targetTileIndex`, "is outside the world");
  }
  finite(candidate.utility, `${path}.utility`);
  validateUtilityFactors(candidate.factors, `${path}.factors`);
}

function validateActiveGoal(value: unknown, path: string, tileCount: number): void {
  if (value === null) return;
  const goal = object(value, path, [
    "kind",
    "targetEntityId",
    "targetTileIndex",
    "selectedAtTick",
    "minimumCommitUntilTick",
    "nextReconsiderationTick",
    "expectedUtility",
    "decisionRecordId",
  ]);
  literal(goal.kind, `${path}.kind`, ACTION_KINDS);
  nullableInteger(goal.targetEntityId, `${path}.targetEntityId`, 1);
  const targetTile = nullableInteger(goal.targetTileIndex, `${path}.targetTileIndex`);
  if (targetTile !== null && targetTile >= tileCount) {
    fail(`${path}.targetTileIndex`, "is outside the world");
  }
  integer(goal.selectedAtTick, `${path}.selectedAtTick`);
  integer(goal.minimumCommitUntilTick, `${path}.minimumCommitUntilTick`);
  integer(goal.nextReconsiderationTick, `${path}.nextReconsiderationTick`);
  finite(goal.expectedUtility, `${path}.expectedUtility`);
  integer(goal.decisionRecordId, `${path}.decisionRecordId`, 1);
}

function validateActiveDesire(value: unknown, path: string): void {
  if (value === null) return;
  const desire = object(value, path, [
    "kind",
    "subjectEntityId",
    "startedAtTick",
    "minimumCommitUntilTick",
    "nextReconsiderationTick",
    "strength",
    "selectedByDecisionId",
  ]);
  literal(desire.kind, `${path}.kind`, DESIRE_KINDS);
  nullableInteger(desire.subjectEntityId, `${path}.subjectEntityId`, 1);
  integer(desire.startedAtTick, `${path}.startedAtTick`);
  integer(desire.minimumCommitUntilTick, `${path}.minimumCommitUntilTick`);
  integer(desire.nextReconsiderationTick, `${path}.nextReconsiderationTick`);
  integer(desire.strength, `${path}.strength`, 0, 10_000);
  integer(desire.selectedByDecisionId, `${path}.selectedByDecisionId`, 1);
}

function validateActivePlan(
  value: unknown,
  path: string,
  tileCount: number,
  width: number,
  height: number,
): void {
  if (value === null) return;
  const plan = object(value, path, [
    "kind",
    "desireKind",
    "targetEntityId",
    "targetTileIndex",
    "startedAtTick",
    "status",
    "selectedByDecisionId",
    "expectedUtility",
    "strongestReason",
    "interactionClaim",
  ]);
  literal(plan.kind, `${path}.kind`, PLAN_KINDS);
  literal(plan.desireKind, `${path}.desireKind`, DESIRE_KINDS);
  nullableInteger(plan.targetEntityId, `${path}.targetEntityId`, 1);
  const targetTile = nullableInteger(plan.targetTileIndex, `${path}.targetTileIndex`);
  if (targetTile !== null && targetTile >= tileCount) {
    fail(`${path}.targetTileIndex`, "is outside the world");
  }
  integer(plan.startedAtTick, `${path}.startedAtTick`);
  literal(plan.status, `${path}.status`, ["ACTIVE", "BLOCKED", "COMPLETED", "ABANDONED"]);
  integer(plan.selectedByDecisionId, `${path}.selectedByDecisionId`, 1);
  finite(plan.expectedUtility, `${path}.expectedUtility`);
  validateReasonFact(plan.strongestReason, `${path}.strongestReason`);
  validateInteractionClaim(
    plan.interactionClaim,
    `${path}.interactionClaim`,
    tileCount,
    width,
    height,
  );
}

function validateActiveAction(
  value: unknown,
  path: string,
  tileCount: number,
  width: number,
  height: number,
): void {
  if (value === null) return;
  const action = object(value, path, [
    "kind",
    "phase",
    "startedAtTick",
    "targetEntityId",
    "targetTileIndex",
    "path",
    "pathIndex",
    "progress",
    "workRequired",
    "navigationRevision",
    "interactionClaim",
  ]);
  literal(action.kind, `${path}.kind`, ACTION_KINDS);
  literal(action.phase, `${path}.phase`, ["MOVING", "WORKING"]);
  integer(action.startedAtTick, `${path}.startedAtTick`);
  nullableInteger(action.targetEntityId, `${path}.targetEntityId`, 1);
  const targetTile = nullableInteger(action.targetTileIndex, `${path}.targetTileIndex`);
  if (targetTile !== null && targetTile >= tileCount) {
    fail(`${path}.targetTileIndex`, "is outside the world");
  }
  const pathTiles = numberArray(action.path, `${path}.path`);
  for (const tile of pathTiles) {
    if (tile >= tileCount) fail(`${path}.path`, "contains a tile outside the world");
  }
  integer(action.pathIndex, `${path}.pathIndex`, 0, pathTiles.length);
  integer(action.progress, `${path}.progress`);
  integer(action.workRequired, `${path}.workRequired`);
  integer(action.navigationRevision, `${path}.navigationRevision`);
  validateInteractionClaim(
    action.interactionClaim,
    `${path}.interactionClaim`,
    tileCount,
    width,
    height,
  );
}

function validateWorld(value: unknown): {
  width: number;
  height: number;
  tileCount: number;
} {
  const world = object(value, "world", ["width", "height", "tiles", "navigationRevision"]);
  const width = integer(world.width, "world.width", 1, 512);
  const height = integer(world.height, "world.height", 1, 512);
  const tileCount = width * height;
  if (tileCount > MAX_PERSISTED_WORLD_TILES) {
    fail("world", `exceeds the ${MAX_PERSISTED_WORLD_TILES.toString()} tile limit`);
  }
  const navigationRevision = integer(world.navigationRevision, "world.navigationRevision");
  const tiles = array(world.tiles, "world.tiles", MAX_PERSISTED_WORLD_TILES);
  if (tiles.length !== tileCount) fail("world.tiles", "does not match width x height");
  for (const [index, tileValue] of tiles.entries()) {
    const path = `world.tiles[${index.toString()}]`;
    const tile = object(tileValue, path, [
      "index",
      "x",
      "y",
      "terrain",
      "walkCost",
      "blocked",
      "navigationRevision",
    ]);
    if (integer(tile.index, `${path}.index`) !== index) {
      fail(`${path}.index`, "does not match its array position");
    }
    if (integer(tile.x, `${path}.x`) !== index % width) {
      fail(`${path}.x`, "does not match its tile index");
    }
    if (integer(tile.y, `${path}.y`) !== Math.floor(index / width)) {
      fail(`${path}.y`, "does not match its tile index");
    }
    literal(tile.terrain, `${path}.terrain`, ["GROUND", "SHALLOW_WATER", "ROCK"]);
    integer(tile.walkCost, `${path}.walkCost`, 1);
    boolean(tile.blocked, `${path}.blocked`);
    integer(tile.navigationRevision, `${path}.navigationRevision`, 0, navigationRevision);
  }
  return { width, height, tileCount };
}

function validateCreatures(
  value: unknown,
  tileCount: number,
  width: number,
  height: number,
): number[] {
  const ids: number[] = [];
  for (const [index, creatureValue] of array(value, "creatures").entries()) {
    const path = `creatures[${index.toString()}]`;
    const creature = object(creatureValue, path, [
      "id",
      "name",
      "color",
      "alive",
      "tileIndex",
      "x",
      "y",
      "health",
      "needs",
      "traits",
      "skills",
      "inventory",
      "groupId",
      "role",
      "activeDesire",
      "activePlan",
      "activeGoal",
      "activeAction",
      "nextDecisionTick",
      "lastActionKind",
      "lastActionTick",
      "actionCounts",
      "memoryIds",
      "intentHistory",
      "recentRoute",
    ]);
    ids.push(integer(creature.id, `${path}.id`, 1));
    string(creature.name, `${path}.name`);
    integer(creature.color, `${path}.color`, 0, 0xffffff);
    boolean(creature.alive, `${path}.alive`);
    integer(creature.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    finite(creature.x, `${path}.x`, 0, width * TILE_FIXED_UNITS);
    finite(creature.y, `${path}.y`, 0, height * TILE_FIXED_UNITS);
    integer(creature.health, `${path}.health`, 0, 10_000);
    const needs = object(creature.needs, `${path}.needs`, ["hunger", "fatigue"]);
    integer(needs.hunger, `${path}.needs.hunger`, 0, 10_000);
    integer(needs.fatigue, `${path}.needs.fatigue`, 0, 10_000);
    const traits = object(creature.traits, `${path}.traits`, [
      "generosity",
      "aggression",
      "sociability",
      "loyalty",
    ]);
    for (const key of ["generosity", "aggression", "sociability", "loyalty"] as const) {
      integer(traits[key], `${path}.traits.${key}`, 0, 10_000);
    }
    const skills = object(creature.skills, `${path}.skills`, ["foraging", "combat"]);
    integer(skills.foraging, `${path}.skills.foraging`, 0, 10_000);
    integer(skills.combat, `${path}.skills.combat`, 0, 10_000);
    validateInventory(creature.inventory, `${path}.inventory`);
    nullableInteger(creature.groupId, `${path}.groupId`, 1);
    literal(creature.role, `${path}.role`, [
      "FORAGER",
      "BUILDER",
      "GUARD",
      "LEADER",
      "DRIFTER",
    ]);
    validateActiveDesire(creature.activeDesire, `${path}.activeDesire`);
    validateActivePlan(creature.activePlan, `${path}.activePlan`, tileCount, width, height);
    validateActiveGoal(creature.activeGoal, `${path}.activeGoal`, tileCount);
    validateActiveAction(
      creature.activeAction,
      `${path}.activeAction`,
      tileCount,
      width,
      height,
    );
    integer(creature.nextDecisionTick, `${path}.nextDecisionTick`);
    if (creature.lastActionKind !== null) {
      literal(creature.lastActionKind, `${path}.lastActionKind`, ACTION_KINDS);
    }
    integer(creature.lastActionTick, `${path}.lastActionTick`, -1);
    const counts = object(creature.actionCounts, `${path}.actionCounts`, ACTION_KINDS);
    for (const action of ACTION_KINDS) {
      integer(counts[action], `${path}.actionCounts.${action}`);
    }
    numberArray(creature.memoryIds, `${path}.memoryIds`, 1);
    for (const [historyIndex, historyValue] of array(
      creature.intentHistory,
      `${path}.intentHistory`,
    ).entries()) {
      const historyPath = `${path}.intentHistory[${historyIndex.toString()}]`;
      const history = object(historyValue, historyPath, [
        "tick",
        "desire",
        "plan",
        "status",
        "reason",
      ]);
      integer(history.tick, `${historyPath}.tick`);
      literal(history.desire, `${historyPath}.desire`, DESIRE_KINDS);
      literal(history.plan, `${historyPath}.plan`, PLAN_KINDS);
      literal(history.status, `${historyPath}.status`, [
        "ACTIVE",
        "BLOCKED",
        "COMPLETED",
        "ABANDONED",
      ]);
      validateReasonFact(history.reason, `${historyPath}.reason`);
    }
    for (const [routeIndex, routeValue] of array(
      creature.recentRoute,
      `${path}.recentRoute`,
    ).entries()) {
      const routePath = `${path}.recentRoute[${routeIndex.toString()}]`;
      const route = object(routeValue, routePath, ["tick", "tileIndex", "x", "y"]);
      integer(route.tick, `${routePath}.tick`);
      integer(route.tileIndex, `${routePath}.tileIndex`, 0, tileCount - 1);
      integer(route.x, `${routePath}.x`, 0, width * TILE_FIXED_UNITS);
      integer(route.y, `${routePath}.y`, 0, height * TILE_FIXED_UNITS);
    }
  }
  assertUnique(ids, "creatures");
  return ids;
}

function validateResourceNodes(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, nodeValue] of array(value, "resourceNodes").entries()) {
    const path = `resourceNodes[${index.toString()}]`;
    const node = object(nodeValue, path, [
      "id",
      "kind",
      "tileIndex",
      "currentStock",
      "maximumStock",
      "regenerationEveryTicks",
      "regenerationAmount",
    ]);
    ids.push(integer(node.id, `${path}.id`, 1));
    literal(node.kind, `${path}.kind`, ["FOOD", "MATERIAL"]);
    integer(node.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    const currentStock = integer(node.currentStock, `${path}.currentStock`);
    const maximumStock = integer(node.maximumStock, `${path}.maximumStock`);
    if (currentStock > maximumStock) fail(`${path}.currentStock`, "exceeds maximumStock");
    integer(node.regenerationEveryTicks, `${path}.regenerationEveryTicks`, 1);
    integer(node.regenerationAmount, `${path}.regenerationAmount`);
  }
  assertUnique(ids, "resourceNodes");
  return ids;
}

function validateStructures(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, structureValue] of array(value, "structures").entries()) {
    const path = `structures[${index.toString()}]`;
    const structure = object(structureValue, path, [
      "id",
      "kind",
      "tileIndex",
      "groupId",
      "material",
      "materialRequired",
      "progress",
      "workRequired",
      "inventory",
      "guardIds",
      "completedTick",
    ]);
    ids.push(integer(structure.id, `${path}.id`, 1));
    literal(structure.kind, `${path}.kind`, ["STORAGE", "STORAGE_SITE"]);
    integer(structure.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    integer(structure.groupId, `${path}.groupId`, 1);
    integer(structure.material, `${path}.material`);
    integer(structure.materialRequired, `${path}.materialRequired`);
    integer(structure.progress, `${path}.progress`);
    integer(structure.workRequired, `${path}.workRequired`);
    validateInventory(structure.inventory, `${path}.inventory`);
    numberArray(structure.guardIds, `${path}.guardIds`, 1);
    nullableInteger(structure.completedTick, `${path}.completedTick`);
  }
  assertUnique(ids, "structures");
  return ids;
}

function validateGroups(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, groupValue] of array(value, "groups").entries()) {
    const path = `groups[${index.toString()}]`;
    const group = object(groupValue, path, [
      "id",
      "name",
      "stage",
      "foundedTick",
      "memberIds",
      "leaderId",
      "homeTileIndex",
      "storageStructureId",
      "cohesion",
      "sharingNorm",
      "majorEventIds",
    ]);
    ids.push(integer(group.id, `${path}.id`, 1));
    string(group.name, `${path}.name`);
    literal(group.stage, `${path}.stage`, ["PROVISIONAL", "PERSISTENT"]);
    integer(group.foundedTick, `${path}.foundedTick`);
    const memberIds = numberArray(group.memberIds, `${path}.memberIds`, 1);
    assertUnique(memberIds, `${path}.memberIds`);
    nullableInteger(group.leaderId, `${path}.leaderId`, 1);
    integer(group.homeTileIndex, `${path}.homeTileIndex`, 0, tileCount - 1);
    nullableInteger(group.storageStructureId, `${path}.storageStructureId`, 1);
    integer(group.cohesion, `${path}.cohesion`, 0, 10_000);
    finite(group.sharingNorm, `${path}.sharingNorm`);
    numberArray(group.majorEventIds, `${path}.majorEventIds`, 1);
  }
  assertUnique(ids, "groups");
  return ids;
}

function validateRelationships(value: unknown): number[] {
  const ids: number[] = [];
  for (const [index, edgeValue] of array(value, "relationships").entries()) {
    const path = `relationships[${index.toString()}]`;
    const edge = object(edgeValue, path, [
      "id",
      "fromId",
      "toId",
      "trust",
      "fear",
      "familiarity",
      "rivalry",
      "lastInteractionTick",
      "significantEventIds",
    ]);
    ids.push(integer(edge.id, `${path}.id`, 1));
    integer(edge.fromId, `${path}.fromId`, 1);
    integer(edge.toId, `${path}.toId`, 1);
    integer(edge.trust, `${path}.trust`, -10_000, 10_000);
    integer(edge.fear, `${path}.fear`, 0, 10_000);
    integer(edge.familiarity, `${path}.familiarity`, 0, 10_000);
    integer(edge.rivalry, `${path}.rivalry`, 0, 10_000);
    integer(edge.lastInteractionTick, `${path}.lastInteractionTick`);
    numberArray(edge.significantEventIds, `${path}.significantEventIds`, 1);
  }
  assertUnique(ids, "relationships");
  return ids;
}

function validateMemories(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, memoryValue] of array(value, "memories").entries()) {
    const path = `memories[${index.toString()}]`;
    const memory = object(memoryValue, path, [
      "id",
      "ownerId",
      "kind",
      "createdTick",
      "subjectEntityId",
      "locationTileIndex",
      "valence",
      "importance",
      "strength",
      "sourceEventIds",
    ]);
    ids.push(integer(memory.id, `${path}.id`, 1));
    integer(memory.ownerId, `${path}.ownerId`, 1);
    literal(memory.kind, `${path}.kind`, [
      "HELP_RECEIVED",
      "THEFT_OBSERVED",
      "HARM_RECEIVED",
      "RESOURCE_FOUND",
      "GROUP_FOUNDED",
    ]);
    integer(memory.createdTick, `${path}.createdTick`);
    nullableInteger(memory.subjectEntityId, `${path}.subjectEntityId`, 1);
    const tile = nullableInteger(memory.locationTileIndex, `${path}.locationTileIndex`);
    if (tile !== null && tile >= tileCount) {
      fail(`${path}.locationTileIndex`, "is outside the world");
    }
    integer(memory.valence, `${path}.valence`, -10_000, 10_000);
    integer(memory.importance, `${path}.importance`, 0, 10_000);
    integer(memory.strength, `${path}.strength`, 0, 10_000);
    numberArray(memory.sourceEventIds, `${path}.sourceEventIds`, 1);
  }
  assertUnique(ids, "memories");
  return ids;
}

function validateCommands(value: unknown, tileCount: number, stateTick: number): number[] {
  const ids: number[] = [];
  let previousTick = -1;
  let previousId = -1;
  for (const [index, commandValue] of array(value, "commandQueue").entries()) {
    const path = `commandQueue[${index.toString()}]`;
    const command = object(commandValue, path, [
      "commandId",
      "applyAtTick",
      "type",
      "tileIndex",
      "amount",
      "blocked",
    ]);
    const commandId = integer(command.commandId, `${path}.commandId`, 1);
    const applyAtTick = integer(command.applyAtTick, `${path}.applyAtTick`);
    if (applyAtTick < stateTick) {
      fail(`${path}.applyAtTick`, "must not precede the current state tick");
    }
    ids.push(commandId);
    const type = literal(command.type, `${path}.type`, [
      "ADD_FOOD",
      "REMOVE_FOOD",
      "TOGGLE_OBSTACLE",
    ]);
    integer(command.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    const amount = integer(command.amount, `${path}.amount`);
    if (command.blocked !== null) boolean(command.blocked, `${path}.blocked`);
    if (type === "TOGGLE_OBSTACLE") {
      if (amount !== 0) fail(`${path}.amount`, "must be zero for an obstacle");
    } else {
      if (amount < 1) fail(`${path}.amount`, "must be positive for food");
      if (amount > MAX_PLAYER_COMMAND_AMOUNT) {
        fail(`${path}.amount`, `must not exceed ${MAX_PLAYER_COMMAND_AMOUNT.toString()}`);
      }
      if (command.blocked !== null) fail(`${path}.blocked`, "must be null for food");
    }
    if (
      applyAtTick < previousTick ||
      (applyAtTick === previousTick && commandId <= previousId)
    ) {
      fail("commandQueue", "must be ordered by applyAtTick and commandId");
    }
    previousTick = applyAtTick;
    previousId = commandId;
  }
  assertUnique(ids, "commandQueue");
  return ids;
}

function validateDomainEvents(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, eventValue] of array(value, "domainEvents").entries()) {
    const path = `domainEvents[${index.toString()}]`;
    const event = object(eventValue, path, [
      "id",
      "tick",
      "type",
      "actorIds",
      "targetIds",
      "groupIds",
      "locationTileIndex",
      "resourceKind",
      "quantity",
      "causedByEventIds",
      "decisionRecordIds",
      "importance",
      "attentionTier",
      "clusterKey",
      "commandId",
      "commandOutcome",
      "commandRejectionReason",
      "summary",
    ]);
    ids.push(integer(event.id, `${path}.id`, 1));
    integer(event.tick, `${path}.tick`);
    literal(event.type, `${path}.type`, [
      "SIMULATION_STARTED",
      "PLAYER_ADDED_FOOD",
      "PLAYER_REMOVED_FOOD",
      "PLAYER_TOGGLED_OBSTACLE",
      "DESIRE_CHANGED",
      "PLAN_CHANGED",
      "PLAN_BLOCKED",
      "ACTION_STARTED",
      "FOOD_GATHERED",
      "MATERIAL_GATHERED",
      "FOOD_EATEN",
      "FOOD_SHARED",
      "THEFT_COMMITTED",
      "THEFT_WITNESSED",
      "FOOD_DEPOSITED",
      "FOOD_WITHDRAWN",
      "MATERIAL_DEPOSITED",
      "STORAGE_SITE_STARTED",
      "STORAGE_WORK_ADVANCED",
      "STORAGE_COMPLETED",
      "THREAT_NOTICED",
      "CONFRONTATION_APPROACHED",
      "CREATURE_ATTACKED",
      "CONFRONTATION_AFTERMATH",
      "CREATURE_FLED",
      "CREATURE_GUARDED",
      "CREATURE_JOINED_GROUP",
      "GROUP_FOUNDED",
      "LEADER_SELECTED",
    ]);
    numberArray(event.actorIds, `${path}.actorIds`, 1);
    numberArray(event.targetIds, `${path}.targetIds`, 1);
    numberArray(event.groupIds, `${path}.groupIds`, 1);
    const tile = nullableInteger(event.locationTileIndex, `${path}.locationTileIndex`);
    if (tile !== null && tile >= tileCount) {
      fail(`${path}.locationTileIndex`, "is outside the world");
    }
    if (event.resourceKind !== null) {
      literal(event.resourceKind, `${path}.resourceKind`, ["FOOD", "MATERIAL"]);
    }
    integer(event.quantity, `${path}.quantity`);
    numberArray(event.causedByEventIds, `${path}.causedByEventIds`, 1);
    numberArray(event.decisionRecordIds, `${path}.decisionRecordIds`, 1);
    finite(event.importance, `${path}.importance`);
    literal(event.attentionTier, `${path}.attentionTier`, [
      "ROUTINE",
      "NOTABLE",
      "SIGNIFICANT",
      "CRITICAL",
    ]);
    string(event.clusterKey, `${path}.clusterKey`);
    nullableInteger(event.commandId, `${path}.commandId`, 1);
    if (event.commandOutcome !== null) {
      literal(event.commandOutcome, `${path}.commandOutcome`, ["APPLIED", "REJECTED"]);
    }
    if (event.commandRejectionReason !== null) {
      literal(event.commandRejectionReason, `${path}.commandRejectionReason`, [
        "OCCUPIED_TILE",
      ]);
    }
    string(event.summary, `${path}.summary`, true);
  }
  assertUnique(ids, "domainEvents");
  return ids;
}

function validateHistoryEvents(value: unknown): number[] {
  const ids: number[] = [];
  for (const [index, eventValue] of array(value, "historyEvents").entries()) {
    const path = `historyEvents[${index.toString()}]`;
    const event = object(eventValue, path, [
      "id",
      "tick",
      "type",
      "title",
      "summary",
      "sourceEventIds",
      "actorIds",
      "groupIds",
      "importance",
    ]);
    ids.push(integer(event.id, `${path}.id`, 1));
    integer(event.tick, `${path}.tick`);
    literal(event.type, `${path}.type`, [
      "INTERVENTION",
      "GROUP_FORMED",
      "LEADERSHIP",
      "STORAGE_BUILT",
      "SOCIAL_BOND",
      "THEFT",
      "CONFRONTATION",
    ]);
    string(event.title, `${path}.title`, true);
    string(event.summary, `${path}.summary`, true);
    numberArray(event.sourceEventIds, `${path}.sourceEventIds`, 1);
    numberArray(event.actorIds, `${path}.actorIds`, 1);
    numberArray(event.groupIds, `${path}.groupIds`, 1);
    finite(event.importance, `${path}.importance`);
  }
  assertUnique(ids, "historyEvents");
  return ids;
}

function validateDecisionRecords(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, decisionValue] of array(value, "decisionRecords").entries()) {
    const path = `decisionRecords[${index.toString()}]`;
    const decision = object(decisionValue, path, [
      "id",
      "tick",
      "actorId",
      "previousAction",
      "selectedAction",
      "selectedDesire",
      "selectedPlan",
      "selectedTargetId",
      "strongestReason",
      "switchReason",
      "candidates",
    ]);
    ids.push(integer(decision.id, `${path}.id`, 1));
    integer(decision.tick, `${path}.tick`);
    integer(decision.actorId, `${path}.actorId`, 1);
    if (decision.previousAction !== null) {
      literal(decision.previousAction, `${path}.previousAction`, ACTION_KINDS);
    }
    literal(decision.selectedAction, `${path}.selectedAction`, ACTION_KINDS);
    literal(decision.selectedDesire, `${path}.selectedDesire`, DESIRE_KINDS);
    literal(decision.selectedPlan, `${path}.selectedPlan`, PLAN_KINDS);
    nullableInteger(decision.selectedTargetId, `${path}.selectedTargetId`, 1);
    validateReasonFact(decision.strongestReason, `${path}.strongestReason`);
    literal(decision.switchReason, `${path}.switchReason`, [
      "NO_ACTIVE_GOAL",
      "GOAL_COMPLETED",
      "EMERGENCY_INTERRUPT",
      "TARGET_INVALID",
      "NEW_OPTION_EXCEEDED_HYSTERESIS",
      "SCHEDULED_RECONSIDERATION",
    ]);
    for (const [candidateIndex, candidate] of array(
      decision.candidates,
      `${path}.candidates`,
    ).entries()) {
      validateCandidate(
        candidate,
        `${path}.candidates[${candidateIndex.toString()}]`,
        tileCount,
      );
    }
  }
  assertUnique(ids, "decisionRecords");
  return ids;
}

function validateMetrics(value: unknown): void {
  const keys = [
    "foodGathered",
    "foodShared",
    "thefts",
    "witnessedThefts",
    "attacks",
    "groupsFormed",
    "storagesCompleted",
    "playerInterventions",
    "invalidPathFailures",
    "interactionContentions",
    "failedInteractionClaims",
  ] as const;
  const metrics = object(value, "metrics", keys);
  for (const key of keys) integer(metrics[key], `metrics.${key}`);
}

function validateConfiguration(value: unknown): void {
  const configuration = object(value, "configuration", [
    "ticksPerSecond",
    "maxDomainEvents",
    "maxHistoryEvents",
    "maxDecisionRecords",
    "maxMemoriesPerCreature",
    "maxRelationshipsPerCreature",
    "maxIntentHistoryPerCreature",
    "maxRouteSamplesPerCreature",
  ]);
  integer(configuration.ticksPerSecond, "configuration.ticksPerSecond", 1, 1_000);
  for (const key of [
    "maxDomainEvents",
    "maxHistoryEvents",
    "maxDecisionRecords",
    "maxMemoriesPerCreature",
    "maxRelationshipsPerCreature",
    "maxIntentHistoryPerCreature",
    "maxRouteSamplesPerCreature",
  ] as const) {
    integer(configuration[key], `configuration.${key}`, 1, MAX_PERSISTED_COLLECTION_ITEMS);
  }
}

function assertCounter(counter: unknown, path: string, ids: readonly number[]): void {
  const next = integer(counter, path, 1);
  const maximum = ids.length === 0 ? 0 : Math.max(...ids);
  if (next <= maximum) fail(path, `must be greater than existing ID ${maximum.toString()}`);
}

/**
 * Validates every persisted state object and the stable cross-references that
 * authoritative simulation logic relies on. Historical evidence references
 * may be absent after bounded retention and are intentionally reported by the
 * causal projection instead of making an otherwise valid save unloadable.
 */
export function assertCompatibleSimulationState(
  value: unknown,
): asserts value is SimulationState {
  const state = object(value, "state", [
    "schemaVersion",
    "seed",
    "tick",
    "nextEntityId",
    "nextCommandId",
    "nextEventId",
    "nextHistoryId",
    "nextDecisionId",
    "nextMemoryId",
    "nextRelationshipId",
    "nextGroupId",
    "randomState",
    "world",
    "creatures",
    "resourceNodes",
    "structures",
    "groups",
    "relationships",
    "memories",
    "commandQueue",
    "domainEvents",
    "historyEvents",
    "decisionRecords",
    "metrics",
    "configuration",
  ]);
  const version = integer(state.schemaVersion, "schemaVersion");
  if (version !== SIMULATION_STATE_VERSION) {
    throw new Error(
      `Unsupported simulation state version ${String(version)}; expected ${SIMULATION_STATE_VERSION}.`,
    );
  }
  integer(state.seed, "seed", 0, 0xffffffff);
  const tick = integer(state.tick, "tick");
  integer(state.randomState, "randomState", 0, 0xffffffff);
  const { width, height, tileCount } = validateWorld(state.world);
  const creatureIds = validateCreatures(state.creatures, tileCount, width, height);
  const resourceIds = validateResourceNodes(state.resourceNodes, tileCount);
  const structureIds = validateStructures(state.structures, tileCount);
  const entityIds = [...creatureIds, ...resourceIds, ...structureIds];
  assertUnique(entityIds, ENTITY_KEYS.join(", "));
  const groupIds = validateGroups(state.groups, tileCount);
  const relationshipIds = validateRelationships(state.relationships);
  const memoryIds = validateMemories(state.memories, tileCount);
  const commandIds = validateCommands(state.commandQueue, tileCount, tick);
  const eventIds = validateDomainEvents(state.domainEvents, tileCount);
  const historyIds = validateHistoryEvents(state.historyEvents);
  const decisionIds = validateDecisionRecords(state.decisionRecords, tileCount);
  validateMetrics(state.metrics);
  validateConfiguration(state.configuration);

  const creatures = array(state.creatures, "creatures");
  const groups = array(state.groups, "groups");
  const structures = array(state.structures, "structures");
  const relationships = array(state.relationships, "relationships");
  const memories = array(state.memories, "memories");
  const domainEvents = array(state.domainEvents, "domainEvents");
  const historyEvents = array(state.historyEvents, "historyEvents");
  const decisions = array(state.decisionRecords, "decisionRecords");
  const creatureSet = new Set(creatureIds);
  const entitySet = new Set(entityIds);
  const groupSet = new Set(groupIds);
  const structureSet = new Set(structureIds);
  const memorySet = new Set(memoryIds);
  const eventSet = new Set(eventIds);
  const decisionSet = new Set(decisionIds);
  const subjectSet = new Set([...entityIds, ...groupIds]);
  const configuration = state.configuration as UnknownRecord;

  for (const [index, creatureValue] of creatures.entries()) {
    const creature = creatureValue as UnknownRecord;
    const groupId = creature.groupId as number | null;
    if (groupId !== null && !groupSet.has(groupId)) {
      fail(
        `creatures[${index.toString()}].groupId`,
        `references missing ID ${groupId.toString()}`,
      );
    }
    assertReferences(
      creature.memoryIds as number[],
      memorySet,
      `creatures[${index.toString()}].memoryIds`,
    );
    const activeDesire = creature.activeDesire as UnknownRecord | null;
    const activePlan = creature.activePlan as UnknownRecord | null;
    const activeGoal = creature.activeGoal as UnknownRecord | null;
    const activeAction = creature.activeAction as UnknownRecord | null;
    if (activeAction !== null && (activeDesire === null || activePlan === null)) {
      fail(
        `creatures[${index.toString()}].activeAction`,
        "requires an active desire and plan",
      );
    }
    for (const [label, intent] of [
      ["activeDesire", activeDesire],
      ["activePlan", activePlan],
    ] as const) {
      if (intent === null) continue;
      const selectedByDecisionId = intent.selectedByDecisionId as number;
      if (!decisionSet.has(selectedByDecisionId)) {
        fail(
          `creatures[${index.toString()}].${label}.selectedByDecisionId`,
          `references missing ID ${selectedByDecisionId.toString()}`,
        );
      }
    }
    if (activeGoal !== null && !decisionSet.has(activeGoal.decisionRecordId as number)) {
      fail(
        `creatures[${index.toString()}].activeGoal.decisionRecordId`,
        `references missing ID ${String(activeGoal.decisionRecordId)}`,
      );
    }
    for (const [label, intent, key] of [
      ["activeDesire", activeDesire, "subjectEntityId"],
      ["activePlan", activePlan, "targetEntityId"],
      ["activeGoal", activeGoal, "targetEntityId"],
      ["activeAction", activeAction, "targetEntityId"],
    ] as const) {
      const targetId = intent?.[key] as number | null | undefined;
      if (targetId !== null && targetId !== undefined && !subjectSet.has(targetId)) {
        fail(
          `creatures[${index.toString()}].${label}.${key}`,
          `references missing ID ${targetId.toString()}`,
        );
      }
    }
    if (activeAction !== null && activePlan !== null) {
      const actionClaim = activeAction.interactionClaim as UnknownRecord | null;
      const planClaim = activePlan.interactionClaim as UnknownRecord | null;
      if (!sameInteractionClaim(actionClaim, planClaim)) {
        fail(
          `creatures[${index.toString()}].activePlan.interactionClaim`,
          "must match the active action claim",
        );
      }
    }
    if (
      (creature.intentHistory as unknown[]).length >
      (configuration.maxIntentHistoryPerCreature as number)
    ) {
      fail(`creatures[${index.toString()}].intentHistory`, "exceeds its configured bound");
    }
    if (
      (creature.recentRoute as unknown[]).length >
      (configuration.maxRouteSamplesPerCreature as number)
    ) {
      fail(`creatures[${index.toString()}].recentRoute`, "exceeds its configured bound");
    }
  }
  for (const [index, groupValue] of groups.entries()) {
    const group = groupValue as UnknownRecord;
    assertReferences(
      group.memberIds as number[],
      creatureSet,
      `groups[${index.toString()}].memberIds`,
    );
    const leaderId = group.leaderId as number | null;
    if (leaderId !== null && !(group.memberIds as number[]).includes(leaderId)) {
      fail(`groups[${index.toString()}].leaderId`, "must be a group member");
    }
    const storageId = group.storageStructureId as number | null;
    if (storageId !== null && !structureSet.has(storageId)) {
      fail(
        `groups[${index.toString()}].storageStructureId`,
        `references missing ID ${storageId.toString()}`,
      );
    }
  }
  for (const [index, structureValue] of structures.entries()) {
    const structure = structureValue as UnknownRecord;
    if (!groupSet.has(structure.groupId as number)) {
      fail(`structures[${index.toString()}].groupId`, "references a missing group");
    }
    assertReferences(
      structure.guardIds as number[],
      creatureSet,
      `structures[${index.toString()}].guardIds`,
    );
  }
  for (const [index, edgeValue] of relationships.entries()) {
    const edge = edgeValue as UnknownRecord;
    assertReferences(
      [edge.fromId as number, edge.toId as number],
      creatureSet,
      `relationships[${index.toString()}]`,
    );
  }
  for (const [index, memoryValue] of memories.entries()) {
    const memory = memoryValue as UnknownRecord;
    assertReferences(
      [memory.ownerId as number],
      creatureSet,
      `memories[${index.toString()}].ownerId`,
    );
    const subjectId = memory.subjectEntityId as number | null;
    if (subjectId !== null && !entitySet.has(subjectId)) {
      fail(
        `memories[${index.toString()}].subjectEntityId`,
        `references missing ID ${subjectId.toString()}`,
      );
    }
    assertReferences(
      memory.sourceEventIds as number[],
      eventSet,
      `memories[${index.toString()}].sourceEventIds`,
    );
  }
  for (const [index, eventValue] of domainEvents.entries()) {
    const event = eventValue as UnknownRecord;
    assertReferences(
      event.actorIds as number[],
      creatureSet,
      `domainEvents[${index.toString()}].actorIds`,
    );
    assertReferences(
      event.targetIds as number[],
      entitySet,
      `domainEvents[${index.toString()}].targetIds`,
    );
    assertReferences(
      event.groupIds as number[],
      groupSet,
      `domainEvents[${index.toString()}].groupIds`,
    );
    assertReferences(
      event.causedByEventIds as number[],
      eventSet,
      `domainEvents[${index.toString()}].causedByEventIds`,
    );
  }
  for (const [index, historyValue] of historyEvents.entries()) {
    const history = historyValue as UnknownRecord;
    assertReferences(
      history.sourceEventIds as number[],
      eventSet,
      `historyEvents[${index.toString()}].sourceEventIds`,
    );
    assertReferences(
      history.actorIds as number[],
      creatureSet,
      `historyEvents[${index.toString()}].actorIds`,
    );
    assertReferences(
      history.groupIds as number[],
      groupSet,
      `historyEvents[${index.toString()}].groupIds`,
    );
  }
  for (const [index, decisionValue] of decisions.entries()) {
    const decision = decisionValue as UnknownRecord;
    assertReferences(
      [decision.actorId as number],
      creatureSet,
      `decisionRecords[${index.toString()}].actorId`,
    );
    const targetId = decision.selectedTargetId as number | null;
    if (targetId !== null && !entitySet.has(targetId)) {
      fail(
        `decisionRecords[${index.toString()}].selectedTargetId`,
        `references missing ID ${targetId.toString()}`,
      );
    }
  }

  for (const collection of [creatures, domainEvents, historyEvents, decisions]) {
    for (const item of collection) {
      const itemTick = (item as UnknownRecord).tick;
      if (typeof itemTick === "number" && itemTick > tick) {
        fail("tick", "is earlier than retained state data");
      }
    }
  }

  assertCounter(state.nextEntityId, "nextEntityId", entityIds);
  assertCounter(state.nextCommandId, "nextCommandId", commandIds);
  assertCounter(state.nextEventId, "nextEventId", eventIds);
  assertCounter(state.nextHistoryId, "nextHistoryId", historyIds);
  assertCounter(state.nextDecisionId, "nextDecisionId", decisionIds);
  assertCounter(state.nextMemoryId, "nextMemoryId", memoryIds);
  assertCounter(state.nextRelationshipId, "nextRelationshipId", relationshipIds);
  assertCounter(state.nextGroupId, "nextGroupId", groupIds);

  const claimErrors = validateInteractionClaims(state as unknown as SimulationState);
  if (claimErrors.length > 0) {
    fail("creatures", `contains invalid interaction claims: ${claimErrors.join("; ")}`);
  }
}

export function assertSerializedSize(serialized: string, label: string): void {
  if (serialized.length > MAX_PERSISTED_JSON_CHARACTERS) {
    throw new Error(
      `${label} exceeds the ${MAX_PERSISTED_JSON_CHARACTERS.toString()} character limit.`,
    );
  }
}
