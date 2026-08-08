import { desireForAction, desireStrength, planForAction } from "./desires.js";
import { classifyAttentionTier, createEventClusterKey } from "./event-attention.js";
import { claimInteractionSlot, requiresInteractionClaim } from "./interaction-slots.js";
import { findPath } from "./pathfinding.js";
import { MAX_TOTAL_IDENTITIES, lifeStageForAge } from "./lifecycle.js";
import { naturalLifespanTicksFor } from "./rng.js";
import { selectStrongestReason } from "./reason-facts.js";
import type {
  ActionKind,
  DecisionCandidate,
  DecisionRecord,
  DomainEvent,
  SimulationState,
  UtilityFactor,
} from "./types.js";
import { SIMULATION_STATE_VERSION } from "./versions.js";
import {
  compileScenario,
  createScenarioReference,
  isScenarioId,
  type ScenarioId,
} from "./scenarios/index.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Legacy simulation state ${key} must be an array.`);
  }
  return value;
}

function legacySeed(state: UnknownRecord): number {
  const seed = state.seed;
  if (
    typeof seed !== "number" ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffff_ffff
  ) {
    throw new Error("Legacy simulation state seed must be an unsigned 32-bit integer.");
  }
  return seed;
}

function legacyScenarioId(state: UnknownRecord): ScenarioId {
  if (state.schemaVersion !== 3) return "petri-world";
  const scenario = state.scenario;
  if (!isRecord(scenario)) {
    throw new Error("Phase 3 simulation state scenario must be an object.");
  }
  if (
    scenario.kind !== "tiny-civilisation/scenario" ||
    scenario.schemaVersion !== 2 ||
    scenario.behaviorVersion !== 3 ||
    scenario.scenarioVersion !== 1 ||
    scenario.mapGenerationVersion !== 1 ||
    !isScenarioId(scenario.scenarioId) ||
    scenario.seed !== legacySeed(state)
  ) {
    throw new Error(
      "Phase 3 simulation state must use the behavior 3 / state 3 / scenario 1 compatibility tuple.",
    );
  }
  return scenario.scenarioId;
}

function resolveInventoryOverflow(inventory: UnknownRecord): void {
  const capacity = inventory.capacity;
  const food = inventory.food;
  const material = inventory.material;
  const water = inventory.water;
  if (
    typeof capacity !== "number" ||
    !Number.isSafeInteger(capacity) ||
    typeof food !== "number" ||
    !Number.isSafeInteger(food) ||
    typeof material !== "number" ||
    !Number.isSafeInteger(material) ||
    typeof water !== "number" ||
    !Number.isSafeInteger(water)
  ) {
    return;
  }
  let overflow = Math.max(0, food + material + water - capacity);
  const droppedMaterial = Math.min(material, overflow);
  inventory.material = material - droppedMaterial;
  overflow -= droppedMaterial;
  const droppedWater = Math.min(water, overflow);
  inventory.water = water - droppedWater;
  overflow -= droppedWater;
  inventory.food = Math.max(0, food - overflow);
}

