import { describe, expect, it } from "vitest";
import {
  ADULT_MIN_AGE_TICKS,
  CRITICAL_DEATH_AFTER_TICKS,
  CRITICAL_HEALTH_THRESHOLD,
  ELDER_MIN_AGE_TICKS,
  FERTILITY_MAX_AGE_TICKS,
  FERTILITY_MIN_AGE_TICKS,
  GESTATION_TICKS,
  MAX_LIVING_POPULATION,
  MAX_TOTAL_IDENTITIES,
  NATURAL_LIFESPAN_MIN_TICKS,
  NATURAL_LIFESPAN_SPAN_TICKS,
  REPRODUCTION_COOLDOWN_TICKS,
  advanceSimulation,
  clearRecoveredCriticalStates,
  completeCareForYoung,
  completeEstateClaim,
  completeFamilyFormation,
  completeMourning,
  createCausalEvidenceProjection,
  createExperiment,
  createScenarioReference,
  createSimulation,
  finalizeLifecycleDeaths,
  followDependentCaregivers,
  isActionAllowedForLifeStage,
  lifeStageForAge,
  lifecycleWorkRate,
  migrateExperiment,
  migrateSimulationState,
  naturalLifespanTicksFor,
  processCriticalMortality,
  processMemorialsAndEstates,
  processPregnanciesAndBirths,
  queryLifeRecords,
  recordCriticalDamage,
  reproductionEligibility,
  transitionToDead,
  updateLifecycleAges,
  updateLifecycleGroupExtinction,
  type ActiveAction,
  type CreatureState,
  type GroupState,
  type LifeRecord,
  type RelationshipEdge,
  type ShelterStructureState,
  type SimulationState,
  type StorageStructureState,
} from "../src/index.js";
import { runScheduledDecisions } from "../src/actions/candidates.js";
import { executeActiveActions } from "../src/actions/execution.js";
import { getActionDuration } from "../src/actions/registry.js";
import { assertCompatibleSimulationState } from "../src/state-validation.js";
import { updateNeeds } from "../src/systems/needs-resources.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function relationship(id: number, fromId: number, toId: number): RelationshipEdge {
  return {
    id,
    fromId,
    toId,
    trust: 8_000,
    fear: 0,
    familiarity: 5_000,
    rivalry: 0,
    lastInteractionTick: 0,
    significantEventIds: [],
  };
}

function familyHarness(seed = 7_313): {
  state: SimulationState;
  female: CreatureState;
  male: CreatureState;
  group: GroupState;
  shelter: ShelterStructureState;
} {
  const state = createSimulation(createScenarioReference("petri-world", seed));
  const female = state.creatures.find((creature) => creature.sex === "FEMALE")!;
  const male = state.creatures.find((creature) => creature.sex === "MALE")!;
  female.ageTicks = FERTILITY_MIN_AGE_TICKS;
  male.ageTicks = FERTILITY_MAX_AGE_TICKS;
  female.lifeStage = male.lifeStage = "ADULT";
  female.health = male.health = 10_000;
  female.needs = { hunger: 0, fatigue: 0, thirst: 0 };
  male.needs = { hunger: 0, fatigue: 0, thirst: 0 };
  female.traits.sociability = 10_000;
  male.traits.sociability = 10_000;
  const openAnchor = state.world.tiles.find((tile) => {
    if (tile.blocked) return false;
    const north = state.world.tiles.find(
      (candidate) => candidate.x === tile.x && candidate.y === tile.y - 1,
    );
    const east = state.world.tiles.find(
      (candidate) => candidate.x === tile.x + 1 && candidate.y === tile.y,
    );
    return Boolean(north && east && !north.blocked && !east.blocked);
  })!;
  female.tileIndex = male.tileIndex = openAnchor.index;
  female.x = male.x = openAnchor.x * 1_024 + 512;
  female.y = male.y = openAnchor.y * 1_024 + 512;
  const group: GroupState = {
    id: state.nextGroupId++,
    name: "Lifecycle Test Group",
    status: "ACTIVE",
    extinctTick: null,
    stage: "PERSISTENT",
    foundedTick: state.tick,
    memberIds: [female.id, male.id],
    leaderId: female.id,
    homeTileIndex: female.tileIndex,
    storageStructureId: null,
    activeShelterId: null,
    pendingShelterId: null,
    shelterRelocations: 0,
    shelterCommitUntilTick: 0,
    shelterRelocationCandidate: null,
    cohesion: 8_000,
    sharingNorm: 5_000,
    majorEventIds: [],
  };
  const shelter: ShelterStructureState = {
    id: state.nextEntityId++,
    kind: "SHELTER",
    tileIndex: female.tileIndex,
    groupId: group.id,
    material: 12,
    materialRequired: 12,
    progress: 10_000,
    workRequired: 10_000,
    inventory: { capacity: 0, food: 0, material: 0, water: 0 },
    guardIds: [],
    completedTick: state.tick,
    condition: 10_000,
    baseCapacity: 6,
    siteAssessment: {
      selectedAtTick: state.tick,
      memberTravelCost: 0,
      storageTravelCost: 0,
      foodAccessCost: 0,
      materialAccessCost: 0,
      waterAccessCost: 0,
      crowdingCost: 0,
      constructionInvestmentCost: 0,
      relocationChangeCost: 0,
      totalScore: 0,
    },
    builtFromShelterId: null,
    maintenanceMaterialSpent: 0,
    lastMaintainedTick: null,
    lastUsedTick: null,
    conditionBand: "GOOD",
  };
  group.activeShelterId = shelter.id;
  state.groups.push(group);
  state.structures.push(shelter);
  female.groupId = male.groupId = group.id;
  state.relationships.push(
    relationship(90_001, female.id, male.id),
    relationship(90_002, male.id, female.id),
  );
  for (const node of state.resourceNodes) {
    if (node.kind === "FOOD" || node.kind === "WATER") node.currentStock = 100;
  }
  return { state, female, male, group, shelter };
}

