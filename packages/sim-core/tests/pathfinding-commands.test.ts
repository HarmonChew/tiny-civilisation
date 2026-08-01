import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSimulation,
  findPath,
  queuePlayerCommand,
  tileCoordinates,
  tileIndexAt,
} from "../src/index.js";

describe("pathfinding", () => {
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
