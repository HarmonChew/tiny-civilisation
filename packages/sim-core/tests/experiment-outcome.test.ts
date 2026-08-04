import { describe, expect, it } from "vitest";
import {
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
        inventory: { capacity: 100, food: 11, material: 7 },
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
        inventory: { capacity: 100, food: 99, material: 99 },
        guardIds: [],
        completedTick: null,
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
    state.metrics.thefts = 3;
    state.metrics.attacks = 2;
    state.metrics.storagesCompleted = 1;

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
      thefts: 3,
      attacks: 2,
      storagesCompleted: 1,
    });
  });

  it("uses zero average trust for an empty relationship graph", () => {
    expect(createExperimentOutcome(createSimulation(9)).averageTrust).toBe(0);
  });

  it("computes intervention-minus-baseline deltas only at a common horizon", () => {
    const baselineState = createSimulation(1);
    baselineState.tick = 20;
    const interventionState = createSimulation(1);
    interventionState.tick = 20;
    interventionState.metrics.foodShared = 4;
    interventionState.resourceNodes[0]!.currentStock += 3;
    const comparison = compareExperimentOutcomes(
      createExperimentOutcome(baselineState),
      createExperimentOutcome(interventionState),
    );
    expect(comparison.delta.foodShared).toBe(4);
    expect(comparison.delta.wildFood).toBe(3);
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