function workingAction(
  state: SimulationState,
  creature: CreatureState,
  kind: ActiveAction["kind"],
): ActiveAction {
  return {
    kind,
    phase: "WORKING",
    startedAtTick: state.tick,
    targetEntityId: null,
    targetTileIndex: creature.tileIndex,
    path: [creature.tileIndex],
    pathIndex: 1,
    progress: 0,
    workRequired: 10_000,
    navigationRevision: state.world.navigationRevision,
    interactionClaim: null,
  };
}

function recordTemplate(id: number, overrides: Partial<LifeRecord> = {}): LifeRecord {
  return {
    id,
    name: `Life ${id.toString()}`,
    color: id,
    sex: id % 2 === 0 ? "FEMALE" : "MALE",
    motherId: null,
    fatherId: null,
    birthTick: 0,
    deathTick: 1,
    ageTicks: 10_000,
    finalLifeStage: "ADULT",
    deathCause: "OLD_AGE",
    finalGroupId: null,
    traitPotential: { generosity: 1, aggression: 2, sociability: 3, loyalty: 4 },
    skillPotential: { foraging: 5, combat: 6 },
    majorEventIds: [],
    heirId: null,
    ...overrides,
  };
}

describe("lifecycle demographics and work", () => {
  it("assigns canonical founder demographics and deterministic lifespan bounds", () => {
    const first = createSimulation(12_345);
    const second = createSimulation(12_345);
    expect(first.creatures.map((creature) => creature.sex)).toEqual([
      "FEMALE",
      "MALE",
      "FEMALE",
      "MALE",
      "FEMALE",
      "MALE",
      "FEMALE",
      "MALE",
    ]);
    expect(first.creatures.map((creature) => creature.ageTicks)).toEqual([
      10_500, 8_000, 15_500, 11_500, 9_500, 13_000, 7_500, 8_500,
    ]);
    expect(first.creatures.map((creature) => creature.naturalLifespanTicks)).toEqual(
      second.creatures.map((creature) => creature.naturalLifespanTicks),
    );
    for (const creature of first.creatures) {
      expect(creature.naturalLifespanTicks).toBe(
        naturalLifespanTicksFor(first.seed, creature.id),
      );
      expect(creature.naturalLifespanTicks).toBeGreaterThanOrEqual(
        NATURAL_LIFESPAN_MIN_TICKS,
      );
      expect(creature.naturalLifespanTicks).toBeLessThan(
        NATURAL_LIFESPAN_MIN_TICKS + NATURAL_LIFESPAN_SPAN_TICKS,
      );
    }
    expect(lifeStageForAge(ADULT_MIN_AGE_TICKS - 1)).toBe("JUVENILE");
    expect(lifeStageForAge(ADULT_MIN_AGE_TICKS)).toBe("ADULT");
    expect(lifeStageForAge(ELDER_MIN_AGE_TICKS)).toBe("ELDER");
  });

  it("restricts juveniles to survival movement and applies an exact 80% elder work rate", () => {
    const state = createSimulation(8_002);
    const juvenile = state.creatures[0]!;
    juvenile.lifeStage = "JUVENILE";
    const allowed = ["EXPLORE", "EAT", "DRINK", "REST", "REST_SHELTERED", "FLEE"] as const;
    for (const action of allowed)
      expect(isActionAllowedForLifeStage(juvenile, action)).toBe(true);
    for (const action of [
      "GATHER_FOOD",
      "SHARE",
      "JOIN_GROUP",
      "FORM_FAMILY",
      "CARE_FOR_YOUNG",
    ] as const) {
      expect(isActionAllowedForLifeStage(juvenile, action)).toBe(false);
    }

    const adult = state.creatures[1]!;
    const elder = state.creatures[2]!;
    adult.lifeStage = "ADULT";
    elder.lifeStage = "ELDER";
    adult.activeAction = workingAction(state, adult, "GATHER_FOOD");
    elder.activeAction = workingAction(state, elder, "GATHER_FOOD");
    executeActiveActions(state);
    expect(lifecycleWorkRate(adult)).toBe(10_000);
    expect(lifecycleWorkRate(elder)).toBe(8_000);
    expect(elder.activeAction!.progress * 5).toBe(adult.activeAction!.progress * 4);
  });

  it("moves an idle juvenile one path step toward its caregiver", () => {
    const state = createSimulation(8_003);
    const dependent = state.creatures[0]!;
    const caregiver = state.creatures[1]!;
    dependent.lifeStage = "JUVENILE";
    dependent.ageTicks = 1_000;
    dependent.caregiverId = caregiver.id;
    dependent.activeAction = null;
    const start = state.world.tiles.find((tile) => !tile.blocked)!;
    const far = [...state.world.tiles].reverse().find((tile) => !tile.blocked)!;
    dependent.tileIndex = start.index;
    dependent.x = start.x * 1_024 + 512;
    dependent.y = start.y * 1_024 + 512;
    caregiver.tileIndex = far.index;
    const before = dependent.tileIndex;
    followDependentCaregivers(state);
    expect(dependent.tileIndex).not.toBe(before);
    expect(dependent.recentRoute.at(-1)).toMatchObject({
      tick: state.tick,
      tileIndex: dependent.tileIndex,
    });
  });
});

