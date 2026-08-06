import { describe, expect, it } from "vitest";
import {
  INTERVENTION_RESPONSE_SCHEMA_VERSION,
  OUTDOOR_REST_RECOVERY,
  SCENARIO_IDS,
  SHELTER_GUEST_TRUST_THRESHOLD,
  SHELTER_MATERIAL_REQUIRED,
  SHELTER_MINIMUM_COMMITMENT_TICKS,
  SHELTER_RELOCATION_MINIMUM_IMPROVEMENT,
  SHELTER_RELOCATION_REQUIRED_EVALUATIONS,
  SHELTER_REST_OFFSETS,
  SHELTER_WORK_REQUIRED,
  TILE_FIXED_UNITS,
  appendExperimentIntervention,
  advanceSimulation,
  assessShelterSite,
  assertCompatibleSimulationState,
  attemptInteractionSlotClaim,
  availableInteractionSlots,
  createCausalEvidenceProjection,
  createExperiment,
  createInterventionResponseTrace,
  createPendingIntervention,
  createRenderSnapshot,
  createScenarioReference,
  createSimulation,
  createSimulationReplay,
  deserializeExperiment,
  effectiveShelterCapacity,
  executeSimulationReplay,
  findPath,
  hashSimulationState,
  isLegalShelterSite,
  isProtectedShelterTile,
  migrateExperiment,
  migrateSimulationReplay,
  migrateSimulationSave,
  outdoorRestAnchorTile,
  observeInterventionResponse,
  queuePlayerCommand,
  rankShelterSites,
  repairInteractionClaims,
  serializeExperiment,
  shelterConditionBand,
  shelterEligibility,
  shelterOccupancy,
  shelterRestFootprintTiles,
  shelteredRestRecovery,
  tileCoordinates,
  tileIndexAt,
  updateShelters,
  type ActionKind,
  type ActiveAction,
  type CreatureState,
  type DomainEvent,
  type GroupState,
  type InteractionClaim,
  type ShelterStructureState,
  type SimulationState,
  type StorageStructureState,
} from "../src/index.js";
import { executeActiveActions } from "../src/actions/execution.js";
import { runScheduledDecisions } from "../src/actions/candidates.js";
import { updateGroups } from "../src/groups.js";
import {
  UNREACHABLE_TRAVEL_COST,
  weightedTravelCostsFrom,
  weightedTravelCostsToNearest,
} from "../src/pathfinding.js";

interface GroupFixture {
  group: GroupState;
  storage: StorageStructureState;
  members: CreatureState[];
}

function groupFixture(
  state: SimulationState,
  memberCount = 2,
  persistent = true,
): GroupFixture {
  const members = state.creatures.slice(0, memberCount);
  const leader = members[0];
  if (!leader) throw new Error("Missing group fixture leader.");
  const groupId = state.nextGroupId++;
  const storage: StorageStructureState = {
    id: state.nextEntityId++,
    kind: persistent ? "STORAGE" : "STORAGE_SITE",
    tileIndex: leader.tileIndex,
    groupId,
    material: persistent ? 8 : 0,
    materialRequired: 8,
    progress: persistent ? 10_000 : 0,
    workRequired: 10_000,
    inventory: { capacity: 100, food: 0, material: 0, water: 0 },
    guardIds: [],
    completedTick: persistent ? state.tick : null,
  };
  const group: GroupState = {
    id: groupId,
    name: "Test settlement",
    stage: persistent ? "PERSISTENT" : "PROVISIONAL",
    foundedTick: state.tick,
    memberIds: members.map((member) => member.id),
    leaderId: leader.id,
    homeTileIndex: storage.tileIndex,
    storageStructureId: storage.id,
    activeShelterId: null,
    pendingShelterId: null,
    shelterRelocations: 0,
    shelterCommitUntilTick: 0,
    shelterRelocationCandidate: null,
    cohesion: 5_000,
    sharingNorm: 1_000,
    majorEventIds: [],
  };
  for (const member of members) member.groupId = groupId;
  state.structures.push(storage);
  state.groups.push(group);
  return { group, storage, members };
}

function addShelter(
  state: SimulationState,
  group: GroupState,
  kind: "SHELTER" | "SHELTER_SITE" = "SHELTER",
  condition = 10_000,
): ShelterStructureState {
  const ranked = rankShelterSites(state, group, kind === "SHELTER_SITE")[0];
  if (!ranked) throw new Error("No legal shelter site in fixture.");
  const active =
    group.activeShelterId === null
      ? null
      : state.structures.find((structure) => structure.id === group.activeShelterId);
  const complete = kind === "SHELTER";
  const shelter: ShelterStructureState = {
    id: state.nextEntityId++,
    kind,
    tileIndex: ranked.tileIndex,
    groupId: group.id,
    material: complete ? SHELTER_MATERIAL_REQUIRED : 0,
    materialRequired: SHELTER_MATERIAL_REQUIRED,
    progress: complete ? SHELTER_WORK_REQUIRED : 0,
    workRequired: SHELTER_WORK_REQUIRED,
    inventory: { capacity: 0, food: 0, material: 0, water: 0 },
    guardIds: [],
    completedTick: complete ? state.tick : null,
    condition,
    baseCapacity: 6,
    siteAssessment: ranked.assessment,
    builtFromShelterId:
      active?.kind === "SHELTER" || active?.kind === "ABANDONED_SHELTER" ? active.id : null,
    maintenanceMaterialSpent: 0,
    lastMaintainedTick: null,
    lastUsedTick: null,
    conditionBand: shelterConditionBand(condition),
  };
  state.structures.push(shelter);
  if (complete) {
    group.activeShelterId = shelter.id;
    group.homeTileIndex = shelter.tileIndex;
    group.shelterCommitUntilTick = state.tick + SHELTER_MINIMUM_COMMITMENT_TICKS;
  } else {
    group.pendingShelterId = shelter.id;
  }
  return shelter;
}

function activeAction(
  state: SimulationState,
  creature: CreatureState,
  kind: ActionKind,
  targetEntityId: number | null,
  targetTileIndex: number,
  interactionClaim: InteractionClaim | null = null,
): ActiveAction {
  return {
    kind,
    phase: "WORKING",
    startedAtTick: state.tick,
    targetEntityId,
    targetTileIndex,
    path: [creature.tileIndex],
    pathIndex: 1,
    progress: 0,
    workRequired: 1,
    navigationRevision: state.world.navigationRevision,
    interactionClaim,
  };
}

function establishAction(
  state: SimulationState,
  creature: CreatureState,
  siteTileIndex: number,
): ActiveAction {
  const claim = availableInteractionSlots(
    state,
    "ESTABLISH_SHELTER_SITE",
    -(siteTileIndex + 1),
    siteTileIndex,
    creature.id,
  )[0];
  if (!claim) throw new Error("No establishment interaction place in fixture.");
  return activeAction(
    state,
    creature,
    "ESTABLISH_SHELTER_SITE",
    null,
    claim.tileIndex,
    claim,
  );
}

function relationship(
  state: SimulationState,
  fromId: number,
  toId: number,
  trust: number,
): void {
  state.relationships.push({
    id: state.nextRelationshipId++,
    fromId,
    toId,
    trust,
    fear: 0,
    familiarity: 5_000,
    rivalry: 0,
    lastInteractionTick: state.tick,
    significantEventIds: [],
  });
}

function cloned(state: SimulationState): SimulationState {
  return JSON.parse(JSON.stringify(state)) as SimulationState;
}

