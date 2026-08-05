import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  estimateInteractionTravelIgnoringOccupancy,
  findPath,
  findWeightedPath,
  manhattanDistance,
  queuePlayerCommand,
  TILE_FIXED_UNITS,
  tileCoordinates,
  tileIndexAt,
} from "../src/index.js";

describe("pathfinding", () => {
  it("prefers a longer geometric route when its weighted travel cost is lower", () => {
    const width = 5;
    const height = 3;
    const world = {
      width,
      height,
      navigationRevision: 0,
      tiles: Array.from({ length: width * height }, (_, index) => ({
        index,
        x: index % width,
        y: Math.floor(index / width),
        terrain: "GROUND" as const,
        walkCost: index > width && index < width * 2 - 1 ? 30 : 10,
        blocked: false,
        navigationRevision: 0,
      })),
    };

    const result = findWeightedPath(world, width, width * 2 - 1);

    expect(result?.cost).toBe(60);
    expect(result?.path).not.toContain(width + 2);
  });

  it("selects the cheapest weighted water target instead of the Manhattan-nearest source", () => {
    const state = createSimulation(createScenarioReference("unequal-table", 1));
    const creature = state.creatures[0];
    if (!creature) throw new Error("Missing weighted target-selection fixture creature.");

    const originX = 1;
    const originY = 21;
    creature.tileIndex = tileIndexAt(state.world, originX, originY);
    creature.x = originX * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    creature.y = originY * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    creature.needs.hunger = 0;
    creature.needs.fatigue = 0;
    creature.needs.thirst = 9_500;
    creature.inventory.food = 0;
    creature.inventory.material = 0;
    creature.inventory.water = 0;
    creature.activeDesire = null;
    creature.activePlan = null;
    creature.activeGoal = null;
    creature.activeAction = null;
    creature.nextDecisionTick = state.tick;
    for (const other of state.creatures) {
      if (other.id !== creature.id) other.nextDecisionTick = state.tick + 1_000;
    }

    const sources = state.resourceNodes.filter((node) => node.kind === "WATER");
    const byManhattan = [...sources].sort(
      (left, right) =>
        manhattanDistance(state.world, creature.tileIndex, left.tileIndex) -
          manhattanDistance(state.world, creature.tileIndex, right.tileIndex) ||
        left.id - right.id,
    );
    const byWeighted = sources
      .map((source) => ({
        source,
        estimate: estimateInteractionTravelIgnoringOccupancy(
          state,
          creature,
          "GATHER_WATER",
          source.id,
          source.tileIndex,
        ),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          source: (typeof sources)[number];
          estimate: NonNullable<typeof candidate.estimate>;
        } => candidate.estimate !== null,
      )
      .sort(
        (left, right) =>
          left.estimate.cost - right.estimate.cost || left.source.id - right.source.id,
      );

    expect(byManhattan[0]?.id).not.toBe(byWeighted[0]?.source.id);
    expect(byWeighted[0]?.estimate.cost).toBeLessThan(
      byWeighted[1]?.estimate.cost ?? Number.POSITIVE_INFINITY,
    );

    advanceSimulation(state, 1);

    const decision = [...state.decisionRecords]
      .reverse()
      .find((record) => record.actorId === creature.id);
    expect(decision).toMatchObject({
      selectedAction: "GATHER_WATER",
      selectedTargetId: byWeighted[0]?.source.id,
    });
    expect(
      decision?.candidates
        .find((candidate) => candidate.targetEntityId === byWeighted[0]?.source.id)
        ?.factors.find((factor) => factor.key === "weighted travel cost")?.fact,
    ).toMatchObject({ unit: "MOVE_COST", value: byWeighted[0]?.estimate.cost });
  });

  it("returns a deterministic adjacent walkable route through the chokepoint", () => {
    const state = createSimulation(4_182);
    const start = tileIndexAt(state.world, 10, 7);
    const goal = tileIndexAt(state.world, 37, 22);
    const first = findPath(state.world, start, goal);
    const second = findPath(state.world, start, goal);

    expect(first).toEqual(second);
    expect(first[0]).toBe(start);
    expect(first.at(-1)).toBe(goal);
    for (let index = 1; index < first.length; index += 1) {
      const previous = tileCoordinates(state.world, first[index - 1] ?? -1);
      const current = tileCoordinates(state.world, first[index] ?? -1);
      expect(Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y)).toBe(1);
      expect(state.world.tiles[first[index] ?? -1]?.blocked).toBe(false);
    }
    expect(
      first.some((tileIndex) => {
        const point = tileCoordinates(state.world, tileIndex);
        return point.x === 24 && point.y >= 14 && point.y <= 17;
      }),
    ).toBe(true);
  });

  it("returns no route when every central opening is closed", () => {
    const state = createSimulation(23);
    for (const y of [14, 15, 16, 17]) {
      queuePlayerCommand(state, {
        type: "TOGGLE_OBSTACLE",
        applyAtTick: 0,
        x: 24,
        y,
        blocked: true,
      });
    }
    advanceSimulation(state, 1);
    expect(
      findPath(
        state.world,
        tileIndexAt(state.world, 10, 7),
        tileIndexAt(state.world, 37, 22),
      ),
    ).toEqual([]);
    expect(state.world.navigationRevision).toBe(4);
  });

  it("does not count unreachable interaction slots as invalid paths", () => {
    const state = createSimulation(23);
    for (const y of [14, 15, 16, 17]) {
      queuePlayerCommand(state, {
        type: "TOGGLE_OBSTACLE",
        applyAtTick: 0,
        x: 24,
        y,
        blocked: true,
      });
    }

    advanceSimulation(state, 120);

    expect(state.metrics.invalidPathFailures).toBe(0);
  });
});

