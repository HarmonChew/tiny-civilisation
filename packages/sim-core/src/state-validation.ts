import {
  MAX_PLAYER_COMMAND_AMOUNT,
  TILE_FIXED_UNITS,
  type ActionKind,
  type SimulationState,
} from "./types.js";
import { DESIRE_KINDS, PLAN_KINDS } from "./desires.js";
import { validateInteractionClaims } from "./interaction-slots.js";
import {
  MAX_LIVING_POPULATION,
  MAX_TOTAL_IDENTITIES,
  lifeStageForAge,
} from "./lifecycle.js";
import {
  UNREACHABLE_TRAVEL_COST,
  tileCoordinates,
  tileIndexAt,
  weightedTravelCostsFrom,
} from "./pathfinding.js";
import { assertScenarioReference, compileScenario } from "./scenarios/index.js";
import {
  SHELTER_BASE_CAPACITY,
  SHELTER_MATERIAL_REQUIRED,
  SHELTER_MINIMUM_COMMITMENT_TICKS,
  SHELTER_RELOCATION_CHANGE_COST,
  SHELTER_RELOCATION_MINIMUM_IMPROVEMENT,
  SHELTER_REST_OFFSETS,
  SHELTER_WORK_REQUIRED,
  assessShelterSite,
  isLegalShelterSite,
  rankShelterSites,
  shelterConditionBand,
} from "./shelters.js";
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
  "GATHER_WATER",
  "EAT",
  "DRINK",
  "REST",
  "ESTABLISH_SHELTER_SITE",
  "BUILD_SHELTER",
  "REST_SHELTERED",
  "MAINTAIN_SHELTER",
  "SHARE",
  "SHARE_WATER",
  "KEEP",
  "STEAL",
  "DEPOSIT",
  "WITHDRAW",
  "BUILD_STORAGE",
  "GUARD",
  "ATTACK",
  "FLEE",
  "JOIN_GROUP",
  "FORM_FAMILY",
  "CARE_FOR_YOUNG",
  "MOURN",
  "CLAIM_ESTATE",
] as const satisfies readonly ActionKind[];