function upgradeHydrationState(state: UnknownRecord, scenarioId: ScenarioId): void {
  const seed = legacySeed(state);
  const scenario = createScenarioReference(scenarioId, seed);
  const compiled = compileScenario(scenario);
  const resources = requireArray(state, "resourceNodes");
  if (resources.some((resource) => isRecord(resource) && resource.kind === "WATER")) {
    throw new Error("Legacy simulation state unexpectedly contains water resources.");
  }
  const creatures = requireArray(state, "creatures");
  const structures = requireArray(state, "structures");
  const metrics = state.metrics;
  if (!isRecord(metrics)) {
    throw new Error("Legacy simulation state metrics must be an object.");
  }
  const nextEntityId = state.nextEntityId;
  if (
    typeof nextEntityId !== "number" ||
    !Number.isSafeInteger(nextEntityId) ||
    nextEntityId < 1
  ) {
    throw new Error("Legacy simulation state nextEntityId must be positive.");
  }
  let entityId = nextEntityId;
  const addedWaterIds: number[] = [];
  for (const prototype of compiled.resourceNodes) {
    if (prototype.kind !== "WATER") continue;
    const id = entityId++;
    addedWaterIds.push(id);
    resources.push({
      id,
      kind: prototype.kind,
      tileIndex: prototype.y * compiled.world.width + prototype.x,
      currentStock: prototype.currentStock,
      maximumStock: prototype.maximumStock,
      regenerationEveryTicks: prototype.regenerationEveryTicks,
      regenerationAmount: prototype.regenerationAmount,
    });
  }
  state.nextEntityId = entityId;

  for (const creatureValue of creatures) {
    if (!isRecord(creatureValue)) throw new Error("Legacy creature must be an object.");
    const needs = creatureValue.needs;
    const inventory = creatureValue.inventory;
    const actionCounts = creatureValue.actionCounts;
    if (!isRecord(needs) || !isRecord(inventory) || !isRecord(actionCounts)) {
      throw new Error("Legacy creature hydration fields must be objects.");
    }
    needs.thirst = 2_500;
    inventory.water = 0;
    resolveInventoryOverflow(inventory);
    actionCounts.GATHER_WATER = 0;
    actionCounts.DRINK = 0;
    actionCounts.SHARE_WATER = 0;
  }
  for (const structureValue of structures) {
    if (!isRecord(structureValue) || !isRecord(structureValue.inventory)) {
      throw new Error("Legacy structure inventory must be an object.");
    }
    structureValue.inventory.water = 0;
    resolveInventoryOverflow(structureValue.inventory);
  }
  metrics.waterGathered = 0;
  metrics.waterDrunk = 0;
  metrics.waterShared = 0;
  metrics.severeThirstCreatureTicks = 0;
  metrics.waterGatherContentions = 0;

  const events = requireArray(state, "domainEvents");
  const nextEventId = state.nextEventId;
  const tick = state.tick;
  if (
    typeof nextEventId !== "number" ||
    !Number.isSafeInteger(nextEventId) ||
    nextEventId < 1 ||
    typeof tick !== "number" ||
    !Number.isSafeInteger(tick) ||
    tick < 0
  ) {
    throw new Error("Legacy simulation state event counters must be valid integers.");
  }
  events.push({
    id: nextEventId,
    tick,
    type: "HYDRATION_RULES_ENABLED",
    actorIds: [],
    targetIds: addedWaterIds,
    groupIds: [],
    locationTileIndex: null,
    resourceKind: "WATER",
    quantity: addedWaterIds.length,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 45,
    attentionTier: "NOTABLE",
    clusterKey: "world:hydration-rules-enabled",
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary:
      "Hydration rules began when this save was upgraded; no water history exists before this tick.",
  });
  state.nextEventId = nextEventId + 1;
  state.scenario = { ...scenario };
  state.compiledMapHash = compiled.compiledMapHash;
  // Hydration was the authoritative v4 boundary. Shelter migration is kept
  // separate so v4 saves receive one truthful Phase 4.2 enable event.
  state.schemaVersion = 4;
}

function phaseFourScenarioId(state: UnknownRecord): ScenarioId {
  const scenario = state.scenario;
  if (!isRecord(scenario) || !isScenarioId(scenario.scenarioId)) {
    throw new Error("Phase 4 simulation state scenario must be a known scenario.");
  }
  if (
    scenario.kind !== "tiny-civilisation/scenario" ||
    scenario.schemaVersion !== 2 ||
    scenario.behaviorVersion !== 4 ||
    scenario.scenarioVersion !== 2 ||
    scenario.mapGenerationVersion !== 1 ||
    scenario.seed !== legacySeed(state)
  ) {
    throw new Error(
      "Phase 4 simulation state must use the scenario 2 / map-generation 1 compatibility tuple.",
    );
  }
  return scenario.scenarioId;
}

