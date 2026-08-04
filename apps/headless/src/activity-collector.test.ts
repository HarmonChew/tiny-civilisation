import {
  advanceSimulation,
  claimInteractionSlot,
  compileScenario,
  createScenarioReference,
  createSimulation,
  TILE_FIXED_UNITS,
  type ActiveAction,
  type AttentionTier,
  type DomainEvent,
  type DomainEventType,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import {
  ACTION_KINDS,
  ACTIVITY_MILESTONE_KINDS,
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  INTERACTION_PURPOSES,
  INTERACTION_EVENT_TYPES,
  INTERVENTION_CHANGE_KINDS,
  INTERVENTION_RESPONSE_WINDOW_TICKS,
  STALEMATE_MAX_ACTION_TRANSITIONS,
  STALEMATE_WINDOW_TICKS,
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

function placeCreature(
  state: SimulationState,
  creature: SimulationState["creatures"][number],
  tileIndex: number,
): void {
  const tile = state.world.tiles[tileIndex];
  if (!tile || tile.blocked) throw new Error(`Expected walkable tile ${tileIndex}.`);
  creature.tileIndex = tileIndex;
  creature.x = tile.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
  creature.y = tile.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
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
      iqr: 1,
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
    appendEvent(state, "PLAYER_TOGGLED_OBSTACLE", "ROUTINE", {
      tick: 1,
      commandId: 99,
      commandOutcome: "REJECTED",
    });
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
    appendEvent(state, "PLAYER_ADDED_FOOD", "SIGNIFICANT", {
      tick: 4,
      commandId: 1,
      commandOutcome: "APPLIED",
    });
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
        iqr: 1,
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

  it("reports group, relationship, dispersion, route, and horizon facts", () => {
    const state = createSimulation(73);
    const [first, second, third, fourth, ...others] = state.creatures;
    if (!first || !second || !third || !fourth) {
      throw new Error("Expected four reference creatures.");
    }
    for (const creature of others) creature.alive = false;
    const walkable = state.world.tiles.filter((tile) => !tile.blocked).slice(0, 6);
    if (walkable.length < 6) throw new Error("Expected six walkable tiles.");
    const tileIndexes = walkable.map((tile) => tile.index);
    const [firstTile, secondTile, thirdTile, fourthTile, fifthTile, sixthTile] =
      tileIndexes;
    if (
      firstTile === undefined ||
      secondTile === undefined ||
      thirdTile === undefined ||
      fourthTile === undefined ||
      fifthTile === undefined ||
      sixthTile === undefined
    ) {
      throw new Error("Expected indexed walkable tiles.");
    }
    placeCreature(state, first, firstTile);
    placeCreature(state, second, secondTile);
    placeCreature(state, third, thirdTile);
    placeCreature(state, fourth, fourthTile);

    const groupId = state.nextGroupId++;
    const storageId = state.nextEntityId++;
    const storageSiteId = state.nextEntityId++;
    first.groupId = groupId;
    second.groupId = groupId;
    state.groups.push({
      id: groupId,
      name: "Test group",
      stage: "PERSISTENT",
      foundedTick: 0,
      memberIds: [first.id, second.id],
      leaderId: first.id,
      homeTileIndex: firstTile,
      storageStructureId: storageId,
      cohesion: 5_000,
      sharingNorm: 1_000,
      majorEventIds: [],
    });
    state.structures.push({
      id: storageId,
      kind: "STORAGE",
      tileIndex: firstTile,
      groupId,
      material: 4,
      materialRequired: 4,
      progress: 10_000,
      workRequired: 10_000,
      inventory: { capacity: 20, food: 6, material: 2 },
      guardIds: [],
      completedTick: 0,
    });
    state.structures.push({
      id: storageSiteId,
      kind: "STORAGE_SITE",
      tileIndex: secondTile,
      groupId,
      material: 3,
      materialRequired: 6,
      progress: 5_000,
      workRequired: 10_000,
      inventory: { capacity: 200, food: 99, material: 99 },
      guardIds: [],
      completedTick: null,
    });
    const addRelationship = (
      fromId: number,
      toId: number,
      trust: number,
      rivalry: number,
      fear: number,
    ) => {
      state.relationships.push({
        id: state.nextRelationshipId++,
        fromId,
        toId,
        trust,
        familiarity: 4_000,
        rivalry,
        fear,
        lastInteractionTick: 0,
        significantEventIds: [],
      });
    };
    addRelationship(first.id, second.id, 3_000, 100, 200);
    addRelationship(second.id, first.id, 2_000, 200, 300);
    addRelationship(second.id, third.id, -1_000, 900, 1_200);

    const collector = new StreamingActivityCollector(state);
    placeCreature(state, first, fifthTile);
    first.actionCounts.EXPLORE += 1;
    first.lastActionKind = "EXPLORE";
    first.lastActionTick = 0;
    observeNextTick(state, collector);
    placeCreature(state, first, sixthTile);
    first.actionCounts.EXPLORE += 1;
    first.lastActionTick = 1;
    observeNextTick(state, collector);

    const profile = collector.report();
    expect(profile.groups.horizon).toMatchObject({
      groupCount: 1,
      groupedCreatureCount: 2,
      ungroupedCreatureCount: 2,
      membershipRate: 0.5,
      partitions: [{ groupId, memberIds: [first.id, second.id] }],
      ungroupedCreatureIds: [third.id, fourth.id],
      largestGroupSize: 2,
      groupsWithLeader: 1,
    });
    expect(profile.groups.overWindow).toMatchObject({
      groupedCreatureTicks: 4,
      livingCreatureTicks: 8,
      timeSpentGroupedRate: 0.5,
      membershipChanges: 0,
      partitionChanges: 0,
      leaderChanges: 0,
    });
    expect(profile.relationships).toMatchObject({
      vertexCount: 4,
      directedEdgeCount: 3,
      possibleDirectedEdges: 12,
      density: 0.25,
      componentCount: 2,
      connectedDyads: 2,
      reciprocalDyads: 1,
      reciprocatedDirectedEdges: 2,
      reciprocity: 0.666667,
      mutualDyadRate: 0.5,
    });
    expect(profile.relationships.components.map(({ memberIds }) => memberIds)).toEqual([
      [first.id, second.id, third.id],
      [fourth.id],
    ]);
    expect(profile.relationships.trust).toMatchObject({
      samples: 3,
      min: -1_000,
      median: 2_000,
      max: 3_000,
    });
    expect(profile.spatial.dispersion.creaturePairDistanceTiles.samples).toBe(18);
    expect(profile.spatial.dispersion.withinGroupPairDistanceTiles.samples).toBe(3);
    expect(profile.spatial.dispersion.byCreatureAtHorizon).toHaveLength(4);
    expect(profile.spatial.dispersion.byGroupAtHorizon).toEqual([
      expect.objectContaining({
        groupId,
        memberIds: [first.id, second.id],
      }),
    ]);
    expect(profile.spatial.routes).toMatchObject({
      traversals: 2,
      uniqueDirectedEdges: 2,
      dominantEdgeShare: 0.5,
      top10PercentEdgeShare: 0.5,
      herfindahlIndex: 0.5,
    });
    expect(profile.actions.analysis).toMatchObject({
      dominantAction: { kind: "EXPLORE", count: 2, share: 1 },
      totalTransitions: 2,
      uniqueTransitions: 2,
      repeatedTransitions: 1,
      repetitionRate: 0.5,
    });
    expect(profile.horizon).toMatchObject({
      tick: 2,
      resources: {
        nodeCount: state.resourceNodes.length,
        unreachableCreatureResourceKinds: 0,
        constructionCommittedMaterial: 3,
      },
      storage: {
        structureCount: 2,
        completedStorageCount: 1,
        storageSiteCount: 1,
        food: 6,
        material: 2,
        capacity: 20,
        fillRatio: 0.4,
      },
    });
    expect(profile.horizon.storage.structures).toHaveLength(2);
    expect(profile.horizon.storage.structures).toContainEqual(
      expect.objectContaining({ id: storageId, groupId, constructionProgress: 1 }),
    );
    expect(profile.milestoneObservations.map(({ milestone }) => milestone)).toEqual(
      ACTIVITY_MILESTONE_KINDS,
    );
    expect(profile.milestoneObservations).toEqual(
      profile.milestoneObservations.map((observation) => ({
        ...observation,
        occurred: false,
        tick: null,
        elapsedTicks: null,
        rightCensored: true,
        censoringTick: 2,
        observedDurationTicks: 2,
      })),
    );
  });

  it("measures resource access to legal gathering footprints, not anchor tiles", () => {
    const state = createSimulation(74);
    const anchor = state.world.tiles.find(
      (tile) =>
        tile.x > 0 &&
        tile.x < state.world.width - 1 &&
        tile.y > 0 &&
        tile.y < state.world.height - 1 &&
        !tile.blocked,
    );
    const source = state.resourceNodes[0];
    if (!anchor || !source) throw new Error("Expected a resource anchor.");
    state.resourceNodes = [{ ...source, kind: "FOOD", tileIndex: anchor.index }];
    for (const offsetX of [-1, 0, 1]) {
      for (const offsetY of [-1, 0, 1]) {
        if (offsetX === 0 && offsetY === 0) continue;
        const tileIndex = (anchor.y + offsetY) * state.world.width + anchor.x + offsetX;
        const tile = state.world.tiles[tileIndex];
        if (tile) tile.blocked = true;
      }
    }

    const resources = new StreamingActivityCollector(state).report().horizon.resources;
    expect(resources.nodes).toEqual([
      expect.objectContaining({
        id: source.id,
        nearestLivingCreatureDistanceTiles: null,
        nearestGroupHomeDistanceTiles: null,
        nearestGroupIds: [],
      }),
    ]);
    expect(resources.accessDistanceTiles.samples).toBe(0);
    expect(resources.unreachableCreatureResourceKinds).toBe(
      state.creatures.filter((creature) => creature.alive).length * 2,
    );
    expect(
      resources.accessByCreatureAndKind.every(
        ({ distanceTiles }) => distanceTiles === null,
      ),
    ).toBe(true);
  });

  it("retains full scenario identity and rejects mixed observations and aggregates", () => {
    const state = createSimulation(createScenarioReference("petri-world", 75));
    const collector = new StreamingActivityCollector(state);
    const profile = collector.report();
    expect(profile.scenario).toEqual(state.scenario);
    expect(profile.scenario).not.toBe(state.scenario);
    expect(profile.compiledMapHash).toBe(state.compiledMapHash);

    const otherScenario = createSimulation(
      createScenarioReference("split-banks", state.seed),
    );
    otherScenario.tick = 1;
    expect(() => collector.observe(otherScenario)).toThrow(/scenario identity changed/);

    const changedHashState = createSimulation(createScenarioReference("petri-world", 76));
    const changedHashCollector = new StreamingActivityCollector(changedHashState);
    changedHashState.tick = 1;
    changedHashState.compiledMapHash = "changed-map-hash";
    expect(() => changedHashCollector.observe(changedHashState)).toThrow(
      /compiled-map hash changed/,
    );

    const invalidInitialState = createSimulation(
      createScenarioReference("petri-world", 77),
    );
    invalidInitialState.compiledMapHash = "invalid-map-hash";
    expect(() => new StreamingActivityCollector(invalidInitialState)).toThrow(
      /does not match scenario/,
    );

    const splitProfile = new StreamingActivityCollector(
      createSimulation(createScenarioReference("split-banks", 75)),
    ).report();
    expect(() => summarizeActivityProfiles([profile, splitProfile])).toThrow(
      /cannot mix scenario definitions/,
    );
    const alternateSeedProfile = structuredClone(profile);
    alternateSeedProfile.seed = 80;
    alternateSeedProfile.scenario = {
      ...alternateSeedProfile.scenario,
      seed: alternateSeedProfile.seed,
    };
    alternateSeedProfile.compiledMapHash = "seed-specific-compiled-map";
    expect(summarizeActivityProfiles([profile, alternateSeedProfile]).runCount).toBe(2);
  });

  it("reports compiled region exposure and actual chokepoint traversals", () => {
    const state = createSimulation(createScenarioReference("split-banks", 78));
    const compiled = compileScenario(state.scenario);
    const actor = state.creatures[0];
    if (!actor) throw new Error("Expected a crossing actor.");
    for (const creature of state.creatures.slice(1)) creature.alive = false;
    const y = 15;
    const westTile = y * state.world.width + 22;
    const firstPassageTile = y * state.world.width + 23;
    const secondPassageTile = y * state.world.width + 24;
    const eastTile = y * state.world.width + 25;
    const passage = compiled.chokepoints.find(
      (chokepoint) => chokepoint.id === "central-passage",
    );
    if (!passage) throw new Error("Expected the split-banks passage.");
    expect(passage.tileIndices).toEqual(
      expect.arrayContaining([firstPassageTile, secondPassageTile]),
    );
    placeCreature(state, actor, westTile);
    const collector = new StreamingActivityCollector(state);
    for (const tileIndex of [firstPassageTile, secondPassageTile, eastTile]) {
      placeCreature(state, actor, tileIndex);
      observeNextTick(state, collector);
    }

    const profile = collector.report();
    expect(profile.scenarioSpatial).toMatchObject({
      observedTicks: 3,
      livingCreatureTicks: 3,
    });
    const crossingProfile = profile.scenarioSpatial.chokepoints.find(
      (chokepoint) => chokepoint.id === "central-passage",
    );
    expect(crossingProfile).toMatchObject({
      connects: ["west-bank", "east-bank"],
      tileTransitions: 3,
      entries: 1,
      exits: 1,
      throughCrossings: 1,
    });
    expect(crossingProfile?.byCreature).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          creatureId: actor.id,
          tileTransitions: 3,
          entries: 1,
          exits: 1,
          throughCrossings: 1,
        }),
      ]),
    );
    expect(
      profile.scenarioSpatial.regions.find((region) => region.id === "west-bank"),
    ).toMatchObject({
      initiallyReachable: true,
      occupiedTicks: 1,
      livingCreatureTicks: 1,
      occupancyExposureRate: 0.333333,
    });
    expect(
      profile.scenarioSpatial.regions.find((region) => region.id === "east-bank"),
    ).toMatchObject({
      initiallyReachable: true,
      occupiedTicks: 1,
      livingCreatureTicks: 1,
      occupancyExposureRate: 0.333333,
    });
    const aggregate = summarizeActivityProfiles([profile]);
    expect(
      aggregate.scenarioSpatial.chokepoints.find(
        (chokepoint) => chokepoint.id === "central-passage",
      )?.throughCrossings,
    ).toMatchObject({ samples: 1, min: 1, median: 1, max: 1 });
  });

  it("tracks desire families and per-creature/action selection concentration", () => {
    const state = createSimulation(createScenarioReference("petri-world", 79));
    const actor = state.creatures[0];
    const resource = state.resourceNodes.find((node) => node.kind === "FOOD");
    if (!actor || !resource) throw new Error("Expected an actor and food target.");
    for (const creature of state.creatures.slice(1)) creature.alive = false;
    const collector = new StreamingActivityCollector(state);

    for (let index = 0; index < 10; index += 1) {
      const decisionId = state.nextDecisionId++;
      state.decisionRecords.push({
        id: decisionId,
        tick: state.tick,
        actorId: actor.id,
        previousAction: index === 0 ? null : "GATHER_FOOD",
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
            factors: [],
          },
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
        kind: "SECURE_PROVISIONS",
        subjectEntityId: resource.id,
        startedAtTick: state.tick,
        minimumCommitUntilTick: state.tick,
        nextReconsiderationTick: state.tick + 1,
        strength: 5_000,
        selectedByDecisionId: decisionId,
      };
      state.tick += 1;
      appendEvent(state, "ACTION_STARTED", "ROUTINE", {
        actorIds: [actor.id],
        targetIds: [resource.id],
        locationTileIndex: actor.tileIndex,
        decisionRecordIds: [decisionId],
      });
      collector.observe(state);
    }

    const profile = collector.report();
    expect(profile.desires).toMatchObject({
      livingCreatureTicks: 10,
      withoutActiveDesireCreatureTicks: 0,
      kindChanges: 1,
      familyChanges: 1,
    });
    expect(
      profile.desires.byKind.find(({ kind }) => kind === "SECURE_PROVISIONS"),
    ).toMatchObject({
      family: "PROVISIONING",
      exposureCreatureTicks: 10,
      exposureRate: 1,
      changesInto: 1,
      changesOutOf: 0,
      candidateEvaluations: 10,
    });
    expect(
      profile.desires.byFamily.find(({ family }) => family === "PROVISIONING"),
    ).toMatchObject({
      exposureCreatureTicks: 10,
      exposureRate: 1,
      changesInto: 1,
      candidateEvaluations: 10,
    });
    const selection = profile.actions.selectionConcentration;
    expect(selection.overall).toMatchObject({
      starts: 10,
      actions: { samples: 10, dominantCategory: { category: "GATHER_FOOD" } },
      targets: {
        samples: 10,
        dominantCategory: { category: `entity:${resource.id}` },
        dominantShare: 1,
      },
      targetLocations: {
        dominantCategory: { category: `tile:${resource.tileIndex}` },
        dominantShare: 1,
      },
      actorGroups: {
        dominantCategory: { category: "UNGROUPED" },
        dominantShare: 1,
      },
    });
    expect(
      selection.byCreature.find(({ creatureId }) => creatureId === actor.id),
    ).toMatchObject({ starts: 10, targets: { dominantShare: 1 } });
    expect(selection.byAction.find(({ kind }) => kind === "GATHER_FOOD")).toMatchObject({
      starts: 10,
      targets: { dominantShare: 1 },
    });
    expect(profile.diagnostics).toMatchObject({
      decisionRecordsObserved: 10,
      unobservedActions: expect.arrayContaining(["ATTACK", "BUILD_STORAGE"]),
      noCandidateActions: expect.arrayContaining(["ATTACK", "BUILD_STORAGE"]),
      unobservedDesires: expect.arrayContaining(["AVOID_THREAT", "BELONG"]),
      noCandidateDesires: expect.arrayContaining(["AVOID_THREAT", "BELONG"]),
    });
    expect(profile.diagnostics.warnings).toContain(
      "Action-start category GATHER_FOOD share 1 exceeds 0.6.",
    );
    expect(profile.diagnostics.limitations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/structural reachability cannot be inferred/),
        expect.stringMatching(/generic target-group field/),
      ]),
    );
  });

  it("declares stalemate only after the full multi-signal trailing window", () => {
    const state = createSimulation(88);
    const collector = new StreamingActivityCollector(state);
    for (let tick = 0; tick < STALEMATE_WINDOW_TICKS - 1; tick += 1) {
      observeNextTick(state, collector);
    }
    expect(collector.report().stalemate).toMatchObject({
      observedWindowTicks: STALEMATE_WINDOW_TICKS - 1,
      eligible: false,
      declared: false,
    });
    observeNextTick(state, collector);
    expect(collector.report().stalemate).toEqual({
      windowTicks: STALEMATE_WINDOW_TICKS,
      observedWindowTicks: STALEMATE_WINDOW_TICKS,
      eligible: true,
      thresholds: {
        maximumMovementFixedUnitsPerLivingCreatureTick: TILE_FIXED_UNITS / 32,
        maximumActionTransitions: STALEMATE_MAX_ACTION_TRANSITIONS,
      },
      movementFixedUnits: 0,
      livingCreatureTicks: STALEMATE_WINDOW_TICKS * state.creatures.length,
      movementFixedUnitsPerLivingCreatureTick: 0,
      actionTransitions: 0,
      uniqueActionTransitions: 0,
      structuralSocialChanges: 0,
      significantEvents: 0,
      signals: {
        lowMovement: true,
        lowActionTransitions: true,
        noStructuralSocialChange: true,
        noSignificantEvents: true,
      },
      declared: true,
    });

    const changingState = createSimulation(89);
    const changingActor = changingState.creatures[0];
    if (!changingActor) throw new Error("Expected a changing actor.");
    const changingCollector = new StreamingActivityCollector(changingState);
    for (let tick = 0; tick < STALEMATE_WINDOW_TICKS - 1; tick += 1) {
      observeNextTick(changingState, changingCollector);
    }

    const farthestTile = changingState.world.tiles
      .filter((tile) => !tile.blocked)
      .sort((left, right) => {
        const leftDistance =
          Math.abs(left.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - changingActor.x) +
          Math.abs(left.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - changingActor.y);
        const rightDistance =
          Math.abs(right.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - changingActor.x) +
          Math.abs(right.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - changingActor.y);
        return rightDistance - leftDistance || left.index - right.index;
      })[0];
    if (!farthestTile) throw new Error("Expected a distant walkable tile.");
    placeCreature(changingState, changingActor, farthestTile.index);
    for (const creature of changingState.creatures.slice(1)) {
      const distantTile = changingState.world.tiles
        .filter((tile) => !tile.blocked)
        .sort((left, right) => {
          const leftDistance =
            Math.abs(left.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - creature.x) +
            Math.abs(left.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - creature.y);
          const rightDistance =
            Math.abs(right.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - creature.x) +
            Math.abs(right.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2 - creature.y);
          return rightDistance - leftDistance || left.index - right.index;
        })[0];
      if (!distantTile) throw new Error("Expected distant movement tiles.");
      placeCreature(changingState, creature, distantTile.index);
    }
    const transitionActors = changingState.creatures.slice(0, 3);
    if (transitionActors.length !== 3) throw new Error("Expected transition actors.");
    for (const actor of transitionActors) {
      actor.actionCounts.EXPLORE += 1;
      actor.lastActionTick = changingState.tick;
    }
    const changingGroupId = changingState.nextGroupId++;
    changingActor.groupId = changingGroupId;
    changingState.groups.push({
      id: changingGroupId,
      name: "Changing group",
      stage: "PROVISIONAL",
      foundedTick: changingState.tick,
      memberIds: [changingActor.id],
      leaderId: changingActor.id,
      homeTileIndex: farthestTile.index,
      storageStructureId: null,
      cohesion: 5_000,
      sharingNorm: 0,
      majorEventIds: [],
    });
    appendEvent(changingState, "THEFT_COMMITTED", "SIGNIFICANT", {
      tick: changingState.tick,
      actorIds: [changingActor.id],
    });
    observeNextTick(changingState, changingCollector);

    expect(changingCollector.report().stalemate).toMatchObject({
      eligible: true,
      actionTransitions: 3,
      uniqueActionTransitions: 1,
      structuralSocialChanges: 1,
      significantEvents: 1,
      signals: {
        lowMovement: false,
        lowActionTransitions: false,
        noStructuralSocialChange: false,
        noSignificantEvents: false,
      },
      declared: false,
    });
  });

  it("aggregates deterministic distributions, censored milestones, and Wilson intervals", () => {
    const occurredState = createSimulation(301);
    const occurredCollector = new StreamingActivityCollector(occurredState);
    occurredState.tick = 1;
    appendEvent(occurredState, "GROUP_FOUNDED", "SIGNIFICANT", { tick: 0 });
    occurredCollector.observe(occurredState);
    for (let tick = 1; tick < 5; tick += 1) {
      observeNextTick(occurredState, occurredCollector);
    }

    const censoredState = createSimulation(302);
    const censoredCollector = new StreamingActivityCollector(censoredState);
    for (let tick = 0; tick < 5; tick += 1) {
      observeNextTick(censoredState, censoredCollector);
    }
    const occurred = occurredCollector.report();
    const censored = censoredCollector.report();
    const aggregate = summarizeActivityProfiles([censored, occurred]);
    expect(summarizeActivityProfiles([occurred, censored])).toEqual(aggregate);
    expect(aggregate.milestones.map(({ milestone }) => milestone)).toEqual(
      ACTIVITY_MILESTONE_KINDS,
    );
    expect(aggregate.milestones.find(({ milestone }) => milestone === "GROUP")).toEqual({
      milestone: "GROUP",
      occurrence: {
        runs: 2,
        occurrences: 1,
        incidence: 0.5,
        wilson95: { confidence: 0.95, lower: 0.094531, upper: 0.905469 },
      },
      timeToEventTicks: {
        samples: 1,
        min: 0,
        p10: 0,
        median: 0,
        p90: 0,
        iqr: 0,
        max: 0,
        mean: 0,
      },
      rightCensoredRuns: 1,
      censoringDurationTicks: {
        samples: 1,
        min: 5,
        p10: 5,
        median: 5,
        p90: 5,
        iqr: 0,
        max: 5,
        mean: 5,
      },
    });
    expect(aggregate.stalemate).toEqual({
      runs: 0,
      occurrences: 0,
      incidence: null,
      wilson95: { confidence: 0.95, lower: null, upper: null },
    });

    const distributionProfiles = [1, 2, 3, 4].map((value, index) => {
      const profile = structuredClone(censored);
      profile.seed = 400 + index;
      profile.scenario = { ...profile.scenario, seed: profile.seed };
      profile.movement.fixedUnitsPerSimulatedMinute = value;
      return profile;
    });
    expect(
      summarizeActivityProfiles(distributionProfiles).seedDistributions
        .movementPerSimulatedMinute,
    ).toEqual({
      samples: 4,
      min: 1,
      p10: 1,
      median: 2,
      p90: 4,
      iqr: 2,
      max: 4,
      mean: 2.5,
    });
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
      iqr: null,
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
