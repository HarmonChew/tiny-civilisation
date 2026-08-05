import { describe, expect, it } from "vitest";
import { ACTION_DEFINITIONS, getActionDuration } from "../src/actions/registry.js";
import {
  maintainBoundedSocialState,
  validateAuthoritativeInvariants,
} from "../src/systems/maintenance.js";
import { regenerateResources, updateNeeds } from "../src/systems/needs-resources.js";
import { createSimulation } from "../src/index.js";

const EXPECTED_ACTIONS = [
  "EXPLORE",
  "GATHER_FOOD",
  "GATHER_MATERIAL",
  "GATHER_WATER",
  "EAT",
  "DRINK",
  "REST",
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
] as const;

describe("action registry", () => {
  it("registers every action exactly once with a positive duration", () => {
    expect(ACTION_DEFINITIONS.map((definition) => definition.kind)).toEqual(
      EXPECTED_ACTIONS,
    );
    expect(new Set(ACTION_DEFINITIONS.map((definition) => definition.kind)).size).toBe(
      EXPECTED_ACTIONS.length,
    );
    for (const action of EXPECTED_ACTIONS) {
      expect(getActionDuration(action)).toBeGreaterThan(0);
    }
  });
});

describe("focused authoritative systems", () => {
  it("updates needs and applies starvation damage with integer bounds", () => {
    const state = createSimulation(3);
    const creature = state.creatures[0]!;
    creature.needs.hunger = 9_399;
    creature.needs.fatigue = 9_499;
    creature.needs.thirst = 9_399;
    const health = creature.health;

    updateNeeds(state);

    expect(creature.needs.hunger).toBe(9_403);
    expect(creature.needs.fatigue).toBe(9_500);
    expect(creature.needs.thirst).toBe(9_404);
    expect(creature.health).toBe(health - 6);
  });

  it("regenerates resources only on their declared cadence", () => {
    const state = createSimulation(5);
    const node = state.resourceNodes[0]!;
    node.currentStock = 0;
    state.tick = node.regenerationEveryTicks;
    regenerateResources(state);
    expect(node.currentStock).toBe(node.regenerationAmount);
    state.tick += 1;
    regenerateResources(state);
    expect(node.currentStock).toBe(node.regenerationAmount);
  });

  it("decays bounded social state and repairs inventory invariants", () => {
    const state = createSimulation(8);
    const creature = state.creatures[0]!;
    state.tick = 100;
    creature.inventory.capacity = 2;
    creature.inventory.food = 3.8;
    creature.inventory.material = 2.4;
    creature.inventory.water = 1.7;
    maintainBoundedSocialState(state);
    validateAuthoritativeInvariants(state);
    expect(creature.inventory).toMatchObject({
      capacity: 2,
      material: 0,
      water: 0,
      food: 2,
    });
    expect(
      creature.inventory.food + creature.inventory.material + creature.inventory.water,
    ).toBeLessThanOrEqual(2);
    expect(Number.isInteger(creature.inventory.food)).toBe(true);
    expect(Number.isInteger(creature.inventory.material)).toBe(true);
    expect(Number.isInteger(creature.inventory.water)).toBe(true);
  });
});