function upgradeShelterState(state: UnknownRecord, scenarioId: ScenarioId): void {
  const structures = requireArray(state, "structures");
  if (
    structures.some(
      (structure) =>
        isRecord(structure) &&
        (structure.kind === "SHELTER_SITE" ||
          structure.kind === "SHELTER" ||
          structure.kind === "ABANDONED_SHELTER"),
    )
  ) {
    throw new Error("Legacy simulation state unexpectedly contains shelters.");
  }
  let retainedOutdoorRests = 0;
  for (const creatureValue of requireArray(state, "creatures")) {
    if (!isRecord(creatureValue) || !isRecord(creatureValue.actionCounts)) {
      throw new Error("Legacy creature shelter fields must be objects.");
    }
    const retainedRestCount = creatureValue.actionCounts.REST;
    if (typeof retainedRestCount === "number" && Number.isSafeInteger(retainedRestCount)) {
      retainedOutdoorRests += Math.max(0, retainedRestCount);
    }
    creatureValue.actionCounts.ESTABLISH_SHELTER_SITE = 0;
    creatureValue.actionCounts.BUILD_SHELTER = 0;
    creatureValue.actionCounts.REST_SHELTERED = 0;
    creatureValue.actionCounts.MAINTAIN_SHELTER = 0;
  }
  for (const groupValue of requireArray(state, "groups")) {
    if (!isRecord(groupValue)) throw new Error("Legacy group must be an object.");
    groupValue.activeShelterId = null;
    groupValue.pendingShelterId = null;
    groupValue.shelterRelocations = 0;
    groupValue.shelterCommitUntilTick = 0;
    groupValue.shelterRelocationCandidate = null;
  }
  const metrics = state.metrics;
  if (!isRecord(metrics))
    throw new Error("Legacy simulation state metrics must be an object.");
  metrics.sheltersCompleted = 0;
  metrics.shelteredRests = 0;
  metrics.outdoorRests = retainedOutdoorRests;
  metrics.shelterMaintenanceMaterial = 0;
  metrics.shelterDeniedClaims = 0;
  metrics.shelterGuestUses = 0;
  metrics.shelterRelocations = 0;

  const nextEventId = state.nextEventId;
  const tick = state.tick;
  if (
    typeof nextEventId !== "number" ||
    !Number.isSafeInteger(nextEventId) ||
    nextEventId < 1 ||
    typeof tick !== "number" ||
    !Number.isSafeInteger(tick) ||
    tick < 0
  ) {
    throw new Error("Legacy simulation state event counters must be valid integers.");
  }
  requireArray(state, "domainEvents").push({
    id: nextEventId,
    tick,
    type: "SHELTER_RULES_ENABLED",
    actorIds: [],
    targetIds: [],
    groupIds: [],
    locationTileIndex: null,
    resourceKind: null,
    quantity: 0,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 45,
    attentionTier: "NOTABLE",
    clusterKey: "world:shelter-rules-enabled",
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary:
      "Shelter and settlement rules began when this save was upgraded; no shelter history exists before this tick.",
  });
  state.nextEventId = nextEventId + 1;
  const scenario = createScenarioReference(scenarioId, legacySeed(state));
  state.scenario = { ...scenario };
  state.compiledMapHash = compileScenario(scenario).compiledMapHash;
  state.schemaVersion = 5;
}

function phaseFiveScenarioId(state: UnknownRecord): ScenarioId {
  const scenario = state.scenario;
  if (!isRecord(scenario) || !isScenarioId(scenario.scenarioId)) {
    throw new Error("Phase 4.2 simulation state scenario must be a known scenario.");
  }
  if (
    scenario.kind !== "tiny-civilisation/scenario" ||
    scenario.schemaVersion !== 2 ||
    scenario.behaviorVersion !== 5 ||
    scenario.scenarioVersion !== 2 ||
    scenario.mapGenerationVersion !== 1 ||
    scenario.seed !== legacySeed(state)
  ) {
    throw new Error(
      "Phase 4.2 simulation state must use the behavior 5 / state 5 / scenario 2 compatibility tuple.",
    );
  }
  return scenario.scenarioId;
}