const ENTITY_KEYS = ["creatures", "resourceNodes", "structures", "memorials"] as const;
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
  "LIFECYCLE",
] as const;
const INTERACTION_PURPOSES = [
  "EXPLORE",
  "GATHER",
  "REST",
  "SOCIAL",
  "STORAGE_ACCESS",
  "CONSTRUCTION",
  "MAINTENANCE",
  "GUARD",
  "CONFLICT",
  "FLIGHT",
  "FAMILY",
  "CARE",
  "MOURNING",
  "ESTATE",
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
  const record = object(value, path, ["capacity", "food", "material", "water"]);
  const capacity = integer(record.capacity, `${path}.capacity`);
  const food = integer(record.food, `${path}.food`);
  const material = integer(record.material, `${path}.material`);
  const water = integer(record.water, `${path}.water`);
  if (food + material + water > capacity) fail(path, "exceeds its capacity");
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
    literal(fact.unit, `${path}.unit`, [
      "UNIT",
      "COUNT",
      "TILES",
      "TICKS",
      "MOVE_COST",
      "LABEL",
    ]);
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
      "sex",
      "ageTicks",
      "lifeStage",
      "naturalLifespanTicks",
      "birthTick",
      "motherId",
      "fatherId",
      "caregiverId",
      "dependentUntilTick",
      "criticalSinceTick",
      "criticalDamage",
      "traitPotential",
      "skillPotential",
      "pregnancy",
      "reproductionCooldownUntilTick",
      "death",
      "mournedLifeRecordIds",
      "majorLifeEventIds",
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
    literal(creature.sex, `${path}.sex`, ["FEMALE", "MALE"]);
    const ageTicks = integer(creature.ageTicks, `${path}.ageTicks`);
    const lifeStage = literal(creature.lifeStage, `${path}.lifeStage`, [
      "JUVENILE",
      "ADULT",
      "ELDER",
    ]);
    if (lifeStage !== lifeStageForAge(ageTicks)) {
      fail(`${path}.lifeStage`, "does not match ageTicks");
    }
    integer(creature.naturalLifespanTicks, `${path}.naturalLifespanTicks`, 1);
    integer(creature.birthTick, `${path}.birthTick`, -Number.MAX_SAFE_INTEGER);
    nullableInteger(creature.motherId, `${path}.motherId`, 1);
    nullableInteger(creature.fatherId, `${path}.fatherId`, 1);
    nullableInteger(creature.caregiverId, `${path}.caregiverId`, 1);
    nullableInteger(creature.dependentUntilTick, `${path}.dependentUntilTick`);
    nullableInteger(creature.criticalSinceTick, `${path}.criticalSinceTick`);
    if (creature.criticalDamage !== null) {
      const criticalDamage = object(creature.criticalDamage, `${path}.criticalDamage`, [
        "starvation",
        "dehydration",
        "exhaustion",
        "injury",
      ]);
      for (const key of ["starvation", "dehydration", "exhaustion", "injury"] as const) {
        integer(criticalDamage[key], `${path}.criticalDamage.${key}`);
      }
      if (creature.criticalSinceTick === null) {
        fail(`${path}.criticalDamage`, "requires criticalSinceTick");
      }
    } else if (creature.criticalSinceTick !== null) {
      fail(`${path}.criticalSinceTick`, "requires retained criticalDamage facts");
    }
    integer(creature.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    finite(creature.x, `${path}.x`, 0, width * TILE_FIXED_UNITS);
    finite(creature.y, `${path}.y`, 0, height * TILE_FIXED_UNITS);
    integer(creature.health, `${path}.health`, 0, 10_000);
    const needs = object(creature.needs, `${path}.needs`, ["hunger", "fatigue", "thirst"]);
    integer(needs.hunger, `${path}.needs.hunger`, 0, 10_000);
    integer(needs.fatigue, `${path}.needs.fatigue`, 0, 10_000);
    integer(needs.thirst, `${path}.needs.thirst`, 0, 10_000);
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
    const traitPotential = object(creature.traitPotential, `${path}.traitPotential`, [
      "generosity",
      "aggression",
      "sociability",
      "loyalty",
    ]);
    for (const key of ["generosity", "aggression", "sociability", "loyalty"] as const) {
      integer(traitPotential[key], `${path}.traitPotential.${key}`, 0, 10_000);
    }
    const skillPotential = object(creature.skillPotential, `${path}.skillPotential`, [
      "foraging",
      "combat",
    ]);
    integer(skillPotential.foraging, `${path}.skillPotential.foraging`, 0, 10_000);
    integer(skillPotential.combat, `${path}.skillPotential.combat`, 0, 10_000);
    if (creature.pregnancy !== null) {
      const pregnancy = object(creature.pregnancy, `${path}.pregnancy`, [
        "fatherId",
        "conceivedTick",
        "dueTick",
      ]);
      integer(pregnancy.fatherId, `${path}.pregnancy.fatherId`, 1);
      const conceivedTick = integer(
        pregnancy.conceivedTick,
        `${path}.pregnancy.conceivedTick`,
      );
      const dueTick = integer(pregnancy.dueTick, `${path}.pregnancy.dueTick`);
      if (dueTick <= conceivedTick)
        fail(`${path}.pregnancy.dueTick`, "must follow conception");
      if (creature.sex !== "FEMALE") fail(`${path}.pregnancy`, "requires FEMALE sex");
    }
    integer(
      creature.reproductionCooldownUntilTick,
      `${path}.reproductionCooldownUntilTick`,
    );
    if (creature.death !== null) {
      const death = object(creature.death, `${path}.death`, ["tick", "cause", "eventId"]);
      integer(death.tick, `${path}.death.tick`);
      literal(death.cause, `${path}.death.cause`, [
        "STARVATION",
        "DEHYDRATION",
        "EXHAUSTION",
        "INJURY",
        "OLD_AGE",
        "LEGACY_UNKNOWN",
      ]);
      integer(death.eventId, `${path}.death.eventId`, 1);
    }
    numberArray(creature.mournedLifeRecordIds, `${path}.mournedLifeRecordIds`, 1);
    numberArray(creature.majorLifeEventIds, `${path}.majorLifeEventIds`, 1);
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
    literal(node.kind, `${path}.kind`, ["FOOD", "MATERIAL", "WATER"]);
    integer(node.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    const currentStock = integer(node.currentStock, `${path}.currentStock`);
    const maximumStock = integer(node.maximumStock, `${path}.maximumStock`, 1);
    if (currentStock > maximumStock) fail(`${path}.currentStock`, "exceeds maximumStock");
    integer(node.regenerationEveryTicks, `${path}.regenerationEveryTicks`, 0);
    integer(node.regenerationAmount, `${path}.regenerationAmount`, 0);
  }
  assertUnique(ids, "resourceNodes");
  return ids;
}

function validateLifeRecords(value: unknown): number[] {
  const ids: number[] = [];
  for (const [index, recordValue] of array(
    value,
    "lifeRecords",
    MAX_TOTAL_IDENTITIES,
  ).entries()) {
    const path = `lifeRecords[${index.toString()}]`;
    const record = object(recordValue, path, [
      "id",
      "name",
      "color",
      "sex",
      "motherId",
      "fatherId",
      "birthTick",
      "deathTick",
      "ageTicks",
      "finalLifeStage",
      "deathCause",
      "finalGroupId",
      "traitPotential",
      "skillPotential",
      "majorEventIds",
      "heirId",
    ]);
    ids.push(integer(record.id, `${path}.id`, 1));
    string(record.name, `${path}.name`);
    integer(record.color, `${path}.color`, 0, 0xffffff);
    literal(record.sex, `${path}.sex`, ["FEMALE", "MALE"]);
    nullableInteger(record.motherId, `${path}.motherId`, 1);
    nullableInteger(record.fatherId, `${path}.fatherId`, 1);
    integer(record.birthTick, `${path}.birthTick`, -Number.MAX_SAFE_INTEGER);
    integer(record.deathTick, `${path}.deathTick`, -1);
    const ageTicks = integer(record.ageTicks, `${path}.ageTicks`);
    const stage = literal(record.finalLifeStage, `${path}.finalLifeStage`, [
      "JUVENILE",
      "ADULT",
      "ELDER",
    ]);
    if (stage !== lifeStageForAge(ageTicks)) {
      fail(`${path}.finalLifeStage`, "does not match ageTicks");
    }
    literal(record.deathCause, `${path}.deathCause`, [
      "STARVATION",
      "DEHYDRATION",
      "EXHAUSTION",
      "INJURY",
      "OLD_AGE",
      "LEGACY_UNKNOWN",
    ]);
    nullableInteger(record.finalGroupId, `${path}.finalGroupId`, 1);
    const traitPotential = object(record.traitPotential, `${path}.traitPotential`, [
      "generosity",
      "aggression",
      "sociability",
      "loyalty",
    ]);
    for (const key of ["generosity", "aggression", "sociability", "loyalty"] as const) {
      integer(traitPotential[key], `${path}.traitPotential.${key}`, 0, 10_000);
    }
    const skillPotential = object(record.skillPotential, `${path}.skillPotential`, [
      "foraging",
      "combat",
    ]);
    integer(skillPotential.foraging, `${path}.skillPotential.foraging`, 0, 10_000);
    integer(skillPotential.combat, `${path}.skillPotential.combat`, 0, 10_000);
    numberArray(record.majorEventIds, `${path}.majorEventIds`, 1);
    nullableInteger(record.heirId, `${path}.heirId`, 1);
  }
  assertUnique(ids, "lifeRecords");
  return ids;
}

function validateMemorials(value: unknown, tileCount: number): number[] {
  const ids: number[] = [];
  for (const [index, memorialValue] of array(
    value,
    "memorials",
    MAX_TOTAL_IDENTITIES,
  ).entries()) {
    const path = `memorials[${index.toString()}]`;
    const memorial = object(memorialValue, path, [
      "id",
      "deceasedId",
      "tileIndex",
      "createdTick",
      "expiresTick",
      "heirId",
      "estate",
      "mournerIds",
      "completedMournerIds",
    ]);
    ids.push(integer(memorial.id, `${path}.id`, 1));
    integer(memorial.deceasedId, `${path}.deceasedId`, 1);
    integer(memorial.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    const createdTick = integer(memorial.createdTick, `${path}.createdTick`);
    const expiresTick = integer(memorial.expiresTick, `${path}.expiresTick`);
    if (expiresTick <= createdTick) fail(`${path}.expiresTick`, "must follow creation");
    nullableInteger(memorial.heirId, `${path}.heirId`, 1);
    const estate = object(memorial.estate, `${path}.estate`, ["food", "material", "water"]);
    integer(estate.food, `${path}.estate.food`);
    integer(estate.material, `${path}.estate.material`);
    integer(estate.water, `${path}.estate.water`);
    const mournerIds = numberArray(memorial.mournerIds, `${path}.mournerIds`, 1);
    const completedMournerIds = numberArray(
      memorial.completedMournerIds,
      `${path}.completedMournerIds`,
      1,
    );
    assertUnique(mournerIds, `${path}.mournerIds`);
    assertUnique(completedMournerIds, `${path}.completedMournerIds`);
    if (completedMournerIds.some((id) => !mournerIds.includes(id))) {
      fail(`${path}.completedMournerIds`, "must be a subset of mournerIds");
    }
  }
  assertUnique(ids, "memorials");
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
      "condition",
      "baseCapacity",
      "siteAssessment",
      "builtFromShelterId",
      "maintenanceMaterialSpent",
      "lastMaintainedTick",
      "lastUsedTick",
      "conditionBand",
    ]);
    ids.push(integer(structure.id, `${path}.id`, 1));
    const kind = literal(structure.kind, `${path}.kind`, [
      "STORAGE",
      "STORAGE_SITE",
      "SHELTER_SITE",
      "SHELTER",
      "ABANDONED_SHELTER",
      "ABANDONED_STORAGE",
    ]);
    integer(structure.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    integer(structure.groupId, `${path}.groupId`, 1);
    const materialRequired = integer(
      structure.materialRequired,
      `${path}.materialRequired`,
      0,
    );
    const material = integer(structure.material, `${path}.material`, 0, materialRequired);
    const workRequired = integer(structure.workRequired, `${path}.workRequired`, 1);
    const progress = integer(structure.progress, `${path}.progress`, 0, workRequired);
    validateInventory(structure.inventory, `${path}.inventory`);
    if ((structure.inventory as UnknownRecord).water !== 0) {
      fail(`${path}.inventory.water`, "must be zero before communal water storage exists");
    }
    const guardIds = numberArray(structure.guardIds, `${path}.guardIds`, 1);
    const completedTick = nullableInteger(structure.completedTick, `${path}.completedTick`);
    if (kind === "STORAGE" || kind === "STORAGE_SITE" || kind === "ABANDONED_STORAGE") {
      for (const shelterOnlyKey of [
        "condition",
        "baseCapacity",
        "siteAssessment",
        "builtFromShelterId",
        "maintenanceMaterialSpent",
        "lastMaintainedTick",
        "lastUsedTick",
        "conditionBand",
      ] as const) {
        if (Object.hasOwn(structure, shelterOnlyKey)) {
          fail(`${path}.${shelterOnlyKey}`, "is not supported for storage structures");
        }
      }
      if (kind === "STORAGE_SITE" && completedTick !== null) {
        fail(`${path}.completedTick`, "must be null while storage is under construction");
      }
      if (
        (kind === "STORAGE" || kind === "ABANDONED_STORAGE") &&
        (completedTick === null ||
          material !== materialRequired ||
          progress !== workRequired)
      ) {
        fail(path, "must be complete when kind is STORAGE or ABANDONED_STORAGE");
      }
    }
    if (kind === "SHELTER_SITE" || kind === "SHELTER" || kind === "ABANDONED_SHELTER") {
      const condition = integer(structure.condition, `${path}.condition`, 0, 10_000);
      const baseCapacity = integer(structure.baseCapacity, `${path}.baseCapacity`, 2, 8);
      if (baseCapacity !== SHELTER_BASE_CAPACITY) {
        fail(
          `${path}.baseCapacity`,
          `must preserve the six-place shelter footprint (${SHELTER_BASE_CAPACITY.toString()})`,
        );
      }
      if (
        materialRequired !== SHELTER_MATERIAL_REQUIRED ||
        workRequired !== SHELTER_WORK_REQUIRED
      ) {
        fail(path, "must use the version-5 shelter construction contract");
      }
      const assessment = object(structure.siteAssessment, `${path}.siteAssessment`, [
        "selectedAtTick",
        "memberTravelCost",
        "storageTravelCost",
        "foodAccessCost",
        "materialAccessCost",
        "waterAccessCost",
        "crowdingCost",
        "constructionInvestmentCost",
        "relocationChangeCost",
        "totalScore",
      ]);
      for (const key of [
        "selectedAtTick",
        "memberTravelCost",
        "storageTravelCost",
        "foodAccessCost",
        "materialAccessCost",
        "waterAccessCost",
        "crowdingCost",
        "constructionInvestmentCost",
        "relocationChangeCost",
        "totalScore",
      ] as const) {
        integer(assessment[key], `${path}.siteAssessment.${key}`, 0);
      }
      const weightedTotal =
        (assessment.memberTravelCost as number) * 3 +
        (assessment.storageTravelCost as number) * 2 +
        (assessment.foodAccessCost as number) +
        (assessment.materialAccessCost as number) * 2 +
        (assessment.waterAccessCost as number) * 2 +
        (assessment.crowdingCost as number) +
        (assessment.constructionInvestmentCost as number) +
        (assessment.relocationChangeCost as number);
      if (assessment.totalScore !== weightedTotal) {
        fail(
          `${path}.siteAssessment.totalScore`,
          "must equal the frozen weighted shelter-site score",
        );
      }
      const builtFromShelterId = nullableInteger(
        structure.builtFromShelterId,
        `${path}.builtFromShelterId`,
        1,
      );
      if (
        builtFromShelterId === null &&
        (assessment.constructionInvestmentCost !== 0 ||
          assessment.relocationChangeCost !== 0)
      ) {
        fail(
          `${path}.siteAssessment`,
          "must not include relocation costs for a first shelter",
        );
      }
      if (
        builtFromShelterId !== null &&
        (assessment.relocationChangeCost !== SHELTER_RELOCATION_CHANGE_COST ||
          (assessment.constructionInvestmentCost as number) > 2_000)
      ) {
        fail(
          `${path}.siteAssessment`,
          "must include the bounded replacement-shelter investment and change costs",
        );
      }
      const maintenanceMaterialSpent = integer(
        structure.maintenanceMaterialSpent,
        `${path}.maintenanceMaterialSpent`,
        0,
      );
      nullableInteger(structure.lastMaintainedTick, `${path}.lastMaintainedTick`);
      nullableInteger(structure.lastUsedTick, `${path}.lastUsedTick`);
      const conditionBand = literal(structure.conditionBand, `${path}.conditionBand`, [
        "GOOD",
        "WORN",
        "LOW",
      ]);
      if (conditionBand !== shelterConditionBand(condition)) {
        fail(`${path}.conditionBand`, "does not match shelter condition");
      }
      const inventory = structure.inventory as UnknownRecord;
      if (
        inventory.capacity !== 0 ||
        inventory.food !== 0 ||
        inventory.material !== 0 ||
        inventory.water !== 0
      ) {
        fail(`${path}.inventory`, "must remain empty for a shelter");
      }
      if (guardIds.length > 0) {
        fail(`${path}.guardIds`, "must remain empty for a shelter");
      }
      if (kind === "SHELTER_SITE") {
        if (
          completedTick !== null ||
          condition !== 10_000 ||
          conditionBand !== "GOOD" ||
          maintenanceMaterialSpent !== 0 ||
          structure.lastMaintainedTick !== null ||
          structure.lastUsedTick !== null
        ) {
          fail(path, "has active-shelter facts while still a site");
        }
      } else if (
        completedTick === null ||
        material !== materialRequired ||
        progress !== workRequired
      ) {
        fail(path, "must be complete when active or abandoned");
      }
    }
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
      "status",
      "extinctTick",
      "stage",
      "foundedTick",
      "memberIds",
      "leaderId",
      "homeTileIndex",
      "storageStructureId",
      "activeShelterId",
      "pendingShelterId",
      "shelterRelocations",
      "shelterCommitUntilTick",
      "shelterRelocationCandidate",
      "cohesion",
      "sharingNorm",
      "majorEventIds",
    ]);
    ids.push(integer(group.id, `${path}.id`, 1));
    string(group.name, `${path}.name`);
    const status = literal(group.status, `${path}.status`, ["ACTIVE", "EXTINCT"]);
    const extinctTick = nullableInteger(group.extinctTick, `${path}.extinctTick`);
    if ((status === "ACTIVE") !== (extinctTick === null)) {
      fail(`${path}.extinctTick`, "must be null exactly while the group is active");
    }
    literal(group.stage, `${path}.stage`, ["PROVISIONAL", "PERSISTENT"]);
    integer(group.foundedTick, `${path}.foundedTick`);
    const memberIds = numberArray(group.memberIds, `${path}.memberIds`, 1);
    assertUnique(memberIds, `${path}.memberIds`);
    nullableInteger(group.leaderId, `${path}.leaderId`, 1);
    integer(group.homeTileIndex, `${path}.homeTileIndex`, 0, tileCount - 1);
    nullableInteger(group.storageStructureId, `${path}.storageStructureId`, 1);
    nullableInteger(group.activeShelterId, `${path}.activeShelterId`, 1);
    nullableInteger(group.pendingShelterId, `${path}.pendingShelterId`, 1);
    integer(group.shelterRelocations, `${path}.shelterRelocations`, 0, 1);
    integer(group.shelterCommitUntilTick, `${path}.shelterCommitUntilTick`);
    if (group.shelterRelocationCandidate !== null) {
      const candidate = object(
        group.shelterRelocationCandidate,
        `${path}.shelterRelocationCandidate`,
        [
          "tileIndex",
          "firstSeenTick",
          "lastEvaluatedTick",
          "consecutiveEvaluations",
          "scoreImprovement",
        ],
      );
      integer(
        candidate.tileIndex,
        `${path}.shelterRelocationCandidate.tileIndex`,
        0,
        tileCount - 1,
      );
      integer(candidate.firstSeenTick, `${path}.shelterRelocationCandidate.firstSeenTick`);
      integer(
        candidate.lastEvaluatedTick,
        `${path}.shelterRelocationCandidate.lastEvaluatedTick`,
      );
      integer(
        candidate.consecutiveEvaluations,
        `${path}.shelterRelocationCandidate.consecutiveEvaluations`,
        1,
      );
      integer(
        candidate.scoreImprovement,
        `${path}.shelterRelocationCandidate.scoreImprovement`,
        0,
      );
    }
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
      "CARE_RECEIVED",
      "BIRTH_WITNESSED",
      "DEATH_MOURNED",
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
      "ADD_MATERIAL",
      "REMOVE_MATERIAL",
      "TOGGLE_OBSTACLE",
      "REPLENISH_WATER",
      "DRAIN_WATER",
    ]);
    integer(command.tileIndex, `${path}.tileIndex`, 0, tileCount - 1);
    const amount = integer(command.amount, `${path}.amount`);
    if (command.blocked !== null) boolean(command.blocked, `${path}.blocked`);
    if (type === "TOGGLE_OBSTACLE") {
      if (amount !== 0) fail(`${path}.amount`, "must be zero for an obstacle");
    } else {
      if (amount < 1)
        fail(`${path}.amount`, "must be positive for a resource intervention");
      if (amount > MAX_PLAYER_COMMAND_AMOUNT) {
        fail(`${path}.amount`, `must not exceed ${MAX_PLAYER_COMMAND_AMOUNT.toString()}`);
      }
      if (command.blocked !== null) {
        fail(`${path}.blocked`, "must be null for a resource intervention");
      }
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
      "HYDRATION_RULES_ENABLED",
      "SHELTER_RULES_ENABLED",
      "LIFECYCLE_RULES_ENABLED",
      "PLAYER_ADDED_FOOD",
      "PLAYER_REMOVED_FOOD",
      "PLAYER_ADDED_MATERIAL",
      "PLAYER_REMOVED_MATERIAL",
      "PLAYER_REPLENISHED_WATER",
      "PLAYER_DRAINED_WATER",
      "PLAYER_TOGGLED_OBSTACLE",
      "DESIRE_CHANGED",
      "PLAN_CHANGED",
      "PLAN_BLOCKED",
      "ACTION_STARTED",
      "FOOD_GATHERED",
      "MATERIAL_GATHERED",
      "WATER_GATHERED",
      "FOOD_EATEN",
      "WATER_DRUNK",
      "FOOD_SHARED",
      "WATER_SHARED",
      "WATER_SOURCE_DEPLETED",
      "SEVERE_THIRST_STARTED",
      "SEVERE_THIRST_RESOLVED",
      "THEFT_COMMITTED",
      "THEFT_WITNESSED",
      "FOOD_DEPOSITED",
      "FOOD_WITHDRAWN",
      "MATERIAL_DEPOSITED",
      "STORAGE_SITE_STARTED",
      "STORAGE_WORK_ADVANCED",
      "STORAGE_COMPLETED",
      "SHELTER_SITE_SELECTED",
      "SHELTER_CONSTRUCTION_STARTED",
      "SHELTER_WORK_ADVANCED",
      "SHELTER_COMPLETED",
      "SHELTER_RESTED",
      "SHELTER_MAINTAINED",
      "SHELTER_CONDITION_LOW",
      "SHELTER_CONDITION_RECOVERED",
      "SHELTER_CROWDED",
      "SHELTER_GUEST_USED",
      "SHELTER_ABANDONED",
      "SHELTER_RELOCATED",
      "THREAT_NOTICED",
      "CONFRONTATION_APPROACHED",
      "CREATURE_ATTACKED",
      "CONFRONTATION_AFTERMATH",
      "CREATURE_FLED",
      "CREATURE_GUARDED",
      "CREATURE_JOINED_GROUP",
      "GROUP_FOUNDED",
      "LEADER_SELECTED",
      "LIFE_STAGE_CHANGED",
      "CRITICAL_HEALTH_STARTED",
      "CRITICAL_HEALTH_RECOVERED",
      "FAMILY_FORMED",
      "PREGNANCY_STARTED",
      "PREGNANCY_LOST",
      "CREATURE_BORN",
      "CARE_GIVEN",
      "CREATURE_DIED",
      "MEMORIAL_CREATED",
      "MOURNING_COMPLETED",
      "ESTATE_CLAIMED",
      "ESTATE_CLOSED",
      "GROUP_EXTINCT",
    ]);
    numberArray(event.actorIds, `${path}.actorIds`, 1);
    numberArray(event.targetIds, `${path}.targetIds`, 1);
    numberArray(event.groupIds, `${path}.groupIds`, 1);
    const tile = nullableInteger(event.locationTileIndex, `${path}.locationTileIndex`);
    if (tile !== null && tile >= tileCount) {
      fail(`${path}.locationTileIndex`, "is outside the world");
    }
    if (event.resourceKind !== null) {
      literal(event.resourceKind, `${path}.resourceKind`, ["FOOD", "MATERIAL", "WATER"]);
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
        "NO_WATER_SOURCE",
        "SOURCE_FULL",
        "SOURCE_EMPTY",
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
      "SHELTER_BUILT",
      "SETTLEMENT_RELOCATED",
      "SOCIAL_BOND",
      "THEFT",
      "CONFRONTATION",
      "HEALTH_CRISIS",
      "BIRTH",
      "DEATH",
      "MOURNING",
      "GROUP_EXTINCTION",
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
    "waterGathered",
    "waterDrunk",
    "waterShared",
    "severeThirstCreatureTicks",
    "waterGatherContentions",
    "thefts",
    "witnessedThefts",
    "attacks",
    "groupsFormed",
    "storagesCompleted",
    "sheltersCompleted",
    "shelteredRests",
    "outdoorRests",
    "shelterMaintenanceMaterial",
    "shelterDeniedClaims",
    "shelterGuestUses",
    "shelterRelocations",
    "playerInterventions",
    "invalidPathFailures",
    "interactionContentions",
    "failedInteractionClaims",
    "births",
    "deaths",
    "pregnanciesStarted",
    "pregnanciesLost",
    "careActions",
    "mournings",
    "estatesClaimed",
    "groupsExtinct",
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
    "maxLifeRecords",
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
    "maxLifeRecords",
  ] as const) {
    integer(configuration[key], `configuration.${key}`, 1, MAX_PERSISTED_COLLECTION_ITEMS);
  }
  if (configuration.maxLifeRecords !== MAX_TOTAL_IDENTITIES) {
    fail(
      "configuration.maxLifeRecords",
      `must preserve the total identity cap of ${MAX_TOTAL_IDENTITIES.toString()}`,
    );
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
    "scenario",
    "compiledMapHash",
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
    "lifeRecords",
    "memorials",
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
  assertScenarioReference(state.scenario);
  const seed = integer(state.seed, "seed", 0, 0xffffffff);
  const scenarioSeed = (state.scenario as { readonly seed: number }).seed;
  if (scenarioSeed !== seed) {
    fail("scenario.seed", "must equal the authoritative state seed");
  }
  const compiledMapHash = string(state.compiledMapHash, "compiledMapHash");
  if (!/^[0-9a-f]{16}$/u.test(compiledMapHash)) {
    fail("compiledMapHash", "must be a lowercase 64-bit hexadecimal hash");
  }
  const expectedCompiledMapHash = compileScenario(state.scenario).compiledMapHash;
  if (compiledMapHash !== expectedCompiledMapHash) {
    fail("compiledMapHash", `does not match scenario ${state.scenario.scenarioId}`);
  }
  const tick = integer(state.tick, "tick");
  integer(state.randomState, "randomState", 0, 0xffffffff);
  const { width, height, tileCount } = validateWorld(state.world);
  const creatureIds = validateCreatures(state.creatures, tileCount, width, height);
  const resourceIds = validateResourceNodes(state.resourceNodes, tileCount);
  const resourceNodes = array(state.resourceNodes, "resourceNodes");
  const worldTiles = array((state.world as UnknownRecord).tiles, "world.tiles");
  let waterSourceCount = 0;
  for (const [index, nodeValue] of resourceNodes.entries()) {
    const node = nodeValue as UnknownRecord;
    if (node.kind !== "WATER") continue;
    waterSourceCount += 1;
    const tile = worldTiles[node.tileIndex as number] as UnknownRecord | undefined;
    if (tile?.terrain !== "SHALLOW_WATER") {
      fail(
        `resourceNodes[${index.toString()}].tileIndex`,
        "must reference shallow-water terrain for a water source",
      );
    }
  }
  if (waterSourceCount === 0) {
    fail("resourceNodes", "must contain at least one water source");
  }
  const structureIds = validateStructures(state.structures, tileCount);
  const lifeRecordIds = validateLifeRecords(state.lifeRecords);
  const memorialIds = validateMemorials(state.memorials, tileCount);
  const entityIds = [...creatureIds, ...resourceIds, ...structureIds, ...memorialIds];
  assertUnique(entityIds, ENTITY_KEYS.join(", "));
  const identityIds = [...creatureIds, ...lifeRecordIds];
  assertUnique(identityIds, "creatures, lifeRecords");
  if (identityIds.length > MAX_TOTAL_IDENTITIES) {
    fail(
      "lifeRecords",
      `exceeds the total identity cap of ${MAX_TOTAL_IDENTITIES.toString()}`,
    );
  }
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
  const lifeRecords = array(state.lifeRecords, "lifeRecords");
  const memorials = array(state.memorials, "memorials");
  const groups = array(state.groups, "groups");
  const structures = array(state.structures, "structures");
  const relationships = array(state.relationships, "relationships");
  const memories = array(state.memories, "memories");
  const domainEvents = array(state.domainEvents, "domainEvents");
  const historyEvents = array(state.historyEvents, "historyEvents");
  const decisions = array(state.decisionRecords, "decisionRecords");
  const livingCount = creatures.filter(
    (value) => (value as UnknownRecord).alive === true,
  ).length;
  const reservedPregnancies = creatures.filter(
    (value) =>
      (value as UnknownRecord).alive === true &&
      (value as UnknownRecord).pregnancy !== null,
  ).length;
  if (livingCount + reservedPregnancies > MAX_LIVING_POPULATION) {
    fail(
      "creatures",
      `living population plus reserved pregnancies exceeds ${MAX_LIVING_POPULATION.toString()}`,
    );
  }
  const creatureSet = new Set(creatureIds);
  const identitySet = new Set(identityIds);
  const entitySet = new Set([...entityIds, ...lifeRecordIds]);
  const groupSet = new Set(groupIds);
  const structureSet = new Set(structureIds);
  const structureById = new Map(
    structures.map((value) => {
      const structure = value as UnknownRecord;
      return [structure.id as number, structure] as const;
    }),
  );
  const memorySet = new Set(memoryIds);
  const eventSet = new Set(eventIds);
  const decisionSet = new Set(decisionIds);
  const subjectSet = new Set([...entitySet, ...groupIds]);
  const configuration = state.configuration as UnknownRecord;
  const typedState = value as SimulationState;
  const historicalMemorialIds = new Set(
    domainEvents.flatMap((eventValue) => {
      const event = eventValue as UnknownRecord;
      return event.type === "MEMORIAL_CREATED" && Array.isArray(event.targetIds)
        ? (event.targetIds as number[]).slice(0, 1)
        : [];
    }),
  );

  for (const [index, creatureValue] of creatures.entries()) {
    const creature = creatureValue as UnknownRecord;
    const groupId = creature.groupId as number | null;
    if (groupId !== null && !groupSet.has(groupId)) {
      fail(
        `creatures[${index.toString()}].groupId`,
        `references missing ID ${groupId.toString()}`,
      );
    }
    for (const key of ["motherId", "fatherId", "caregiverId"] as const) {
      const relatedId = creature[key] as number | null;
      if (relatedId !== null && !identitySet.has(relatedId)) {
        fail(
          `creatures[${index.toString()}].${key}`,
          `references missing identity ${relatedId.toString()}`,
        );
      }
    }
    const pregnancy = creature.pregnancy as UnknownRecord | null;
    if (pregnancy !== null && !identitySet.has(pregnancy.fatherId as number)) {
      fail(
        `creatures[${index.toString()}].pregnancy.fatherId`,
        "references a missing identity",
      );
    }
    assertReferences(
      creature.mournedLifeRecordIds as number[],
      new Set(lifeRecordIds),
      `creatures[${index.toString()}].mournedLifeRecordIds`,
    );
    const criticalSinceTick = creature.criticalSinceTick as number | null;
    if (criticalSinceTick !== null && criticalSinceTick > tick) {
      fail(`creatures[${index.toString()}].criticalSinceTick`, "cannot be in the future");
    }
    if (criticalSinceTick !== null && (creature.health as number) > 1_200) {
      fail(
        `creatures[${index.toString()}].criticalSinceTick`,
        "requires health at or below 1200",
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
  for (const [index, recordValue] of lifeRecords.entries()) {
    const record = recordValue as UnknownRecord;
    for (const key of ["motherId", "fatherId", "heirId"] as const) {
      const relatedId = record[key] as number | null;
      if (relatedId !== null && !identitySet.has(relatedId)) {
        fail(
          `lifeRecords[${index.toString()}].${key}`,
          `references missing identity ${relatedId.toString()}`,
        );
      }
    }
    const finalGroupId = record.finalGroupId as number | null;
    if (finalGroupId !== null && !groupSet.has(finalGroupId)) {
      fail(`lifeRecords[${index.toString()}].finalGroupId`, "references a missing group");
    }
  }
  for (const [index, memorialValue] of memorials.entries()) {
    const memorial = memorialValue as UnknownRecord;
    if (!lifeRecordIds.includes(memorial.deceasedId as number)) {
      fail(`memorials[${index.toString()}].deceasedId`, "must reference a life record");
    }
    const heirId = memorial.heirId as number | null;
    if (heirId !== null && !identitySet.has(heirId)) {
      fail(`memorials[${index.toString()}].heirId`, "references a missing identity");
    }
    assertReferences(
      memorial.mournerIds as number[],
      identitySet,
      `memorials[${index.toString()}].mournerIds`,
    );
    assertReferences(
      memorial.completedMournerIds as number[],
      identitySet,
      `memorials[${index.toString()}].completedMournerIds`,
    );
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
    if (group.status === "EXTINCT") {
      if (
        (group.memberIds as number[]).length !== 0 ||
        leaderId !== null ||
        group.storageStructureId !== null ||
        group.activeShelterId !== null ||
        group.pendingShelterId !== null
      ) {
        fail(
          `groups[${index.toString()}]`,
          "must clear active membership and asset pointers when extinct",
        );
      }
      continue;
    }
    const storageId = group.storageStructureId as number | null;
    if (storageId !== null && !structureSet.has(storageId)) {
      fail(
        `groups[${index.toString()}].storageStructureId`,
        `references missing ID ${storageId.toString()}`,
      );
    }
    if (storageId !== null) {
      const storage = structureById.get(storageId);
      if (
        !storage ||
        storage.groupId !== group.id ||
        (storage.kind !== "STORAGE" && storage.kind !== "STORAGE_SITE")
      ) {
        fail(
          `groups[${index.toString()}].storageStructureId`,
          "must reference this group's storage or storage site",
        );
      }
    }
    if (group.stage === "PERSISTENT") {
      const storage = storageId === null ? null : structureById.get(storageId);
      if (!storage || storage.kind !== "STORAGE" || storage.completedTick === null) {
        fail(
          `groups[${index.toString()}].storageStructureId`,
          "must reference the completed shared store that made the group persistent",
        );
      }
    }
    const activeShelterId = group.activeShelterId as number | null;
    const pendingShelterId = group.pendingShelterId as number | null;
    const ownedShelters = structures
      .map((value) => value as UnknownRecord)
      .filter(
        (structure) =>
          structure.groupId === group.id &&
          (structure.kind === "SHELTER_SITE" ||
            structure.kind === "SHELTER" ||
            structure.kind === "ABANDONED_SHELTER"),
      );
    const activeShelters = ownedShelters.filter(
      (structure) => structure.kind === "SHELTER",
    );
    const pendingShelters = ownedShelters.filter(
      (structure) => structure.kind === "SHELTER_SITE",
    );
    const abandonedShelters = ownedShelters.filter(
      (structure) => structure.kind === "ABANDONED_SHELTER",
    );
    if (activeShelters.length > 1 || pendingShelters.length > 1) {
      fail(
        `groups[${index.toString()}]`,
        "may own at most one active shelter and one pending shelter site",
      );
    }
    if (
      (activeShelters[0]?.id ?? null) !== activeShelterId ||
      (pendingShelters[0]?.id ?? null) !== pendingShelterId
    ) {
      fail(
        `groups[${index.toString()}]`,
        "shelter pointers must account for every active shelter and shelter site",
      );
    }
    if (activeShelterId !== null) {
      const activeShelter = structureById.get(activeShelterId);
      if (
        !activeShelter ||
        activeShelter.groupId !== group.id ||
        activeShelter.kind !== "SHELTER"
      ) {
        fail(
          `groups[${index.toString()}].activeShelterId`,
          "must reference this group's active shelter",
        );
      }
      if (group.stage !== "PERSISTENT") {
        fail(`groups[${index.toString()}].activeShelterId`, "requires a persistent group");
      }
      if (activeShelter?.tileIndex !== group.homeTileIndex) {
        fail(
          `groups[${index.toString()}].homeTileIndex`,
          "must equal the active shelter tile",
        );
      }
      if (
        activeShelter?.completedTick === null ||
        (group.shelterCommitUntilTick as number) !==
          (activeShelter?.completedTick as number) + SHELTER_MINIMUM_COMMITMENT_TICKS
      ) {
        fail(
          `groups[${index.toString()}].shelterCommitUntilTick`,
          "must preserve the active shelter's minimum commitment period",
        );
      }
    } else if (group.shelterCommitUntilTick !== 0) {
      fail(
        `groups[${index.toString()}].shelterCommitUntilTick`,
        "must be zero before the first shelter is completed",
      );
    }
    if (pendingShelterId !== null) {
      const pendingShelter = structureById.get(pendingShelterId);
      if (
        !pendingShelter ||
        pendingShelter.groupId !== group.id ||
        pendingShelter.kind !== "SHELTER_SITE"
      ) {
        fail(
          `groups[${index.toString()}].pendingShelterId`,
          "must reference this group's pending shelter site",
        );
      }
      if (group.stage !== "PERSISTENT") {
        fail(`groups[${index.toString()}].pendingShelterId`, "requires a persistent group");
      }
      if (
        pendingShelter.builtFromShelterId !== null &&
        ((pendingShelter.siteAssessment as UnknownRecord).selectedAtTick as number) <
          (group.shelterCommitUntilTick as number)
      ) {
        fail(
          `groups[${index.toString()}].pendingShelterId`,
          "cannot begin a replacement before the minimum shelter commitment",
        );
      }
    }
    if (activeShelterId !== null && activeShelterId === pendingShelterId) {
      fail(`groups[${index.toString()}]`, "cannot use one shelter as active and pending");
    }
    const relocations = group.shelterRelocations as number;
    if (relocations === 0 && abandonedShelters.length > 0) {
      fail(
        `groups[${index.toString()}].shelterRelocations`,
        "must account for its abandoned shelter",
      );
    }
    if (relocations === 1) {
      if (
        abandonedShelters.length !== 1 ||
        activeShelterId === null ||
        pendingShelterId !== null ||
        group.shelterRelocationCandidate !== null
      ) {
        fail(
          `groups[${index.toString()}]`,
          "must retain one active and one abandoned shelter after its only relocation",
        );
      }
      const active = structureById.get(activeShelterId);
      if (active?.builtFromShelterId !== abandonedShelters[0]?.id) {
        fail(
          `groups[${index.toString()}].activeShelterId`,
          "must identify the abandoned shelter it replaced",
        );
      }
    }
    if (relocations === 0 && activeShelterId !== null) {
      const active = structureById.get(activeShelterId);
      if (active?.builtFromShelterId !== null) {
        fail(
          `groups[${index.toString()}].activeShelterId`,
          "cannot claim a prior shelter before relocation",
        );
      }
    }
    if (pendingShelterId !== null) {
      const pending = structureById.get(pendingShelterId);
      if (pending?.builtFromShelterId !== activeShelterId) {
        fail(
          `groups[${index.toString()}].pendingShelterId`,
          "must identify the active shelter it will replace, or null for the first home",
        );
      }
    }
    if (group.shelterRelocationCandidate !== null) {
      if (activeShelterId === null || pendingShelterId !== null || relocations !== 0) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate`,
          "requires one committed active shelter and no pending replacement",
        );
      }
      const candidate = group.shelterRelocationCandidate as UnknownRecord;
      if (candidate.tileIndex === group.homeTileIndex) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate.tileIndex`,
          "must differ from the current home",
        );
      }
      const firstSeenTick = candidate.firstSeenTick as number;
      const lastEvaluatedTick = candidate.lastEvaluatedTick as number;
      const consecutiveEvaluations = candidate.consecutiveEvaluations as number;
      if (
        firstSeenTick > lastEvaluatedTick ||
        lastEvaluatedTick > tick ||
        tick - lastEvaluatedTick > 50
      ) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate`,
          "must contain ordered, current evaluation ticks",
        );
      }
      if (firstSeenTick % 50 !== 0 || lastEvaluatedTick % 50 !== 0) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate`,
          "must use the deterministic 50-tick shelter evaluation cadence",
        );
      }
      if (lastEvaluatedTick - firstSeenTick !== (consecutiveEvaluations - 1) * 50) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate.consecutiveEvaluations`,
          "must exactly match the elapsed shelter evaluations",
        );
      }
      if ((candidate.scoreImprovement as number) < SHELTER_RELOCATION_MINIMUM_IMPROVEMENT) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate.scoreImprovement`,
          `must be at least ${SHELTER_RELOCATION_MINIMUM_IMPROVEMENT.toString()}`,
        );
      }
      if (tick < (group.shelterCommitUntilTick as number)) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate`,
          "cannot become relocation-ready before the minimum shelter commitment",
        );
      }
      const candidateTileIndex = candidate.tileIndex as number;
      const candidateCost = weightedTravelCostsFrom(
        typedState.world,
        group.homeTileIndex as number,
      )[candidateTileIndex];
      if (
        !isLegalShelterSite(typedState, candidateTileIndex) ||
        candidateCost === undefined ||
        candidateCost >= UNREACHABLE_TRAVEL_COST
      ) {
        fail(
          `groups[${index.toString()}].shelterRelocationCandidate.tileIndex`,
          "must remain a legal, reachable candidate from the bounded site set",
        );
      }
      if (lastEvaluatedTick === tick) {
        const typedGroup = typedState.groups.find(
          (candidateGroup) => candidateGroup.id === group.id,
        );
        const activeShelter = typedState.structures.find(
          (structure) => structure.id === activeShelterId,
        );
        const currentBest = typedGroup
          ? rankShelterSites(typedState, typedGroup, true)[0]
          : null;
        const currentImprovement =
          typedGroup && activeShelter?.kind === "SHELTER" && currentBest
            ? assessShelterSite(typedState, typedGroup, activeShelter.tileIndex, false)
                .totalScore - currentBest.assessment.totalScore
            : Number.NEGATIVE_INFINITY;
        if (
          !currentBest ||
          currentBest.tileIndex !== candidateTileIndex ||
          currentImprovement !== candidate.scoreImprovement
        ) {
          fail(
            `groups[${index.toString()}].shelterRelocationCandidate`,
            "must match the current deterministic best site and factual score improvement",
          );
        }
      }
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
    const builtFromShelterId = structure.builtFromShelterId as number | null | undefined;
    if (
      builtFromShelterId !== null &&
      builtFromShelterId !== undefined &&
      !structureSet.has(builtFromShelterId)
    ) {
      fail(
        `structures[${index.toString()}].builtFromShelterId`,
        "references a missing shelter",
      );
    }
    if (
      structure.kind === "SHELTER_SITE" ||
      structure.kind === "SHELTER" ||
      structure.kind === "ABANDONED_SHELTER"
    ) {
      const owner = groups
        .map((value) => value as UnknownRecord)
        .find((group) => group.id === structure.groupId);
      if (owner?.stage !== "PERSISTENT") {
        fail(
          `structures[${index.toString()}].groupId`,
          "must belong to a persistent group",
        );
      }
      if (builtFromShelterId !== null && builtFromShelterId !== undefined) {
        const builtFrom = structureById.get(builtFromShelterId);
        if (
          !builtFrom ||
          builtFrom.groupId !== structure.groupId ||
          (structure.kind === "SHELTER_SITE"
            ? builtFrom.kind !== "SHELTER"
            : structure.kind === "SHELTER"
              ? builtFrom.kind !== "ABANDONED_SHELTER"
              : true)
        ) {
          fail(
            `structures[${index.toString()}].builtFromShelterId`,
            "must reference the same group's appropriate shelter lifecycle predecessor",
          );
        }
      }
      const completedTick = structure.completedTick as number | null;
      const assessment = structure.siteAssessment as UnknownRecord;
      if (completedTick !== null && (assessment.selectedAtTick as number) > completedTick) {
        fail(
          `structures[${index.toString()}].siteAssessment.selectedAtTick`,
          "cannot be later than shelter completion",
        );
      }
      if (
        (completedTick !== null && completedTick > tick) ||
        (assessment.selectedAtTick as number) > tick ||
        (structure.lastMaintainedTick !== null &&
          (structure.lastMaintainedTick as number) > tick) ||
        (structure.lastUsedTick !== null && (structure.lastUsedTick as number) > tick)
      ) {
        fail(`structures[${index.toString()}]`, "contains shelter facts from the future");
      }
    }
  }
  const shelterEndpointOwners = new Map<number, number>();
  for (const structure of typedState.structures) {
    if (
      structure.kind !== "SHELTER_SITE" &&
      structure.kind !== "SHELTER" &&
      structure.kind !== "ABANDONED_SHELTER"
    ) {
      continue;
    }
    if (
      structure.kind !== "ABANDONED_SHELTER" &&
      !isLegalShelterSite(typedState, structure.tileIndex, structure.id)
    ) {
      fail(
        "structures",
        `shelter ${structure.id.toString()} does not retain a legal six-place rest footprint`,
      );
    }
    const center = tileCoordinates(typedState.world, structure.tileIndex);
    for (const [offsetX, offsetY] of SHELTER_REST_OFFSETS) {
      const endpoint = tileIndexAt(
        typedState.world,
        center.x + offsetX,
        center.y + offsetY,
      );
      const owner = shelterEndpointOwners.get(endpoint);
      if (owner !== undefined) {
        fail(
          "structures",
          `shelters ${owner.toString()} and ${structure.id.toString()} have overlapping rest footprints`,
        );
      }
      shelterEndpointOwners.set(endpoint, structure.id);
    }
  }
  for (const [index, edgeValue] of relationships.entries()) {
    const edge = edgeValue as UnknownRecord;
    assertReferences(
      [edge.fromId as number, edge.toId as number],
      identitySet,
      `relationships[${index.toString()}]`,
    );
  }
  for (const [index, memoryValue] of memories.entries()) {
    const memory = memoryValue as UnknownRecord;
    assertReferences(
      [memory.ownerId as number],
      identitySet,
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
      identitySet,
      `domainEvents[${index.toString()}].actorIds`,
    );
    for (const targetId of event.targetIds as number[]) {
      if (!entitySet.has(targetId) && !historicalMemorialIds.has(targetId)) {
        fail(
          `domainEvents[${index.toString()}].targetIds`,
          `references missing ID ${targetId.toString()}`,
        );
      }
    }
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
      identitySet,
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
      identitySet,
      `decisionRecords[${index.toString()}].actorId`,
    );
    const targetId = decision.selectedTargetId as number | null;
    if (
      targetId !== null &&
      !entitySet.has(targetId) &&
      !historicalMemorialIds.has(targetId)
    ) {
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