describe("family formation and population ceilings", () => {
  it("enforces the exact family eligibility thresholds and dependent shelter reservation", () => {
    const { state, female, male, group } = familyHarness();
    expect(reproductionEligibility(state, female, male)).toEqual({
      eligible: true,
      reasons: [],
    });
    female.health = 6_499;
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "both parents need at least 6500 health",
    );
    female.health = 6_500;
    female.needs.hunger = 6_500;
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "survival needs are too urgent",
    );
    female.needs.hunger = 0;
    group.stage = "PROVISIONAL";
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "both parents must share the same active persistent group",
    );
    group.stage = "PERSISTENT";
    for (const dependent of state.creatures.slice(2)) {
      dependent.groupId = group.id;
      dependent.lifeStage = "JUVENILE";
    }
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "the shared shelter has no dependent-priority reservation",
    );
  });

  it("locks both partners for the eight-tick action, starts one pregnancy, then births with cooldown", () => {
    const { state, female, male } = familyHarness(7_314);
    female.inventory = { capacity: 0, food: 0, material: 0, water: 0 };
    female.activeDesire = {
      kind: "RAISE_FAMILY",
      subjectEntityId: male.id,
      startedAtTick: state.tick,
      minimumCommitUntilTick: state.tick + 100,
      nextReconsiderationTick: state.tick + 100,
      strength: 10_000,
      selectedByDecisionId: 1,
    };
    female.nextDecisionTick = state.tick;
    for (const creature of state.creatures) {
      if (creature.id !== female.id) creature.nextDecisionTick = Number.MAX_SAFE_INTEGER;
    }
    expect(reproductionEligibility(state, female, male).eligible).toBe(true);
    runScheduledDecisions(state);
    expect(
      state.decisionRecords.at(-1)!.candidates.map((candidate) => candidate.action),
    ).toContain("FORM_FAMILY");
    expect(female.activeAction).toMatchObject({
      kind: "FORM_FAMILY",
      targetEntityId: male.id,
    });
    expect(male.activeAction).toMatchObject({
      kind: "FORM_FAMILY",
      targetEntityId: female.id,
    });
    expect(getActionDuration("FORM_FAMILY")).toBe(8);
    for (const partner of [female, male]) {
      partner.activeAction!.phase = "WORKING";
      partner.activeAction!.path = [partner.activeAction!.targetTileIndex!];
      partner.activeAction!.pathIndex = 1;
    }
    for (let index = 0; index < 7; index += 1) executeActiveActions(state);
    expect(female.pregnancy).toBeNull();
    executeActiveActions(state);
    expect(female.pregnancy).toEqual({
      fatherId: male.id,
      conceivedTick: state.tick,
      dueTick: state.tick + GESTATION_TICKS,
    });
    expect(state.metrics.pregnanciesStarted).toBe(1);
    expect(female.reproductionCooldownUntilTick).toBe(
      state.tick + REPRODUCTION_COOLDOWN_TICKS,
    );
    state.tick += GESTATION_TICKS;
    processPregnanciesAndBirths(state);
    const child = state.creatures.find((creature) => creature.motherId === female.id)!;
    expect(child).toMatchObject({
      fatherId: male.id,
      caregiverId: female.id,
      lifeStage: "JUVENILE",
    });
    expect(child.traitPotential).toEqual(child.traits);
    expect(state.metrics.births).toBe(1);
  });

  it("reserves the 24-living and exact 256-identity ceilings", () => {
    const { state, female, male } = familyHarness(7_315);
    const source = state.creatures[0]!;
    while (
      state.creatures.filter((creature) => creature.alive).length < MAX_LIVING_POPULATION
    ) {
      const id = state.nextEntityId++;
      state.creatures.push({
        ...clone(source),
        id,
        name: `Extra ${id.toString()}`,
        groupId: null,
      });
    }
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "the population cap of 24 is reserved",
    );
    state.creatures.splice(MAX_LIVING_POPULATION - 1);
    const existing = new Set(state.creatures.map((creature) => creature.id));
    let id = 100_000;
    while (existing.size + state.lifeRecords.length < MAX_TOTAL_IDENTITIES) {
      if (!existing.has(id)) state.lifeRecords.push(recordTemplate(id));
      id += 1;
    }
    expect(reproductionEligibility(state, female, male).reasons).toContain(
      "the total identity cap of 256 is reserved",
    );
  });

  it("births after paternal death using the archived father's inherited potential", () => {
    const { state, female, male } = familyHarness(7_316);
    female.traitPotential = { generosity: 0, aggression: 0, sociability: 0, loyalty: 0 };
    female.skillPotential = { foraging: 0, combat: 0 };
    male.traitPotential = {
      generosity: 10_000,
      aggression: 10_000,
      sociability: 10_000,
      loyalty: 10_000,
    };
    male.skillPotential = { foraging: 10_000, combat: 10_000 };
    expect(completeFamilyFormation(state, female, male.id)).toBe(true);
    transitionToDead(state, male, "INJURY");
    finalizeLifecycleDeaths(state);
    state.tick = GESTATION_TICKS;
    processPregnanciesAndBirths(state);
    const child = state.creatures.find((creature) => creature.fatherId === male.id)!;
    expect(child).toBeDefined();
    expect(
      Object.values(child.traitPotential).every(
        (value) => value >= 4_250 && value <= 5_750,
      ),
    ).toBe(true);
    expect(
      Object.values(child.skillPotential).every(
        (value) => value >= 4_250 && value <= 5_750,
      ),
    ).toBe(true);
  });
});