const LEGACY_FOUNDER_SEX = [
  "FEMALE",
  "MALE",
  "FEMALE",
  "MALE",
  "FEMALE",
  "MALE",
  "FEMALE",
  "MALE",
] as const;

const LEGACY_FOUNDER_AGE = [
  10_500, 8_000, 15_500, 11_500, 9_500, 13_000, 7_500, 8_500,
] as const;

function upgradeLifecycleState(state: UnknownRecord, scenarioId: ScenarioId): void {
  const seed = legacySeed(state);
  const tick = state.tick;
  if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 0) {
    throw new Error("Legacy simulation state tick must be a non-negative integer.");
  }
  const creatures = requireArray(state, "creatures");
  const groups = requireArray(state, "groups");
  const metrics = state.metrics;
  const configuration = state.configuration;
  if (!isRecord(metrics) || !isRecord(configuration)) {
    throw new Error("Legacy lifecycle metrics and configuration must be objects.");
  }
  const lifeRecords: UnknownRecord[] = [];
  const livingIds = new Set<number>();
  const orderedCreatures = [...creatures].sort((left, right) => {
    const leftId = isRecord(left) && typeof left.id === "number" ? left.id : 0;
    const rightId = isRecord(right) && typeof right.id === "number" ? right.id : 0;
    return leftId - rightId;
  });
  for (const [index, creatureValue] of orderedCreatures.entries()) {
    if (!isRecord(creatureValue) || typeof creatureValue.id !== "number") {
      throw new Error("Legacy creature must be an object with an ID.");
    }
    const id = creatureValue.id;
    const baseAge = LEGACY_FOUNDER_AGE[index % LEGACY_FOUNDER_AGE.length] ?? 8_500;
    const lifespan = naturalLifespanTicksFor(seed, id);
    const ageTicks = Math.min(baseAge + tick, lifespan - 1_000);
    const traits = isRecord(creatureValue.traits) ? creatureValue.traits : {};
    const skills = isRecord(creatureValue.skills) ? creatureValue.skills : {};
    creatureValue.sex = LEGACY_FOUNDER_SEX[index % LEGACY_FOUNDER_SEX.length] ?? "FEMALE";
    creatureValue.ageTicks = ageTicks;
    creatureValue.lifeStage = lifeStageForAge(ageTicks);
    creatureValue.naturalLifespanTicks = lifespan;
    creatureValue.birthTick = tick - ageTicks;
    creatureValue.motherId = null;
    creatureValue.fatherId = null;
    creatureValue.caregiverId = null;
    creatureValue.dependentUntilTick = null;
    creatureValue.criticalSinceTick = null;
    creatureValue.criticalDamage = null;
    creatureValue.traitPotential = {
      generosity: traits.generosity ?? 5_000,
      aggression: traits.aggression ?? 5_000,
      sociability: traits.sociability ?? 5_000,
      loyalty: traits.loyalty ?? 5_000,
    };
    creatureValue.skillPotential = {
      foraging: skills.foraging ?? 5_000,
      combat: skills.combat ?? 5_000,
    };
    creatureValue.pregnancy = null;
    creatureValue.reproductionCooldownUntilTick = 0;
    creatureValue.death = null;
    creatureValue.mournedLifeRecordIds = [];
    creatureValue.majorLifeEventIds = [];
    if (!isRecord(creatureValue.actionCounts)) {
      throw new Error("Legacy creature actionCounts must be an object.");
    }
    creatureValue.actionCounts.FORM_FAMILY = 0;
    creatureValue.actionCounts.CARE_FOR_YOUNG = 0;
    creatureValue.actionCounts.MOURN = 0;
    creatureValue.actionCounts.CLAIM_ESTATE = 0;
    if (creatureValue.alive === false) {
      lifeRecords.push({
        id,
        name: creatureValue.name,
        color: creatureValue.color,
        sex: creatureValue.sex,
        motherId: null,
        fatherId: null,
        birthTick: creatureValue.birthTick,
        deathTick: -1,
        ageTicks,
        finalLifeStage: creatureValue.lifeStage,
        deathCause: "LEGACY_UNKNOWN",
        finalGroupId: creatureValue.groupId ?? null,
        traitPotential: { ...(creatureValue.traitPotential as UnknownRecord) },
        skillPotential: { ...(creatureValue.skillPotential as UnknownRecord) },
        majorEventIds: [],
        heirId: null,
      });
    } else {
      livingIds.add(id);
    }
  }
  state.creatures = orderedCreatures.filter(
    (creature) => isRecord(creature) && creature.alive !== false,
  );
  state.lifeRecords = lifeRecords;
  state.memorials = [];
  for (const groupValue of groups) {
    if (!isRecord(groupValue)) throw new Error("Legacy group must be an object.");
    groupValue.status = "ACTIVE";
    groupValue.extinctTick = null;
    if (Array.isArray(groupValue.memberIds)) {
      groupValue.memberIds = groupValue.memberIds.filter(
        (id): id is number => typeof id === "number" && livingIds.has(id),
      );
    }
    if (typeof groupValue.leaderId === "number" && !livingIds.has(groupValue.leaderId)) {
      groupValue.leaderId = null;
    }
  }
  metrics.births = 0;
  metrics.deaths = 0;
  metrics.pregnanciesStarted = 0;
  metrics.pregnanciesLost = 0;
  metrics.careActions = 0;
  metrics.mournings = 0;
  metrics.estatesClaimed = 0;
  metrics.groupsExtinct = 0;
  configuration.maxLifeRecords = MAX_TOTAL_IDENTITIES;
  const nextEventId = state.nextEventId;
  if (typeof nextEventId !== "number" || !Number.isSafeInteger(nextEventId)) {
    throw new Error("Legacy simulation state nextEventId must be an integer.");
  }
  requireArray(state, "domainEvents").push({
    id: nextEventId,
    tick,
    type: "LIFECYCLE_RULES_ENABLED",
    actorIds: [],
    targetIds: [],
    groupIds: [],
    locationTileIndex: null,
    resourceKind: null,
    quantity: lifeRecords.length,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 45,
    attentionTier: "NOTABLE",
    clusterKey: "world:lifecycle-rules-enabled",
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary:
      "Lifecycle rules began when this save was upgraded; legacy deaths retain unknown timing and no pregnancy or lineage history was invented.",
  });
  state.nextEventId = nextEventId + 1;
  const scenario = createScenarioReference(scenarioId, seed);
  state.scenario = { ...scenario };
  state.compiledMapHash = compileScenario(scenario).compiledMapHash;
  state.schemaVersion = SIMULATION_STATE_VERSION;
}

