import {
  createSimulation,
  effectiveShelterCapacity,
  shelterConditionBand,
  type ActiveAction,
  type DomainEvent,
  type ShelterStructureState,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import {
  ELEVATED_FATIGUE_THRESHOLD,
  StreamingSettlementActivityCollector,
  summarizeSettlementProfiles,
} from "./settlement-activity.js";

function shelter(
  state: SimulationState,
  overrides: Partial<ShelterStructureState> = {},
): ShelterStructureState {
  const condition = overrides.condition ?? 3_000;
  return {
    id: state.nextEntityId++,
    kind: "SHELTER",
    tileIndex: state.creatures[0]?.tileIndex ?? 0,
    groupId: 1,
    material: 18,
    materialRequired: 18,
    progress: 10_000,
    workRequired: 10_000,
    completedTick: 0,
    condition,
    baseCapacity: 6,
    siteAssessment: {
      selectedAtTick: 0,
      memberTravelCost: 100,
      storageTravelCost: 200,
      foodAccessCost: 300,
      materialAccessCost: 400,
      waterAccessCost: 500,
      crowdingCost: 600,
      constructionInvestmentCost: 700,
      relocationChangeCost: 800,
      totalScore: 10_000,
    },
    builtFromShelterId: null,
    maintenanceMaterialSpent: 0,
    lastMaintainedTick: null,
    lastUsedTick: null,
    conditionBand: shelterConditionBand(condition),
    ...overrides,
    inventory: overrides.inventory ?? { capacity: 0, food: 0, material: 0, water: 0 },
    guardIds: overrides.guardIds ?? [],
  };
}

function restAction(
  structureId: number,
  slotIndex: number,
  phase: ActiveAction["phase"] = "WORKING",
): ActiveAction {
  return {
    kind: "REST_SHELTERED",
    phase,
    startedAtTick: 0,
    targetEntityId: structureId,
    targetTileIndex: 0,
    path: [0],
    pathIndex: 0,
    progress: 0,
    workRequired: 10_000,
    navigationRevision: 0,
    interactionClaim: {
      anchorKind: "STRUCTURE",
      anchorId: structureId,
      purpose: "REST",
      slotIndex,
      tileIndex: 0,
      targetX: slotIndex * 100,
      targetY: 100,
      claimedAtTick: 0,
    },
  };
}

function event(
  state: SimulationState,
  type: DomainEvent["type"],
  targetId: number,
  actorIds: number[] = [],
  quantity = 1,
): DomainEvent {
  return {
    id: state.nextEventId++,
    tick: state.tick,
    type,
    actorIds,
    targetIds: [targetId],
    groupIds: [1],
    locationTileIndex: 0,
    resourceKind: null,
    quantity,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 1,
    attentionTier: "ROUTINE",
    clusterKey: `test:${type.toLowerCase()}`,
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary: type,
  };
}

describe("settlement activity collector", () => {
  it("profiles fatigue, occupancy, construction, condition, guests, and relocation", () => {
    const state = createSimulation(17);
    const [member, guest, ...others] = state.creatures;
    if (!member || !guest) throw new Error("Expected settlement fixture creatures.");
    for (const creature of others) creature.alive = false;
    const groupId = state.nextGroupId++;
    const oldShelter = shelter(state, {
      kind: "ABANDONED_SHELTER",
      groupId,
      siteAssessment: {
        ...shelter(state).siteAssessment,
        totalScore: 12_000,
      },
    });
    const activeShelter = shelter(state, {
      groupId,
      builtFromShelterId: oldShelter.id,
      siteAssessment: {
        ...oldShelter.siteAssessment,
        totalScore: 9_500,
      },
    });
    state.structures.push(oldShelter, activeShelter);
    member.groupId = groupId;
    member.needs.fatigue = ELEVATED_FATIGUE_THRESHOLD;
    state.groups.push({
      id: groupId,
      name: "Settlers",
      stage: "PERSISTENT",
      foundedTick: 0,
      memberIds: [member.id],
      leaderId: member.id,
      homeTileIndex: activeShelter.tileIndex,
      storageStructureId: null,
      activeShelterId: activeShelter.id,
      pendingShelterId: null,
      shelterRelocations: 1,
      shelterCommitUntilTick: 0,
      shelterRelocationCandidate: null,
      cohesion: 5_000,
      sharingNorm: 0,
      majorEventIds: [],
    });
    const collector = new StreamingSettlementActivityCollector(state);

    state.tick = 1;
    member.needs.fatigue = 7_000;
    member.activeAction = restAction(activeShelter.id, 0);
    guest.activeAction = restAction(activeShelter.id, 1, "MOVING");
    state.metrics.shelteredRests = 2;
    state.metrics.shelterGuestUses = 1;
    state.metrics.shelterDeniedClaims = 1;
    state.metrics.shelterMaintenanceMaterial = 2;
    state.metrics.shelterRelocations = 1;
    const events = [
      event(state, "SHELTER_SITE_SELECTED", activeShelter.id),
      event(state, "SHELTER_WORK_ADVANCED", activeShelter.id, [member.id]),
      event(state, "SHELTER_COMPLETED", activeShelter.id, [member.id]),
      event(state, "SHELTER_MAINTAINED", activeShelter.id, [member.id]),
      event(state, "SHELTER_CROWDED", activeShelter.id),
      event(state, "SHELTER_GUEST_USED", activeShelter.id, [guest.id]),
      event(state, "SHELTER_ABANDONED", oldShelter.id),
      event(state, "SHELTER_RELOCATED", activeShelter.id, [], 1_777),
    ];
    collector.observe(state, events);

    const profile = collector.report();
    expect(profile.fatigue).toMatchObject({
      elevatedThreshold: 8_000,
      livingCreatureTicks: 2,
      elevatedSpellCount: 1,
      resolvedElevatedSpellCount: 1,
      recoveredFatigueUnits: 1_000,
      recoveryLatencyTicks: { median: 1 },
    });
    expect(profile.rest).toMatchObject({
      shelteredRestEvents: 2,
      outdoorRestEvents: 0,
      shelteredRestShare: 1,
      shelteredRestCreatureTicks: 1,
      outdoorRestCreatureTicks: 0,
      memberUseEvents: 1,
      guestUseEvents: 1,
    });
    expect(profile.construction).toMatchObject({
      sitesSelected: 1,
      completions: 1,
      contributorIds: [member.id],
      distinctContributors: 1,
      workAdvanceEvents: 1,
    });
    expect(profile.condition).toMatchObject({
      activeShelterTicks: 1,
      meanCondition: 3_000,
      lowConditionShelterTicks: 1,
      maintenanceEvents: 1,
      maintenanceMaterial: 2,
    });
    expect(profile.occupancy).toMatchObject({
      effectiveCapacityTicks: effectiveShelterCapacity(activeShelter),
      reservedSpaceTicks: 2,
      restingCreatureTicks: 1,
      memberReservationTicks: 1,
      guestReservationTicks: 1,
      memberRestingCreatureTicks: 1,
      guestRestingCreatureTicks: 0,
      deniedClaims: 1,
      crowdingEvents: 1,
    });
    expect(profile.access).toMatchObject({ assessedSiteCount: 2 });
    expect(profile.relocation).toMatchObject({
      abandonments: 1,
      relocations: 1,
      scoreImprovement: { median: 1_777 },
    });
    expect(profile.horizon).toMatchObject({
      activeShelterCount: 1,
      abandonedShelterCount: 1,
      groupsWithActiveShelter: 1,
    });
    expect(profile.horizon.structures).toContainEqual(
      expect.objectContaining({
        structureId: activeShelter.id,
        material: 18,
        materialRequired: 18,
        progress: 10_000,
        workRequired: 10_000,
        reservedSpaces: 2,
        restingCreatures: 1,
        memberReservedSpaces: 1,
        guestReservedSpaces: 1,
        memberRestingCreatures: 1,
        guestRestingCreatures: 0,
      }),
    );
  });

  it("aggregates settlement distributions without inventing absent medians", () => {
    const state = createSimulation(18);
    const collector = new StreamingSettlementActivityCollector(state);
    const aggregate = summarizeSettlementProfiles([collector.report()]);

    expect(aggregate).toMatchObject({
      shelteredRestEvents: 0,
      outdoorRestEvents: 0,
      relocations: 0,
      seedDistributions: {
        activeShelterCount: { samples: 1, median: 0 },
        fatigueRecoveryLatencyMedianTicks: { samples: 0, median: null },
        meanShelterCondition: { samples: 0, median: null },
        lowConditionExposureRate: { samples: 0, median: null },
        reservationUtilization: { samples: 0, median: null },
        relocationScoreImprovementMedian: { samples: 0, median: null },
      },
    });
  });

  it("rejects a decreasing authoritative settlement counter on a mutable state", () => {
    const state = createSimulation(19);
    const collector = new StreamingSettlementActivityCollector(state);
    state.tick = 1;
    state.metrics.shelteredRests = 1;
    collector.observe(state, []);

    state.tick = 2;
    state.metrics.shelteredRests = 0;

    expect(() => collector.observe(state, [])).toThrow(
      "Settlement metric shelteredRests decreased inside one profile window.",
    );
  });
});
