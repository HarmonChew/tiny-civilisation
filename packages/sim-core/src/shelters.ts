import { emitDomainEvent } from "./events.js";
import { isWalkableTile } from "./navigation.js";
import {
  tileCoordinates,
  tileIndexAt,
  UNREACHABLE_TRAVEL_COST,
  weightedTravelCostsFrom,
  weightedTravelCostsToNearest,
} from "./pathfinding.js";
import { relationshipFrom } from "./social.js";
import type {
  CreatureState,
  GroupState,
  ShelterConditionBand,
  ShelterEligibility,
  ShelterSiteAssessment,
  ShelterStructureState,
  SimulationState,
} from "./types.js";

export const SHELTER_BASE_CAPACITY = 6;
export const SHELTER_MINIMUM_CAPACITY = 2;
export const SHELTER_MATERIAL_REQUIRED = 18;
export const SHELTER_WORK_REQUIRED = 10_000;
export const SHELTER_MAINTENANCE_THRESHOLD = 6_500;
export const SHELTER_LOW_CONDITION_THRESHOLD = 3_500;
export const SHELTER_REST_RECOVERY_BASE = 6_400;
export const OUTDOOR_REST_RECOVERY = 4_200;
export const SHELTER_MINIMUM_COMMITMENT_TICKS = 1_500;
export const SHELTER_RELOCATION_REQUIRED_EVALUATIONS = 3;
export const SHELTER_RELOCATION_MINIMUM_IMPROVEMENT = 1_200;
export const SHELTER_RELOCATION_CHANGE_COST = 1_600;
export const SHELTER_GUEST_TRUST_THRESHOLD = 2_500;

/** The six stable interaction places promised by a completed shelter. */
export const SHELTER_REST_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
] as const;

export function shelterRestFootprintTiles(
  state: Pick<SimulationState, "world">,
  shelterTileIndex: number,
): number[] {
  const center = tileCoordinates(state.world, shelterTileIndex);
  return SHELTER_REST_OFFSETS.map(([offsetX, offsetY]) =>
    tileIndexAt(state.world, center.x + offsetX, center.y + offsetY),
  );
}

/**
 * Active and provisional homes reserve both their centre and all six usable
 * rest places. Abandoned shelters remain inspectable scenery, but no longer
 * reserve interaction space for settlement decisions.
 */
export function isProtectedShelterTile(
  state: Pick<SimulationState, "structures" | "world">,
  tileIndex: number,
): boolean {
  return state.structures.some(
    (structure) =>
      isShelterStructure(structure) &&
      structure.kind !== "ABANDONED_SHELTER" &&
      (structure.tileIndex === tileIndex ||
        shelterRestFootprintTiles(state, structure.tileIndex).includes(tileIndex)),
  );
}

/**
 * Finds the nearest deterministic tile on which a new ordinary structure can
 * be established without consuming a resource, another structure, or a live
 * shelter place.
 */
export function nearestLegalStructurePlacementTile(
  state: SimulationState,
  requestedTileIndex: number,
): number | null {
  const origin = tileCoordinates(state.world, requestedTileIndex);
  return (
    state.world.tiles
      .filter(
        (tile) =>
          isWalkableTile(state, tile.index) &&
          !state.resourceNodes.some((node) => node.tileIndex === tile.index) &&
          !state.structures.some((structure) => structure.tileIndex === tile.index) &&
          !isProtectedShelterTile(state, tile.index),
      )
      .sort(
        (left, right) =>
          Math.abs(left.x - origin.x) +
            Math.abs(left.y - origin.y) -
            (Math.abs(right.x - origin.x) + Math.abs(right.y - origin.y)) ||
          left.index - right.index,
      )[0]?.index ?? null
  );
}

const SITE_LIMIT = 32;
const SHELTER_CONSTRUCTION_ENDPOINTS = 5;
const MAX_CACHED_SHELTER_TARGET_SETS = 64;
const shelterTargetCostCache = new WeakMap<
  SimulationState["world"],
  { navigationRevision: number; byTargets: Map<string, Int32Array> }
>();
const SITE_OFFSETS = [
  [0, 0],
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
  [4, 0],
  [-4, 0],
  [0, 4],
  [0, -4],
] as const;