function enrichFactor(factor: UnknownRecord): UtilityFactor {
  const key = typeof factor.key === "string" ? factor.key : "retained factor";
  const contribution =
    typeof factor.contribution === "number" ? Math.round(factor.contribution) : 0;
  const evidenceEventIds = Array.isArray(factor.evidenceEventIds)
    ? factor.evidenceEventIds.filter(
        (value): value is number => Number.isSafeInteger(value) && value > 0,
      )
    : [];
  // V1 retained utility scores but not the source measurements behind them.
  // Reconstructing a value from the load-time creature state would fabricate
  // a historical observation, so migrated factors remain explicitly unknown.
  return { key, contribution, evidenceEventIds, fact: null };
}

function enrichDecision(state: SimulationState, value: UnknownRecord): DecisionRecord {
  const actor = state.creatures.find((creature) => creature.id === value.actorId);
  if (!actor) throw new Error("Legacy decision references a missing actor.");
  const candidates = (Array.isArray(value.candidates) ? value.candidates : []).map(
    (candidateValue): DecisionCandidate => {
      if (!isRecord(candidateValue) || typeof candidateValue.action !== "string") {
        throw new Error("Legacy decision contains an invalid candidate.");
      }
      const action = candidateValue.action as ActionKind;
      const targetEntityId =
        typeof candidateValue.targetEntityId === "number"
          ? candidateValue.targetEntityId
          : null;
      const factors = (
        Array.isArray(candidateValue.factors) ? candidateValue.factors : []
      ).map((factorValue) => enrichFactor(isRecord(factorValue) ? factorValue : {}));
      return {
        action,
        desire: desireForAction(state, actor, action),
        plan: planForAction(action),
        targetEntityId,
        targetTileIndex:
          typeof candidateValue.targetTileIndex === "number"
            ? candidateValue.targetTileIndex
            : null,
        utility:
          typeof candidateValue.utility === "number"
            ? Math.round(candidateValue.utility)
            : factors.reduce((total, factor) => total + factor.contribution, 0),
        factors,
      };
    },
  );
  const selectedAction = value.selectedAction as ActionKind;
  const selected =
    candidates.find(
      (candidate) =>
        candidate.action === selectedAction &&
        candidate.targetEntityId ===
          (typeof value.selectedTargetId === "number" ? value.selectedTargetId : null),
    ) ?? candidates[0];
  if (!selected) throw new Error("Legacy decision has no candidate.");
  return {
    ...(value as unknown as DecisionRecord),
    selectedDesire: selected.desire,
    selectedPlan: selected.plan,
    strongestReason: selectStrongestReason(selected.factors),
    candidates,
  };
}