describe("shelter site selection and settlement gates", () => {
  it("matches standalone site assessment for every ranked candidate across scenarios and seeds", () => {
    for (const scenarioId of SCENARIO_IDS) {
      for (const seed of [1, 17]) {
        const state = createSimulation(createScenarioReference(scenarioId, seed));
        const { group } = groupFixture(state, 3);
        const initial = rankShelterSites(state, group);
        expect(initial.length).toBeGreaterThan(0);
        expect(initial).toEqual(
          initial
            .map(({ tileIndex }) => ({
              tileIndex,
              assessment: assessShelterSite(state, group, tileIndex, false),
            }))
            .sort(
              (left, right) =>
                left.assessment.totalScore - right.assessment.totalScore ||
                left.tileIndex - right.tileIndex,
            ),
        );

        addShelter(state, group, "SHELTER", 6_418);
        const relocation = rankShelterSites(state, group, true);
        expect(relocation.length).toBeGreaterThan(0);
        expect(relocation).toEqual(
          relocation
            .map(({ tileIndex }) => ({
              tileIndex,
              assessment: assessShelterSite(state, group, tileIndex, true),
            }))
            .sort(
              (left, right) =>
                left.assessment.totalScore - right.assessment.totalScore ||
                left.tileIndex - right.tileIndex,
            ),
        );
      }
    }
  });

  it("preserves exact weighted costs to nearest targets across weighted disconnected regions", () => {
    const width = 7;
    const height = 4;
    const world: SimulationState["world"] = {
      width,
      height,
      navigationRevision: 0,
      tiles: Array.from({ length: width * height }, (_, index) => ({
        index,
        x: index % width,
        y: Math.floor(index / width),
        terrain: "GROUND" as const,
        walkCost: 7 + ((index * 13) % 5) * 9,
        blocked: index % width === 3,
        navigationRevision: 0,
      })),
    };
    const targets = [1, width * height - 2];
    const nearest = weightedTravelCostsToNearest(world, targets);
    for (const tile of world.tiles) {
      const expected = Math.min(
        ...targets.map((target) => weightedTravelCostsFrom(world, tile.index)[target]!),
      );
      expect(nearest[tile.index]).toBe(expected);
    }
    expect(
      [...weightedTravelCostsToNearest(world, [])].every(
        (cost) => cost === UNREACHABLE_TRAVEL_COST,
      ),
    ).toBe(true);
  });

  it("preserves reachable resource costs above the 50,000 unreachable fallback", () => {
    const state = createSimulation(createScenarioReference("petri-world", 71));
    const { group } = groupFixture(state, 3);
    for (const node of state.resourceNodes) {
      if (node.kind === "FOOD") node.currentStock = 0;
    }
    const food = state.resourceNodes.find((node) => node.kind === "FOOD")!;
    food.currentStock = 1;
    state.world.navigationRevision += 1;
    for (const tile of state.world.tiles) {
      if (!tile.blocked) tile.walkCost = 60_001;
      tile.navigationRevision = state.world.navigationRevision;
    }

    const ranked = rankShelterSites(state, group);
    const longReachable = ranked.find(
      ({ tileIndex }) =>
        assessShelterSite(state, group, tileIndex, false).foodAccessCost > 50_000,
    );
    expect(longReachable).toBeDefined();
    expect(longReachable!.assessment).toEqual(
      assessShelterSite(state, group, longReachable!.tileIndex, false),
    );
    expect(longReachable!.assessment.foodAccessCost).toBeGreaterThan(50_000);
  });

  it("invalidates cached site costs when only the exact resource target set changes", () => {
    const state = createSimulation(createScenarioReference("petri-world", 72));
    const { group } = groupFixture(state, 3);
    const initial = rankShelterSites(state, group);
    expect(initial.some(({ assessment }) => assessment.foodAccessCost !== 50_000)).toBe(
      true,
    );

    for (const node of state.resourceNodes) {
      if (node.kind === "FOOD") node.currentStock = 0;
    }
    const ranked = rankShelterSites(state, group);
    expect(ranked.every(({ assessment }) => assessment.foodAccessCost === 50_000)).toBe(
      true,
    );
    expect(ranked).toEqual(
      ranked
        .map(({ tileIndex }) => ({
          tileIndex,
          assessment: assessShelterSite(state, group, tileIndex, false),
        }))
        .sort(
          (left, right) =>
            left.assessment.totalScore - right.assessment.totalScore ||
            left.tileIndex - right.tileIndex,
        ),
    );
  });

  it("invalidates cached site costs when navigation changes without target changes", () => {
    const state = createSimulation(createScenarioReference("petri-world", 73));
    const { group } = groupFixture(state, 3);
    const initial = rankShelterSites(state, group);
    const targetSet = state.resourceNodes
      .filter((node) => node.currentStock > 0)
      .map((node) => node.tileIndex)
      .sort((left, right) => left - right);

    state.world.navigationRevision += 1;
    for (const tile of state.world.tiles) {
      if (!tile.blocked) tile.walkCost += 7;
      tile.navigationRevision = state.world.navigationRevision;
    }

    const ranked = rankShelterSites(state, group);
    expect(
      state.resourceNodes
        .filter((node) => node.currentStock > 0)
        .map((node) => node.tileIndex)
        .sort((left, right) => left - right),
    ).toEqual(targetSet);
    expect(ranked.length).toBeGreaterThan(0);
    expect(
      ranked.some(({ tileIndex, assessment }) => {
        const previous = initial.find((candidate) => candidate.tileIndex === tileIndex);
        return (
          previous !== undefined && previous.assessment.totalScore !== assessment.totalScore
        );
      }),
    ).toBe(true);
    expect(ranked).toEqual(
      ranked
        .map(({ tileIndex }) => ({
          tileIndex,
          assessment: assessShelterSite(state, group, tileIndex, false),
        }))
        .sort(
          (left, right) =>
            left.assessment.totalScore - right.assessment.totalScore ||
            left.tileIndex - right.tileIndex,
        ),
    );
  });

  it("ranks a bounded legal six-place footprint deterministically with stable tie breaks and no scenario branch", () => {
    const state = createSimulation(createScenarioReference("split-banks", 7_319));
    const { group, members } = groupFixture(state, 3);
    const anchor = members[0]!.tileIndex;
    for (const member of members) {
      member.tileIndex = anchor;
      const point = tileCoordinates(state.world, anchor);
      member.x = point.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      member.y = point.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }

    const first = rankShelterSites(state, group);
    const repeated = rankShelterSites(state, group);
    expect(repeated).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(32);
    for (const candidate of first) {
      expect(isLegalShelterSite(state, candidate.tileIndex)).toBe(true);
      const footprint = shelterRestFootprintTiles(state, candidate.tileIndex);
      expect(new Set(footprint).size).toBe(SHELTER_REST_OFFSETS.length);
      expect(
        footprint.every((tile) => tile >= 0 && !state.world.tiles[tile]!.blocked),
      ).toBe(true);
      expect(
        footprint
          .slice(0, 5)
          .some((tile) => findPath(state.world, members[0]!.tileIndex, tile).length > 0),
      ).toBe(true);
    }
    for (let index = 1; index < first.length; index += 1) {
      const previous = first[index - 1]!;
      const current = first[index]!;
      expect(
        previous.assessment.totalScore < current.assessment.totalScore ||
          (previous.assessment.totalScore === current.assessment.totalScore &&
            previous.tileIndex < current.tileIndex),
      ).toBe(true);
    }

    const otherScenario = {
      ...state,
      scenario: { ...state.scenario, scenarioId: "unequal-table" as const },
    };
    expect(rankShelterSites(otherScenario, group)).toEqual(first);
  });

  it("freezes whole-number relocation investment facts for arbitrary condition", () => {
    const state = createSimulation(29);
    const { group } = groupFixture(state, 3);
    addShelter(state, group, "SHELTER", 6_418);
    const assessment = rankShelterSites(state, group, true)[0]!.assessment;
    expect(assessment.constructionInvestmentCost).toBe(1_284);
    expect(Number.isInteger(assessment.totalScore)).toBe(true);
  });

  it("tries the next ranked site when the first site's construction places are occupied", () => {
    const state = createSimulation(30);
    const { group, members } = groupFixture(state, 3);
    const leader = members[0]!;
    const ranked = rankShelterSites(state, group);
    expect(ranked.length).toBeGreaterThan(1);
    const first = ranked[0]!;
    const blockedSlots = availableInteractionSlots(
      state,
      "ESTABLISH_SHELTER_SITE",
      -(first.tileIndex + 1),
      first.tileIndex,
      null,
    );
    expect(blockedSlots.length).toBeGreaterThan(0);
    const blockers = state.creatures.filter((creature) => creature.id !== leader.id);
    for (const [index, claim] of blockedSlots.entries()) {
      const blocker = blockers[index]!;
      blocker.activeAction = activeAction(
        state,
        blocker,
        "ESTABLISH_SHELTER_SITE",
        null,
        claim.tileIndex,
        claim,
      );
      blocker.nextDecisionTick = Number.MAX_SAFE_INTEGER;
    }
    leader.activeAction = null;
    leader.activeDesire = null;
    leader.activePlan = null;
    leader.activeGoal = null;
    leader.nextDecisionTick = state.tick;
    runScheduledDecisions(state);

    const decision = state.decisionRecords.find((record) => record.actorId === leader.id);
    const establishment = decision?.candidates.find(
      (candidate) => candidate.action === "ESTABLISH_SHELTER_SITE",
    );
    expect(establishment?.targetTileIndex).not.toBe(first.tileIndex);
    expect(
      ranked.slice(1).some((site) => site.tileIndex === establishment?.targetTileIndex),
    ).toBe(true);
  });

  it("requires a completed store and revalidates the whole footprint when establishment completes", () => {
    const state = createSimulation(31);
    const { group, storage, members } = groupFixture(state, 2, false);
    const leader = members[0]!;
    const site = rankShelterSites(state, group)[0]!;
    leader.activeAction = establishAction(state, leader, site.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();
    expect(state.structures.some((structure) => structure.kind === "SHELTER_SITE")).toBe(
      false,
    );

    storage.kind = "STORAGE";
    storage.material = storage.materialRequired;
    storage.progress = storage.workRequired;
    storage.completedTick = state.tick;
    group.stage = "PERSISTENT";
    leader.activeAction = establishAction(state, leader, site.tileIndex);
    const footprintTile = shelterRestFootprintTiles(state, site.tileIndex)[0]!;
    state.world.tiles[footprintTile]!.blocked = true;
    leader.activeAction!.navigationRevision = state.world.navigationRevision;
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();

    state.world.tiles[footprintTile]!.blocked = false;
    leader.activeAction = establishAction(state, leader, site.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).not.toBeNull();
  });

  it("relocates a later group's storage away from an existing shelter place", () => {
    const state = createSimulation(37);
    const first = groupFixture(state, 2);
    const shelter = addShelter(state, first.group);
    const occupiedHome = shelterRestFootprintTiles(state, shelter.tileIndex)[0]!;
    const members = state.creatures.slice(2, 5);
    const leader = members[0]!;
    const group: GroupState = {
      id: state.nextGroupId++,
      name: "Later group",
      stage: "PROVISIONAL",
      foundedTick: state.tick,
      memberIds: members.map((member) => member.id),
      leaderId: leader.id,
      homeTileIndex: occupiedHome,
      storageStructureId: null,
      activeShelterId: null,
      pendingShelterId: null,
      shelterRelocations: 0,
      shelterCommitUntilTick: 0,
      shelterRelocationCandidate: null,
      cohesion: 5_000,
      sharingNorm: 1_000,
      majorEventIds: [],
    };
    state.groups.push(group);
    for (const member of members) member.groupId = group.id;
    leader.inventory.material = 1;
    leader.activeAction = activeAction(
      state,
      leader,
      "BUILD_STORAGE",
      group.id,
      occupiedHome,
    );

    executeActiveActions(state);

    const storage = state.structures.find(
      (structure) => structure.id === group.storageStructureId,
    );
    expect(storage?.kind).toBe("STORAGE_SITE");
    expect(storage?.tileIndex).not.toBe(occupiedHome);
    expect(isProtectedShelterTile(state, storage!.tileIndex)).toBe(false);
    expect(group.homeTileIndex).toBe(storage?.tileIndex);
  });

  it("rejects overlapping homes and stale relocation choices, then moves home atomically only once", () => {
    const state = createSimulation(createScenarioReference("scattered-plenty", 2_047));
    const { group, members } = groupFixture(state, 3);
    const leader = members[0]!;
    const oldShelter = addShelter(state, group);
    const oldPoint = tileCoordinates(state.world, oldShelter.tileIndex);
    const overlappingCenter = tileIndexAt(state.world, oldPoint.x, oldPoint.y + 2);
    expect(isLegalShelterSite(state, overlappingCenter)).toBe(false);

    state.tick = 2_000;
    group.shelterCommitUntilTick = 1_500;
    const farTile = state.world.tiles
      .filter(
        (tile) =>
          !tile.blocked &&
          !isProtectedShelterTile(state, tile.index) &&
          !state.resourceNodes.some((node) => node.tileIndex === tile.index) &&
          !state.structures.some((structure) => structure.tileIndex === tile.index),
      )
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - oldPoint.x) + Math.abs(left.y - oldPoint.y);
        const rightDistance =
          Math.abs(right.x - oldPoint.x) + Math.abs(right.y - oldPoint.y);
        return rightDistance - leftDistance || left.index - right.index;
      })[0]!;
    const storage = state.structures.find(
      (structure) => structure.id === group.storageStructureId,
    )!;
    storage.tileIndex = farTile.index;
    for (const member of members) {
      member.tileIndex = farTile.index;
      member.x = farTile.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      member.y = farTile.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }
    oldShelter.condition = 0;
    oldShelter.conditionBand = "LOW";
    for (const outsider of state.creatures.filter(
      (creature) => !group.memberIds.includes(creature.id),
    )) {
      outsider.tileIndex = oldShelter.tileIndex;
      outsider.x = oldPoint.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      outsider.y = oldPoint.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }
    const alternative = rankShelterSites(state, group, true)[0]!;
    const scoreImprovement =
      assessShelterSite(state, group, oldShelter.tileIndex, false).totalScore -
      alternative.assessment.totalScore;
    expect(scoreImprovement).toBeGreaterThanOrEqual(SHELTER_RELOCATION_MINIMUM_IMPROVEMENT);
    group.shelterRelocationCandidate = {
      tileIndex: alternative.tileIndex,
      firstSeenTick: 1_800,
      lastEvaluatedTick: 2_000,
      consecutiveEvaluations: SHELTER_RELOCATION_REQUIRED_EVALUATIONS,
      scoreImprovement,
    };
    leader.activeAction = establishAction(state, leader, alternative.tileIndex);
    group.shelterRelocationCandidate = null;
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();
    expect(group.activeShelterId).toBe(oldShelter.id);

    group.shelterRelocationCandidate = {
      tileIndex: alternative.tileIndex,
      firstSeenTick: 1_800,
      lastEvaluatedTick: 2_000,
      consecutiveEvaluations: SHELTER_RELOCATION_REQUIRED_EVALUATIONS,
      scoreImprovement,
    };
    leader.activeAction = establishAction(state, leader, alternative.tileIndex);
    executeActiveActions(state);
    const pending = state.structures.find(
      (structure): structure is ShelterStructureState =>
        structure.id === group.pendingShelterId && structure.kind === "SHELTER_SITE",
    );
    if (!pending) throw new Error("Expected committed replacement site.");
    expect(group.shelterRelocationCandidate).toBeNull();
    pending.material = pending.materialRequired;
    pending.progress = pending.workRequired;
    const expectedImprovement = Math.max(
      0,
      assessShelterSite(state, group, oldShelter.tileIndex, false).totalScore -
        assessShelterSite(state, group, pending.tileIndex, true).totalScore,
    );
    leader.activeAction = activeAction(
      state,
      leader,
      "BUILD_SHELTER",
      pending.id,
      pending.tileIndex,
    );
    executeActiveActions(state);

    expect(oldShelter.kind).toBe("ABANDONED_SHELTER");
    expect(pending.kind).toBe("SHELTER");
    expect(group).toMatchObject({
      activeShelterId: pending.id,
      pendingShelterId: null,
      homeTileIndex: pending.tileIndex,
      shelterRelocations: 1,
    });
    expect(state.metrics.shelterRelocations).toBe(1);
    expect(
      state.domainEvents.filter((event) => event.type === "SHELTER_RELOCATED").at(-1),
    ).toMatchObject({ quantity: expectedImprovement });

    state.tick = group.shelterCommitUntilTick;
    const forbidden = rankShelterSites(state, group, true)[0]!;
    group.shelterRelocationCandidate = {
      tileIndex: forbidden.tileIndex,
      firstSeenTick: state.tick,
      lastEvaluatedTick: state.tick,
      consecutiveEvaluations: SHELTER_RELOCATION_REQUIRED_EVALUATIONS,
      scoreImprovement: SHELTER_RELOCATION_MINIMUM_IMPROVEMENT,
    };
    leader.activeAction = establishAction(state, leader, forbidden.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();
    expect(state.metrics.shelterRelocations).toBe(1);
  });

  it("requires three consecutive material relocation evaluations and resets a lost advantage", () => {
    const state = createSimulation(createScenarioReference("scattered-plenty", 2_049));
    const { group, members, storage } = groupFixture(state, 3);
    const leader = members[0]!;
    const oldShelter = addShelter(state, group);
    const oldPoint = tileCoordinates(state.world, oldShelter.tileIndex);
    const farTile = state.world.tiles
      .filter(
        (tile) =>
          !tile.blocked &&
          !isProtectedShelterTile(state, tile.index) &&
          !state.resourceNodes.some((node) => node.tileIndex === tile.index) &&
          !state.structures.some((structure) => structure.tileIndex === tile.index),
      )
      .sort((left, right) => {
        const leftDistance = Math.abs(left.x - oldPoint.x) + Math.abs(left.y - oldPoint.y);
        const rightDistance =
          Math.abs(right.x - oldPoint.x) + Math.abs(right.y - oldPoint.y);
        return rightDistance - leftDistance || left.index - right.index;
      })[0]!;
    const moveCreature = (
      creature: CreatureState,
      tile: { index: number; x: number; y: number },
    ): void => {
      creature.tileIndex = tile.index;
      creature.x = tile.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      creature.y = tile.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    };
    const oldTile = { index: oldShelter.tileIndex, ...oldPoint };
    const outsiders = state.creatures.filter(
      (creature) => !group.memberIds.includes(creature.id),
    );
    const restoreAdvantage = (): void => {
      storage.tileIndex = farTile.index;
      for (const member of members) moveCreature(member, farTile);
      for (const outsider of outsiders) moveCreature(outsider, oldTile);
      oldShelter.condition = 0;
      oldShelter.conditionBand = "LOW";
    };
    restoreAdvantage();
    state.tick = 2_000;
    group.shelterCommitUntilTick = 1_500;

    updateShelters(state);
    expect(group.shelterRelocationCandidate?.consecutiveEvaluations).toBe(1);
    let candidate = group.shelterRelocationCandidate!;
    leader.activeAction = establishAction(state, leader, candidate.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();

    state.tick = 2_050;
    updateShelters(state);
    expect(group.shelterRelocationCandidate?.consecutiveEvaluations).toBe(2);
    candidate = group.shelterRelocationCandidate!;
    leader.activeAction = establishAction(state, leader, candidate.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).toBeNull();

    storage.tileIndex = oldShelter.tileIndex;
    for (const member of members) moveCreature(member, oldTile);
    for (const outsider of outsiders) moveCreature(outsider, farTile);
    oldShelter.condition = 10_000;
    oldShelter.conditionBand = "GOOD";
    state.tick = 2_100;
    updateShelters(state);
    expect(group.shelterRelocationCandidate).toBeNull();

    restoreAdvantage();
    for (const [tick, expected] of [
      [2_150, 1],
      [2_200, 2],
      [2_250, 3],
    ] as const) {
      state.tick = tick;
      updateShelters(state);
      expect(group.shelterRelocationCandidate?.consecutiveEvaluations).toBe(expected);
    }
    candidate = group.shelterRelocationCandidate!;
    expect(candidate.scoreImprovement).toBeGreaterThanOrEqual(
      SHELTER_RELOCATION_MINIMUM_IMPROVEMENT,
    );
    leader.activeAction = establishAction(state, leader, candidate.tileIndex);
    executeActiveActions(state);
    expect(group.pendingShelterId).not.toBeNull();
    expect(group.activeShelterId).toBe(oldShelter.id);
  });
});

