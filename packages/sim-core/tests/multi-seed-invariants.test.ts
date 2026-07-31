import { describe, expect, it } from "vitest";
import { advanceSimulation, createSimulation, hashSimulationState } from "../src/index.js";

describe("sampled multi-seed invariants", () => {
  it("keeps authoritative collections bounded and deterministic", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const first = createSimulation(seed);
      const second = createSimulation(seed);
      advanceSimulation(first, 2_000);
      advanceSimulation(second, 2_000);

      expect(hashSimulationState(first)).toBe(hashSimulationState(second));
      expect(first.creatures.every((creature) => creature.inventory.food >= 0)).toBe(true);
      expect(
        first.creatures.every(
          (creature) =>
            creature.inventory.food + creature.inventory.material <=
            creature.inventory.capacity,
        ),
      ).toBe(true);
      expect(first.domainEvents.length).toBeLessThanOrEqual(
        first.configuration.maxDomainEvents,
      );
      expect(first.historyEvents.length).toBeLessThanOrEqual(
        first.configuration.maxHistoryEvents,
      );
      expect(first.decisionRecords.length).toBeLessThanOrEqual(
        first.configuration.maxDecisionRecords,
      );
    }
  }, 20_000);
});
