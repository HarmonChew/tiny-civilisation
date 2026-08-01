import {
  advanceSimulation,
  claimInteractionSlot,
  createSimulation,
  type ActiveAction,
  type AttentionTier,
  type DomainEvent,
  type DomainEventType,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import {
  ACTION_KINDS,
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  INTERACTION_PURPOSES,
  INTERACTION_EVENT_TYPES,
  INTERVENTION_CHANGE_KINDS,
  INTERVENTION_RESPONSE_WINDOW_TICKS,
  StreamingActivityCollector,
  summarizeActivityProfiles,
} from "./activity-collector.js";

function appendEvent(
  state: SimulationState,
  type: DomainEventType,
  attentionTier: AttentionTier,
  overrides: Partial<DomainEvent> = {},
): DomainEvent {
  const event: DomainEvent = {
    id: state.nextEventId++,
    tick: Math.max(0, state.tick - 1),
    type,
    actorIds: [],
    targetIds: [],
    groupIds: [],
    locationTileIndex: null,
    resourceKind: null,
    quantity: 0,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 0,
    attentionTier,
    clusterKey: `test:${type.toLowerCase()}`,
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary: type,
    ...overrides,
  };
  state.domainEvents.push(event);
  return event;
}

function observeNextTick(
  state: SimulationState,
  collector: StreamingActivityCollector,
): void {
  state.tick += 1;
  collector.observe(state);
}

function socialAction(slotIndex: number, targetEntityId: number): ActiveAction {
  return {
    kind: "SHARE",
    phase: "WORKING",
    startedAtTick: 0,
    targetEntityId,
    targetTileIndex: 3,
    path: [3],
    pathIndex: 1,
    progress: 0,
    workRequired: 10_000,
    navigationRevision: 0,
    interactionClaim: {
      anchorKind: "CREATURE",
      anchorId: targetEntityId,
      purpose: "SOCIAL",
      slotIndex,
      tileIndex: 3,
      targetX: 200,
      targetY: 100,
      claimedAtTick: 0,
    },
  };
}

describe("streaming activity collector", () => {
  it("measures completed actions, transitions, movement, occupancy, overlap, and crowding", () => {
    const state = createSimulation(7);
    const [left, right, ...others] = state.creatures;
    if (!left || !right) throw new Error("Expected the reference creatures.");
    const anchorTile = state.world.tiles.find(
      (tile) =>
        tile.y > 0 &&
        tile.x < state.world.width - 1 &&
        !tile.blocked &&
        !state.world.tiles[tile.index - state.world.width]?.blocked &&
        !state.world.tiles[tile.index + 1]?.blocked,
    )?.index;
    if (anchorTile === undefined) throw new Error("Expected a two-slot anchor tile.");
    for (const creature of others) creature.alive = false;
    left.x = 100;
    left.y = 100;
    left.tileIndex = 1;
    right.x = 200;
    right.y = 200;
    right.tileIndex = 2;
    const collector = new StreamingActivityCollector(state);

    left.x = 200;
    left.tileIndex = anchorTile;
    right.y = 100;
    right.tileIndex = anchorTile;
    left.activeAction = socialAction(0, right.id);
    right.activeAction = socialAction(1, right.id);
    left.actionCounts.EXPLORE += 1;
    left.lastActionKind = "EXPLORE";
    left.lastActionTick = 0;
    observeNextTick(state, collector);

    left.x = 300;
    left.tileIndex = anchorTile + 1;
    right.tileIndex = anchorTile;
    left.activeAction = socialAction(0, right.id);
    right.activeAction = null;
    left.actionCounts.KEEP += 1;
    left.lastActionKind = "KEEP";
    left.lastActionTick = 1;
    observeNextTick(state, collector);

    const profile = collector.report();
    expect(profile.schemaVersion).toBe(ACTIVITY_PROFILE_SCHEMA_VERSION);
    expect(profile.window).toMatchObject({
      startTick: 0,
      endTick: 2,
      observedTicks: 2,
      sampledStates: 3,
      sampleEveryTicks: 1,
    });
    expect(profile.actions.completedActions).toBe(2);
    expect(profile.actions.byKind.map(({ kind }) => kind)).toEqual(ACTION_KINDS);
    expect(profile.actions.byKind.find(({ kind }) => kind === "EXPLORE")).toEqual({
      kind: "EXPLORE",
      count: 1,
      share: 0.5,
    });
    expect(profile.actions.byKind.find(({ kind }) => kind === "KEEP")).toEqual({
      kind: "KEEP",
      count: 1,
      share: 0.5,
    });
    expect(profile.actions.transitions).toEqual([
      {
        from: null,
        to: "EXPLORE",
        count: 1,
        totalDwellTicks: 0,
        meanDwellTicks: 0,
      },
      {
        from: "EXPLORE",
        to: "KEEP",
        count: 1,
        totalDwellTicks: 1,
        meanDwellTicks: 1,
      },
    ]);
    expect(profile.movement).toMatchObject({
      distanceFixedUnits: 300,
      distanceTiles: 1.171875,
      fixedUnitsPerSimulatedMinute: 90_000,
    });
    expect(profile.spatial.occupiedTiles).toEqual({
      samples: 3,
      min: 1,
      p10: 1,
      median: 2,
      p90: 2,
      max: 2,
      mean: 1.666667,
    });
    expect(profile.spatial.crowding.maximumCreaturesPerTile).toBe(2);
    expect(profile.spatial.crowding.maximumCreaturesPerInteractionAnchor).toBe(2);
    expect(profile.spatial.slots).toMatchObject({
      sampledAnchorPurposeTicks: 2,
      claimedSlotTicks: 3,
      availableSlotTicks: 1,
      capacitySlotTicks: 4,
      utilisation: 0.75,
      saturatedAnchorPurposeTicks: 1,
      contentionCount: 0,
      failedClaimCount: 0,
    });
    expect(profile.spatial.slots.byPurpose.map(({ purpose }) => purpose)).toEqual(
      INTERACTION_PURPOSES,
    );
    expect(
      profile.spatial.slots.byPurpose.find(({ purpose }) => purpose === "SOCIAL"),
    ).toEqual({
      purpose: "SOCIAL",
      sampledAnchorPurposeTicks: 2,
      claimedSlotTicks: 3,
      availableSlotTicks: 1,
      capacitySlotTicks: 4,
      utilisation: 0.75,
      saturatedAnchorPurposeTicks: 1,
    });
    expect(profile.spatial.slots.byAnchor).toEqual([
      {
        anchorKind: "CREATURE",
        anchorId: right.id,
        purpose: "SOCIAL",
        sampledAnchorPurposeTicks: 2,
        claimedSlotTicks: 3,
        availableSlotTicks: 1,
        capacitySlotTicks: 4,
        utilisation: 0.75,
        saturatedAnchorPurposeTicks: 1,
      },
    ]);
    expect(profile.spatial.exactOverlap).toEqual({
      overlappingCreatureTicks: 2,
      livingCreatureTicks: 6,
      rate: 0.333333,
      overlapGroups: 1,
      maximumConsecutiveTicks: 1,
    });
  });

  it("decodes a groupless rest claim's tile-encoded GROUP_HOME anchor", () => {
    const state = createSimulation(17);
    const actor = state.creatures[0];
    if (!actor) throw new Error("Expected a reference creature.");
    actor.groupId = null;
    let claim: ReturnType<typeof claimInteractionSlot> = null;
    let anchorTileIndex = actor.tileIndex;
    for (const tile of state.world.tiles) {
      if (tile.blocked) continue;
      actor.tileIndex = tile.index;
      claim = claimInteractionSlot(state, actor, "REST", null, tile.index);
      if (claim) {
        anchorTileIndex = tile.index;
        break;
      }
    }
    if (!claim) throw new Error("Expected a valid groupless rest claim.");
    expect(claim).toMatchObject({
      anchorKind: "GROUP_HOME",
      anchorId: -(anchorTileIndex + 1),
      purpose: "REST",
    });
    actor.activeAction = {
      kind: "REST",
      phase: "MOVING",
      startedAtTick: state.tick,
      targetEntityId: null,
      targetTileIndex: claim.tileIndex,
      path: [anchorTileIndex, claim.tileIndex],
      pathIndex: 1,
      progress: 0,
      workRequired: 10_000,
      navigationRevision: state.world.navigationRevision,
      interactionClaim: claim,
    };

    const profile = new StreamingActivityCollector(state).report();
    expect(profile.spatial.slots.byAnchor).toContainEqual(
      expect.objectContaining({
        anchorKind: "GROUP_HOME",
        anchorId: -(anchorTileIndex + 1),
        purpose: "REST",
        sampledAnchorPurposeTicks: 1,
        claimedSlotTicks: 1,
      }),
    );
  });

  it("counts typed interactions, significant cadence, and factual milestone ticks", () => {
    const state = createSimulation(23);
    const collector = new StreamingActivityCollector(state);
    const target = state.creatures[1];
    if (!target) throw new Error("Expected a conflict target.");

    state.tick = 1;
    appendEvent(state, "GROUP_FOUNDED", "SIGNIFICANT", { tick: 0 });
    collector.observe(state);

    state.tick = 2;
    appendEvent(state, "STORAGE_SITE_STARTED", "NOTABLE", { tick: 1 });
    appendEvent(state, "THEFT_COMMITTED", "SIGNIFICANT", { tick: 1 });
    collector.observe(state);

    state.tick = 3;
    target.health = 5_000;
    appendEvent(state, "CREATURE_ATTACKED", "CRITICAL", {
      tick: 2,
      targetIds: [target.id],
      quantity: 1_000,
    });
    collector.observe(state);

    state.tick = 4;
    target.health = 5_100;
    collector.observe(state);

    state.tick = 5;
    appendEvent(state, "STORAGE_COMPLETED", "SIGNIFICANT", { tick: 4 });
    appendEvent(state, "PLAYER_ADDED_FOOD", "SIGNIFICANT", { tick: 4 });
    collector.observe(state);

    const profile = collector.report();
    expect(profile.interactions.count).toBe(5);
    expect(profile.interactions.byType.map(({ eventType }) => eventType)).toEqual(
      INTERACTION_EVENT_TYPES,
    );
    expect(
      profile.interactions.byType.find(({ eventType }) => eventType === "THEFT_COMMITTED")
        ?.count,
    ).toBe(1);
    expect(profile.significantEvents).toMatchObject({
      tiers: ["SIGNIFICANT", "CRITICAL"],
      count: 5,
      per1_000Ticks: 1_000,
      trailingSilenceTicks: 1,
      intervals: {
        samples: 4,
        min: 0,
        p10: 0,
        median: 1,
        p90: 2,
        max: 2,
        mean: 1,
      },
    });
    expect(profile.milestones).toEqual({
      firstGroupTick: 0,
      firstStorageSiteTick: 1,
      firstStorageTick: 4,
      firstTheftTick: 1,
      firstConflictTick: 2,
      firstRecoveryTick: 4,
      firstInterventionTick: 4,
      firstInterventionResponseTick: null,
    });
  });

  it("counts only factually linked intervention reconsideration and rerouting", () => {
    const state = createSimulation(41);
    const actor = state.creatures[0];
    const resource = state.resourceNodes.find((node) => node.kind === "FOOD");
    if (!actor || !resource) throw new Error("Expected an actor and food resource.");
    actor.activeDesire = {
      kind: "RELIEVE_HUNGER",
      subjectEntityId: null,
      startedAtTick: 0,
      minimumCommitUntilTick: 0,
      nextReconsiderationTick: 0,
      strength: 1_000,
      selectedByDecisionId: 0,
    };
    actor.activePlan = {
      kind: "EXPLORE_SURROUNDINGS",
      desireKind: "RELIEVE_HUNGER",
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      startedAtTick: 0,
      status: "ACTIVE",
      selectedByDecisionId: 0,
      expectedUtility: 100,
      strongestReason: null,
      interactionClaim: null,
    };
    actor.activeGoal = {
      kind: "EXPLORE",
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      selectedAtTick: 0,
      minimumCommitUntilTick: 0,
      nextReconsiderationTick: 0,
      expectedUtility: 100,
      decisionRecordId: 0,
    };
    actor.activeAction = {
      kind: "EXPLORE",
      phase: "MOVING",
      startedAtTick: 0,
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      path: [actor.tileIndex],
      pathIndex: 0,
      progress: 0,
      workRequired: 10_000,
      navigationRevision: state.world.navigationRevision,
      interactionClaim: null,
    };
    const collector = new StreamingActivityCollector(state);

    state.tick = 1;
    const intervention = appendEvent(state, "PLAYER_ADDED_FOOD", "SIGNIFICANT", {
      tick: 0,
      targetIds: [resource.id],
      locationTileIndex: resource.tileIndex,
      commandId: 1,
      commandOutcome: "APPLIED",
    });
    const decisionId = state.nextDecisionId++;
    state.decisionRecords.push({
      id: decisionId,
      tick: 0,
      actorId: actor.id,
      previousAction: "EXPLORE",
      selectedAction: "GATHER_FOOD",
      selectedDesire: "SECURE_PROVISIONS",
      selectedPlan: "FORAGE_FOR_FOOD",
      selectedTargetId: resource.id,
      strongestReason: null,
      switchReason: "SCHEDULED_RECONSIDERATION",
      candidates: [
        {
          action: "GATHER_FOOD",
          desire: "SECURE_PROVISIONS",
          plan: "FORAGE_FOR_FOOD",
          targetEntityId: resource.id,
          targetTileIndex: resource.tileIndex,
          utility: 1_000,
          factors: [
            {
              key: "known stock",
              contribution: 1_000,
              evidenceEventIds: [intervention.id],
              fact: null,
            },
          ],
        },
      ],
    });
    actor.activeDesire = {
      kind: "SECURE_PROVISIONS",
      subjectEntityId: resource.id,
      startedAtTick: 0,
      minimumCommitUntilTick: 20,
      nextReconsiderationTick: 40,
      strength: 2_000,
      selectedByDecisionId: decisionId,
    };
    actor.activePlan = {
      kind: "FORAGE_FOR_FOOD",
      desireKind: "SECURE_PROVISIONS",
      targetEntityId: resource.id,
      targetTileIndex: resource.tileIndex,
      startedAtTick: 0,
      status: "ACTIVE",
      selectedByDecisionId: decisionId,
      expectedUtility: 1_000,
      strongestReason: null,
      interactionClaim: null,
    };
    actor.activeGoal = {
      kind: "GATHER_FOOD",
      targetEntityId: resource.id,
      targetTileIndex: resource.tileIndex,
      selectedAtTick: 0,
      minimumCommitUntilTick: 20,
      nextReconsiderationTick: 40,
      expectedUtility: 1_000,
      decisionRecordId: decisionId,
    };
    actor.activeAction = {
      kind: "GATHER_FOOD",
      phase: "MOVING",
      startedAtTick: 0,
      targetEntityId: resource.id,
      targetTileIndex: resource.tileIndex,
      path: [actor.tileIndex, resource.tileIndex],
      pathIndex: 0,
      progress: 0,
      workRequired: 10_000,
      navigationRevision: state.world.navigationRevision,
      interactionClaim: null,
    };
    for (const type of ["DESIRE_CHANGED", "PLAN_CHANGED", "ACTION_STARTED"] as const) {
      appendEvent(state, type, "ROUTINE", {
        tick: 0,
        actorIds: [actor.id],
        targetIds: [resource.id],
        decisionRecordIds: [decisionId],
      });
    }
    collector.observe(state);

    state.tick = 2;
    appendEvent(state, "PLAYER_TOGGLED_OBSTACLE", "SIGNIFICANT", {
      tick: 1,
      commandId: 2,
      commandOutcome: "APPLIED",
      locationTileIndex: actor.tileIndex,
    });
    state.world.navigationRevision += 1;
    actor.activeAction = {
      ...actor.activeAction,
      path: [actor.tileIndex, actor.tileIndex + 1, resource.tileIndex],
      navigationRevision: state.world.navigationRevision,
    };
    collector.observe(state);

    state.tick = 3;
    const unlinkedDecisionId = state.nextDecisionId++;
    state.decisionRecords.push({
      id: unlinkedDecisionId,
      tick: 2,
      actorId: actor.id,
      previousAction: "GATHER_FOOD",
      selectedAction: "REST",
      selectedDesire: "RECOVER_ENERGY",
      selectedPlan: "REST_SAFELY",
      selectedTargetId: null,
      strongestReason: null,
      switchReason: "SCHEDULED_RECONSIDERATION",
      candidates: [
        {
          action: "REST",
          desire: "RECOVER_ENERGY",
          plan: "REST_SAFELY",
          targetEntityId: null,
          targetTileIndex: actor.tileIndex,
          utility: 500,
          factors: [],
        },
      ],
    });
    actor.activeDesire = {
      ...actor.activeDesire,
      kind: "RECOVER_ENERGY",
      subjectEntityId: null,
      selectedByDecisionId: unlinkedDecisionId,
    };
    actor.activePlan = {
      ...actor.activePlan,
      kind: "REST_SAFELY",
      desireKind: "RECOVER_ENERGY",
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      selectedByDecisionId: unlinkedDecisionId,
    };
    actor.activeGoal = {
      ...actor.activeGoal,
      kind: "REST",
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      decisionRecordId: unlinkedDecisionId,
    };
    actor.activeAction = {
      ...actor.activeAction,
      kind: "REST",
      startedAtTick: 2,
      targetEntityId: null,
      targetTileIndex: actor.tileIndex,
      path: [actor.tileIndex],
      navigationRevision: state.world.navigationRevision,
    };
    for (const type of ["DESIRE_CHANGED", "PLAN_CHANGED", "ACTION_STARTED"] as const) {
      appendEvent(state, type, "ROUTINE", {
        tick: 2,
        actorIds: [actor.id],
        decisionRecordIds: [unlinkedDecisionId],
      });
    }
    collector.observe(state);

    const profile = collector.report();
    expect(profile.interventionResponses).toEqual({
      windowTicks: INTERVENTION_RESPONSE_WINDOW_TICKS,
      changes: 5,
      respondingCreatures: 1,
      firstResponseTick: 0,
      byKind: INTERVENTION_CHANGE_KINDS.map((kind) => ({ kind, count: 1 })),
    });
    expect(profile.milestones.firstInterventionResponseTick).toBe(0);
  });

  it("handles an empty window and rejects skipped or duplicate samples", () => {
    const state = createSimulation(921);
    const collector = new StreamingActivityCollector(state);
    const report = collector.report();

    expect(report.window).toMatchObject({ observedTicks: 0, sampledStates: 1 });
    expect(report.actions.completedActions).toBe(0);
    expect(report.movement.fixedUnitsPerSimulatedMinute).toBe(0);
    expect(report.significantEvents.intervals).toEqual({
      samples: 0,
      min: null,
      p10: null,
      median: null,
      p90: null,
      max: null,
      mean: null,
    });
    expect(() => collector.observe(state)).toThrow(/expected tick 1, received 0/);
    state.tick = 2;
    expect(() => collector.observe(state)).toThrow(/expected tick 1, received 2/);
  });

  it("produces deterministic profile ordering and aggregate warnings", () => {
    const collect = (seed: number) => {
      const state = createSimulation(seed);
      const collector = new StreamingActivityCollector(state);
      for (let tick = 0; tick < 120; tick += 1) {
        advanceSimulation(state, 1);
        collector.observe(state);
      }
      return collector.report();
    };

    const first = collect(4_182);
    const second = collect(4_182);
    expect(second).toEqual(first);
    const aggregate = summarizeActivityProfiles([first]);
    expect(aggregate.runCount).toBe(1);
    expect(aggregate.actionShares.map(({ kind }) => kind)).toEqual(ACTION_KINDS);
    expect(aggregate.totalObservedTicks).toBe(120);
    expect(aggregate.slotUtilisation).toBe(
      aggregate.capacitySlotTicks === 0
        ? 0
        : Math.round(
            (aggregate.claimedSlotTicks / aggregate.capacitySlotTicks) * 1_000_000,
          ) / 1_000_000,
    );
    expect(aggregate.contentionCount).toBe(first.spatial.slots.contentionCount);
    expect(aggregate.failedClaimCount).toBe(first.spatial.slots.failedClaimCount);
    expect(aggregate.warnings).toEqual([...aggregate.warnings].sort());
    expect(summarizeActivityProfiles([second])).toEqual(aggregate);
  });
});
