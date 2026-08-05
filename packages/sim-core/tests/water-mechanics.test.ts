import { describe, expect, it } from "vitest";
import {
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_IDS,
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  hashSimulationState,
  type ActiveAction,
  type ActionKind,
} from "../src/index.js";
import { executeActiveActions } from "../src/actions/execution.js";
import { runScheduledDecisions } from "../src/actions/candidates.js";
import { getActionDuration } from "../src/actions/registry.js";
import { claimInteractionSlot, interactionCapacity } from "../src/interaction-slots.js";
import { regenerateResources, updateNeeds } from "../src/systems/needs-resources.js";

function workingAction(
  state: ReturnType<typeof createSimulation>,
  kind: ActionKind,
  targetEntityId: number | null,
): ActiveAction {
  const creature = state.creatures[0]!;
  return {
    kind,
    phase: "WORKING",
    startedAtTick: state.tick,
    targetEntityId,
    targetTileIndex: creature.tileIndex,
    path: [creature.tileIndex],
    pathIndex: 1,
    progress: 0,
    workRequired: 10_000,
    navigationRevision: state.world.navigationRevision,
    interactionClaim: null,
  };
}

function finishAction(state: ReturnType<typeof createSimulation>): void {
  const kind = state.creatures[0]!.activeAction!.kind;
  for (let tick = 0; tick < getActionDuration(kind); tick += 1) {
    executeActiveActions(state);
  }
}

