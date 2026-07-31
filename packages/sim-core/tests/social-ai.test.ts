import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSimulation,
  type DecisionCandidate,
} from "../src/index.js";

function factorTotal(candidate: DecisionCandidate): number {
  return candidate.factors.reduce((total, factor) => total + factor.contribution, 0);
}

describe("utility decisions", () => {
  it("stores up to five alternatives whose factor sums equal their utilities", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 900);

    expect(state.decisionRecords.length).toBeGreaterThan(0);
    for (const record of state.decisionRecords) {
      expect(record.candidates.length).toBeGreaterThan(0);
      expect(record.candidates.length).toBeLessThanOrEqual(5);
      for (const candidate of record.candidates) {
        expect(factorTotal(candidate)).toBe(candidate.utility);
      }
    }
  });

  it("lets seed 4182 create a factual social-storage-theft loop", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 1_000);

    expect(state.metrics.foodShared).toBeGreaterThan(0);
    expect(state.metrics.groupsFormed).toBeGreaterThan(0);
    expect(state.metrics.storagesCompleted).toBeGreaterThan(0);
    expect(state.metrics.thefts).toBeGreaterThan(0);
    expect(state.metrics.witnessedThefts).toBeGreaterThan(0);
    expect(state.metrics.attacks).toBeGreaterThan(0);
    expect(state.metrics.attacks).toBeLessThan(50);

    const theftHistory = state.historyEvents.find((event) => event.type === "THEFT");
    expect(theftHistory).toBeDefined();
    const theftFact = state.domainEvents.find(
      (event) =>
        event.type === "THEFT_COMMITTED" && theftHistory?.sourceEventIds.includes(event.id),
    );
    expect(theftFact?.quantity).toBe(1);
    expect(theftFact?.decisionRecordIds.length).toBeGreaterThan(0);
    expect(
      state.decisionRecords.some((record) =>
        theftFact?.decisionRecordIds.includes(record.id),
      ),
    ).toBe(true);
  });

  it("makes sharing build directed trust and an evidence-linked memory", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 450);

    const share = state.domainEvents.find((event) => event.type === "FOOD_SHARED");
    expect(share).toBeDefined();
    const donorId = share?.actorIds[0];
    const recipientId = share?.targetIds[0];
    expect(donorId).toBeTypeOf("number");
    expect(recipientId).toBeTypeOf("number");

    const recipientTrust = state.relationships.find(
      (edge) => edge.fromId === recipientId && edge.toId === donorId,
    );
    expect(recipientTrust?.trust).toBeGreaterThan(0);
    expect(
      state.memories.some(
        (memory) =>
          memory.ownerId === recipientId &&
          memory.kind === "HELP_RECEIVED" &&
          (share ? memory.sourceEventIds.includes(share.id) : false),
      ),
    ).toBe(true);
  });

  it("makes witnessed theft lower trust and create rivalry without a brawl loop", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 1_200);

    const witnessed = state.domainEvents.find((event) => event.type === "THEFT_WITNESSED");
    expect(witnessed).toBeDefined();
    const thiefId = witnessed?.targetIds[0];
    const witnessId = witnessed?.actorIds[0];
    const edge = state.relationships.find(
      (relationship) => relationship.fromId === witnessId && relationship.toId === thiefId,
    );
    expect(edge?.trust).toBeLessThan(0);
    expect(edge?.rivalry).toBeGreaterThan(0);
    expect(state.metrics.attacks).toBeLessThan(50);
  });
});

describe("resource invariants", () => {
  it("never creates negative or over-capacity personal inventories", () => {
    const state = createSimulation(731);
    advanceSimulation(state, 5_000);

    for (const creature of state.creatures) {
      expect(creature.inventory.food).toBeGreaterThanOrEqual(0);
      expect(creature.inventory.material).toBeGreaterThanOrEqual(0);
      expect(creature.inventory.food + creature.inventory.material).toBeLessThanOrEqual(
        creature.inventory.capacity,
      );
    }
    for (const node of state.resourceNodes) {
      expect(node.currentStock).toBeGreaterThanOrEqual(0);
      expect(node.currentStock).toBeLessThanOrEqual(node.maximumStock);
    }
    for (const structure of state.structures) {
      expect(structure.inventory.food).toBeGreaterThanOrEqual(0);
    }
  });
});
