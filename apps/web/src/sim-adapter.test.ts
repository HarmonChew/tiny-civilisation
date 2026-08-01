import { describe, expect, it } from "vitest";
import {
  createRenderSnapshot,
  hashSimulationState,
  projectCreatureObservationSummary,
  type SimulationState,
} from "@tiny-civ/sim-core";
import {
  advanceSimulationTicks,
  createSimulationState,
  makeWorldView,
  makeWorldViewFromSnapshot,
  queueIntervention,
} from "./sim-adapter";

describe("simulation UI adapter", () => {
  it("uses the core factual observation summary for state-derived views", () => {
    const state = createSimulationState(4_182);
    advanceSimulationTicks(state, 25);
    const subject = state.creatures.find(
      (creature) => creature.activeDesire && creature.activePlan && creature.activeAction,
    );
    if (!subject) throw new Error("Missing active creature fixture.");

    const expected = projectCreatureObservationSummary(subject);
    const mapped = makeWorldView(state).creatures.find(
      (creature) => creature.id === subject.id,
    );
    const projected = makeWorldViewFromSnapshot(
      createRenderSnapshot(state, false),
      hashSimulationState(state),
    ).creatures.find((creature) => creature.id === subject.id);
    expect(mapped?.summary).toEqual({
      desire: expected.desire.text,
      plan: expected.plan.text,
      action: expected.action.text,
      reason: expected.reason.text,
    });
    expect(projected?.reason).toBe(mapped?.reason);
    expect(projected?.summary).toEqual(mapped?.summary);
    expect(projected?.candidates).toEqual(mapped?.candidates);
    expect(projected?.inventory).toEqual(mapped?.inventory);
    expect(projected?.interactionSlot).toEqual(mapped?.interactionSlot);
  });

  it("retains bootstrap tiles when a dynamic observation omits static world data", () => {
    const state = createSimulationState(4_182);
    const bootstrap = makeWorldViewFromSnapshot(
      createRenderSnapshot(state),
      hashSimulationState(state),
    );
    advanceSimulationTicks(state, 1);
    const dynamic = makeWorldViewFromSnapshot(
      createRenderSnapshot(state, false),
      hashSimulationState(state),
      bootstrap.tiles,
    );

    expect(bootstrap.tiles.length).toBeGreaterThan(0);
    expect(dynamic.tiles).toEqual(bootstrap.tiles);
    expect(dynamic.tiles).not.toBe(bootstrap.tiles);
    expect(dynamic.tick).toBe(1);
  });

  it("keeps the authoritative state intact when an intervention is queued", () => {
    const state = createSimulationState(4182);
    const initial = makeWorldView(state);
    const tile = initial.tiles.find((candidate) => !candidate.blocked);

    expect(initial.population).toBe(8);
    expect(tile).toBeTruthy();
    expect(initial.creatures.every((creature) => creature.groupId !== 0)).toBe(true);

    const queued = queueIntervention(state, "add-food", tile!);
    expect(queued).toBe(state);

    const advanced = advanceSimulationTicks(queued, 1);
    const after = makeWorldView(advanced);
    expect(after.tick).toBe(1);
    expect(after.population).toBe(8);
    const intervention = after.events.find(
      (event) => event.type === "INTERVENTION" && event.playerCaused,
    );
    expect(intervention).toMatchObject({
      commandId: 1,
      commandOutcome: "APPLIED",
      locationTileIndex: tile!.index,
    });
    expect(intervention?.commandSourceEventId).toBeTypeOf("number");
    expect(intervention?.causedByEventIds).toContain(intervention?.commandSourceEventId);
  });

  it("maps null social IDs, storage stock, and colliding event sequences truthfully", () => {
    const state = createSimulationState(17) as SimulationState;
    const owner = state.creatures[0]!;
    const earlierActor = state.creatures[1]!;
    const memoryId = state.nextMemoryId++;
    owner.memoryIds.push(memoryId);
    state.memories.push({
      id: memoryId,
      ownerId: owner.id,
      kind: "RESOURCE_FOUND",
      createdTick: state.tick,
      subjectEntityId: null,
      locationTileIndex: owner.tileIndex,
      valence: 0,
      importance: 4_000,
      strength: 5_000,
      sourceEventIds: [77],
    });

    state.groups.push({
      id: 99,
      name: "Test keepers",
      foundedTick: 0,
      stage: "PERSISTENT",
      memberIds: [],
      leaderId: null,
      homeTileIndex: owner.tileIndex,
      storageStructureId: 500,
      cohesion: 4_000,
      sharingNorm: 0,
      majorEventIds: [],
    });
    state.structures.push({
      id: 500,
      kind: "STORAGE",
      tileIndex: owner.tileIndex,
      groupId: 99,
      material: 12,
      materialRequired: 12,
      progress: 10_000,
      workRequired: 10_000,
      inventory: { capacity: 80, food: 7, material: 2 },
      guardIds: [],
      completedTick: 0,
    });

    state.decisionRecords.push(
      {
        id: 900,
        tick: 0,
        actorId: earlierActor.id,
        previousAction: null,
        selectedAction: "STEAL",
        selectedDesire: "RELIEVE_HUNGER",
        selectedPlan: "TAKE_FOOD",
        selectedTargetId: owner.id,
        strongestReason: null,
        switchReason: "NO_ACTIVE_GOAL",
        candidates: [
          {
            action: "STEAL",
            desire: "RELIEVE_HUNGER",
            plan: "TAKE_FOOD",
            targetEntityId: owner.id,
            targetTileIndex: null,
            utility: 4_000,
            factors: [],
          },
        ],
      },
      {
        id: 901,
        tick: 0,
        actorId: owner.id,
        previousAction: null,
        selectedAction: "SHARE",
        selectedDesire: "RECIPROCATE_OR_REPAIR",
        selectedPlan: "SHARE_WITH_OTHER",
        selectedTargetId: earlierActor.id,
        strongestReason: {
          kind: "MEMORY",
          key: "remembered help",
          label: "Remembered help",
          value: "recent",
          unit: "LABEL",
          sourceEntityId: earlierActor.id,
          sourceEventIds: [],
          capturedAtTick: 0,
        },
        switchReason: "NO_ACTIVE_GOAL",
        candidates: [
          {
            action: "SHARE",
            desire: "RECIPROCATE_OR_REPAIR",
            plan: "SHARE_WITH_OTHER",
            targetEntityId: state.creatures[2]!.id,
            targetTileIndex: null,
            utility: 7_000,
            factors: [],
          },
          {
            action: "SHARE",
            desire: "RECIPROCATE_OR_REPAIR",
            plan: "SHARE_WITH_OTHER",
            targetEntityId: earlierActor.id,
            targetTileIndex: null,
            utility: 6_000,
            factors: [],
          },
        ],
      },
    );
    state.domainEvents.push({
      id: 77,
      tick: 0,
      type: "FOOD_SHARED",
      actorIds: [owner.id],
      targetIds: [],
      groupIds: [],
      locationTileIndex: owner.tileIndex,
      resourceKind: "FOOD",
      quantity: 1,
      causedByEventIds: [],
      decisionRecordIds: [901],
      importance: 22,
      attentionTier: "NOTABLE",
      clusterKey: "test-share",
      commandId: null,
      commandOutcome: null,
      commandRejectionReason: null,
      summary: `${owner.name} shared a test portion.`,
    });
    state.domainEvents.push({
      id: 78,
      tick: 0,
      type: "THEFT_COMMITTED",
      actorIds: [earlierActor.id],
      targetIds: [owner.id],
      groupIds: [],
      locationTileIndex: owner.tileIndex,
      resourceKind: "FOOD",
      quantity: 1,
      causedByEventIds: [],
      decisionRecordIds: [900],
      importance: 62,
      attentionTier: "SIGNIFICANT",
      clusterKey: "test-theft",
      commandId: null,
      commandOutcome: null,
      commandRejectionReason: null,
      summary: `${earlierActor.name} stole an earlier test portion.`,
    });
    state.historyEvents.push({
      id: 77,
      tick: 0,
      type: "SOCIAL_BOND",
      title: "A test bond formed",
      summary: "A factual history record with a colliding sequence ID.",
      sourceEventIds: [77, 78],
      actorIds: [earlierActor.id, owner.id],
      groupIds: [],
      importance: 50,
    });

    const view = makeWorldView(state);
    const mappedOwner = view.creatures.find((creature) => creature.id === owner.id);
    const mappedGroup = view.groups.find((group) => group.id === 99);
    const mappedStore = view.structures.find((structure) => structure.id === 500);
    const collidingEvents = view.events.filter(
      (event) => event.type === "FOOD_SHARED" || event.type === "SOCIAL_BOND",
    );

    expect(mappedOwner?.groupId).toBeUndefined();
    expect(mappedOwner?.memories[0]?.subjectId).toBeUndefined();
    expect(mappedGroup?.leaderId).toBeUndefined();
    expect(mappedStore?.stored).toBe(7);
    expect(mappedStore?.capacity).toBe(80);
    // A domain event promoted into factual history is shown once, through the
    // richer historical record, instead of duplicated in the chronicle.
    expect(collidingEvents).toHaveLength(1);
    expect(
      collidingEvents.find((event) => event.type === "SOCIAL_BOND")?.causedByEventIds,
    ).toEqual([77, 78]);
    expect(
      collidingEvents.find((event) => event.type === "SOCIAL_BOND")?.decisionActorId,
    ).toBe(owner.id);
    expect(collidingEvents.find((event) => event.type === "SOCIAL_BOND")?.reason).toBe(
      "the retained “remembered help” factor weighs most.",
    );
    expect(
      collidingEvents.find((event) => event.type === "SOCIAL_BOND")?.decisionCandidates?.[0]
        ?.action,
    ).toBe("SHARE");
    const linkedCandidates = collidingEvents.find(
      (event) => event.type === "SOCIAL_BOND",
    )?.decisionCandidates;
    expect(linkedCandidates?.filter((candidate) => candidate.selected)).toHaveLength(1);
    expect(linkedCandidates?.find((candidate) => candidate.selected)?.targetId).toBe(
      earlierActor.id,
    );
  });

  it("scales low authoritative Unit values without treating them as percentages", () => {
    const state = createSimulationState(29) as SimulationState;
    const subject = state.creatures[0]!;
    const other = state.creatures[1]!;
    subject.health = 34;
    subject.needs.hunger = 4;
    subject.needs.fatigue = 8;
    subject.traits.generosity = 34;
    state.relationships.push({
      id: state.nextRelationshipId++,
      fromId: subject.id,
      toId: other.id,
      trust: 34,
      fear: 34,
      familiarity: 34,
      rivalry: 34,
      lastInteractionTick: state.tick,
      significantEventIds: [],
    });

    const mapped = makeWorldView(state).creatures.find(
      (creature) => creature.id === subject.id,
    );
    const generosity = mapped?.traits.find((trait) => trait.key === "generosity");
    const relationship = mapped?.relationships.find((edge) => edge.otherId === other.id);

    expect(mapped?.health).toBeCloseTo(0.34);
    expect(mapped?.hunger).toBeCloseTo(0.04);
    expect(mapped?.fatigue).toBeCloseTo(0.08);
    expect(generosity?.value).toBeCloseTo(0.34);
    expect(relationship?.familiarity).toBeCloseTo(0.34);
    expect(relationship?.trust).toBeCloseTo(0.0034);
  });
});
