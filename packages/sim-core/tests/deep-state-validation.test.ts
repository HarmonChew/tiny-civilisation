import { describe, expect, it } from "vitest";
import {
  MAX_PERSISTED_COLLECTION_ITEMS,
  MAX_PERSISTED_JSON_CHARACTERS,
  advanceSimulation,
  assertCompatibleSimulationState,
  createSimulation,
  createSimulationSave,
  deserializeSimulationSave,
  hashSimulationState,
  migrateSimulationSave,
  type SimulationSaveV1,
  type SimulationState,
} from "../src/index.js";

function clonedState(seed = 31): SimulationState {
  return JSON.parse(JSON.stringify(createSimulation(seed))) as SimulationState;
}

describe("deep persisted state validation", () => {
  it("validates nested runtime shapes, finite values, tile geometry, and IDs", () => {
    const hunger = clonedState();
    (hunger.creatures[0]?.needs as unknown as { hunger: unknown }).hunger = "hungry";
    expect(() => assertCompatibleSimulationState(hunger)).toThrow(
      "creatures[0].needs.hunger must be a finite number",
    );

    const nonfinite = clonedState();
    if (!nonfinite.creatures[0]) throw new Error("Missing fixture creature.");
    nonfinite.creatures[0].x = Number.NaN;
    expect(() => assertCompatibleSimulationState(nonfinite)).toThrow(
      "creatures[0].x must be a finite number",
    );

    const geometry = clonedState();
    if (!geometry.world.tiles[1]) throw new Error("Missing fixture tile.");
    geometry.world.tiles[1].x = 99;
    expect(() => assertCompatibleSimulationState(geometry)).toThrow(
      "does not match its tile index",
    );

    const duplicate = clonedState();
    if (!duplicate.resourceNodes[0] || !duplicate.creatures[0]) {
      throw new Error("Missing fixture entities.");
    }
    duplicate.resourceNodes[0].id = duplicate.creatures[0].id;
    expect(() => assertCompatibleSimulationState(duplicate)).toThrow(
      "contains duplicate ID",
    );
  });

  it("rejects contradictory or structurally stale scenario identity", () => {
    const mismatchedSeed = clonedState();
    mismatchedSeed.scenario = {
      ...mismatchedSeed.scenario,
      seed: mismatchedSeed.seed + 1,
    };
    expect(() => assertCompatibleSimulationState(mismatchedSeed)).toThrow(
      "scenario.seed must equal the authoritative state seed",
    );

    const staleMap = clonedState();
    staleMap.compiledMapHash = "0000000000000000";
    expect(() => assertCompatibleSimulationState(staleMap)).toThrow(
      "compiledMapHash does not match",
    );
  });

  it("rejects stable dangling cross-references and invalid counters", () => {
    const group = clonedState();
    if (!group.creatures[0]) throw new Error("Missing fixture creature.");
    group.creatures[0].groupId = 999;
    expect(() => assertCompatibleSimulationState(group)).toThrow(
      "groupId references missing ID 999",
    );

    const event = clonedState();
    const started = event.domainEvents[0];
    if (!started) throw new Error("Missing fixture event.");
    started.targetIds = [999];
    expect(() => assertCompatibleSimulationState(event)).toThrow(
      "targetIds references missing ID 999",
    );

    const counter = clonedState();
    counter.nextEntityId = 1;
    expect(() => assertCompatibleSimulationState(counter)).toThrow(
      "nextEntityId must be greater than existing ID",
    );
  });

  it("rejects impossible or already-missed queued commands", () => {
    const invalidFood = clonedState();
    invalidFood.commandQueue = [
      {
        commandId: 1,
        applyAtTick: invalidFood.tick,
        type: "ADD_FOOD",
        tileIndex: 1,
        amount: 0,
        blocked: true,
      },
    ];
    invalidFood.nextCommandId = 2;
    expect(() => assertCompatibleSimulationState(invalidFood)).toThrow(
      "amount must be positive for food",
    );

    const missed = clonedState();
    missed.tick = 5;
    missed.commandQueue = [
      {
        commandId: 1,
        applyAtTick: 4,
        type: "TOGGLE_OBSTACLE",
        tileIndex: 1,
        amount: 0,
        blocked: null,
      },
    ];
    missed.nextCommandId = 2;
    expect(() => assertCompatibleSimulationState(missed)).toThrow(
      "applyAtTick must not precede the current state tick",
    );
  });

  it("rejects malformed intent facts, dangling decisions, and duplicate claims", () => {
    const malformedIntent = createSimulation(4_182);
    advanceUntilIntent(malformedIntent);
    const intentCreature = malformedIntent.creatures.find(
      (creature) => creature.activeDesire !== null,
    );
    if (!intentCreature?.activeDesire) throw new Error("Missing active intent fixture.");
    (intentCreature.activeDesire as unknown as { kind: string }).kind = "PLAYER_ORDER";
    expect(() => assertCompatibleSimulationState(malformedIntent)).toThrow(
      "activeDesire.kind must be one of",
    );

    const danglingDecision = createSimulation(4_182);
    advanceUntilIntent(danglingDecision);
    const danglingCreature = danglingDecision.creatures.find(
      (creature) => creature.activePlan !== null,
    );
    if (!danglingCreature?.activePlan) throw new Error("Missing active plan fixture.");
    danglingCreature.activePlan.selectedByDecisionId = 999_999;
    expect(() => assertCompatibleSimulationState(danglingDecision)).toThrow(
      "selectedByDecisionId references missing ID 999999",
    );

    const duplicateClaim = createSimulation(4_182);
    let claimOwners = duplicateClaim.creatures.filter(
      (creature) => creature.activeAction?.interactionClaim,
    );
    for (let tick = 0; tick < 300 && claimOwners.length < 2; tick += 1) {
      advanceSimulation(duplicateClaim, 1);
      claimOwners = duplicateClaim.creatures.filter(
        (creature) => creature.activeAction?.interactionClaim,
      );
    }
    const firstClaim = claimOwners[0]?.activeAction?.interactionClaim;
    const second = claimOwners[1];
    if (!firstClaim || !second?.activeAction || !second.activePlan) {
      throw new Error("Missing duplicate-claim fixture.");
    }
    second.activeAction.interactionClaim = { ...firstClaim };
    second.activePlan.interactionClaim = { ...firstClaim };
    expect(() => assertCompatibleSimulationState(duplicateClaim)).toThrow(
      "invalid interaction claims",
    );
  });

  it("enforces collection and serialized-input limits before accepting data", () => {
    const state = clonedState();
    state.commandQueue = new Array(MAX_PERSISTED_COLLECTION_ITEMS + 1).fill({
      commandId: 1,
      applyAtTick: 1,
      type: "ADD_FOOD",
      tileIndex: 1,
      amount: 1,
      blocked: null,
    });
    expect(() => assertCompatibleSimulationState(state)).toThrow(
      `${MAX_PERSISTED_COLLECTION_ITEMS.toString()} item limit`,
    );
    expect(() =>
      deserializeSimulationSave(" ".repeat(MAX_PERSISTED_JSON_CHARACTERS + 1)),
    ).toThrow("Save data exceeds");
  });

  it("keeps the caller's active state untouched after a failed import", () => {
    const active = createSimulation(66);
    const before = hashSimulationState(active);
    const save = createSimulationSave(clonedState(77));
    const malformed = {
      ...save,
      state: { ...save.state, world: { ...save.state.world, tiles: null } },
    } as unknown as SimulationSaveV1;

    expect(() => migrateSimulationSave(malformed)).toThrow("world.tiles must be an array");
    expect(hashSimulationState(active)).toBe(before);
  });
});

function advanceUntilIntent(state: SimulationState): void {
  for (let tick = 0; tick < 100; tick += 1) {
    if (state.creatures.some((creature) => creature.activePlan !== null)) return;
    advanceSimulation(state, 1);
  }
}