describe("player command queue", () => {
  it("replenishes and drains only existing potable sources with actual quantities", () => {
    const state = createSimulation(42);
    const source = state.resourceNodes.find((node) => node.kind === "WATER")!;
    const missingTile = tileIndexAt(state.world, 6, 6);
    const initialGap = source.maximumStock - source.currentStock;
    queuePlayerCommand(state, {
      type: "REPLENISH_WATER",
      tileIndex: source.tileIndex,
      amount: 999,
    });
    queuePlayerCommand(state, {
      type: "DRAIN_WATER",
      tileIndex: missingTile,
      amount: 4,
    });

    advanceSimulation(state, 1);

    expect(source.currentStock).toBe(source.maximumStock);
    const replenish = state.domainEvents.find(
      (event) => event.type === "PLAYER_REPLENISHED_WATER",
    );
    const rejectedDrain = state.domainEvents.find(
      (event) =>
        event.type === "PLAYER_DRAINED_WATER" && event.locationTileIndex === missingTile,
    );
    expect(replenish).toMatchObject({
      quantity: initialGap,
      commandOutcome: "APPLIED",
      commandRejectionReason: null,
    });
    expect(rejectedDrain).toMatchObject({
      quantity: 0,
      commandOutcome: "REJECTED",
      commandRejectionReason: "NO_WATER_SOURCE",
    });
    expect(
      state.resourceNodes.some(
        (node) => node.kind === "WATER" && node.tileIndex === missingTile,
      ),
    ).toBe(false);
  });

  it("applies a command on its exact scheduled tick", () => {
    const state = createSimulation(42);
    const target = tileIndexAt(state.world, 6, 6);
    queuePlayerCommand(state, {
      type: "ADD_FOOD",
      tileIndex: target,
      amount: 7,
      applyAtTick: 3,
    });

    advanceSimulation(state, 3);
    expect(state.tick).toBe(3);
    expect(state.resourceNodes.find((node) => node.tileIndex === target)).toBeUndefined();

    advanceSimulation(state, 1);
    expect(
      state.resourceNodes.find((node) => node.tileIndex === target)?.currentStock,
    ).toBe(7);
    expect(state.metrics.playerInterventions).toBe(1);
  });

  it("uses command IDs to preserve same-tick insertion order", () => {
    const state = createSimulation(42);
    const target = tileIndexAt(state.world, 6, 6);
    const add = queuePlayerCommand(state, {
      type: "ADD_FOOD",
      tileIndex: target,
      amount: 10,
    });
    const remove = queuePlayerCommand(state, {
      type: "REMOVE_FOOD",
      tileIndex: target,
      amount: 4,
    });

    expect(add.commandId).toBeLessThan(remove.commandId);
    advanceSimulation(state, 1);
    expect(
      state.resourceNodes.find((node) => node.tileIndex === target)?.currentStock,
    ).toBe(6);
  });

  it("rejects food quantities outside the persisted command contract", () => {
    const state = createSimulation(42);
    const target = tileIndexAt(state.world, 6, 6);
    expect(() =>
      queuePlayerCommand(state, {
        type: "ADD_FOOD",
        tileIndex: target,
        amount: 1_000,
      }),
    ).toThrow("whole number from 1 to 999");
    expect(() =>
      queuePlayerCommand(state, {
        type: "REMOVE_FOOD",
        tileIndex: target,
        amount: 1.5,
      }),
    ).toThrow("whole number from 1 to 999");
    expect(state.commandQueue).toEqual([]);
  });

  it("rejects fractional command ticks and tile indexes before scheduling", () => {
    const state = createSimulation(42);
    expect(() =>
      queuePlayerCommand(state, {
        type: "ADD_FOOD",
        tileIndex: 4.5,
        amount: 1,
      }),
    ).toThrow("targets invalid tile");
    expect(() =>
      queuePlayerCommand(state, {
        type: "ADD_FOOD",
        tileIndex: 4,
        amount: 1,
        applyAtTick: 2.5,
      }),
    ).toThrow("tick must be a nonnegative whole number");
    expect(state.commandQueue).toEqual([]);
  });

  it("does not trap a creature by blocking its occupied tile", () => {
    const state = createSimulation(4_182);
    const creature = state.creatures[0];
    expect(creature).toBeDefined();
    const occupiedTile = creature?.tileIndex ?? -1;
    queuePlayerCommand(state, {
      type: "TOGGLE_OBSTACLE",
      tileIndex: occupiedTile,
      blocked: true,
    });
    advanceSimulation(state, 300);

    expect(state.world.tiles[occupiedTile]?.blocked).toBe(false);
    expect(state.creatures[0]?.activeAction).not.toBeNull();
    expect(state.metrics.invalidPathFailures).toBeLessThan(20);
  });

  it("relocates food placement away from an unreachable blocked tile", () => {
    const state = createSimulation(19);
    const blockedTile = tileIndexAt(state.world, 24, 4);
    expect(state.world.tiles[blockedTile]?.blocked).toBe(true);
    const scheduled = queuePlayerCommand(state, {
      type: "ADD_FOOD",
      tileIndex: blockedTile,
      amount: 9,
    });
    advanceSimulation(state, 1);

    expect(scheduled.tileIndex).not.toBe(blockedTile);
    expect(state.world.tiles[scheduled.tileIndex]?.blocked).toBe(false);
    expect(
      state.resourceNodes.find(
        (node) => node.tileIndex === scheduled.tileIndex && node.kind === "FOOD",
      )?.currentStock,
    ).toBe(9);
  });
});
