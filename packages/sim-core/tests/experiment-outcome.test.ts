import { describe, expect, it } from "vitest";
import {
  assertExperimentOutcome,
  compareExperimentOutcomes,
  createExperimentOutcome,
  createScenarioReference,
  createSimulation,
  type ExperimentOutcomeV1,
} from "../src/index.js";

describe("canonical experiment outcomes", () => {
  it("projects resources, social outcomes, conflict, and construction by formula", () => {
    const state = createSimulation(5);
    const first = state.creatures[0];
    const second = state.creatures[1];
    if (!first || !second) throw new Error("Missing fixture creatures.");
    first.inventory.food = 2;
    first.inventory.material = 1;
    second.inventory.food = 3;
    second.inventory.material = 2;
    second.alive = false;
    state.groups.push({
      id: 1,
      name: "Test group",
      stage: "PERSISTENT",
      foundedTick: 0,
      memberIds: [first.id],
      leaderId: first.id,
      homeTileIndex: first.tileIndex,
      storageStructureId: 12,
      activeShelterId: null,
      pendingShelterId: null,
      shelterRelocations: 0,
      shelterCommitUntilTick: 0,
      shelterRelocationCandidate: null,
      cohesion: 5_000,
      sharingNorm: 4_000,
      majorEventIds: [],
    });
    state.structures.push(
      {
        id: 12,
        kind: "STORAGE",
        tileIndex: first.tileIndex,
        groupId: 1,
        material: 8,
        materialRequired: 8,
        progress: 10_000,
        workRequired: 10_000,
        inventory: { capacity: 100, food: 11, material: 7, water: 0 },
        guardIds: [],
        completedTick: 4,
      },
      {
        id: 13,
        kind: "STORAGE_SITE",
        tileIndex: first.tileIndex + 1,
        groupId: 1,
        material: 2,
        materialRequired: 8,
        progress: 100,
        workRequired: 10_000,
        inventory: { capacity: 100, food: 99, material: 99, water: 0 },
        guardIds: [],
        completedTick: null,
      },
      {
        id: 14,
        kind: "SHELTER",
        tileIndex: first.tileIndex + 48,
        groupId: 1,
        material: 18,
        materialRequired: 18,
        progress: 10_000,
        workRequired: 10_000,
        inventory: { capacity: 0, food: 0, material: 0, water: 0 },
        guardIds: [],
        completedTick: 5,
        condition: 6_000,
        baseCapacity: 6,
        siteAssessment: {
          selectedAtTick: 1,
          memberTravelCost: 10,
          storageTravelCost: 10,
          foodAccessCost: 10,
          materialAccessCost: 10,
          waterAccessCost: 10,
          crowdingCost: 0,
          constructionInvestmentCost: 0,
          relocationChangeCost: 0,
          totalScore: 90,
        },
        builtFromShelterId: null,
        maintenanceMaterialSpent: 2,
        lastMaintainedTick: 5,
        lastUsedTick: 5,
        conditionBand: "WORN",
      },
    );
    state.relationships.push(
      {
        id: 1,
        fromId: first.id,
        toId: second.id,
        trust: 2_000,
        fear: 0,
        familiarity: 10,
        rivalry: 0,
        lastInteractionTick: 0,
        significantEventIds: [],
      },
      {
        id: 2,
        fromId: second.id,
        toId: first.id,
        trust: -1_000,
        fear: 0,
        familiarity: 10,
        rivalry: 0,
        lastInteractionTick: 0,
        significantEventIds: [],
      },
    );
    state.metrics.foodShared = 8;
    state.metrics.waterGathered = 7;
    state.metrics.waterDrunk = 5;
    state.metrics.waterShared = 2;
    state.metrics.severeThirstCreatureTicks = 13;
    state.metrics.interactionContentions = 4;
    state.metrics.waterGatherContentions = 3;
    state.metrics.thefts = 3;
    state.metrics.attacks = 2;
    state.metrics.storagesCompleted = 1;
    state.metrics.sheltersCompleted = 1;
    state.metrics.shelteredRests = 9;
    state.metrics.outdoorRests = 4;
    state.metrics.shelterMaintenanceMaterial = 2;
    state.metrics.shelterDeniedClaims = 3;
    state.metrics.shelterGuestUses = 2;
    state.metrics.shelterRelocations = 1;

    const outcome = createExperimentOutcome(state);
    expect(outcome).toMatchObject({
      population: state.creatures.length - 1,
      wildFood: 129,
      wildMaterial: 80,
      storedFood: 13,
      storedMaterial: 8,
      groups: 1,
      averageTrust: 500,
      foodShared: 8,
      waterGathered: 7,
      waterDrunk: 5,
      waterShared: 2,
      severeThirstExposureTicks: 13,
      interactionContentions: 4,
      waterGatherContentions: 3,
      thefts: 3,
      attacks: 2,
      storagesCompleted: 1,
      sheltersCompleted: 1,
      activeShelters: 1,
      shelteredRests: 9,
      outdoorRests: 4,
      meanShelterCondition: 6_000,
      shelterMaintenanceMaterial: 2,
      shelterDeniedClaims: 3,
      shelterGuestUses: 2,
      shelterRelocations: 1,
    });
    expect(() => assertExperimentOutcome(outcome)).not.toThrow();
  });

  it("uses zero average trust for an empty relationship graph", () => {
    expect(createExperimentOutcome(createSimulation(9)).averageTrust).toBe(0);
  });

  it("projects deterministic water access and recent hydration-route pressure", () => {
    const state = createSimulation(createScenarioReference("petri-world", 11));
    const first = state.creatures[0];
    if (!first) throw new Error("Missing fixture creature.");
    for (const creature of state.creatures.slice(1)) creature.alive = false;
    first.activeDesire = {
      kind: "RELIEVE_THIRST",
      subjectEntityId: first.id,
      startedAtTick: 0,
      minimumCommitUntilTick: 10,
      nextReconsiderationTick: 10,
      strength: 8_000,
      selectedByDecisionId: 1,
    };
    first.recentRoute = [
      { tick: 0, tileIndex: 1, x: 1_500, y: 500 },
      { tick: 1, tileIndex: 2, x: 2_500, y: 500 },
      { tick: 2, tileIndex: 1, x: 1_500, y: 500 },
      { tick: 3, tileIndex: 49, x: 1_500, y: 1_500 },
    ];

    const outcome = createExperimentOutcome(state);
    expect(outcome.averageWaterAccessCost).toBeGreaterThan(0);
    expect(outcome.unreachableWaterAccessPairs).toBe(0);
    expect(outcome.routeConcentration).toBeCloseTo(2 / 3);
  });

  it("computes intervention-minus-baseline deltas only at a common horizon", () => {
    const baselineState = createSimulation(1);
    baselineState.tick = 20;
    const interventionState = createSimulation(1);
    interventionState.tick = 20;
    interventionState.metrics.foodShared = 4;
    interventionState.metrics.waterDrunk = 2;
    interventionState.metrics.interactionContentions = 3;
    interventionState.metrics.waterGatherContentions = 2;
    interventionState.metrics.severeThirstCreatureTicks = 7;
    interventionState.metrics.shelteredRests = 5;
    interventionState.metrics.shelterDeniedClaims = 2;
    interventionState.resourceNodes[0]!.currentStock += 3;
    const comparison = compareExperimentOutcomes(
      createExperimentOutcome(baselineState),
      createExperimentOutcome(interventionState),
    );
    expect(comparison.delta.foodShared).toBe(4);
    expect(comparison.delta.wildFood).toBe(3);
    expect(comparison.delta.waterDrunk).toBe(2);
    expect(comparison.delta.interactionContentions).toBe(3);
    expect(comparison.delta.waterGatherContentions).toBe(2);
    expect(comparison.delta.severeThirstExposureTicks).toBe(7);
    expect(comparison.delta.shelteredRests).toBe(5);
    expect(comparison.delta.shelterDeniedClaims).toBe(2);
    expect(comparison.baseline.foodShared).toBe(0);
    expect(comparison.intervention.foodShared).toBe(4);

    interventionState.tick = 21;
    expect(() =>
      compareExperimentOutcomes(
        createExperimentOutcome(baselineState),
        createExperimentOutcome(interventionState),
      ),
    ).toThrow("must share a tick");
    const incompatible = {
      ...createExperimentOutcome(baselineState),
      behaviorVersion: 999,
    } as unknown as ExperimentOutcomeV1;
    expect(() =>
      compareExperimentOutcomes(createExperimentOutcome(baselineState), incompatible),
    ).toThrow("incompatible behavior versions");
    const oldSchema = {
      ...createExperimentOutcome(baselineState),
      schemaVersion: 3,
    } as unknown as ExperimentOutcomeV1;
    expect(() => assertExperimentOutcome(oldSchema)).toThrow(
      "schema version 3 is incompatible with 4",
    );

    const otherScenario = createSimulation(
      createScenarioReference("split-banks", baselineState.seed),
    );
    otherScenario.tick = baselineState.tick;
    expect(() =>
      compareExperimentOutcomes(
        createExperimentOutcome(baselineState),
        createExperimentOutcome(otherScenario),
      ),
    ).toThrow("same scenario identity and seed");
  });
});