describe("shelter condition, rest, upkeep, and occupancy", () => {
  it("keeps condition, capacity, and recovery bounded with a meaningful outdoor advantage", () => {
    const recoveries = [-1_000, 0, 2_500, 5_000, 10_000, 20_000].map(shelteredRestRecovery);
    expect(recoveries[0]).toBe(recoveries[1]);
    expect(recoveries.at(-1)).toBe(recoveries.at(-2));
    expect(recoveries[1]).toBeGreaterThanOrEqual(OUTDOOR_REST_RECOVERY + 500);
    expect(recoveries).toEqual([...recoveries].sort((left, right) => left - right));

    const state = createSimulation(47);
    const { group } = groupFixture(state);
    const shelter = addShelter(state, group, "SHELTER", 5);
    group.shelterCommitUntilTick = 10_000;
    state.tick = 50;
    updateShelters(state);
    expect(shelter.condition).toBe(0);
    expect(shelter.conditionBand).toBe("LOW");
    expect(effectiveShelterCapacity(shelter)).toBe(2);
    shelter.condition = 10_000;
    shelter.conditionBand = "GOOD";
    expect(effectiveShelterCapacity(shelter)).toBe(6);
  });

  it("resolves sheltered and outdoor rest separately and charges maintenance material exactly", () => {
    const state = createSimulation(53);
    const { group, members } = groupFixture(state, 3);
    const shelter = addShelter(state, group, "SHELTER", 0);
    shelter.conditionBand = "LOW";
    const sheltered = members[0]!;
    const outdoors = members[1]!;
    sheltered.needs.fatigue = 8_000;
    outdoors.needs.fatigue = 8_000;
    const shelteredClaim = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      sheltered.id,
    )[0]!;
    sheltered.tileIndex = shelteredClaim.tileIndex;
    sheltered.x = shelteredClaim.targetX;
    sheltered.y = shelteredClaim.targetY;
    sheltered.activeAction = activeAction(
      state,
      sheltered,
      "REST_SHELTERED",
      shelter.id,
      shelteredClaim.tileIndex,
      shelteredClaim,
    );
    outdoors.activeAction = activeAction(state, outdoors, "REST", null, outdoors.tileIndex);
    executeActiveActions(state);
    expect(sheltered.needs.fatigue).toBe(8_000 - shelteredRestRecovery(0));
    expect(outdoors.needs.fatigue).toBe(8_000 - OUTDOOR_REST_RECOVERY);
    expect(state.metrics).toMatchObject({ shelteredRests: 1, outdoorRests: 1 });

    const maintainer = members[2]!;
    shelter.condition = 3_000;
    shelter.conditionBand = "LOW";
    maintainer.inventory.material = 2;
    const cohesion = group.cohesion;
    maintainer.activeAction = activeAction(
      state,
      maintainer,
      "MAINTAIN_SHELTER",
      shelter.id,
      shelter.tileIndex,
    );
    executeActiveActions(state);
    expect(maintainer.inventory.material).toBe(0);
    expect(shelter).toMatchObject({
      condition: 7_400,
      conditionBand: "GOOD",
      maintenanceMaterialSpent: 2,
      lastMaintainedTick: state.tick,
    });
    expect(state.metrics.shelterMaintenanceMaterial).toBe(2);
    expect(group.cohesion).toBe(cohesion + 180);
    expect(
      state.domainEvents.filter((event) => event.type === "SHELTER_MAINTAINED").at(-1),
    ).toMatchObject({ resourceKind: "MATERIAL", quantity: 2 });
  });

  it("rejects missing and forged sheltered-rest claims before recovery", () => {
    const state = createSimulation(55);
    const { group, members } = groupFixture(state, 2);
    const shelter = addShelter(state, group);
    const member = members[0]!;
    for (const creature of state.creatures) {
      creature.nextDecisionTick = Number.MAX_SAFE_INTEGER;
    }
    member.activeAction = null;
    member.activeDesire = null;
    member.activePlan = null;
    member.activeGoal = null;
    member.needs = { hunger: 0, fatigue: 9_500, thirst: 0 };
    member.nextDecisionTick = state.tick;
    runScheduledDecisions(state);
    expect((member as CreatureState).activeAction?.kind).toBe("REST_SHELTERED");
    expect(() => assertCompatibleSimulationState(state)).not.toThrow();
    repairInteractionClaims(state);

    const staleTargets = cloned(state);
    const staleMember = staleTargets.creatures.find(
      (creature) => creature.id === member.id,
    )!;
    const canonicalTileIndex = staleMember.activeAction!.interactionClaim!.tileIndex;
    const staleTileIndex = (canonicalTileIndex + 1) % staleTargets.world.tiles.length;
    staleMember.activeGoal!.targetTileIndex = staleTileIndex;
    staleMember.activePlan!.targetTileIndex = staleTileIndex;
    repairInteractionClaims(staleTargets);
    expect(staleMember.activeGoal?.targetTileIndex).toBe(canonicalTileIndex);
    expect(staleMember.activePlan).toMatchObject({
      targetTileIndex: canonicalTileIndex,
      interactionClaim: { tileIndex: canonicalTileIndex },
    });

    const missing = cloned(state);
    const missingMember = missing.creatures.find((creature) => creature.id === member.id)!;
    const missingShelter = missing.structures.find(
      (structure): structure is ShelterStructureState =>
        structure.id === shelter.id && structure.kind === "SHELTER",
    )!;
    missingMember.activeAction!.interactionClaim = null;
    missingMember.activePlan!.interactionClaim = null;
    expect(() => assertCompatibleSimulationState(missing)).toThrow(
      "missing a required interaction claim",
    );
    const fatigue = missingMember.needs.fatigue;
    const condition = missingShelter.condition;
    const rests = missing.metrics.shelteredRests;
    const denied = missing.metrics.shelterDeniedClaims;
    executeActiveActions(missing);
    expect(missingMember.activeAction).toBeNull();
    expect(missingMember.needs.fatigue).toBe(fatigue);
    expect(missingShelter.condition).toBe(condition);
    expect(missing.metrics.shelteredRests).toBe(rests);
    expect(missing.metrics.shelterDeniedClaims).toBe(denied + 1);

    const forged = cloned(state);
    const forgedMember = forged.creatures.find((creature) => creature.id === member.id)!;
    const forgedAction = forgedMember.activeAction!;
    const forgedClaim = {
      ...forgedAction.interactionClaim!,
      tileIndex: forgedMember.tileIndex,
      targetX: forgedMember.x,
      targetY: forgedMember.y,
    };
    forgedAction.interactionClaim = forgedClaim;
    forgedAction.targetTileIndex = forgedMember.tileIndex;
    forgedAction.path = [forgedMember.tileIndex];
    forgedAction.pathIndex = 1;
    forgedMember.activePlan!.interactionClaim = forgedClaim;
    forgedMember.activePlan!.targetTileIndex = forgedMember.tileIndex;
    forgedMember.activeGoal!.targetTileIndex = forgedMember.tileIndex;
    expect(() => assertCompatibleSimulationState(forged)).toThrow(
      "invalid sheltered-rest claim",
    );
  });

  it("preserves construction and upkeep cohesion effects across group recomputation", () => {
    const state = createSimulation(57);
    const { group, members } = groupFixture(state, 3);
    const shelter = addShelter(state, group, "SHELTER", 3_000);
    for (const from of members) {
      for (const to of members) {
        if (from.id !== to.id) relationship(state, from.id, to.id, 1_000);
      }
    }
    const baseline = cloned(state);
    const maintainer = members[0]!;
    maintainer.inventory.material = 1;
    maintainer.activeAction = activeAction(
      state,
      maintainer,
      "MAINTAIN_SHELTER",
      shelter.id,
      shelter.tileIndex,
    );
    executeActiveActions(state);
    const maintained = state.domainEvents.find(
      (event) => event.type === "SHELTER_MAINTAINED",
    )!;
    expect(
      state.relationships.some((edge) => edge.significantEventIds.includes(maintained.id)),
    ).toBe(true);

    state.tick = 50;
    baseline.tick = 50;
    updateGroups(state);
    updateGroups(baseline);
    expect(group.cohesion).toBeGreaterThan(baseline.groups[0]!.cohesion);
  });

  it("uses the exact trust threshold and compacts member reservations ahead of guests after capacity shrinks", () => {
    const state = createSimulation(59);
    const { group, members, storage } = groupFixture(state, 2);
    const shelter = addShelter(state, group);
    const firstGuest = state.creatures[2]!;
    const secondGuest = state.creatures[3]!;
    relationship(state, members[0]!.id, firstGuest.id, SHELTER_GUEST_TRUST_THRESHOLD - 1);
    expect(shelterEligibility(state, firstGuest, shelter)).toBe("INELIGIBLE");
    state.relationships[0]!.trust = SHELTER_GUEST_TRUST_THRESHOLD;
    relationship(state, members[0]!.id, secondGuest.id, SHELTER_GUEST_TRUST_THRESHOLD);
    expect(shelterEligibility(state, firstGuest, shelter)).toBe("TRUSTED_GUEST");
    expect(shelterEligibility(state, secondGuest, shelter)).toBe("TRUSTED_GUEST");

    const storagePoint = tileCoordinates(state.world, storage.tileIndex);
    for (const creature of [...members, firstGuest, secondGuest]) {
      creature.tileIndex = storage.tileIndex;
      creature.x = storagePoint.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      creature.y = storagePoint.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }
    const slots = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      null,
    );
    expect(slots).toHaveLength(6);
    for (const [creature, slotIndex] of [
      [firstGuest, 0],
      [secondGuest, 1],
      [members[0]!, 4],
      [members[1]!, 5],
    ] as const) {
      const claim = slots[slotIndex]!;
      creature.activeAction = activeAction(
        state,
        creature,
        "REST_SHELTERED",
        shelter.id,
        claim.tileIndex,
        claim,
      );
    }
    shelter.condition = 0;
    shelter.conditionBand = "LOW";
    repairInteractionClaims(state);
    expect(
      members.map((member) => member.activeAction?.interactionClaim?.slotIndex),
    ).toEqual([0, 1]);
    expect(firstGuest.activeAction).toBeNull();
    expect(secondGuest.activeAction).toBeNull();
    expect(state.metrics.shelterDeniedClaims).toBe(2);
    expect(
      state.domainEvents.filter((event) => event.type === "SHELTER_CROWDED"),
    ).toHaveLength(1);

    const outdoorAnchor = outdoorRestAnchorTile(state, firstGuest);
    const outdoorSlots = availableInteractionSlots(
      state,
      "REST",
      -(outdoorAnchor + 1),
      outdoorAnchor,
      firstGuest.id,
    );
    expect(outdoorSlots.length).toBeGreaterThan(0);
    const memberEndpoints = new Set(
      members.map((member) => member.activeAction?.interactionClaim?.tileIndex),
    );
    expect(outdoorSlots.some((slot) => !memberEndpoints.has(slot.tileIndex))).toBe(true);
  });

  it("denies an eligible isolated claimant without reporting free slots as crowding", () => {
    const state = createSimulation(60);
    const { group, members } = groupFixture(state, 2);
    const shelter = addShelter(state, group);
    const claimant = members[0]!;
    for (const creature of state.creatures) {
      creature.activeAction = null;
      if (creature.id !== claimant.id) creature.alive = false;
    }
    const shelterPoint = tileCoordinates(state.world, shelter.tileIndex);
    const protectedTiles = new Set([
      shelter.tileIndex,
      ...shelterRestFootprintTiles(state, shelter.tileIndex),
    ]);
    const isolatedTile = state.world.tiles.find((tile) => {
      if (
        tile.blocked ||
        tile.x <= 0 ||
        tile.y <= 0 ||
        tile.x >= state.world.width - 1 ||
        tile.y >= state.world.height - 1 ||
        Math.abs(tile.x - shelterPoint.x) + Math.abs(tile.y - shelterPoint.y) <= 5
      ) {
        return false;
      }
      return [
        tileIndexAt(state.world, tile.x, tile.y - 1),
        tileIndexAt(state.world, tile.x - 1, tile.y),
        tileIndexAt(state.world, tile.x + 1, tile.y),
        tileIndexAt(state.world, tile.x, tile.y + 1),
      ].every(
        (neighbor) =>
          neighbor >= 0 &&
          !state.world.tiles[neighbor]!.blocked &&
          !protectedTiles.has(neighbor),
      );
    });
    if (!isolatedTile) throw new Error("Missing isolated shelter claimant fixture tile.");
    claimant.tileIndex = isolatedTile.index;
    claimant.x = isolatedTile.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    claimant.y = isolatedTile.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    state.world.navigationRevision += 1;
    for (const neighbor of [
      tileIndexAt(state.world, isolatedTile.x, isolatedTile.y - 1),
      tileIndexAt(state.world, isolatedTile.x - 1, isolatedTile.y),
      tileIndexAt(state.world, isolatedTile.x + 1, isolatedTile.y),
      tileIndexAt(state.world, isolatedTile.x, isolatedTile.y + 1),
    ]) {
      state.world.tiles[neighbor]!.blocked = true;
      state.world.tiles[neighbor]!.navigationRevision = state.world.navigationRevision;
    }

    const freeSlots = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      claimant.id,
    );
    expect(freeSlots).toHaveLength(effectiveShelterCapacity(shelter));
    expect(
      freeSlots.every(
        (slot) => findPath(state.world, claimant.tileIndex, slot.tileIndex).length === 0,
      ),
    ).toBe(true);
    const deniedBefore = state.metrics.shelterDeniedClaims;
    expect(
      attemptInteractionSlotClaim(
        state,
        claimant,
        "REST_SHELTERED",
        shelter.id,
        shelter.tileIndex,
      ),
    ).toEqual({ claim: null, contended: false, failed: true });
    expect(state.metrics.shelterDeniedClaims).toBe(deniedBefore + 1);
    expect(state.domainEvents.some((event) => event.type === "SHELTER_CROWDED")).toBe(
      false,
    );
  });

  it("separates reserved places from members and guests physically resting", () => {
    const state = createSimulation(58);
    const { group, members } = groupFixture(state, 2);
    const shelter = addShelter(state, group);
    const guest = state.creatures[2]!;
    relationship(state, members[0]!.id, guest.id, SHELTER_GUEST_TRUST_THRESHOLD);
    const claims = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      null,
    );
    members[0]!.activeAction = activeAction(
      state,
      members[0]!,
      "REST_SHELTERED",
      shelter.id,
      claims[0]!.tileIndex,
      claims[0]!,
    );
    guest.activeAction = {
      ...activeAction(
        state,
        guest,
        "REST_SHELTERED",
        shelter.id,
        claims[1]!.tileIndex,
        claims[1]!,
      ),
      phase: "MOVING",
    };

    expect(shelterOccupancy(state, shelter.id)).toEqual({
      reserved: 2,
      resting: 1,
      members: 1,
      guests: 0,
    });
    guest.activeAction.phase = "WORKING";
    expect(shelterOccupancy(state, shelter.id)).toEqual({
      reserved: 2,
      resting: 2,
      members: 1,
      guests: 1,
    });
  });

  it("omits sheltered rest when every place is held by members so outdoor rest can win", () => {
    const state = createSimulation(60);
    const { group, members, storage } = groupFixture(state, 7);
    const shelter = addShelter(state, group);
    const point = tileCoordinates(state.world, storage.tileIndex);
    for (const member of members) {
      member.tileIndex = storage.tileIndex;
      member.x = point.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      member.y = point.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      member.nextDecisionTick = Number.MAX_SAFE_INTEGER;
    }
    const claims = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      null,
    );
    for (const [index, member] of members.slice(0, 6).entries()) {
      const claim = claims[index]!;
      member.activeAction = activeAction(
        state,
        member,
        "REST_SHELTERED",
        shelter.id,
        claim.tileIndex,
        claim,
      );
    }

    const fallback = members[6]!;
    fallback.activeAction = null;
    fallback.activeDesire = null;
    fallback.activePlan = null;
    fallback.activeGoal = null;
    fallback.inventory = {
      capacity: fallback.inventory.capacity,
      food: 0,
      material: 0,
      water: 0,
    };
    fallback.needs = { hunger: 0, fatigue: 9_500, thirst: 0 };
    fallback.nextDecisionTick = state.tick;
    runScheduledDecisions(state);

    const decision = state.decisionRecords.find((record) => record.actorId === fallback.id);
    expect(
      decision?.candidates.some((candidate) => candidate.action === "REST_SHELTERED"),
    ).toBe(false);
    expect(decision?.selectedAction).toBe("REST");
    expect((fallback as CreatureState).activeAction?.kind).toBe("REST");
  });

  it("does not mislabel ineligibility or unreachable denial as factual crowding", () => {
    const state = createSimulation(61);
    const { group } = groupFixture(state);
    const shelter = addShelter(state, group);
    const outsider = state.creatures[3]!;
    const slot = availableInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      outsider.id,
    )[0]!;
    outsider.activeAction = activeAction(
      state,
      outsider,
      "REST_SHELTERED",
      shelter.id,
      slot.tileIndex,
      slot,
    );
    repairInteractionClaims(state);
    expect(outsider.activeAction).toBeNull();
    expect(state.domainEvents.some((event) => event.type === "SHELTER_CROWDED")).toBe(
      false,
    );
  });
});

