import { describe, expect, it } from "vitest";
import {
  createCausalEvidenceProjection,
  createSimulation,
  type SimulationState,
} from "../src/index.js";

function evidenceState(): SimulationState {
  const state = createSimulation(3);
  const actor = state.creatures[0];
  const target = state.creatures[1];
  if (!actor || !target) throw new Error("Missing fixture creatures.");
  state.decisionRecords.push({
    id: 1,
    tick: 1,
    actorId: actor.id,
    previousAction: "EXPLORE",
    selectedAction: "SHARE",
    selectedTargetId: target.id,
    switchReason: "NEW_OPTION_EXCEEDED_HYSTERESIS",
    candidates: [
      {
        action: "SHARE",
        targetEntityId: target.id,
        targetTileIndex: target.tileIndex,
        utility: 720,
        factors: [{ key: "remembered-help", contribution: 300, evidenceEventIds: [1] }],
      },
      {
        action: "KEEP",
        targetEntityId: null,
        targetTileIndex: null,
        utility: 500,
        factors: [],
      },
    ],
  });
  state.domainEvents.push({
    id: 2,
    tick: 2,
    type: "FOOD_SHARED",
    actorIds: [actor.id],
    targetIds: [target.id],
    groupIds: [],
    locationTileIndex: actor.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    causedByEventIds: [1],
    decisionRecordIds: [1],
    importance: 40,
    summary: `${actor.name} shared food with ${target.name}.`,
  });
  state.memories.push({
    id: 1,
    ownerId: target.id,
    kind: "HELP_RECEIVED",
    createdTick: 2,
    subjectEntityId: actor.id,
    locationTileIndex: actor.tileIndex,
    valence: 2_000,
    importance: 3_000,
    strength: 3_000,
    sourceEventIds: [2],
  });
  target.memoryIds.push(1);
  state.relationships.push({
    id: 1,
    fromId: target.id,
    toId: actor.id,
    trust: 1_500,
    fear: 0,
    familiarity: 300,
    rivalry: 0,
    lastInteractionTick: 2,
    significantEventIds: [2],
  });
  state.historyEvents.push({
    id: 1,
    tick: 2,
    type: "SOCIAL_BOND",
    title: "Food was shared",
    summary: "A social bond strengthened.",
    sourceEventIds: [2],
    actorIds: [actor.id, target.id],
    groupIds: [],
    importance: 40,
  });
  state.groups.push({
    id: 1,
    name: "Evidence group",
    stage: "PERSISTENT",
    foundedTick: 1,
    memberIds: [actor.id, target.id],
    leaderId: actor.id,
    homeTileIndex: actor.tileIndex,
    storageStructureId: state.nextEntityId,
    cohesion: 6_000,
    sharingNorm: 5_000,
    majorEventIds: [2],
  });
  actor.groupId = 1;
  target.groupId = 1;
  state.structures.push({
    id: state.nextEntityId++,
    kind: "STORAGE",
    tileIndex: actor.tileIndex,
    groupId: 1,
    material: 8,
    materialRequired: 8,
    progress: 10_000,
    workRequired: 10_000,
    inventory: { capacity: 100, food: 2, material: 0 },
    guardIds: [actor.id],
    completedTick: 2,
  });
  state.tick = 3;
  state.nextEventId = 3;
  state.nextDecisionId = 2;
  state.nextMemoryId = 2;
  state.nextRelationshipId = 2;
  state.nextHistoryId = 2;
  state.nextGroupId = 2;
  return state;
}