describe("critical health and death", () => {
  it("starts a visible critical episode below 1200, clears only above it, and retains source evidence", () => {
    const state = createSimulation(9_001);
    const creature = state.creatures[0]!;
    const sourceEventId = state.domainEvents[0]!.id;
    creature.health = CRITICAL_HEALTH_THRESHOLD;
    recordCriticalDamage(state, creature, { dehydration: 3 }, [sourceEventId]);
    const started = state.domainEvents.at(-1)!;
    expect(started).toMatchObject({
      type: "CRITICAL_HEALTH_STARTED",
      actorIds: [creature.id],
      causedByEventIds: [sourceEventId],
      attentionTier: "CRITICAL",
    });
    expect(state.historyEvents.at(-1)).toMatchObject({
      type: "HEALTH_CRISIS",
      sourceEventIds: [started.id, sourceEventId],
    });
    creature.health = CRITICAL_HEALTH_THRESHOLD;
    clearRecoveredCriticalStates(state);
    expect(creature.criticalSinceTick).toBe(state.tick);
    creature.health += 1;
    clearRecoveredCriticalStates(state);
    expect(creature.criticalSinceTick).toBeNull();
    expect(state.domainEvents.at(-1)).toMatchObject({
      type: "CRITICAL_HEALTH_RECOVERED",
      causedByEventIds: [started.id],
    });
  });

  it("dies after exactly 300 consecutive critical ticks with the documented cause tie order", () => {
    const state = createSimulation(9_002);
    const creature = state.creatures[0]!;
    creature.health = 1_100;
    state.tick = 100;
    recordCriticalDamage(state, creature, {
      dehydration: 7,
      starvation: 7,
      exhaustion: 7,
      injury: 7,
    });
    state.tick = 100 + CRITICAL_DEATH_AFTER_TICKS - 2;
    processCriticalMortality(state);
    expect(creature.alive).toBe(true);
    state.tick += 1;
    processCriticalMortality(state);
    expect(creature.alive).toBe(false);
    expect(creature.death?.cause).toBe("DEHYDRATION");
    expect(state.lifeRecords.at(-1)?.deathCause).toBe("DEHYDRATION");
  });

  it("lets hardship mortality win a same-tick natural-lifespan tie", () => {
    const state = createSimulation(9_003);
    const creature = state.creatures[0]!;
    state.tick = 500;
    creature.ageTicks = creature.naturalLifespanTicks - 1;
    creature.health = 1_100;
    creature.criticalSinceTick = state.tick - CRITICAL_DEATH_AFTER_TICKS + 1;
    creature.criticalDamage = { starvation: 0, dehydration: 3, exhaustion: 0, injury: 0 };
    updateLifecycleAges(state);
    processCriticalMortality(state);
    expect(creature.death?.cause).toBe("DEHYDRATION");
  });

  it("allows hardship health to fall below the threshold before the episode duration elapses", () => {
    const state = createSimulation(9_004);
    const creature = state.creatures[0]!;
    creature.health = 1_201;
    creature.needs = { hunger: 10_000, thirst: 10_000, fatigue: 10_000 };
    updateNeeds(state);
    expect(creature.health).toBe(1_195);
    expect(creature.alive).toBe(true);
  });
});

