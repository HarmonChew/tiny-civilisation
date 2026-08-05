import { describe, expect, it } from "vitest";
import { createRenderSnapshot, createSimulation } from "../src/index.js";
import { claimInteractionSlot } from "../src/interaction-slots.js";

describe("water-source access projection", () => {
  it("publishes reachability, weighted cost, and three-slot pressure", () => {
    const state = createSimulation(4_182);
    const source = state.resourceNodes.find((node) => node.kind === "WATER");
    const creature = state.creatures[0];
    if (!source || !creature) throw new Error("Missing water-access fixture.");

    const initial = createRenderSnapshot(state, false).resourceNodes.find(
      (node) => node.id === source.id,
    );
    expect(initial?.waterAccess).toMatchObject({
      interactionCapacity: 3,
      claimedInteractionSlots: 0,
      reachableCreatures: 8,
      livingCreatures: 8,
    });
    expect(initial?.waterAccess?.nearestWeightedCost).not.toBeNull();
    expect(initial?.waterAccess?.meanWeightedCost).not.toBeNull();
    const creatureAccess = createRenderSnapshot(state, false).creatures[0]?.waterAccess;
    expect(creatureAccess).toMatchObject({
      sourceId: source.id,
      sourceStock: source.currentStock,
      sourceCapacity: source.maximumStock,
      reachableSources: 1,
      totalSources: 1,
      interactionCapacity: 3,
      claimedInteractionSlots: 0,
    });
    expect(creatureAccess?.weightedCost).toBeGreaterThan(0);

    const claim = claimInteractionSlot(
      state,
      creature,
      "GATHER_WATER",
      source.id,
      source.tileIndex,
    );
    if (!claim) throw new Error("Expected a reachable water interaction slot.");
    creature.activeAction = {
      kind: "GATHER_WATER",
      phase: "MOVING",
      startedAtTick: state.tick,
      targetEntityId: source.id,
      targetTileIndex: claim.tileIndex,
      path: [creature.tileIndex],
      pathIndex: 0,
      progress: 0,
      workRequired: 10_000,
      navigationRevision: state.world.navigationRevision,
      interactionClaim: claim,
    };

    const claimed = createRenderSnapshot(state, false).resourceNodes.find(
      (node) => node.id === source.id,
    );
    expect(claimed?.waterAccess?.claimedInteractionSlots).toBe(1);
    expect(claimed?.waterAccess?.reachableCreatures).toBe(8);
    expect(claimed?.waterAccess?.nearestWeightedCost).toBe(
      initial?.waterAccess?.nearestWeightedCost,
    );
    expect(
      createRenderSnapshot(state, false).creatures[0]?.waterAccess?.claimedInteractionSlots,
    ).toBe(1);
  });

  it("uses null access metadata for non-water resources", () => {
    const snapshot = createRenderSnapshot(createSimulation(3), false);
    expect(
      snapshot.resourceNodes
        .filter((node) => node.kind !== "WATER")
        .every((node) => node.waterAccess === null),
    ).toBe(true);
  });
});
