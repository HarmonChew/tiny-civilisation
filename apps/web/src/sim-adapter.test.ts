import { describe, expect, it } from "vitest";
import {
  createRenderSnapshot,
  hashSimulationState,
  projectCreatureObservationSummary,
  type DomainEvent,
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
    expect(projected?.thirst).toBe(mapped?.thirst);
    expect(projected?.interactionSlot).toEqual(mapped?.interactionSlot);
    const stateWater = makeWorldView(state).resources.find(
      (resource) => resource.kind === "WATER",
    );
    const projectedWater = makeWorldViewFromSnapshot(
      createRenderSnapshot(state, false),
      hashSimulationState(state),
    ).resources.find((resource) => resource.kind === "WATER");
    expect(projectedWater?.access).toEqual(stateWater?.access);
    expect(projectedWater?.access).toMatchObject({ interactionCapacity: 3 });
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

  it("projects shelter access, site rationale, condition, occupancy, and group home state", () => {
    const state = createSimulationState(4_182);
    const snapshot = createRenderSnapshot(state);
    const creature = snapshot.creatures[0]!;
    const projected = makeWorldViewFromSnapshot(
      {
        ...snapshot,
        creatures: [
          {
            ...creature,
            groupId: 81,
            shelterAccess: {
              shelterId: 900,
              weightedCost: 72,
              eligibility: "MEMBER",
              condition: 6_800,
              effectiveCapacity: 4,
              reservedSpaces: 3,
              restingCreatures: 2,
              destination: "SHELTERED",
              reason: "A member space is reachable.",
            },
          },
          ...snapshot.creatures.slice(1),
        ],
        structures: [
          {
            id: 900,
            kind: "SHELTER",
            tileIndex: creature.tileIndex,
            groupId: 81,
            progress: 10_000,
            workRequired: 10_000,
            food: 0,
            material: 18,
            materialRequired: 18,
            storedMaterial: 0,
            storageCapacity: 0,
            water: 0,
            guardIds: [],
            condition: 6_800,
            baseCapacity: 6,
            effectiveCapacity: 4,
            reservedSpaces: 3,
            restingCreatures: 2,
            memberOccupancy: 1,
            guestOccupancy: 1,
            upkeepNeeded: true,
            siteAssessment: {
              selectedAtTick: 12,
              memberTravelCost: 11,
              storageTravelCost: 9,
              foodAccessCost: 14,
              materialAccessCost: 8,
              waterAccessCost: 17,
              crowdingCost: 2,
              constructionInvestmentCost: 4,
              relocationChangeCost: 0,
              totalScore: 65,
            },
            builtFromShelterId: null,
          },
        ],
        groups: [
          {
            id: 81,
            name: "Mossbank",
            stage: "PERSISTENT",
            foundedTick: 0,
            memberIds: [creature.id],
            leaderId: creature.id,
            homeTileIndex: creature.tileIndex,
            storageStructureId: null,
            activeShelterId: 900,
            pendingShelterId: null,
            shelterRelocations: 0,
            shelterCommitUntilTick: 200,
            shelterRelocationCandidate: null,
            cohesion: 7_200,
            sharingNorm: 2_000,
            majorEventIds: [],
          },
        ],
      },
      null,
    );

    expect(projected.creatures[0]?.shelterAccess).toMatchObject({
      shelterId: 900,
      condition: 68,
      destination: "SHELTERED",
    });
    expect(projected.structures[0]).toMatchObject({
      kind: "SHELTER",
      condition: 68,
      baseCapacity: 6,
      effectiveCapacity: 4,
      reservedSpaces: 3,
      restingCreatures: 2,
      memberOccupancy: 1,
      guestOccupancy: 1,
      upkeepNeeded: true,
      siteAssessment: { totalScore: 65 },
    });
    expect(projected.groups[0]).toMatchObject({
      stage: "PERSISTENT",
      activeShelterId: 900,
      shelterRelocations: 0,
      shelterCommitUntilTick: 200,
    });
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

  it("maps water and material intervention tools to their authoritative commands", () => {
    const replenishState = createSimulationState(4_182);
    const tile = makeWorldView(replenishState).tiles.find(
      (candidate) => !candidate.blocked,
    );
    expect(tile).toBeTruthy();
    queueIntervention(replenishState, "replenish-water", tile!);
    expect(replenishState.commandQueue.at(-1)?.type).toBe("REPLENISH_WATER");

    const drainState = createSimulationState(4_182);
    queueIntervention(drainState, "drain-water", tile!);
    expect(drainState.commandQueue.at(-1)?.type).toBe("DRAIN_WATER");

    const addMaterialState = createSimulationState(4_182);
    queueIntervention(addMaterialState, "add-material", tile!);
    expect(addMaterialState.commandQueue.at(-1)?.type).toBe("ADD_MATERIAL");

    const removeMaterialState = createSimulationState(4_182);
    queueIntervention(removeMaterialState, "remove-material", tile!);
    expect(removeMaterialState.commandQueue.at(-1)?.type).toBe("REMOVE_MATERIAL");
  });

  it("clusters routine hydration facts while distinctly surfacing first sharing and alerts", () => {
    const state = createSimulationState(73) as SimulationState;
    const giver = state.creatures[0]!;
    const recipient = state.creatures[1]!;
    const source = state.resourceNodes.find((node) => node.kind === "WATER")!;
    const event = (
      id: number,
      tick: number,
      type: DomainEvent["type"],
      summary: string,
      attentionTier: DomainEvent["attentionTier"],
      importance: number,
      overrides: Partial<DomainEvent> = {},
    ): DomainEvent => ({
      id,
      tick,
      type,
      actorIds: [giver.id],
      targetIds: [],
      groupIds: [],
      locationTileIndex: giver.tileIndex,
      resourceKind: "WATER",
      quantity: 1,
      causedByEventIds: [],
      decisionRecordIds: [],
      importance,
      attentionTier,
      clusterKey: `authoritative:${id}`,
      commandId: null,
      commandOutcome: null,
      commandRejectionReason: null,
      summary,
      ...overrides,
    });

    state.domainEvents = [
      event(101, 10, "WATER_DRUNK", `${giver.name} drank one water.`, "ROUTINE", 8),
      event(102, 20, "WATER_DRUNK", `${recipient.name} drank one water.`, "ROUTINE", 8, {
        actorIds: [recipient.id],
      }),
      event(103, 30, "WATER_DRUNK", `${giver.name} drank one water.`, "ROUTINE", 8, {
        causedByEventIds: [91],
      }),
      event(
        104,
        40,
        "WATER_SHARED",
        `${giver.name} shared water with ${recipient.name}.`,
        "NOTABLE",
        28,
        { targetIds: [recipient.id], causedByEventIds: [92] },
      ),
      event(
        105,
        50,
        "WATER_SHARED",
        `${recipient.name} shared water with ${giver.name}.`,
        "NOTABLE",
        28,
        { actorIds: [recipient.id], targetIds: [giver.id] },
      ),
      event(
        106,
        60,
        "WATER_SHARED",
        `${giver.name} shared water with ${recipient.name}.`,
        "NOTABLE",
        28,
        { targetIds: [recipient.id], causedByEventIds: [93] },
      ),
      event(
        107,
        70,
        "WATER_SOURCE_DEPLETED",
        `${giver.name} drew the potable water source empty.`,
        "SIGNIFICANT",
        64,
        { targetIds: [source.id], locationTileIndex: source.tileIndex, quantity: 0 },
      ),
      event(
        108,
        80,
        "SEVERE_THIRST_STARTED",
        `${recipient.name} entered severe thirst.`,
        "SIGNIFICANT",
        58,
        { actorIds: [recipient.id], quantity: 8_004 },
      ),
      event(
        109,
        90,
        "SEVERE_THIRST_RESOLVED",
        `${recipient.name} recovered from severe thirst after drinking.`,
        "NOTABLE",
        42,
        { actorIds: [recipient.id], causedByEventIds: [103], quantity: 1_504 },
      ),
    ];
    state.metrics.waterDrunk = 3;
    state.metrics.waterShared = 3;
    state.tick = 100;

    const snapshot = createRenderSnapshot(state, false);
    const views = [
      makeWorldView(state),
      makeWorldViewFromSnapshot(snapshot, hashSimulationState(state)),
    ];
    for (const view of views) {
      const drinks = view.events.filter((candidate) => candidate.type === "WATER_DRUNK");
      expect(drinks).toHaveLength(1);
      expect(drinks[0]).toMatchObject({
        id: 103,
        title: "Routine drinking",
        detail: `3 routine drinks were recorded; latest: ${giver.name} drank one water.`,
        causedByEventIds: [91],
        attentionTier: "ROUTINE",
      });

      const shares = view.events.filter((candidate) => candidate.type === "WATER_SHARED");
      expect(shares).toHaveLength(2);
      expect(shares.find((candidate) => candidate.id === 104)).toMatchObject({
        title: "First water sharing",
        detail: `${giver.name} shared water with ${recipient.name}. This was the first recorded water share.`,
        causedByEventIds: [92],
        attentionTier: "SIGNIFICANT",
      });
      expect(shares.find((candidate) => candidate.id === 106)).toMatchObject({
        title: "Water sharing continued",
        detail: `2 later water shares were recorded; latest: ${giver.name} shared water with ${recipient.name}.`,
        causedByEventIds: [93],
        attentionTier: "NOTABLE",
      });

      expect(
        view.events.find((candidate) => candidate.type === "WATER_SOURCE_DEPLETED"),
      ).toMatchObject({
        title: "Water source depleted",
        detail: `${giver.name} drew the potable water source empty.`,
        attentionTier: "SIGNIFICANT",
      });
      expect(
        view.events.find((candidate) => candidate.type === "SEVERE_THIRST_STARTED"),
      ).toMatchObject({
        title: "Severe thirst started",
        detail: `${recipient.name} entered severe thirst.`,
        attentionTier: "SIGNIFICANT",
      });
      expect(
        view.events.find((candidate) => candidate.type === "SEVERE_THIRST_RESOLVED"),
      ).toMatchObject({
        title: "Severe thirst resolved",
        detail: `${recipient.name} recovered from severe thirst after drinking.`,
        causedByEventIds: [103],
        attentionTier: "NOTABLE",
      });
    }

    expect(state.domainEvents).toHaveLength(9);
    expect(state.domainEvents[0]?.clusterKey).toBe("authoritative:101");
    expect(state.domainEvents[3]?.attentionTier).toBe("NOTABLE");
  });

  it("presents shelter completion and relocation as group observations", () => {
    const state = createSimulationState(93);
    const template = state.domainEvents[0]!;
    state.domainEvents.push(
      {
        ...template,
        id: 90,
        tick: 4,
        type: "SHELTER_COMPLETED",
        attentionTier: "SIGNIFICANT",
        importance: 58,
        clusterKey: "shelter:group:8:completion",
        summary: "The group completed its communal shelter.",
      },
      {
        ...template,
        id: 91,
        tick: 8,
        type: "SHELTER_RELOCATED",
        attentionTier: "SIGNIFICANT",
        importance: 62,
        clusterKey: "shelter:group:8:relocation",
        summary: "The group moved home after a stable site comparison.",
      },
    );

    const events = makeWorldView(state).events.filter((event) => event.id >= 90);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "SHELTER_COMPLETED", category: "group" }),
        expect.objectContaining({ type: "SHELTER_RELOCATED", category: "group" }),
      ]),
    );
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
      activeShelterId: null,
      pendingShelterId: null,
      shelterRelocations: 0,
      shelterCommitUntilTick: 0,
      shelterRelocationCandidate: null,
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
      inventory: { capacity: 80, food: 7, material: 2, water: 4 },
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
    subject.needs.thirst = 12;
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
    expect(mapped?.thirst).toBeCloseTo(0.12);
    expect(generosity?.value).toBeCloseTo(0.34);
    expect(relationship?.familiarity).toBeCloseTo(0.34);
    expect(relationship?.trust).toBeCloseTo(0.0034);
  });
});
