import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSimulation,
  hashSimulationState,
  type SimulationState,
} from "../src/index.js";
import {
  addHistory,
  beginEventRetentionContext,
  emitDomainEvent,
  endEventRetentionContext,
  historicallyProtectedDecisionIds,
} from "../src/events.js";

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

  it("keeps indexed and scan-based retention paths hash-equivalent", () => {
    const indexed = createSimulation(77);
    const scanned = createSimulation(77);
    const exerciseRetention = (state: SimulationState, useIndex: boolean): number[] => {
      state.configuration.maxDomainEvents = 12;
      state.configuration.maxHistoryEvents = 1;
      const actor = state.creatures[0]!;
      let historicalSourceId = state.domainEvents[0]!.id;
      if (useIndex) beginEventRetentionContext(state);
      try {
        for (let index = 0; index < 48; index += 1) {
          const event = emitDomainEvent(state, {
            type: "ACTION_STARTED",
            actorIds: [actor.id],
            locationTileIndex: actor.tileIndex,
            causedByEventIds: index % 4 === 0 ? [historicalSourceId] : [],
            decisionRecordIds: [index + 1],
            summary: `${actor.name} exercised retained event ${index.toString()}.`,
          });
          if (index === 5 || index === 24) {
            historicalSourceId = event.id;
            addHistory(
              state,
              "SOCIAL_BOND",
              `Retention checkpoint ${index.toString()}`,
              "A retained event used to verify bounded-history equivalence.",
              [event.id],
              [actor.id],
              [],
              20,
            );
          }
        }
        return [...historicallyProtectedDecisionIds(state)].sort(
          (left, right) => left - right,
        );
      } finally {
        if (useIndex) endEventRetentionContext(state);
      }
    };

    const indexedProtectedDecisions = exerciseRetention(indexed, true);
    const scannedProtectedDecisions = exerciseRetention(scanned, false);

    expect(indexed.domainEvents).toEqual(scanned.domainEvents);
    expect(indexed.historyEvents).toEqual(scanned.historyEvents);
    expect(indexedProtectedDecisions).toEqual(scannedProtectedDecisions);
    expect(hashSimulationState(indexed)).toBe(hashSimulationState(scanned));
  });

  it("keeps save/load continuation identical to uninterrupted simulation", () => {
    const uninterrupted = createSimulation(921);
    const saved = createSimulation(921);

    advanceSimulation(uninterrupted, 2_400);
    advanceSimulation(saved, 1_200);
    const loaded = JSON.parse(JSON.stringify(saved)) as SimulationState;
    advanceSimulation(loaded, 1_200);

    expect(hashSimulationState(loaded)).toBe(hashSimulationState(uninterrupted));
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
      ).toBeLessThanOrEqual(state.configuration.maxRelationshipsPerCreature);
    }

    const eventIds = new Set(state.domainEvents.map((event) => event.id));
    const decisionIds = new Set(state.decisionRecords.map((decision) => decision.id));
    for (const history of state.historyEvents) {
      for (const sourceId of history.sourceEventIds) {
        expect(eventIds.has(sourceId)).toBe(true);
        const source = state.domainEvents.find((event) => event.id === sourceId);
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