function projectedEvent(
  id: number,
  tick: number,
  type: DomainEvent["type"],
  attentionTier: DomainEvent["attentionTier"],
  quantity: number,
  summary: string,
  targetId = 20,
  actorId = 1,
  groupId = 1,
): DomainEvent {
  return {
    id,
    tick,
    type,
    actorIds: [actorId],
    targetIds: [targetId],
    groupIds: [groupId],
    locationTileIndex: 10,
    resourceKind: type === "SHELTER_MAINTAINED" ? "MATERIAL" : null,
    quantity,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: attentionTier === "ROUTINE" ? 8 : 80,
    attentionTier,
    clusterKey: `authoritative:${id.toString()}`,
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary,
  };
}

describe("shelter observer projections and material experiments", () => {
  it("explains ineligible, full, and absent-shelter outdoor fallback without hiding the nearest shelter", () => {
    const ineligibleState = createSimulation(67);
    const { group } = groupFixture(ineligibleState);
    const shelter = addShelter(ineligibleState, group);
    const outsider = ineligibleState.creatures[3]!;
    outsider.activeAction = activeAction(
      ineligibleState,
      outsider,
      "REST",
      null,
      outsider.tileIndex,
    );
    const ineligibleAccess = createRenderSnapshot(ineligibleState, false).creatures.find(
      (creature) => creature.id === outsider.id,
    )!.shelterAccess;
    expect(ineligibleAccess).toMatchObject({
      shelterId: shelter.id,
      eligibility: "INELIGIBLE",
      destination: "OUTDOOR",
    });
    expect(ineligibleAccess?.reason).toContain("did not admit");

    const fullState = createSimulation(71);
    const fullFixture = groupFixture(fullState, 7);
    const fullShelter = addShelter(fullState, fullFixture.group);
    const storagePoint = tileCoordinates(fullState.world, fullFixture.storage.tileIndex);
    for (const member of fullFixture.members) {
      member.tileIndex = fullFixture.storage.tileIndex;
      member.x = storagePoint.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      member.y = storagePoint.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }
    const claims = availableInteractionSlots(
      fullState,
      "REST_SHELTERED",
      fullShelter.id,
      fullShelter.tileIndex,
      null,
    );
    for (const [index, member] of fullFixture.members.slice(0, 6).entries()) {
      const claim = claims[index]!;
      member.activeAction = activeAction(
        fullState,
        member,
        "REST_SHELTERED",
        fullShelter.id,
        claim.tileIndex,
        claim,
      );
    }
    const fallback = fullFixture.members[6]!;
    const fallbackAnchor = outdoorRestAnchorTile(fullState, fallback);
    const fallbackClaim = availableInteractionSlots(
      fullState,
      "REST",
      -(fallbackAnchor + 1),
      fallbackAnchor,
      fallback.id,
    )[0];
    expect(fallbackClaim).toBeDefined();
    fallback.activeAction = activeAction(
      fullState,
      fallback,
      "REST",
      null,
      fallbackClaim!.tileIndex,
      fallbackClaim!,
    );
    const fullAccess = createRenderSnapshot(fullState, false).creatures.find(
      (creature) => creature.id === fallback.id,
    )!.shelterAccess;
    expect(fullAccess).toMatchObject({
      shelterId: fullShelter.id,
      eligibility: "MEMBER",
      reservedSpaces: 6,
      effectiveCapacity: 6,
      destination: "OUTDOOR",
    });
    expect(fullAccess?.reason).toContain("no unreserved place");

    const absentState = createSimulation(73);
    const resting = absentState.creatures[0]!;
    resting.activeAction = activeAction(
      absentState,
      resting,
      "REST",
      null,
      resting.tileIndex,
    );
    expect(
      createRenderSnapshot(absentState, false).creatures.find(
        (creature) => creature.id === resting.id,
      )!.shelterAccess,
    ).toMatchObject({
      shelterId: null,
      eligibility: null,
      destination: "OUTDOOR",
      reason: expect.stringContaining("No active communal shelter"),
    });
  });

  it("coalesces routine rest and upkeep while retaining completion and relocation moments", () => {
    const state = createSimulation(79);
    state.domainEvents = [
      projectedEvent(101, 10, "SHELTER_RESTED", "ROUTINE", 5_000, "Iri rested."),
      projectedEvent(102, 20, "SHELTER_RESTED", "ROUTINE", 5_200, "Nalo rested."),
      projectedEvent(
        103,
        30,
        "SHELTER_MAINTAINED",
        "ROUTINE",
        1,
        "Iri repaired the shelter.",
      ),
      projectedEvent(
        107,
        25,
        "SHELTER_RESTED",
        "ROUTINE",
        5_100,
        "Seli rested elsewhere.",
        21,
        2,
        2,
      ),
      projectedEvent(
        104,
        40,
        "SHELTER_MAINTAINED",
        "ROUTINE",
        2,
        "Nalo repaired the shelter.",
      ),
      projectedEvent(
        108,
        45,
        "SHELTER_MAINTAINED",
        "ROUTINE",
        4,
        "Seli repaired another shelter.",
        21,
        2,
        2,
      ),
      projectedEvent(105, 50, "SHELTER_COMPLETED", "SIGNIFICANT", 6, "Home built."),
      projectedEvent(106, 60, "SHELTER_RELOCATED", "CRITICAL", 1_500, "Home moved."),
    ];
    const recent = createRenderSnapshot(state, false).recentEvents;
    expect(recent.filter((event) => event.type === "SHELTER_RESTED")).toEqual([
      expect.objectContaining({
        id: 102,
        actorIds: [1],
        targetIds: [20],
        quantity: 2,
        clusterKey: "presentation:shelter-rest:routine:20",
      }),
      expect.objectContaining({
        id: 107,
        actorIds: [2],
        targetIds: [21],
        quantity: 1,
        clusterKey: "presentation:shelter-rest:routine:21",
      }),
    ]);
    expect(recent.filter((event) => event.type === "SHELTER_MAINTAINED")).toEqual([
      expect.objectContaining({
        id: 104,
        actorIds: [1],
        targetIds: [20],
        quantity: 3,
        clusterKey: "presentation:shelter-maintenance:routine:20",
      }),
      expect.objectContaining({
        id: 108,
        actorIds: [2],
        targetIds: [21],
        quantity: 4,
        clusterKey: "presentation:shelter-maintenance:routine:21",
      }),
    ]);
    expect(recent.map((event) => event.type)).toEqual(
      expect.arrayContaining(["SHELTER_COMPLETED", "SHELTER_RELOCATED"]),
    );
    expect(state.domainEvents[0]!.quantity).toBe(5_000);
    expect(state.domainEvents[0]!.clusterKey).toBe("authoritative:101");
  });

  it("schedules material commands deterministically and retains replay, experiment, response, and causal facts", () => {
    const direct = createSimulation(83);
    const materialNode = direct.resourceNodes.find((node) => node.kind === "MATERIAL")!;
    const before = materialNode.currentStock;
    const added = queuePlayerCommand(direct, {
      type: "ADD_MATERIAL",
      tileIndex: materialNode.tileIndex,
      amount: 5,
      applyAtTick: 0,
    });
    const removed = queuePlayerCommand(direct, {
      type: "REMOVE_MATERIAL",
      tileIndex: materialNode.tileIndex,
      amount: 2,
      applyAtTick: 0,
    });
    expect([added.commandId, removed.commandId]).toEqual([1, 2]);
    const replay = createSimulationReplay(direct.scenario, [added, removed]);
    const replayed = executeSimulationReplay(replay, { finalTick: 1 }).state;
    const repeated = executeSimulationReplay(replay, { finalTick: 1 }).state;
    expect(hashSimulationState(repeated)).toBe(hashSimulationState(replayed));
    expect(
      replayed.resourceNodes.find((node) => node.id === materialNode.id)?.currentStock,
    ).toBe(before + 3);
    expect(
      replayed.domainEvents
        .filter(
          (event) =>
            event.type === "PLAYER_ADDED_MATERIAL" ||
            event.type === "PLAYER_REMOVED_MATERIAL",
        )
        .map((event) => event.type),
    ).toEqual(["PLAYER_ADDED_MATERIAL", "PLAYER_REMOVED_MATERIAL"]);

    const addedEvent = replayed.domainEvents.find(
      (event) => event.type === "PLAYER_ADDED_MATERIAL",
    )!;
    const evidence = createCausalEvidenceProjection(replayed, {
      kind: "event",
      id: addedEvent.id,
    });
    expect(evidence.nodes.find((node) => node.ref.kind === "resource")?.label).toContain(
      "Material",
    );

    let experiment = createExperiment(replayed.scenario);
    experiment = appendExperimentIntervention(
      experiment,
      "baseline",
      createPendingIntervention(added),
    );
    const persisted = deserializeExperiment(serializeExperiment(experiment));
    expect(persisted.branches[0]!.commandLog[0]!.command.type).toBe("ADD_MATERIAL");
    const trace = createInterventionResponseTrace(added, [1, 2]);
    expect(trace.schemaVersion).toBe(INTERVENTION_RESPONSE_SCHEMA_VERSION);
    expect(trace.command.type).toBe("ADD_MATERIAL");
  });

  it("rejects a delayed material addition if a shelter claims its tile before apply", () => {
    const state = createSimulation(89);
    const { group, members } = groupFixture(state, 3);
    const requestedTile = rankShelterSites(state, group)[0]!.tileIndex;
    const scheduled = queuePlayerCommand(state, {
      type: "ADD_MATERIAL",
      tileIndex: requestedTile,
      amount: 4,
      applyAtTick: 2,
    });
    const shelter = addShelter(state, group);
    expect(shelter.tileIndex).toBe(requestedTile);

    advanceSimulation(state, 3);

    expect(
      state.resourceNodes.some(
        (node) => node.kind === "MATERIAL" && node.tileIndex === requestedTile,
      ),
    ).toBe(false);
    const outcome = state.domainEvents.find(
      (event) => event.commandId === scheduled.commandId,
    )!;
    expect(outcome).toMatchObject({
      type: "PLAYER_ADDED_MATERIAL",
      locationTileIndex: requestedTile,
      quantity: 0,
      commandOutcome: "REJECTED",
      commandRejectionReason: "OCCUPIED_TILE",
    });

    const trace = observeInterventionResponse(
      createInterventionResponseTrace(
        scheduled,
        members.map((member) => member.id),
      ),
      {
        tick: state.tick,
        width: state.world.width,
        creatures: [],
        events: [
          {
            id: outcome.id,
            tick: outcome.tick,
            type: outcome.type,
            actorIds: outcome.actorIds,
            targetIds: outcome.targetIds,
            causedByEventIds: outcome.causedByEventIds,
            locationTileIndex: outcome.locationTileIndex ?? undefined,
            commandId: outcome.commandId ?? undefined,
            commandOutcome: outcome.commandOutcome ?? undefined,
            commandRejectionReason: outcome.commandRejectionReason ?? undefined,
          },
        ],
      },
    );
    expect(trace).toMatchObject({
      phase: "CLOSED",
      command: { tileIndex: requestedTile },
      outcome: {
        eventId: outcome.id,
        status: "REJECTED",
        rejectionReason: "OCCUPIED_TILE",
      },
      closureReason: { code: "COMMAND_REJECTED_OCCUPIED_TILE" },
    });
    const causal = createCausalEvidenceProjection(state, {
      kind: "event",
      id: outcome.id,
    });
    expect(causal.focus).toEqual({ kind: "event", id: outcome.id });
    expect(causal.nodes.find((node) => node.ref.kind === "tile")?.ref).toEqual({
      kind: "tile",
      id: requestedTile,
    });
  });
});