function enrichEvent(value: UnknownRecord): DomainEvent {
  const importance = typeof value.importance === "number" ? value.importance : 10;
  const event = {
    ...(value as unknown as DomainEvent),
    attentionTier: classifyAttentionTier(importance),
    clusterKey: "",
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
  };
  event.clusterKey = createEventClusterKey(event);
  return event;
}

/** Deterministically upgrades the authoritative v1 shape without claiming v1 hash parity. */
export function migrateSimulationState(value: unknown): SimulationState {
  if (!isRecord(value)) throw new Error("Simulation state must be an object.");
  if (value.schemaVersion === SIMULATION_STATE_VERSION) {
    return value as unknown as SimulationState;
  }
  if (value.schemaVersion === 5) {
    const migrated = cloneJson(value);
    if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
    upgradeLifecycleState(migrated, phaseFiveScenarioId(migrated));
    return migrated as unknown as SimulationState;
  }
  if (value.schemaVersion === 4) {
    const migrated = cloneJson(value);
    if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
    upgradeShelterState(migrated, phaseFourScenarioId(migrated));
    upgradeLifecycleState(migrated, phaseFourScenarioId(value));
    return migrated as unknown as SimulationState;
  }
  if (value.schemaVersion === 3) {
    const migrated = cloneJson(value);
    if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
    const scenarioId = legacyScenarioId(migrated);
    upgradeHydrationState(migrated, scenarioId);
    upgradeShelterState(migrated, scenarioId);
    upgradeLifecycleState(migrated, scenarioId);
    return migrated as unknown as SimulationState;
  }
  if (value.schemaVersion === 2) {
    const migrated = cloneJson(value);
    if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
    upgradeHydrationState(migrated, "petri-world");
    upgradeShelterState(migrated, "petri-world");
    upgradeLifecycleState(migrated, "petri-world");
    return migrated as unknown as SimulationState;
  }
  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported simulation state version ${String(value.schemaVersion)}; expected 1, 2, 3, 4, 5, or ${SIMULATION_STATE_VERSION}.`,
    );
  }
  const migrated = cloneJson(value);
  if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
  migrated.schemaVersion = 2;
  const creatures = requireArray(migrated, "creatures");
  const decisions = requireArray(migrated, "decisionRecords");
  const events = requireArray(migrated, "domainEvents");
  const configuration = migrated.configuration;
  if (!isRecord(configuration)) {
    throw new Error("Legacy simulation state configuration must be an object.");
  }
  configuration.maxIntentHistoryPerCreature = 32;
  configuration.maxRouteSamplesPerCreature = 24;
  const metrics = migrated.metrics;
  if (!isRecord(metrics)) {
    throw new Error("Legacy simulation state metrics must be an object.");
  }
  metrics.interactionContentions = 0;
  metrics.failedInteractionClaims = 0;

  for (const creatureValue of creatures) {
    if (!isRecord(creatureValue)) throw new Error("Legacy creature must be an object.");
    creatureValue.activeDesire = null;
    creatureValue.activePlan = null;
    creatureValue.intentHistory = [];
    creatureValue.recentRoute = [
      {
        tick: typeof migrated.tick === "number" ? migrated.tick : 0,
        tileIndex: creatureValue.tileIndex,
        x: creatureValue.x,
        y: creatureValue.y,
      },
    ];
    const activeAction = creatureValue.activeAction;
    if (isRecord(activeAction)) activeAction.interactionClaim = null;
  }
  const state = migrated as unknown as SimulationState;
  state.domainEvents = events.map((event) => enrichEvent(isRecord(event) ? event : {}));
  state.decisionRecords = decisions.map((decision) =>
    enrichDecision(state, isRecord(decision) ? decision : {}),
  );

  for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
    const action = creature.activeAction;
    const goal = creature.activeGoal;
    if (!action || !goal) continue;
    const decision = state.decisionRecords.find(
      (record) => record.id === goal.decisionRecordId,
    );
    const desire =
      decision?.selectedDesire ?? desireForAction(state, creature, action.kind);
    const plan = decision?.selectedPlan ?? planForAction(action.kind);
    const reason = decision?.strongestReason ?? null;
    creature.activeDesire = {
      kind: desire,
      subjectEntityId: action.targetEntityId,
      startedAtTick: goal.selectedAtTick,
      minimumCommitUntilTick: Math.max(goal.minimumCommitUntilTick, state.tick),
      nextReconsiderationTick: Math.max(goal.nextReconsiderationTick, state.tick),
      strength: desireStrength(creature, desire),
      selectedByDecisionId: goal.decisionRecordId,
    };
    const anchorTile = action.targetTileIndex ?? creature.tileIndex;
    const claim = claimInteractionSlot(
      state,
      creature,
      action.kind,
      action.targetEntityId,
      anchorTile,
    );
    let claimRebuilt = !requiresInteractionClaim(action.kind);
    if (claim) {
      const path = findPath(state.world, creature.tileIndex, claim.tileIndex);
      if (path.length > 0) {
        action.interactionClaim = claim;
        action.targetTileIndex = claim.tileIndex;
        action.path = path;
        action.pathIndex = path.length <= 1 ? path.length : 1;
        goal.targetTileIndex = claim.tileIndex;
        claimRebuilt = true;
      }
    }
    if (!claimRebuilt) {
      creature.activeDesire = null;
      creature.activePlan = null;
      creature.activeGoal = null;
      creature.activeAction = null;
      creature.nextDecisionTick = Math.min(creature.nextDecisionTick, state.tick);
      continue;
    }
    creature.activePlan = {
      kind: plan,
      desireKind: desire,
      targetEntityId: action.targetEntityId,
      targetTileIndex: action.targetTileIndex,
      startedAtTick: goal.selectedAtTick,
      status: "ACTIVE",
      selectedByDecisionId: goal.decisionRecordId,
      expectedUtility: goal.expectedUtility,
      strongestReason: reason,
      interactionClaim: action.interactionClaim,
    };
    creature.intentHistory = [
      {
        tick: goal.selectedAtTick,
        desire,
        plan,
        status: "ACTIVE",
        reason,
      },
    ];
  }
  upgradeHydrationState(migrated, "petri-world");
  upgradeShelterState(migrated, "petri-world");
  upgradeLifecycleState(migrated, "petri-world");
  return migrated as unknown as SimulationState;
}