function cachedShelterTargetCosts(
  state: Pick<SimulationState, "world">,
  targetTileIndices: readonly number[],
): Int32Array {
  let cache = shelterTargetCostCache.get(state.world);
  if (!cache || cache.navigationRevision !== state.world.navigationRevision) {
    cache = {
      navigationRevision: state.world.navigationRevision,
      byTargets: new Map<string, Int32Array>(),
    };
    shelterTargetCostCache.set(state.world, cache);
  }
  const orderedTargets = [...new Set(targetTileIndices)].sort(
    (left, right) => left - right,
  );
  const key = orderedTargets.join(",");
  const retained = cache.byTargets.get(key);
  if (retained) return retained;
  const costs = weightedTravelCostsToNearest(state.world, orderedTargets);
  if (cache.byTargets.size >= MAX_CACHED_SHELTER_TARGET_SETS) {
    const oldest = cache.byTargets.keys().next().value as string | undefined;
    if (oldest !== undefined) cache.byTargets.delete(oldest);
  }
  cache.byTargets.set(key, costs);
  return costs;
}

function topologicallyReachableTiles(
  state: Pick<SimulationState, "world">,
  startTileIndex: number,
): Uint8Array {
  const reachable = new Uint8Array(state.world.tiles.length);
  if (startTileIndex < 0 || state.world.tiles[startTileIndex]?.blocked) return reachable;
  const queue = new Int32Array(state.world.tiles.length);
  let readIndex = 0;
  let writeIndex = 1;
  queue[0] = startTileIndex;
  reachable[startTileIndex] = 1;
  while (readIndex < writeIndex) {
    const tileIndex = queue[readIndex++]!;
    const point = tileCoordinates(state.world, tileIndex);
    for (const neighbor of [
      tileIndexAt(state.world, point.x, point.y - 1),
      tileIndexAt(state.world, point.x - 1, point.y),
      tileIndexAt(state.world, point.x + 1, point.y),
      tileIndexAt(state.world, point.x, point.y + 1),
    ]) {
      if (
        neighbor < 0 ||
        reachable[neighbor] === 1 ||
        state.world.tiles[neighbor]?.blocked
      ) {
        continue;
      }
      reachable[neighbor] = 1;
      queue[writeIndex++] = neighbor;
    }
  }
  return reachable;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function isShelterStructure(
  structure: SimulationState["structures"][number] | null | undefined,
): structure is ShelterStructureState {
  return (
    structure?.kind === "SHELTER_SITE" ||
    structure?.kind === "SHELTER" ||
    structure?.kind === "ABANDONED_SHELTER"
  );
}

export function shelterConditionBand(condition: number): ShelterConditionBand {
  if (condition < SHELTER_LOW_CONDITION_THRESHOLD) return "LOW";
  if (condition < SHELTER_MAINTENANCE_THRESHOLD) return "WORN";
  return "GOOD";
}

/** Condition reduces capacity but a standing shelter always retains two places. */
export function effectiveShelterCapacity(
  shelter: Pick<ShelterStructureState, "condition" | "baseCapacity">,
): number {
  const condition = clamp(shelter.condition, 0, 10_000);
  const scaled = Math.floor(
    (shelter.baseCapacity * (3_500 + (condition * 6_500) / 10_000)) / 10_000,
  );
  return clamp(scaled, SHELTER_MINIMUM_CAPACITY, shelter.baseCapacity);
}

/** Rest benefit is 75-100% of full recovery, meaningfully above outdoor rest. */
export function shelteredRestRecovery(condition: number): number {
  const bounded = clamp(condition, 0, 10_000);
  return Math.round(SHELTER_REST_RECOVERY_BASE * (0.75 + (0.25 * bounded) / 10_000));
}

export function activeShelterForGroup(
  state: SimulationState,
  group: GroupState | null | undefined,
): ShelterStructureState | null {
  if (!group || group.activeShelterId === null) return null;
  const shelter = state.structures.find((item) => item.id === group.activeShelterId);
  return isShelterStructure(shelter) && shelter.kind === "SHELTER" ? shelter : null;
}

export function pendingShelterForGroup(
  state: SimulationState,
  group: GroupState | null | undefined,
): ShelterStructureState | null {
  if (!group || group.pendingShelterId === null) return null;
  const shelter = state.structures.find((item) => item.id === group.pendingShelterId);
  return isShelterStructure(shelter) && shelter.kind === "SHELTER_SITE" ? shelter : null;
}

/** Outdoor fallback stays local once a group's home is the shelter itself. */
export function outdoorRestAnchorTile(
  state: SimulationState,
  creature: CreatureState,
): number {
  const group = state.groups.find((candidate) => candidate.id === creature.groupId);
  return activeShelterForGroup(state, group)
    ? creature.tileIndex
    : (group?.homeTileIndex ?? creature.tileIndex);
}

export function shelterEligibility(
  state: SimulationState,
  creature: CreatureState,
  shelter: ShelterStructureState,
): ShelterEligibility {
  if (creature.groupId === shelter.groupId) return "MEMBER";
  const owner = state.groups.find((group) => group.id === shelter.groupId);
  const trusted = (owner?.memberIds ?? []).some((memberId) => {
    const member = state.creatures.find(
      (candidate) => candidate.id === memberId && candidate.alive,
    );
    return (
      member !== undefined &&
      (relationshipFrom(state, member.id, creature.id)?.trust ?? 0) >=
        SHELTER_GUEST_TRUST_THRESHOLD
    );
  });
  return trusted ? "TRUSTED_GUEST" : "INELIGIBLE";
}

export interface ShelterOccupancy {
  readonly reserved: number;
  readonly resting: number;
  /** Members physically resting now, excluding reservations still in transit. */
  readonly members: number;
  /** Guests physically resting now, excluding reservations still in transit. */
  readonly guests: number;
}

export function shelterOccupancy(
  state: SimulationState,
  shelterId: number,
): ShelterOccupancy {
  let reserved = 0;
  let resting = 0;
  let members = 0;
  let guests = 0;
  for (const creature of state.creatures) {
    const action = creature.activeAction;
    const claim = action?.interactionClaim;
    if (
      !creature.alive ||
      action?.kind !== "REST_SHELTERED" ||
      claim?.anchorKind !== "STRUCTURE" ||
      claim.anchorId !== shelterId
    ) {
      continue;
    }
    reserved += 1;
    if (action.phase === "WORKING") {
      resting += 1;
      const shelter = state.structures.find((item) => item.id === shelterId);
      if (shelter && creature.groupId === shelter.groupId) members += 1;
      else guests += 1;
    }
  }
  return { reserved, resting, members, guests };
}

function livingMembers(state: SimulationState, group: GroupState): CreatureState[] {
  return group.memberIds
    .map((id) => state.creatures.find((creature) => creature.id === id))
    .filter((creature): creature is CreatureState => creature?.alive === true)
    .sort((left, right) => left.id - right.id);
}

function nearestCost(
  costs: Int32Array,
  state: SimulationState,
  kind: "FOOD" | "MATERIAL" | "WATER",
): number {
  const available = state.resourceNodes
    .filter((node) => node.kind === kind && node.currentStock > 0)
    .map((node) => costs[node.tileIndex] ?? UNREACHABLE_TRAVEL_COST)
    .filter((cost) => cost < UNREACHABLE_TRAVEL_COST);
  return available.length === 0 ? 50_000 : Math.min(...available);
}

export function isLegalShelterSite(
  state: SimulationState,
  tileIndex: number,
  ignoredStructureId: number | null = null,
): boolean {
  if (!isWalkableTile(state, tileIndex)) return false;
  if (state.resourceNodes.some((node) => node.tileIndex === tileIndex)) return false;
  if (
    state.structures.some(
      (structure) =>
        structure.id !== ignoredStructureId && structure.tileIndex === tileIndex,
    )
  ) {
    return false;
  }
  const point = tileCoordinates(state.world, tileIndex);
  for (const [offsetX, offsetY] of SHELTER_REST_OFFSETS) {
    const neighbor = tileIndexAt(state.world, point.x + offsetX, point.y + offsetY);
    if (neighbor < 0 || !isWalkableTile(state, neighbor)) return false;
    if (state.resourceNodes.some((node) => node.tileIndex === neighbor)) return false;
    if (
      state.structures.some(
        (structure) =>
          structure.id !== ignoredStructureId && structure.tileIndex === neighbor,
      )
    ) {
      return false;
    }
  }
  const candidateEndpoints = new Set(shelterRestFootprintTiles(state, tileIndex));
  for (const structure of state.structures) {
    if (structure.id === ignoredStructureId) continue;
    if (!isShelterStructure(structure)) continue;
    for (const endpoint of shelterRestFootprintTiles(state, structure.tileIndex)) {
      if (candidateEndpoints.has(endpoint)) return false;
    }
  }
  return true;
}

function memberCentroidTile(
  state: SimulationState,
  group: GroupState,
  members: readonly CreatureState[],
): number {
  if (members.length === 0) return group.homeTileIndex;
  const sum = members.reduce(
    (total, member) => {
      const point = tileCoordinates(state.world, member.tileIndex);
      return { x: total.x + point.x, y: total.y + point.y };
    },
    { x: 0, y: 0 },
  );
  return tileIndexAt(
    state.world,
    Math.round(sum.x / members.length),
    Math.round(sum.y / members.length),
  );
}

function candidateAnchors(
  state: SimulationState,
  group: GroupState,
  members: readonly CreatureState[],
): number[] {
  const anchors = [memberCentroidTile(state, group, members), group.homeTileIndex];
  const storage = state.structures.find((item) => item.id === group.storageStructureId);
  if (storage) anchors.push(storage.tileIndex);
  const centroid = tileCoordinates(state.world, anchors[0] ?? group.homeTileIndex);
  for (const kind of ["FOOD", "MATERIAL", "WATER"] as const) {
    const nearest = state.resourceNodes
      .filter((node) => node.kind === kind && node.currentStock > 0)
      .sort((left, right) => {
        const leftPoint = tileCoordinates(state.world, left.tileIndex);
        const rightPoint = tileCoordinates(state.world, right.tileIndex);
        const leftDistance =
          Math.abs(leftPoint.x - centroid.x) + Math.abs(leftPoint.y - centroid.y);
        const rightDistance =
          Math.abs(rightPoint.x - centroid.x) + Math.abs(rightPoint.y - centroid.y);
        return leftDistance - rightDistance || left.id - right.id;
      })[0];
    if (nearest) anchors.push(nearest.tileIndex);
  }
  return [...new Set(anchors)].sort((left, right) => left - right);
}

export function assessShelterSite(
  state: SimulationState,
  group: GroupState,
  tileIndex: number,
  relocation: boolean,
): ShelterSiteAssessment {
  const members = livingMembers(state, group);
  const costs = weightedTravelCostsFrom(state.world, tileIndex);
  const memberTravelCost =
    members.length === 0
      ? 0
      : Math.round(
          members.reduce(
            (total, member) => total + Math.min(50_000, costs[member.tileIndex] ?? 50_000),
            0,
          ) / members.length,
        );
  const storage = state.structures.find((item) => item.id === group.storageStructureId);
  const storageTravelCost = storage
    ? Math.min(50_000, costs[storage.tileIndex] ?? 50_000)
    : 8_000;
  const foodAccessCost = nearestCost(costs, state, "FOOD");
  const materialAccessCost = nearestCost(costs, state, "MATERIAL");
  const waterAccessCost = nearestCost(costs, state, "WATER");
  const point = tileCoordinates(state.world, tileIndex);
  const crowdingCost =
    state.creatures.filter((creature) => {
      if (!creature.alive || group.memberIds.includes(creature.id)) return false;
      const other = tileCoordinates(state.world, creature.tileIndex);
      return Math.abs(point.x - other.x) + Math.abs(point.y - other.y) <= 2;
    }).length * 350;
  const active = activeShelterForGroup(state, group);
  // Freeze a whole-number rationale even when condition is not divisible by
  // five so saves and visible site explanations share the same exact fact.
  const constructionInvestmentCost =
    relocation && active ? Math.round(active.condition / 5) : 0;
  const relocationChangeCost = relocation && active ? SHELTER_RELOCATION_CHANGE_COST : 0;
  return {
    selectedAtTick: state.tick,
    memberTravelCost,
    storageTravelCost,
    foodAccessCost,
    materialAccessCost,
    waterAccessCost,
    crowdingCost,
    constructionInvestmentCost,
    relocationChangeCost,
    totalScore: Math.round(
      memberTravelCost * 3 +
        storageTravelCost * 2 +
        foodAccessCost +
        materialAccessCost * 2 +
        waterAccessCost * 2 +
        crowdingCost +
        constructionInvestmentCost +
        relocationChangeCost,
    ),
  };
}

export interface RankedShelterSite {
  readonly tileIndex: number;
  readonly assessment: ShelterSiteAssessment;
}

function resourceAccessCostAt(costs: Int32Array | undefined, tileIndex: number): number {
  const cost = costs?.[tileIndex] ?? UNREACHABLE_TRAVEL_COST;
  return cost < UNREACHABLE_TRAVEL_COST ? cost : 50_000;
}

function assessShelterSites(
  state: SimulationState,
  group: GroupState,
  tileIndices: readonly number[],
  members: readonly CreatureState[],
  relocation: boolean,
): RankedShelterSite[] {
  const memberCostSums = new Int32Array(tileIndices.length);
  for (const member of members) {
    const costs = cachedShelterTargetCosts(state, [member.tileIndex]);
    for (let index = 0; index < tileIndices.length; index += 1) {
      memberCostSums[index] =
        memberCostSums[index]! +
        Math.min(50_000, costs[tileIndices[index]!] ?? UNREACHABLE_TRAVEL_COST);
    }
  }

  const storage = state.structures.find((item) => item.id === group.storageStructureId);
  const storageCosts = storage
    ? cachedShelterTargetCosts(state, [storage.tileIndex])
    : null;
  const resourceCosts = new Map<"FOOD" | "MATERIAL" | "WATER", Int32Array>();
  for (const kind of ["FOOD", "MATERIAL", "WATER"] as const) {
    resourceCosts.set(
      kind,
      cachedShelterTargetCosts(
        state,
        state.resourceNodes
          .filter((node) => node.kind === kind && node.currentStock > 0)
          .map((node) => node.tileIndex),
      ),
    );
  }
  const active = activeShelterForGroup(state, group);
  const constructionInvestmentCost =
    relocation && active ? Math.round(active.condition / 5) : 0;
  const relocationChangeCost = relocation && active ? SHELTER_RELOCATION_CHANGE_COST : 0;

  return tileIndices.map((tileIndex, index) => {
    const memberTravelCost =
      members.length === 0 ? 0 : Math.round(memberCostSums[index]! / members.length);
    const storageTravelCost = storageCosts
      ? Math.min(50_000, storageCosts[tileIndex] ?? UNREACHABLE_TRAVEL_COST)
      : 8_000;
    const foodAccessCost = resourceAccessCostAt(resourceCosts.get("FOOD"), tileIndex);
    const materialAccessCost = resourceAccessCostAt(
      resourceCosts.get("MATERIAL"),
      tileIndex,
    );
    const waterAccessCost = resourceAccessCostAt(resourceCosts.get("WATER"), tileIndex);
    const point = tileCoordinates(state.world, tileIndex);
    const crowdingCost =
      state.creatures.filter((creature) => {
        if (!creature.alive || group.memberIds.includes(creature.id)) return false;
        const other = tileCoordinates(state.world, creature.tileIndex);
        return Math.abs(point.x - other.x) + Math.abs(point.y - other.y) <= 2;
      }).length * 350;
    return {
      tileIndex,
      assessment: {
        selectedAtTick: state.tick,
        memberTravelCost,
        storageTravelCost,
        foodAccessCost,
        materialAccessCost,
        waterAccessCost,
        crowdingCost,
        constructionInvestmentCost,
        relocationChangeCost,
        totalScore: Math.round(
          memberTravelCost * 3 +
            storageTravelCost * 2 +
            foodAccessCost +
            materialAccessCost * 2 +
            waterAccessCost * 2 +
            crowdingCost +
            constructionInvestmentCost +
            relocationChangeCost,
        ),
      },
    };
  });
}

/** Bounded, deterministic, scenario-agnostic shelter-site ranking. */
export function rankShelterSites(
  state: SimulationState,
  group: GroupState,
  relocation = false,
): RankedShelterSite[] {
  const members = livingMembers(state, group);
  const leader = members.find((member) => member.id === group.leaderId);
  if (!leader) return [];
  const leaderReachability = topologicallyReachableTiles(state, leader.tileIndex);
  const tiles = new Set<number>();
  for (const anchorIndex of candidateAnchors(state, group, members)) {
    const anchor = tileCoordinates(state.world, anchorIndex);
    for (const [offsetX, offsetY] of SITE_OFFSETS) {
      const tile = tileIndexAt(state.world, anchor.x + offsetX, anchor.y + offsetY);
      if (
        tile >= 0 &&
        isLegalShelterSite(state, tile) &&
        shelterRestFootprintTiles(state, tile)
          .slice(0, SHELTER_CONSTRUCTION_ENDPOINTS)
          .some((endpoint) => leaderReachability[endpoint] === 1)
      ) {
        tiles.add(tile);
      }
    }
  }
  return assessShelterSites(
    state,
    group,
    [...tiles].sort((left, right) => left - right).slice(0, SITE_LIMIT),
    members,
    relocation,
  ).sort(
    (left, right) =>
      left.assessment.totalScore - right.assessment.totalScore ||
      left.tileIndex - right.tileIndex,
  );
}

export function updateShelters(state: SimulationState): void {
  if (state.tick % 50 !== 0) return;
  for (const shelter of state.structures) {
    if (!isShelterStructure(shelter) || shelter.kind !== "SHELTER") continue;
    const occupancy = shelterOccupancy(state, shelter.id);
    shelter.condition = clamp(shelter.condition - 18 - occupancy.reserved * 12, 0, 10_000);
    const nextBand = shelterConditionBand(shelter.condition);
    if (nextBand !== shelter.conditionBand) {
      if (nextBand === "LOW") {
        emitDomainEvent(state, {
          type: "SHELTER_CONDITION_LOW",
          targetIds: [shelter.id],
          groupIds: [shelter.groupId],
          locationTileIndex: shelter.tileIndex,
          quantity: shelter.condition,
          importance: 52,
          summary: `A communal shelter fell into low condition, reducing its recovery and usable places.`,
        });
      } else if (shelter.conditionBand === "LOW") {
        emitDomainEvent(state, {
          type: "SHELTER_CONDITION_RECOVERED",
          targetIds: [shelter.id],
          groupIds: [shelter.groupId],
          locationTileIndex: shelter.tileIndex,
          quantity: shelter.condition,
          importance: 34,
          summary: `Maintenance lifted a communal shelter out of low condition.`,
        });
      }
      shelter.conditionBand = nextBand;
    }
  }

  for (const group of state.groups) {
    const active = activeShelterForGroup(state, group);
    if (
      !active ||
      group.pendingShelterId !== null ||
      group.shelterRelocations >= 1 ||
      state.tick < group.shelterCommitUntilTick
    ) {
      group.shelterRelocationCandidate = null;
      continue;
    }
    const current = assessShelterSite(state, group, active.tileIndex, false);
    const alternative = rankShelterSites(state, group, true).find(
      (candidate) => candidate.tileIndex !== active.tileIndex,
    );
    if (!alternative) {
      group.shelterRelocationCandidate = null;
      continue;
    }
    const improvement = current.totalScore - alternative.assessment.totalScore;
    if (improvement < SHELTER_RELOCATION_MINIMUM_IMPROVEMENT) {
      group.shelterRelocationCandidate = null;
      continue;
    }
    const retained = group.shelterRelocationCandidate;
    group.shelterRelocationCandidate = {
      tileIndex: alternative.tileIndex,
      firstSeenTick:
        retained?.tileIndex === alternative.tileIndex ? retained.firstSeenTick : state.tick,
      lastEvaluatedTick: state.tick,
      consecutiveEvaluations:
        retained?.tileIndex === alternative.tileIndex
          ? retained.consecutiveEvaluations + 1
          : 1,
      scoreImprovement: improvement,
    };
  }
}