function phaseFourState(seed = 97): Record<string, unknown> {
  const legacy = JSON.parse(
    JSON.stringify(createSimulation(createScenarioReference("split-banks", seed))),
  ) as Record<string, unknown>;
  legacy.schemaVersion = 4;
  const scenario = legacy.scenario as Record<string, unknown>;
  scenario.behaviorVersion = 4;
  for (const creature of legacy.creatures as Array<Record<string, unknown>>) {
    const counts = creature.actionCounts as Record<string, unknown>;
    counts.REST = creature.id === 1 ? 3 : 0;
    delete counts.ESTABLISH_SHELTER_SITE;
    delete counts.BUILD_SHELTER;
    delete counts.REST_SHELTERED;
    delete counts.MAINTAIN_SHELTER;
  }
  const metrics = legacy.metrics as Record<string, unknown>;
  delete metrics.sheltersCompleted;
  delete metrics.shelteredRests;
  delete metrics.outdoorRests;
  delete metrics.shelterMaintenanceMaterial;
  delete metrics.shelterDeniedClaims;
  delete metrics.shelterGuestUses;
  delete metrics.shelterRelocations;
  return legacy;
}

describe("version-4 shelter migrations and malformed hybrids", () => {
  it("migrates v4 saves atomically with empty shelter state and a truthful enable event", () => {
    const legacyState = phaseFourState();
    const original = JSON.stringify(legacyState);
    const migrated = migrateSimulationSave({
      kind: "tiny-civilisation/save",
      schemaVersion: 3,
      behaviorVersion: 4,
      stateSchemaVersion: 4,
      state: legacyState,
    }).state;
    expect(JSON.stringify(legacyState)).toBe(original);
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.groups.every((group) => group.activeShelterId === null)).toBe(true);
    expect(
      migrated.structures.every((structure) => structure.kind.startsWith("STORAGE")),
    ).toBe(true);
    expect(migrated.metrics).toMatchObject({
      sheltersCompleted: 0,
      shelteredRests: 0,
      outdoorRests: 3,
      shelterRelocations: 0,
    });
    expect(migrated.domainEvents.at(-1)).toMatchObject({
      type: "SHELTER_RULES_ENABLED",
      tick: migrated.tick,
      resourceKind: null,
      quantity: 0,
    });
    expect(() => assertCompatibleSimulationState(migrated)).not.toThrow();
  });

  it("retains v4 replay commands/horizons and v4 experiment branches while clearing unverifiable facts", () => {
    const scenario = {
      ...createScenarioReference("unequal-table", 101),
      behaviorVersion: 4,
    };
    const command = {
      commandId: 1,
      applyAtTick: 4,
      type: "ADD_FOOD" as const,
      tileIndex: 340,
      amount: 2,
      blocked: null,
    };
    const replay = migrateSimulationReplay({
      kind: "tiny-civilisation/replay",
      schemaVersion: 3,
      behaviorVersion: 4,
      stateSchemaVersion: 4,
      scenario,
      seed: 101,
      commands: [command],
      finalTick: 20,
      finalHash: "0123456789abcdef",
    });
    expect(replay.commands).toEqual([command]);
    expect(replay.finalTick).toBe(20);
    expect(replay.finalHash).toBeUndefined();

    const current = createExperiment(createScenarioReference("unequal-table", 101));
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    legacy.schemaVersion = 4;
    legacy.behaviorVersion = 4;
    legacy.stateSchemaVersion = 4;
    (legacy.scenario as Record<string, unknown>).behaviorVersion = 4;
    const branch = (legacy.branches as Array<Record<string, unknown>>)[0]!;
    branch.targetTick = 20;
    branch.expectedHash = "0123456789abcdef";
    branch.commandLog = [
      {
        command,
        outcome: { status: "APPLIED" },
        responseTrace: { schemaVersion: 2, historical: true },
      },
    ];
    legacy.checkpoints = [
      { id: "old", branchId: "baseline", tick: 20, stateHash: "0".repeat(16) },
    ];
    const experiment = migrateExperiment(legacy);
    expect(experiment.branches[0]).toMatchObject({
      targetTick: 20,
      expectedHash: null,
      commandLog: [{ command, outcome: { status: "PENDING" }, responseTrace: null }],
    });
    expect(experiment.checkpoints).toEqual([]);
  });

  it("rejects version hybrids and Phase-5-only material facts disguised as v4", () => {
    const stateHybrid = phaseFourState(103);
    (stateHybrid.scenario as Record<string, unknown>).behaviorVersion = 5;
    expect(() =>
      migrateSimulationSave({
        kind: "tiny-civilisation/save",
        schemaVersion: 3,
        behaviorVersion: 4,
        stateSchemaVersion: 4,
        state: stateHybrid,
      }),
    ).toThrow("Phase 4 simulation state");

    const scenario = {
      ...createScenarioReference(103),
      behaviorVersion: 4,
    };
    expect(() =>
      migrateSimulationReplay({
        kind: "tiny-civilisation/replay",
        schemaVersion: 3,
        behaviorVersion: 4,
        stateSchemaVersion: 4,
        scenario,
        seed: 103,
        commands: [
          {
            commandId: 1,
            applyAtTick: 0,
            type: "ADD_MATERIAL",
            tileIndex: 10,
            amount: 1,
            blocked: null,
          },
        ],
        finalTick: 1,
      }),
    ).toThrow("not a Phase 4 command");
  });
});