describe("death cleanup, estates, succession, and extinction", () => {
  it("cleans death once, preserves paternal pregnancy, loses maternal pregnancy, and reparents orphans", () => {
    const paternal = familyHarness(9_101);
    paternal.female.pregnancy = {
      fatherId: paternal.male.id,
      conceivedTick: 0,
      dueTick: 1_000,
    };
    expect(transitionToDead(paternal.state, paternal.male, "INJURY")).toBe(true);
    expect(paternal.female.pregnancy).not.toBeNull();

    const maternal = familyHarness(9_102);
    const orphan = maternal.state.creatures[2]!;
    orphan.lifeStage = "JUVENILE";
    orphan.motherId = maternal.female.id;
    orphan.fatherId = maternal.male.id;
    orphan.caregiverId = maternal.female.id;
    orphan.groupId = maternal.group.id;
    maternal.group.memberIds.push(orphan.id);
    maternal.female.pregnancy = {
      fatherId: maternal.male.id,
      conceivedTick: 0,
      dueTick: 1_000,
    };
    maternal.shelter.guardIds.push(maternal.female.id);
    const before = maternal.state.metrics.deaths;
    expect(transitionToDead(maternal.state, maternal.female, "INJURY")).toBe(true);
    expect(maternal.female.pregnancy).toBeNull();
    expect(maternal.state.metrics.pregnanciesLost).toBe(1);
    expect(orphan.caregiverId).toBe(maternal.male.id);
    expect(maternal.shelter.guardIds).not.toContain(maternal.female.id);
    expect(transitionToDead(maternal.state, maternal.female, "OLD_AGE")).toBe(false);
    expect(maternal.state.metrics.deaths).toBe(before + 1);
    expect(maternal.state.lifeRecords).toHaveLength(1);
  });

  it("selects a non-hereditary successor in the leader-death tick with causal evidence", () => {
    const { state, female, male, group } = familyHarness(9_103);
    const child = state.creatures[2]!;
    child.lifeStage = "ADULT";
    child.motherId = female.id;
    child.groupId = group.id;
    group.memberIds.push(child.id);
    child.traits = { generosity: 0, aggression: 0, sociability: 0, loyalty: 0 };
    child.skills = { foraging: 0, combat: 0 };
    male.traits = {
      generosity: 10_000,
      aggression: 0,
      sociability: 10_000,
      loyalty: 10_000,
    };
    male.skills = { foraging: 10_000, combat: 10_000 };
    transitionToDead(state, female, "OLD_AGE");
    const death = state.domainEvents.find((event) => event.type === "CREATURE_DIED")!;
    const succession = state.domainEvents.find(
      (event) => event.type === "LEADER_SELECTED",
    )!;
    expect(succession.tick).toBe(death.tick);
    expect(succession.actorIds).toEqual([male.id]);
    expect(succession.targetIds).toEqual([female.id]);
    expect(succession.causedByEventIds).toEqual([death.id]);
    expect(group.leaderId).toBe(male.id);
  });

  it("transfers water then food then material, deposits overflow, and records residual expiry as loss", () => {
    const { state, female, male, group } = familyHarness(9_104);
    const child = state.creatures[2]!;
    child.motherId = female.id;
    child.fatherId = male.id;
    child.birthTick = 50;
    male.inventory = { capacity: 1, food: 0, material: 0, water: 0 };
    female.inventory = { capacity: 6, food: 2, material: 2, water: 2 };
    const storage: StorageStructureState = {
      id: state.nextEntityId++,
      kind: "STORAGE",
      tileIndex: female.tileIndex,
      groupId: group.id,
      material: 10,
      materialRequired: 10,
      progress: 10_000,
      workRequired: 10_000,
      inventory: { capacity: 10, food: 0, material: 0, water: 0 },
      guardIds: [],
      completedTick: state.tick,
    };
    state.structures.push(storage);
    group.storageStructureId = storage.id;
    transitionToDead(state, female, "INJURY");
    const memorial = state.memorials[0]!;
    expect(memorial.heirId).toBe(male.id);
    expect(completeEstateClaim(state, male, memorial.id)).toBe(true);
    expect(male.inventory).toMatchObject({ water: 1, food: 0, material: 0 });
    expect(storage.inventory).toMatchObject({ food: 2, material: 2, water: 0 });
    expect(memorial.estate).toEqual({ water: 1, food: 0, material: 0 });
    state.tick = memorial.expiresTick;
    processMemorialsAndEstates(state);
    expect(state.memorials).toHaveLength(0);
    expect(state.domainEvents.at(-1)).toMatchObject({ type: "ESTATE_CLOSED", quantity: 1 });
    expect(state.domainEvents.at(-1)!.summary).toContain("unclaimed loss");
  });

  it("archives extinct groups and permits a valid zero-population state", () => {
    const { state, female, male, group, shelter } = familyHarness(9_105);
    transitionToDead(state, female, "OLD_AGE");
    transitionToDead(state, male, "OLD_AGE");
    updateLifecycleGroupExtinction(state);
    expect(group).toMatchObject({
      status: "EXTINCT",
      extinctTick: state.tick,
      leaderId: null,
    });
    expect(shelter.kind).toBe("ABANDONED_SHELTER");

    const empty = createSimulation(9_106);
    empty.creatures = [];
    expect(() => assertCompatibleSimulationState(empty)).not.toThrow();
  });
});