describe("causal evidence projection", () => {
  it("links an event to immediate causes, decisions, factors, actors, and targets", () => {
    const projection = createCausalEvidenceProjection(
      evidenceState(),
      { kind: "event", id: 2 },
      { maxDepth: 2 },
    );
    expect(projection.immediateCauses).toEqual([{ kind: "event", id: 1 }]);
    expect(projection.missingRefs).toEqual([]);
    expect(projection.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: { kind: "event", id: 2 },
          to: { kind: "event", id: 1 },
          relation: "CAUSED_BY",
        }),
        expect.objectContaining({
          from: { kind: "event", id: 2 },
          to: { kind: "decision", id: 1 },
          relation: "EXPLAINED_BY",
        }),
        expect.objectContaining({
          from: { kind: "decision", id: 1 },
          to: { kind: "event", id: 1 },
          relation: "SUPPORTED_BY",
          factorKey: "remembered-help",
          contribution: 300,
        }),
        expect.objectContaining({
          from: { kind: "event", id: 2 },
          to: { kind: "creature", id: 1 },
          relation: "ACTOR",
        }),
      ]),
    );
    const decision = projection.nodes.find((node) => node.ref.kind === "decision");
    expect(decision?.detail).toMatchObject({
      kind: "decision",
      selectedAction: "SHARE",
      candidates: [
        expect.objectContaining({
          action: "SHARE",
          factors: [
            {
              key: "remembered-help",
              contribution: 300,
              evidence: [{ kind: "event", id: 1 }],
            },
          ],
        }),
        expect.objectContaining({ action: "KEEP" }),
      ],
    });
  });

  it("provides reverse consequences and navigable memory/relationship evidence", () => {
    const state = evidenceState();
    const cause = createCausalEvidenceProjection(state, { kind: "event", id: 1 });
    expect(cause.laterConsequences).toEqual([{ kind: "event", id: 2 }]);

    const memory = createCausalEvidenceProjection(state, { kind: "memory", id: 1 });
    expect(memory.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "REMEMBERS", to: { kind: "event", id: 2 } }),
        expect.objectContaining({ relation: "OWNED_BY", to: { kind: "creature", id: 2 } }),
        expect.objectContaining({ relation: "ABOUT", to: { kind: "creature", id: 1 } }),
      ]),
    );

    const relationship = createCausalEvidenceProjection(
      state,
      { kind: "relationship", id: 1 },
      { maxDepth: 1 },
    );
    expect(relationship.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "SHAPED_BY", to: { kind: "event", id: 2 } }),
        expect.objectContaining({ relation: "FROM", to: { kind: "creature", id: 2 } }),
        expect.objectContaining({ relation: "TO", to: { kind: "creature", id: 1 } }),
      ]),
    );
  });

  it("uses summarized source events as the evidence and consequence roots for history", () => {
    const state = evidenceState();
    const actor = state.creatures[0];
    if (!actor) throw new Error("Missing fixture actor.");
    state.domainEvents.push({
      id: 3,
      tick: 3,
      type: "ACTION_STARTED",
      actorIds: [actor.id],
      targetIds: [],
      groupIds: [],
      locationTileIndex: actor.tileIndex,
      resourceKind: null,
      quantity: 1,
      causedByEventIds: [2],
      decisionRecordIds: [],
      importance: 20,
      summary: "Trust changed after the shared food.",
    });
    state.nextEventId = 4;

    const projection = createCausalEvidenceProjection(state, {
      kind: "history",
      id: 1,
    });
    expect(projection.immediateCauses).toEqual([{ kind: "event", id: 2 }]);
    expect(projection.laterConsequences).toEqual([{ kind: "event", id: 3 }]);
  });

  it("reports retained-reference gaps and bounded-query truncation factually", () => {
    const state = evidenceState();
    expect(
      createCausalEvidenceProjection(state, { kind: "event", id: 999 }).missingRefs,
    ).toEqual([{ kind: "event", id: 999 }]);
    expect(
      createCausalEvidenceProjection(
        state,
        { kind: "event", id: 2 },
        { maxNodes: 1, maxDepth: 2 },
      ).truncated,
    ).toBe(true);
    expect(() =>
      createCausalEvidenceProjection(state, { kind: "event", id: 2 }, { maxDepth: 6 }),
    ).toThrow("maxDepth must be between 0 and 5");
    expect(() =>
      createCausalEvidenceProjection(state, { kind: "event", id: 2 }, { maxNodes: 0 }),
    ).toThrow("maxNodes must be between 1 and 500");
  });

  it("projects every supported evidence subject without exposing mutable state", () => {
    const state = evidenceState();
    const structure = state.structures[0];
    const resource = state.resourceNodes[0];
    const actor = state.creatures[0];
    if (!structure || !resource || !actor) throw new Error("Missing evidence subjects.");
    const refs = [
      { kind: "decision", id: 1 },
      { kind: "history", id: 1 },
      { kind: "creature", id: actor.id },
      { kind: "group", id: 1 },
      { kind: "structure", id: structure.id },
      { kind: "resource", id: resource.id },
      { kind: "tile", id: actor.tileIndex },
    ] as const;

    for (const ref of refs) {
      const projection = createCausalEvidenceProjection(state, ref, {
        maxDepth: 1,
      });
      expect(projection.nodes.some((node) => node.ref.kind === ref.kind)).toBe(true);
      expect(projection.focus).toEqual(ref);
    }
    expect(createCausalEvidenceProjection(state, { kind: "history", id: 1 }).edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "SUMMARIZES" }),
        expect.objectContaining({ relation: "ACTOR" }),
      ]),
    );
    expect(
      createCausalEvidenceProjection(state, { kind: "structure", id: structure.id }).edges,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "GUARDED_BY" }),
        expect.objectContaining({ relation: "INVOLVES_GROUP" }),
        expect.objectContaining({ relation: "LOCATED_AT" }),
      ]),
    );
    expect(
      createCausalEvidenceProjection(state, { kind: "resource", id: resource.id }).edges,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ relation: "LOCATED_AT" })]),
    );
  });
});