describe("deep shelter union and lifecycle validation", () => {
  function validSettlement(): SimulationState {
    const state = createSimulation(107);
    const { group } = groupFixture(state);
    addShelter(state, group);
    assertCompatibleSimulationState(state);
    return state;
  }

  function expectInvalid(mutate: (state: SimulationState) => void, message: string): void {
    const state = cloned(validSettlement());
    mutate(state);
    expect(() => assertCompatibleSimulationState(state)).toThrow(message);
  }

  function validRelocationCandidate(): SimulationState {
    const state = validSettlement();
    const group = state.groups[0]!;
    state.tick = group.shelterCommitUntilTick;
    const active = state.structures.find(
      (structure): structure is ShelterStructureState =>
        structure.id === group.activeShelterId && structure.kind === "SHELTER",
    )!;
    active.condition = 0;
    active.conditionBand = "LOW";
    const activePoint = tileCoordinates(state.world, active.tileIndex);
    const farTile = state.world.tiles
      .filter(
        (tile) =>
          !tile.blocked &&
          !isProtectedShelterTile(state, tile.index) &&
          !state.resourceNodes.some((node) => node.tileIndex === tile.index) &&
          !state.structures.some((structure) => structure.tileIndex === tile.index),
      )
      .sort((left, right) => {
        const leftDistance =
          Math.abs(left.x - activePoint.x) + Math.abs(left.y - activePoint.y);
        const rightDistance =
          Math.abs(right.x - activePoint.x) + Math.abs(right.y - activePoint.y);
        return rightDistance - leftDistance || left.index - right.index;
      })[0]!;
    const storage = state.structures.find(
      (structure) => structure.id === group.storageStructureId,
    )!;
    storage.tileIndex = farTile.index;
    for (const creature of state.creatures) {
      const member = group.memberIds.includes(creature.id);
      const point = member ? farTile : activePoint;
      creature.tileIndex = member ? farTile.index : active.tileIndex;
      creature.x = point.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
      creature.y = point.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    }
    const candidate = rankShelterSites(state, group, true)[0]!;
    const scoreImprovement =
      assessShelterSite(state, group, active.tileIndex, false).totalScore -
      candidate.assessment.totalScore;
    if (scoreImprovement < SHELTER_RELOCATION_MINIMUM_IMPROVEMENT) {
      throw new Error("Relocation validation fixture lacks a materially better site.");
    }
    group.shelterRelocationCandidate = {
      tileIndex: candidate.tileIndex,
      firstSeenTick: state.tick - 100,
      lastEvaluatedTick: state.tick,
      consecutiveEvaluations: 3,
      scoreImprovement,
    };
    assertCompatibleSimulationState(state);
    return state;
  }

  it("rejects storage/shelter hybrids, bad lifecycle facts, guards, and illegal footprints", () => {
    expectInvalid((state) => {
      const storage = state.structures.find((structure) => structure.kind === "STORAGE")!;
      (storage as unknown as Record<string, unknown>).condition = 10_000;
    }, "is not supported for storage structures");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      shelter.conditionBand = "LOW";
    }, "does not match shelter condition");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      shelter.guardIds = [state.creatures[0]!.id];
    }, "must remain empty for a shelter");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      const endpoint = shelterRestFootprintTiles(state, shelter.tileIndex)[0]!;
      state.world.tiles[endpoint]!.blocked = true;
    }, "does not retain a legal six-place rest footprint");
  });

  it("rejects incomplete persistence, stray shelters, wrong home pointers, and invalid predecessors", () => {
    expectInvalid((state) => {
      const storage = state.structures.find((structure) => structure.kind === "STORAGE")!;
      storage.kind = "STORAGE_SITE";
      storage.completedTick = null;
      storage.material = 0;
      storage.progress = 0;
    }, "completed shared store that made the group persistent");
    expectInvalid((state) => {
      const group = state.groups[0]!;
      group.homeTileIndex = state.creatures[7]!.tileIndex;
    }, "must equal the active shelter tile");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      state.structures.push({ ...shelter, id: state.nextEntityId++ });
    }, "at most one active shelter");
    expectInvalid((state) => {
      const group = state.groups[0]!;
      const active = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      state.tick = group.shelterCommitUntilTick;
      const site = addShelter(state, group, "SHELTER_SITE");
      site.builtFromShelterId = state.structures.find(
        (structure) => structure.kind === "STORAGE",
      )!.id;
      group.activeShelterId = active.id;
    }, "must identify the active shelter it will replace");
  });

  it("rejects untruthful commitment, relocation candidate, and frozen assessment facts", () => {
    expectInvalid((state) => {
      state.groups[0]!.shelterCommitUntilTick = 0;
    }, "must preserve the active shelter's minimum commitment period");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      shelter.siteAssessment.totalScore += 1;
    }, "must equal the frozen weighted shelter-site score");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      shelter.siteAssessment.constructionInvestmentCost = 1;
      shelter.siteAssessment.totalScore += 1;
    }, "must not include relocation costs for a first shelter");
    expectInvalid((state) => {
      const shelter = state.structures.find(
        (structure) => structure.kind === "SHELTER",
      ) as ShelterStructureState;
      state.tick = 1;
      shelter.siteAssessment.selectedAtTick = 1;
    }, "cannot be later than shelter completion");

    const replacement = validSettlement();
    const replacementGroup = replacement.groups[0]!;
    replacement.tick = replacementGroup.shelterCommitUntilTick;
    const site = addShelter(replacement, replacementGroup, "SHELTER_SITE");
    site.siteAssessment.relocationChangeCost = 0;
    site.siteAssessment.totalScore -= 1_600;
    expect(() => assertCompatibleSimulationState(replacement)).toThrow(
      "must include the bounded replacement-shelter investment and change costs",
    );

    for (const mutate of [
      (state: SimulationState) => {
        state.groups[0]!.shelterRelocationCandidate!.lastEvaluatedTick = state.tick + 1;
      },
      (state: SimulationState) => {
        state.groups[0]!.shelterRelocationCandidate!.firstSeenTick = state.tick + 1;
      },
    ]) {
      const state = validRelocationCandidate();
      mutate(state);
      expect(() => assertCompatibleSimulationState(state)).toThrow(
        "must contain ordered, current evaluation ticks",
      );
    }
    const tooMany = validRelocationCandidate();
    tooMany.groups[0]!.shelterRelocationCandidate!.firstSeenTick = tooMany.tick - 50;
    expect(() => assertCompatibleSimulationState(tooMany)).toThrow(
      "must exactly match the elapsed shelter evaluations",
    );
    const skipped = validRelocationCandidate();
    skipped.groups[0]!.shelterRelocationCandidate!.firstSeenTick = skipped.tick - 150;
    expect(() => assertCompatibleSimulationState(skipped)).toThrow(
      "must exactly match the elapsed shelter evaluations",
    );
    const offCadence = validRelocationCandidate();
    offCadence.tick += 1;
    offCadence.groups[0]!.shelterRelocationCandidate!.firstSeenTick += 1;
    offCadence.groups[0]!.shelterRelocationCandidate!.lastEvaluatedTick += 1;
    expect(() => assertCompatibleSimulationState(offCadence)).toThrow(
      "must use the deterministic 50-tick shelter evaluation cadence",
    );
    const weak = validRelocationCandidate();
    weak.groups[0]!.shelterRelocationCandidate!.scoreImprovement =
      SHELTER_RELOCATION_MINIMUM_IMPROVEMENT - 1;
    expect(() => assertCompatibleSimulationState(weak)).toThrow("must be at least 1200");
    const exaggerated = validRelocationCandidate();
    exaggerated.groups[0]!.shelterRelocationCandidate!.scoreImprovement += 1;
    expect(() => assertCompatibleSimulationState(exaggerated)).toThrow(
      "must match the current deterministic best site and factual score improvement",
    );
    const nonBest = validRelocationCandidate();
    const nonBestGroup = nonBest.groups[0]!;
    const secondBest = rankShelterSites(nonBest, nonBestGroup, true)[1]!;
    nonBestGroup.shelterRelocationCandidate!.tileIndex = secondBest.tileIndex;
    expect(() => assertCompatibleSimulationState(nonBest)).toThrow(
      "must match the current deterministic best site and factual score improvement",
    );
    const illegal = validRelocationCandidate();
    illegal.groups[0]!.shelterRelocationCandidate!.tileIndex = illegal.world.tiles.find(
      (tile) => tile.blocked,
    )!.index;
    expect(() => assertCompatibleSimulationState(illegal)).toThrow(
      "must remain a legal, reachable candidate",
    );
  });
});