describe("records, causal evidence, validation, and migration", () => {
  it("retains a configured 10,000-tick lifecycle story from birth through adulthood and bereavement", () => {
    // This is an explicit deterministic story fixture: the valid family/group/shelter
    // preconditions are configured above so the gate tests lifecycle continuity,
    // retention, and persistence rather than claiming a naturally emergent seed.
    const { state, female, male } = familyHarness(10_000);
    female.inventory = { capacity: 4, food: 1, material: 1, water: 1 };
    male.inventory = { capacity: 6, food: 1, material: 0, water: 1 };
    expect(completeFamilyFormation(state, female, male.id)).toBe(true);
    female.pregnancy!.dueTick = state.tick;
    processPregnanciesAndBirths(state);
    const child = state.creatures.find((creature) => creature.motherId === female.id)!;
    child.needs = { hunger: 4_000, thirst: 4_000, fatigue: 2_000 };
    expect(completeCareForYoung(state, male, child.id)).toBe(true);
    expect(transitionToDead(state, female, "INJURY")).toBe(true);
    const memorial = state.memorials.find(
      (candidate) => candidate.deceasedId === female.id,
    )!;
    expect(completeMourning(state, male, memorial.id)).toBe(true);
    expect(completeEstateClaim(state, male, memorial.id)).toBe(true);
    const retainedIds = new Map(
      [
        "CREATURE_BORN",
        "CARE_GIVEN",
        "CREATURE_DIED",
        "MOURNING_COMPLETED",
        "ESTATE_CLAIMED",
      ].map((type) => [type, state.domainEvents.find((event) => event.type === type)!.id]),
    );

    advanceSimulation(state, 10_000);

    expect(state.tick).toBe(10_000);
    for (const [type, id] of retainedIds) {
      expect(state.domainEvents.find((event) => event.id === id)?.type).toBe(type);
    }
    expect(
      state.domainEvents.some(
        (event) => event.type === "LIFE_STAGE_CHANGED" && event.actorIds.includes(child.id),
      ),
    ).toBe(true);
    const grown = state.creatures.find((creature) => creature.id === child.id)!;
    expect(grown).toMatchObject({
      lifeStage: "ADULT",
      ageTicks: 10_000,
      motherId: female.id,
      fatherId: male.id,
    });
    expect(state.lifeRecords.find((record) => record.id === female.id)).toMatchObject({
      heirId: male.id,
      traitPotential: female.traitPotential,
      skillPotential: female.skillPotential,
    });
  }, 15_000);

  it("queries stable cursor pages and related parent/child/sibling records without leaking mutations", () => {
    const state = createSimulation(10_001);
    state.lifeRecords = [
      recordTemplate(30, { motherId: 10, fatherId: 20 }),
      recordTemplate(10),
      recordTemplate(40, { motherId: 10, fatherId: 20 }),
      recordTemplate(20),
    ];
    const first = queryLifeRecords(state, { limit: 2 });
    expect(first.records.map((record) => record.id)).toEqual([10, 20]);
    expect(first.nextCursor).toBe(20);
    expect(
      queryLifeRecords(state, { cursor: first.nextCursor, limit: 2 }).records.map(
        (record) => record.id,
      ),
    ).toEqual([30, 40]);
    expect(
      queryLifeRecords(state, { relatedToId: 30 }).records.map((record) => record.id),
    ).toEqual([10, 20, 30, 40]);
    first.records[0]!.traitPotential.generosity = 9_999;
    expect(
      state.lifeRecords.find((record) => record.id === 10)!.traitPotential.generosity,
    ).toBe(1);
  });

  it("resolves archived lives and their death evidence after live-state cleanup", () => {
    const state = createSimulation(10_002);
    const deceased = state.creatures[0]!;
    transitionToDead(state, deceased, "INJURY");
    const deathEventId = deceased.death!.eventId;
    finalizeLifecycleDeaths(state);
    const life = createCausalEvidenceProjection(state, {
      kind: "creature",
      id: deceased.id,
    });
    expect(
      life.nodes.find(
        (node) => node.ref.kind === "creature" && node.ref.id === deceased.id,
      ),
    ).toMatchObject({
      detail: { kind: "creature", alive: false, deathCause: "INJURY" },
    });
    const death = createCausalEvidenceProjection(state, {
      kind: "event",
      id: deathEventId,
    });
    expect(
      death.nodes.some(
        (node) => node.ref.kind === "creature" && node.ref.id === deceased.id,
      ),
    ).toBe(true);
  });

  it("rejects 25 living identities and 24 living plus a reserved pregnancy", () => {
    const base = createSimulation(10_003);
    const source = base.creatures[0]!;
    while (base.creatures.length < 25) {
      const id = base.nextEntityId++;
      base.creatures.push({ ...clone(source), id, name: `Cap ${id.toString()}` });
    }
    expect(() => assertCompatibleSimulationState(base)).toThrow(
      "living population plus reserved pregnancies exceeds 24",
    );
    base.creatures.pop();
    base.creatures[0]!.pregnancy = {
      fatherId: base.creatures[1]!.id,
      conceivedTick: 0,
      dueTick: 1_000,
    };
    expect(() => assertCompatibleSimulationState(base)).toThrow(
      "living population plus reserved pregnancies exceeds 24",
    );
  });

  it("migrates v5 state demographics without inventing lineage or death timing", () => {
    const legacy = clone(createSimulation(10_004)) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    const scenario = legacy.scenario as Record<string, unknown>;
    scenario.behaviorVersion = 5;
    scenario.scenarioVersion = 2;
    const dead = (legacy.creatures as Array<Record<string, unknown>>)[1]!;
    dead.alive = false;
    const migrated = migrateSimulationState(legacy);
    expect(migrated.schemaVersion).toBe(6);
    expect(
      migrated.creatures.every(
        (creature) => creature.motherId === null && creature.fatherId === null,
      ),
    ).toBe(true);
    expect(migrated.lifeRecords).toContainEqual(
      expect.objectContaining({ id: dead.id, deathTick: -1, deathCause: "LEGACY_UNKNOWN" }),
    );
    expect(migrated.domainEvents.at(-1)?.type).toBe("LIFECYCLE_RULES_ENABLED");
  });

  it("migrates Phase 4.2 experiments while preserving graph, commands, bookmarks, and horizons", () => {
    const current = createExperiment(createScenarioReference("split-banks", 10_005));
    const legacy = clone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 5;
    legacy.behaviorVersion = 5;
    legacy.stateSchemaVersion = 5;
    (legacy.scenario as Record<string, unknown>).behaviorVersion = 5;
    (legacy.scenario as Record<string, unknown>).scenarioVersion = 2;
    const branch = (legacy.branches as Array<Record<string, unknown>>)[0]!;
    branch.targetTick = 700;
    branch.expectedHash = "0123456789abcdef";
    branch.commandLog = [
      {
        command: {
          commandId: 1,
          applyAtTick: 4,
          type: "ADD_FOOD",
          tileIndex: 2,
          amount: 1,
          blocked: null,
        },
        outcome: {
          status: "APPLIED",
          appliedAtTick: 4,
          resolvedTileIndex: 2,
          quantity: 1,
          blocked: null,
          eventIds: [],
          reason: null,
        },
        responseTrace: null,
      },
    ];
    legacy.bookmarks = [{ id: "kept", branchId: "baseline", tick: 4, label: "Keep me" }];
    legacy.checkpoints = [
      { id: "old", branchId: "baseline", tick: 4, stateHash: "0".repeat(16) },
    ];
    const migrated = migrateExperiment(legacy);
    expect(migrated).toMatchObject({
      schemaVersion: 6,
      behaviorVersion: 6,
      stateSchemaVersion: 6,
    });
    expect(migrated.branches[0]).toMatchObject({
      targetTick: 700,
      expectedHash: null,
      commandLog: [{ outcome: { status: "PENDING" }, responseTrace: null }],
    });
    expect(migrated.bookmarks).toEqual([
      { id: "kept", branchId: "baseline", tick: 4, label: "Keep me" },
    ]);
    expect(migrated.checkpoints).toEqual([]);
  });
});
