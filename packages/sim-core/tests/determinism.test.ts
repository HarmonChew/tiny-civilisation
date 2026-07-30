import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSimulation,
  hashSimulationState,
  type SimulationState,
} from "../src/index.js";

describe("deterministic simulation", () => {
  it("produces the same full-state hash for the same seed", () => {
    const first = createSimulation(4_182);
    const second = createSimulation(4_182);

    advanceSimulation(first, 2_500);
    for (let index = 0; index < 25; index += 1) {
      advanceSimulation(second, 100);
    }

    expect(hashSimulationState(first)).toBe(hashSimulationState(second));
  });

  it("keeps save/load continuation identical to uninterrupted simulation", () => {
    const uninterrupted = createSimulation(921);
    const saved = createSimulation(921);

    advanceSimulation(uninterrupted, 2_400);
    advanceSimulation(saved, 1_200);
    const loaded = JSON.parse(JSON.stringify(saved)) as SimulationState;
    advanceSimulation(loaded, 1_200);

    expect(hashSimulationState(loaded)).toBe(
      hashSimulationState(uninterrupted),
    );
  });

  it("makes distinct seeds produce distinct authoritative states", () => {
    const first = createSimulation(91);
    const second = createSimulation(92);
    advanceSimulation(first, 600);
    advanceSimulation(second, 600);
    expect(hashSimulationState(first)).not.toBe(hashSimulationState(second));
  });

  it("keeps authoritative bounded collections within configured limits", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 5_000);

    expect(state.domainEvents.length).toBeLessThanOrEqual(
      state.configuration.maxDomainEvents,
    );
    expect(state.historyEvents.length).toBeLessThanOrEqual(
      state.configuration.maxHistoryEvents,
    );
    expect(state.decisionRecords.length).toBeLessThanOrEqual(
      state.configuration.maxDecisionRecords,
    );
    for (const creature of state.creatures) {
      expect(creature.memoryIds.length).toBeLessThanOrEqual(
        state.configuration.maxMemoriesPerCreature,
      );
      expect(
        state.relationships.filter((edge) => edge.fromId === creature.id).length,
      ).toBeLessThanOrEqual(
        state.configuration.maxRelationshipsPerCreature,
      );
    }

    const eventIds = new Set(state.domainEvents.map((event) => event.id));
    const decisionIds = new Set(
      state.decisionRecords.map((decision) => decision.id),
    );
    for (const history of state.historyEvents) {
      for (const sourceId of history.sourceEventIds) {
        expect(eventIds.has(sourceId)).toBe(true);
        const source = state.domainEvents.find(
          (event) => event.id === sourceId,
        );
        for (const decisionId of source?.decisionRecordIds ?? []) {
          expect(decisionIds.has(decisionId)).toBe(true);
        }
      }
    }
    for (const event of state.domainEvents) {
      for (const causeId of event.causedByEventIds) {
        expect(eventIds.has(causeId)).toBe(true);
      }
    }
  });
});