describe("water actions", () => {
  it("advances thirst by five per tick, plus two while moving, without chunk drift", () => {
    const stationary = createSimulation(90);
    const stationaryCreature = stationary.creatures[0]!;
    stationaryCreature.needs.thirst = 1_000;
    stationaryCreature.activeAction = null;
    updateNeeds(stationary);
    expect(stationaryCreature.needs.thirst).toBe(1_005);

    const moving = createSimulation(90);
    const movingCreature = moving.creatures[0]!;
    movingCreature.needs.thirst = 1_000;
    movingCreature.activeAction = {
      ...workingAction(moving, "GATHER_WATER", moving.resourceNodes.at(-1)!.id),
      phase: "MOVING",
    };
    updateNeeds(moving);
    expect(movingCreature.needs.thirst).toBe(1_007);

    const oneShot = createSimulation(95);
    const chunked = createSimulation(95);
    advanceSimulation(oneShot, 250);
    for (let tick = 0; tick < 250; tick += 1) advanceSimulation(chunked, 1);
    expect(hashSimulationState(chunked)).toBe(hashSimulationState(oneShot));
  });

  it("counts cumulative severe-thirst exposure in creature-ticks", () => {
    const state = createSimulation(9_501);
    for (const creature of state.creatures.slice(1)) creature.alive = false;
    const creature = state.creatures[0]!;
    creature.needs.thirst = 7_995;

    updateNeeds(state);
    updateNeeds(state);

    expect(creature.needs.thirst).toBe(8_005);
    expect(state.metrics.severeThirstCreatureTicks).toBe(2);
  });

  it("records a real water-gather contention when a reachable source is partly occupied", () => {
    const state = createSimulation(createScenarioReference("petri-world", 9_502));
    const source = state.resourceNodes.find((node) => node.kind === "WATER")!;
    const claimant = state.creatures[0]!;
    const chooser = state.creatures[1]!;
    for (const creature of state.creatures.slice(2)) creature.alive = false;

    const claim = claimInteractionSlot(
      state,
      claimant,
      "GATHER_WATER",
      source.id,
      source.tileIndex,
    );
    if (!claim) throw new Error("Expected an initial water claim.");
    claimant.activeAction = {
      ...workingAction(state, "GATHER_WATER", source.id),
      phase: "MOVING",
      targetTileIndex: claim.tileIndex,
      interactionClaim: claim,
    };
    claimant.nextDecisionTick = Number.MAX_SAFE_INTEGER;
    chooser.activeAction = null;
    chooser.activePlan = null;
    chooser.activeDesire = null;
    chooser.inventory.food = 0;
    chooser.inventory.material = 0;
    chooser.inventory.water = 0;
    chooser.needs.thirst = 9_500;
    chooser.nextDecisionTick = state.tick;

    runScheduledDecisions(state);

    expect(state.decisionRecords.at(-1)?.selectedAction).toBe("GATHER_WATER");
    expect(state.metrics.waterGatherContentions).toBe(1);
    expect(state.metrics.interactionContentions).toBe(1);
  });

  it("keeps dehydration damage nonlethal at the 1,200 health floor", () => {
    const state = createSimulation(96);
    const creature = state.creatures[0]!;
    creature.needs.thirst = 9_399;
    creature.health = 1_201;

    for (let tick = 0; tick < 50; tick += 1) updateNeeds(state);

    expect(creature.needs.thirst).toBeGreaterThanOrEqual(9_400);
    expect(creature.health).toBe(1_200);
    expect(creature.alive).toBe(true);
  });

  it("regenerates water on its declared cadence without exceeding source capacity", () => {
    const state = createSimulation(97);
    const source = state.resourceNodes.find((node) => node.kind === "WATER")!;
    source.currentStock = source.maximumStock - 1;
    state.tick = source.regenerationEveryTicks;
    regenerateResources(state);
    expect(source.currentStock).toBe(source.maximumStock);
    state.tick += source.regenerationEveryTicks;
    regenerateResources(state);
    expect(source.currentStock).toBe(source.maximumStock);
  });

  it("publishes exactly three simultaneous gathering slots per water source", () => {
    expect(interactionCapacity("GATHER_WATER")).toBe(3);
  });

  it("runs the hydration loop in every versioned scenario", () => {
    for (const scenarioId of SCENARIO_IDS) {
      const state = createSimulation(
        createScenarioReference(scenarioId, SCENARIO_CANONICAL_SEEDS[scenarioId]),
      );
      advanceSimulation(state, 2_000);
      expect(state.metrics.waterGathered, scenarioId).toBeGreaterThan(0);
      expect(state.metrics.waterDrunk, scenarioId).toBeGreaterThan(0);
      expect(
        state.creatures.every(
          (creature) => creature.needs.thirst >= 0 && creature.needs.thirst <= 10_000,
        ),
        scenarioId,
      ).toBe(true);
    }
  });

  it("gathers at most two water and reports source depletion", () => {
    const state = createSimulation(91);
    const creature = state.creatures[0]!;
    const source = state.resourceNodes.find((node) => node.kind === "WATER")!;
    creature.inventory.food = 0;
    creature.inventory.material = 0;
    creature.inventory.water = 0;
    source.currentStock = 2;
    creature.activeAction = workingAction(state, "GATHER_WATER", source.id);

    finishAction(state);

    expect(creature.inventory.water).toBe(2);
    expect(source.currentStock).toBe(0);
    expect(state.metrics.waterGathered).toBe(2);
    expect(state.domainEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["WATER_GATHERED", "WATER_SOURCE_DEPLETED"]),
    );
  });

  it("drinks carried water and resolves severe thirst without enabling death", () => {
    const state = createSimulation(92);
    const creature = state.creatures[0]!;
    creature.inventory.water = 1;
    creature.needs.thirst = 9_000;
    creature.health = 5_000;
    creature.activeAction = workingAction(state, "DRINK", null);

    finishAction(state);

    expect(creature.inventory.water).toBe(0);
    expect(creature.needs.thirst).toBe(2_500);
    expect(creature.health).toBe(5_150);
    expect(creature.alive).toBe(true);
    expect(state.metrics.waterDrunk).toBe(1);
    expect(state.domainEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["WATER_DRUNK", "SEVERE_THIRST_RESOLVED"]),
    );
  });

  it("shares one water, records help, and preserves shared capacity", () => {
    const state = createSimulation(93);
    const giver = state.creatures[0]!;
    const recipient = state.creatures[1]!;
    giver.inventory.food = 0;
    giver.inventory.material = 0;
    giver.inventory.water = 1;
    giver.needs.thirst = 4_000;
    recipient.inventory.food = 0;
    recipient.inventory.material = 0;
    recipient.inventory.water = 0;
    recipient.needs.thirst = 8_200;
    giver.activeAction = workingAction(state, "SHARE_WATER", recipient.id);

    finishAction(state);

    expect(giver.inventory.water).toBe(0);
    expect(recipient.inventory.water).toBe(1);
    expect(state.metrics.waterShared).toBe(1);
    expect(
      state.memories.some(
        (memory) =>
          memory.ownerId === recipient.id &&
          memory.subjectEntityId === giver.id &&
          memory.kind === "HELP_RECEIVED",
      ),
    ).toBe(true);
  });

  it("does not complete a water share when either thirst threshold is no longer valid", () => {
    const state = createSimulation(94);
    const giver = state.creatures[0]!;
    const recipient = state.creatures[1]!;
    giver.inventory.food = 0;
    giver.inventory.material = 0;
    giver.inventory.water = 1;
    giver.needs.thirst = 4_000;
    recipient.inventory.food = 0;
    recipient.inventory.material = 0;
    recipient.inventory.water = 0;
    recipient.needs.thirst = 5_999;
    giver.activeAction = workingAction(state, "SHARE_WATER", recipient.id);

    finishAction(state);

    expect(giver.inventory.water).toBe(1);
    expect(recipient.inventory.water).toBe(0);
    expect(state.metrics.waterShared).toBe(0);
    expect(state.domainEvents.some((event) => event.type === "WATER_SHARED")).toBe(false);
  });

  it("does not overflow the recipient's shared six-unit carrying capacity", () => {
    const state = createSimulation(98);
    const giver = state.creatures[0]!;
    const recipient = state.creatures[1]!;
    giver.inventory.food = 0;
    giver.inventory.material = 0;
    giver.inventory.water = 1;
    giver.needs.thirst = 4_000;
    recipient.inventory.food = recipient.inventory.capacity;
    recipient.inventory.material = 0;
    recipient.inventory.water = 0;
    recipient.needs.thirst = 8_200;
    giver.activeAction = workingAction(state, "SHARE_WATER", recipient.id);

    finishAction(state);

    expect(giver.inventory.water).toBe(1);
    expect(recipient.inventory.water).toBe(0);
    expect(
      recipient.inventory.food + recipient.inventory.material + recipient.inventory.water,
    ).toBe(recipient.inventory.capacity);
  });
});
