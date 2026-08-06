import { isWalkableTile } from "./navigation.js";
import { emitDomainEvent } from "./events.js";
import {
  findWeightedPath,
  tileCoordinates,
  tileIndexAt,
  UNREACHABLE_TRAVEL_COST,
  weightedTravelCostsFrom,
} from "./pathfinding.js";
import { recordPlanTransition } from "./plans.js";
import {
  effectiveShelterCapacity,
  isShelterStructure,
  SHELTER_REST_OFFSETS,
  shelterEligibility,
} from "./shelters.js";
import {
  TILE_FIXED_UNITS,
  type ActionKind,
  type ActiveAction,
  type CreatureState,
  type InteractionClaim,
  type InteractionPurpose,
  type SimulationState,
} from "./types.js";

const OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const;

const MAX_CACHED_TRAVEL_ORIGINS = 96;
const MAX_CACHED_CANONICAL_TOPOLOGIES = 8;
const MAX_CACHED_CANONICAL_ORIGINS_PER_TOPOLOGY = 1_024;
const travelCostCache = new WeakMap<
  SimulationState["world"],
  { navigationRevision: number; byOrigin: Map<number, Int32Array> }
>();
const canonicalTravelCostCache = new Map<string, Map<string, Map<number, Int32Array>>>();
const canonicalTravelTopologyFifo: Array<{
  compiledMapHash: string;
  topologyIdentity: string;
}> = [];
const travelTopologyIdentities = new WeakMap<
  SimulationState["world"],
  { navigationRevision: number; identity: string }
>();

function travelTopologyIdentity(state: SimulationState): string {
  const retained = travelTopologyIdentities.get(state.world);
  if (retained?.navigationRevision === state.world.navigationRevision) {
    return retained.identity;
  }
  const identity = `${state.world.width}x${state.world.height}:${state.world.tiles
    .map((tile) => `${tile.blocked ? 1 : 0}:${tile.walkCost}`)
    .join(",")}`;
  travelTopologyIdentities.set(state.world, {
    navigationRevision: state.world.navigationRevision,
    identity,
  });
  return identity;
}

function canonicalOriginCache(
  compiledMapHash: string,
  topologyIdentity: string,
): Map<number, Int32Array> {
  const retained = canonicalTravelCostCache.get(compiledMapHash)?.get(topologyIdentity);
  if (retained) return retained;

  if (canonicalTravelTopologyFifo.length >= MAX_CACHED_CANONICAL_TOPOLOGIES) {
    const oldest = canonicalTravelTopologyFifo.shift()!;
    const oldestTopologies = canonicalTravelCostCache.get(oldest.compiledMapHash);
    oldestTopologies?.delete(oldest.topologyIdentity);
    if (oldestTopologies?.size === 0) {
      canonicalTravelCostCache.delete(oldest.compiledMapHash);
    }
  }

  let byTopology = canonicalTravelCostCache.get(compiledMapHash);
  if (!byTopology) {
    byTopology = new Map<string, Map<number, Int32Array>>();
    canonicalTravelCostCache.set(compiledMapHash, byTopology);
  }
  const created = new Map<number, Int32Array>();
  byTopology.set(topologyIdentity, created);
  canonicalTravelTopologyFifo.push({ compiledMapHash, topologyIdentity });
  return created;
}

function cachedTravelCosts(state: SimulationState, origin: number): Int32Array {
  if (state.world.navigationRevision === 0) {
    const topologyIdentity = travelTopologyIdentity(state);
    const shared = canonicalOriginCache(state.compiledMapHash, topologyIdentity);
    const retained = shared.get(origin);
    if (retained) return retained;
    const costs = weightedTravelCostsFrom(state.world, origin);
    if (shared.size >= MAX_CACHED_CANONICAL_ORIGINS_PER_TOPOLOGY) {
      const oldest = shared.keys().next().value as number | undefined;
      if (oldest !== undefined) shared.delete(oldest);
    }
    shared.set(origin, costs);
    return costs;
  }
  let cache = travelCostCache.get(state.world);
  if (!cache || cache.navigationRevision !== state.world.navigationRevision) {
    cache = {
      navigationRevision: state.world.navigationRevision,
      byOrigin: new Map<number, Int32Array>(),
    };
    travelCostCache.set(state.world, cache);
  }
  const retained = cache.byOrigin.get(origin);
  if (retained) return retained;
  const costs = weightedTravelCostsFrom(state.world, origin);
  if (cache.byOrigin.size >= MAX_CACHED_TRAVEL_ORIGINS) {
    const oldest = cache.byOrigin.keys().next().value as number | undefined;
    if (oldest !== undefined) cache.byOrigin.delete(oldest);
  }
  cache.byOrigin.set(origin, costs);
  return costs;
}

const PURPOSE_BY_ACTION: Record<ActionKind, InteractionPurpose> = {
  EXPLORE: "EXPLORE",
  GATHER_FOOD: "GATHER",
  GATHER_MATERIAL: "GATHER",
  GATHER_WATER: "GATHER",
  EAT: "REST",
  DRINK: "REST",
  REST: "REST",
  ESTABLISH_SHELTER_SITE: "CONSTRUCTION",
  BUILD_SHELTER: "CONSTRUCTION",
  REST_SHELTERED: "REST",
  MAINTAIN_SHELTER: "MAINTENANCE",
  SHARE: "SOCIAL",
  SHARE_WATER: "SOCIAL",
  KEEP: "REST",
  STEAL: "STORAGE_ACCESS",
  DEPOSIT: "STORAGE_ACCESS",
  WITHDRAW: "STORAGE_ACCESS",
  BUILD_STORAGE: "CONSTRUCTION",
  GUARD: "GUARD",
  ATTACK: "CONFLICT",
  FLEE: "FLIGHT",
  JOIN_GROUP: "SOCIAL",
};

export function interactionPurpose(action: ActionKind): InteractionPurpose {
  return PURPOSE_BY_ACTION[action];
}

export function interactionCapacity(action: ActionKind): number {
  switch (action) {
    case "GATHER_FOOD":
    case "GATHER_MATERIAL":
      return 6;
    case "GATHER_WATER":
      return 3;
    case "BUILD_STORAGE":
    case "ESTABLISH_SHELTER_SITE":
    case "BUILD_SHELTER":
      return 5;
    case "DEPOSIT":
    case "WITHDRAW":
    case "STEAL":
      return 4;
    case "GUARD":
      return 4;
    case "REST":
    case "REST_SHELTERED":
    case "JOIN_GROUP":
      return 6;
    case "MAINTAIN_SHELTER":
      return 3;
    case "SHARE":
    case "SHARE_WATER":
    case "ATTACK":
      return 2;
    default:
      return 1;
  }
}

export function requiresInteractionClaim(action: ActionKind): boolean {
  return (
    action !== "EXPLORE" && action !== "EAT" && action !== "DRINK" && action !== "FLEE"
  );
}

/**
 * Proves that a sheltered-rest reservation names the exact authoritative
 * shelter place represented by its slot. A WORKING action must also be
 * physically standing at that place; merely naming a slot is only a
 * reservation while the creature is moving.
 */
export function isCanonicalShelteredRestClaim(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (action.kind !== "REST_SHELTERED" || action.targetEntityId === null) return false;
  const shelter = state.structures.find(
    (structure) => structure.id === action.targetEntityId,
  );
  if (
    !isShelterStructure(shelter) ||
    shelter.kind !== "SHELTER" ||
    shelterEligibility(state, creature, shelter) === "INELIGIBLE"
  ) {
    return false;
  }
  const claim = action.interactionClaim;
  if (
    claim === null ||
    claim.anchorKind !== "STRUCTURE" ||
    claim.anchorId !== shelter.id ||
    claim.purpose !== "REST" ||
    claim.slotIndex < 0 ||
    claim.slotIndex >= effectiveShelterCapacity(shelter) ||
    claim.claimedAtTick > state.tick
  ) {
    return false;
  }
  const offset = SHELTER_REST_OFFSETS[claim.slotIndex];
  if (!offset) return false;
  const center = tileCoordinates(state.world, shelter.tileIndex);
  const expectedTileIndex = tileIndexAt(
    state.world,
    center.x + offset[0],
    center.y + offset[1],
  );
  const expectedTargetX = (center.x + offset[0]) * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
  const expectedTargetY = (center.y + offset[1]) * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
  if (
    expectedTileIndex < 0 ||
    !isWalkableTile(state, expectedTileIndex) ||
    claim.tileIndex !== expectedTileIndex ||
    claim.targetX !== expectedTargetX ||
    claim.targetY !== expectedTargetY ||
    action.targetTileIndex !== expectedTileIndex
  ) {
    return false;
  }
  return (
    action.phase !== "WORKING" ||
    (creature.tileIndex === expectedTileIndex &&
      creature.x === expectedTargetX &&
      creature.y === expectedTargetY)
  );
}

function anchorKindFor(action: ActionKind, targetEntityId: number | null) {
  if (action === "REST" || action === "JOIN_GROUP") {
    return "GROUP_HOME" as const;
  }
  if (targetEntityId === null) return "TILE" as const;
  if (
    action === "GATHER_FOOD" ||
    action === "GATHER_MATERIAL" ||
    action === "GATHER_WATER"
  ) {
    return "RESOURCE" as const;
  }
  if (action === "SHARE" || action === "SHARE_WATER" || action === "ATTACK") {
    return "CREATURE" as const;
  }
  return "STRUCTURE" as const;
}

function capacityForAnchor(
  state: SimulationState,
  action: ActionKind,
  anchorId: number,
): number {
  if (action !== "REST_SHELTERED") return interactionCapacity(action);
  const shelter = state.structures.find((structure) => structure.id === anchorId);
  return isShelterStructure(shelter) && shelter.kind === "SHELTER"
    ? effectiveShelterCapacity(shelter)
    : 0;
}

function activeClaims(state: SimulationState): InteractionClaim[] {
  return state.creatures.flatMap((creature) => {
    const claim = creature.activeAction?.interactionClaim;
    return claim ? [claim] : [];
  });
}

interface InteractionSlotAvailability {
  readonly available: InteractionClaim[];
  readonly occupiedSlotCount: number;
}

function inspectInteractionSlots(
  state: SimulationState,
  action: ActionKind,
  anchorId: number,
  anchorTileIndex: number,
  requestingCreatureId: number | null,
  ignoreOccupancy = false,
): InteractionSlotAvailability {
  const anchor = tileCoordinates(state.world, anchorTileIndex);
  const capacity = capacityForAnchor(state, action, anchorId);
  const purpose = interactionPurpose(action);
  const anchorKind = anchorKindFor(action, anchorId > 0 ? anchorId : null);
  const retainedClaims = ignoreOccupancy ? [] : activeClaims(state);
  const usedSlots = new Set(
    retainedClaims
      .filter((claim) => claim.anchorKind === anchorKind && claim.anchorId === anchorId)
      .map((claim) => claim.slotIndex),
  );
  const usedEndpoints = new Set([
    ...retainedClaims.map((claim) => `${claim.targetX}:${claim.targetY}`),
    ...(ignoreOccupancy
      ? []
      : state.creatures
          .filter((creature) => creature.alive && creature.id !== requestingCreatureId)
          .map((creature) => `${creature.x}:${creature.y}`)),
  ]);
  const available: InteractionClaim[] = [];
  let occupiedSlotCount = 0;
  const offsets = action === "REST_SHELTERED" ? SHELTER_REST_OFFSETS : OFFSETS;
  for (let slotIndex = 0; slotIndex < Math.min(capacity, offsets.length); slotIndex += 1) {
    if (usedSlots.has(slotIndex)) {
      occupiedSlotCount += 1;
      continue;
    }
    const [offsetX, offsetY] = offsets[slotIndex]!;
    const tileIndex = tileIndexAt(state.world, anchor.x + offsetX, anchor.y + offsetY);
    if (tileIndex < 0 || !isWalkableTile(state, tileIndex)) continue;
    const targetX = (anchor.x + offsetX) * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    const targetY = (anchor.y + offsetY) * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    if (usedEndpoints.has(`${targetX}:${targetY}`)) {
      occupiedSlotCount += 1;
      continue;
    }
    available.push({
      anchorKind,
      anchorId,
      purpose,
      slotIndex,
      tileIndex,
      targetX,
      targetY,
      claimedAtTick: state.tick,
    });
  }
  return { available, occupiedSlotCount };
}

export function availableInteractionSlots(
  state: SimulationState,
  action: ActionKind,
  anchorId: number,
  anchorTileIndex: number,
  requestingCreatureId: number | null = null,
): InteractionClaim[] {
  return inspectInteractionSlots(
    state,
    action,
    anchorId,
    anchorTileIndex,
    requestingCreatureId,
  ).available;
}

/**
 * Estimates topological weighted access to legal interaction slots while
 * deliberately ignoring transient creatures and claims. Contention is a
 * separate fact and must not make a reachable source appear unreachable.
 */
export function estimateInteractionTravelIgnoringOccupancy(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: number | null,
  anchorTileIndex: number,
): InteractionTravelEstimate | null {
  if (!requiresInteractionClaim(action)) {
    const cost = cachedTravelCosts(state, creature.tileIndex)[anchorTileIndex];
    return cost !== undefined && cost < UNREACHABLE_TRAVEL_COST
      ? { cost, destinationTileIndex: anchorTileIndex, slotIndex: null }
      : null;
  }
  const anchorId = targetEntityId ?? -(anchorTileIndex + 1);
  const travelCosts = cachedTravelCosts(state, creature.tileIndex);
  let estimate: InteractionTravelEstimate | null = null;
  for (const slot of inspectInteractionSlots(
    state,
    action,
    anchorId,
    anchorTileIndex,
    creature.id,
    true,
  ).available) {
    const cost = travelCosts[slot.tileIndex] ?? UNREACHABLE_TRAVEL_COST;
    if (
      cost < UNREACHABLE_TRAVEL_COST &&
      (estimate === null ||
        cost < estimate.cost ||
        (cost === estimate.cost &&
          slot.slotIndex < (estimate.slotIndex ?? Number.MAX_SAFE_INTEGER)))
    ) {
      estimate = {
        cost,
        destinationTileIndex: slot.tileIndex,
        slotIndex: slot.slotIndex,
      };
    }
  }
  return estimate;
}

export interface InteractionTravelEstimate {
  /** Authoritative sum of entered-tile walk costs. Ground steps cost 10. */
  readonly cost: number;
  readonly destinationTileIndex: number;
  readonly slotIndex: number | null;
}

export type InteractionTravelEstimator = (
  action: ActionKind,
  targetEntityId: number | null,
  anchorTileIndex: number,
) => InteractionTravelEstimate | null;

/**
 * Creates a decision-local weighted route estimator. Availability and route
 * results are cached only for this decision, so claims made by later decisions
 * can never reuse stale costs.
 */
export function createInteractionTravelEstimator(
  state: SimulationState,
  creature: CreatureState,
): InteractionTravelEstimator {
  const tick = state.tick;
  const navigationRevision = state.world.navigationRevision;
  const travelCosts = cachedTravelCosts(state, creature.tileIndex);
  const cache = new Map<string, InteractionTravelEstimate | null>();
  return (action, targetEntityId, anchorTileIndex) => {
    const key = `${tick}:${navigationRevision}:${creature.id}:${action}:${targetEntityId ?? "none"}:${anchorTileIndex}`;
    if (cache.has(key)) return cache.get(key) ?? null;

    let estimate: InteractionTravelEstimate | null = null;
    if (!requiresInteractionClaim(action)) {
      const cost = travelCosts[anchorTileIndex] ?? UNREACHABLE_TRAVEL_COST;
      if (cost < UNREACHABLE_TRAVEL_COST) {
        estimate = {
          cost,
          destinationTileIndex: anchorTileIndex,
          slotIndex: null,
        };
      }
    } else {
      const anchorId = targetEntityId ?? -(anchorTileIndex + 1);
      const slots = availableInteractionSlots(
        state,
        action,
        anchorId,
        anchorTileIndex,
        creature.id,
      );
      for (const slot of slots) {
        const cost = travelCosts[slot.tileIndex] ?? UNREACHABLE_TRAVEL_COST;
        if (
          cost < UNREACHABLE_TRAVEL_COST &&
          (estimate === null ||
            cost < estimate.cost ||
            (cost === estimate.cost &&
              slot.slotIndex < (estimate.slotIndex ?? Number.MAX_SAFE_INTEGER)))
        ) {
          estimate = {
            cost,
            destinationTileIndex: slot.tileIndex,
            slotIndex: slot.slotIndex,
          };
        }
      }
    }
    cache.set(key, estimate);
    return estimate;
  };
}

export interface InteractionClaimAttempt {
  readonly claim: InteractionClaim | null;
  /** True when another living creature or retained claim occupied a candidate slot. */
  readonly contended: boolean;
  /** True when this required claim had no reachable candidate. */
  readonly failed: boolean;
}

function emitShelterCrowding(
  state: SimulationState,
  shelterId: number,
  actorIds: number[],
  summary: string,
): void {
  const shelter = state.structures.find((structure) => structure.id === shelterId);
  if (!isShelterStructure(shelter)) return;
  const recentlyEmitted = state.domainEvents.some(
    (event) =>
      event.type === "SHELTER_CROWDED" &&
      event.targetIds.includes(shelterId) &&
      state.tick - event.tick <= 60,
  );
  if (recentlyEmitted) return;
  emitDomainEvent(state, {
    type: "SHELTER_CROWDED",
    actorIds,
    targetIds: [shelterId],
    groupIds: [shelter.groupId],
    locationTileIndex: shelter.tileIndex,
    quantity: effectiveShelterCapacity(shelter),
    importance: 28,
    summary,
  });
}

export function attemptInteractionSlotClaim(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: number | null,
  anchorTileIndex: number,
): InteractionClaimAttempt {
  if (!requiresInteractionClaim(action)) {
    return { claim: null, contended: false, failed: false };
  }
  if (action === "REST_SHELTERED") {
    const shelter = state.structures.find((structure) => structure.id === targetEntityId);
    if (
      !isShelterStructure(shelter) ||
      shelter.kind !== "SHELTER" ||
      shelterEligibility(state, creature, shelter) === "INELIGIBLE"
    ) {
      state.metrics.shelterDeniedClaims += 1;
      return { claim: null, contended: false, failed: true };
    }

    // A member may deterministically displace a guest reservation when every
    // effective place is occupied. The guest immediately reconsiders and can
    // fall back to outdoor rest.
    if (creature.groupId === shelter.groupId) {
      const capacity = effectiveShelterCapacity(shelter);
      const reservations = state.creatures
        .filter(
          (candidate) =>
            candidate.activeAction?.kind === "REST_SHELTERED" &&
            candidate.activeAction.targetEntityId === shelter.id &&
            candidate.activeAction.interactionClaim !== null,
        )
        .sort((left, right) => right.id - left.id);
      if (reservations.length >= capacity) {
        const displaced = reservations.find(
          (candidate) => candidate.groupId !== shelter.groupId,
        );
        if (displaced) {
          state.metrics.shelterDeniedClaims += 1;
          emitShelterCrowding(
            state,
            shelter.id,
            [creature.id, displaced.id],
            `${creature.name} claimed a full communal shelter's member-priority place, so ${displaced.name} had to reconsider outdoor rest.`,
          );
          displaced.activeAction = null;
          displaced.activeGoal = null;
          if (displaced.activePlan) {
            displaced.activePlan.interactionClaim = null;
            recordPlanTransition(state, displaced, "BLOCKED");
          }
          displaced.nextDecisionTick = Math.min(displaced.nextDecisionTick, state.tick + 1);
        }
      }
    }
  }
  const anchorId = targetEntityId ?? -(anchorTileIndex + 1);
  const availability = inspectInteractionSlots(
    state,
    action,
    anchorId,
    anchorTileIndex,
    creature.id,
  );
  const travelCosts = cachedTravelCosts(state, creature.tileIndex);
  const claim =
    availability.available
      .map((candidate) => ({
        candidate,
        cost: travelCosts[candidate.tileIndex] ?? UNREACHABLE_TRAVEL_COST,
      }))
      .filter((entry) => entry.cost < UNREACHABLE_TRAVEL_COST)
      .sort(
        (left, right) =>
          left.cost - right.cost || left.candidate.slotIndex - right.candidate.slotIndex,
      )[0]?.candidate ?? null;
  if (action === "REST_SHELTERED" && claim === null) {
    state.metrics.shelterDeniedClaims += 1;
    if (
      targetEntityId !== null &&
      availability.available.length === 0 &&
      availability.occupiedSlotCount > 0
    ) {
      emitShelterCrowding(
        state,
        targetEntityId,
        [creature.id],
        `${creature.name} could not reserve a usable place in the crowded communal shelter.`,
      );
    }
  }
  return {
    claim,
    contended: availability.occupiedSlotCount > 0,
    failed: claim === null,
  };
}

export function claimInteractionSlot(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: number | null,
  anchorTileIndex: number,
): InteractionClaim | null {
  return attemptInteractionSlotClaim(
    state,
    creature,
    action,
    targetEntityId,
    anchorTileIndex,
  ).claim;
}

export function interactionCrowding(
  state: SimulationState,
  action: ActionKind,
  targetEntityId: number | null,
  anchorTileIndex: number,
): { claimed: number; capacity: number } {
  const anchorId = targetEntityId ?? -(anchorTileIndex + 1);
  const anchorKind = anchorKindFor(action, targetEntityId);
  const claimed = activeClaims(state).filter(
    (claim) => claim.anchorKind === anchorKind && claim.anchorId === anchorId,
  ).length;
  return { claimed, capacity: capacityForAnchor(state, action, anchorId) };
}

export function validateInteractionClaims(state: SimulationState): string[] {
  const errors: string[] = [];
  const owners = new Map<string, number>();
  const endpointOwners = new Map<string, number>();
  for (const creature of [...state.creatures].sort((a, b) => a.id - b.id)) {
    const action = creature.activeAction;
    if (!action) continue;
    const claim = action.interactionClaim;
    if (!claim) {
      if (requiresInteractionClaim(action.kind)) {
        errors.push(`creature ${creature.id} is missing a required interaction claim`);
      }
      continue;
    }
    const key = `${claim.anchorKind}:${claim.anchorId}:${claim.slotIndex}`;
    const owner = owners.get(key);
    if (owner !== undefined) {
      errors.push(`slot ${key} is claimed by creatures ${owner} and ${creature.id}`);
    } else {
      owners.set(key, creature.id);
    }
    const endpointKey = `${claim.targetX}:${claim.targetY}`;
    const endpointOwner = endpointOwners.get(endpointKey);
    if (endpointOwner !== undefined) {
      errors.push(
        `endpoint ${endpointKey} is claimed by creatures ${endpointOwner} and ${creature.id}`,
      );
    } else {
      endpointOwners.set(endpointKey, creature.id);
    }
    if (!isWalkableTile(state, claim.tileIndex)) {
      errors.push(`creature ${creature.id} claims blocked tile ${claim.tileIndex}`);
    }
    if (
      claim.slotIndex < 0 ||
      claim.slotIndex >= capacityForAnchor(state, action.kind, claim.anchorId)
    ) {
      errors.push(`creature ${creature.id} claims invalid slot ${claim.slotIndex}`);
    }
    if (action.kind === "REST_SHELTERED") {
      if (!isCanonicalShelteredRestClaim(state, creature, action)) {
        errors.push(`creature ${creature.id} has an invalid sheltered-rest claim`);
      }
    }
  }
  return errors;
}

function blockShelterReservation(state: SimulationState, creature: CreatureState): void {
  state.metrics.shelterDeniedClaims += 1;
  creature.activeAction = null;
  creature.activeGoal = null;
  if (creature.activePlan) {
    creature.activePlan.interactionClaim = null;
    recordPlanTransition(state, creature, "BLOCKED");
  }
  creature.nextDecisionTick = Math.min(creature.nextDecisionTick, state.tick + 1);
}

function hasRetainableShelterRoute(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (!isCanonicalShelteredRestClaim(state, creature, action)) return false;
  if (action.phase === "WORKING") return true;
  const claim = action.interactionClaim;
  if (
    claim === null ||
    action.navigationRevision !== state.world.navigationRevision ||
    action.path.length === 0 ||
    action.path.at(-1) !== claim.tileIndex
  ) {
    return false;
  }
  const currentPathIndex = action.pathIndex <= 0 ? 0 : action.pathIndex - 1;
  if (action.path[currentPathIndex] !== creature.tileIndex) return false;
  for (let index = currentPathIndex; index < action.path.length; index += 1) {
    const tileIndex = action.path[index]!;
    if (!isWalkableTile(state, tileIndex)) return false;
    if (index === currentPathIndex) continue;
    const previous = tileCoordinates(state.world, action.path[index - 1]!);
    const current = tileCoordinates(state.world, tileIndex);
    if (Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y) !== 1) {
      return false;
    }
  }
  return true;
}

/**
 * Capacity wear can invalidate a high-numbered member slot while a guest still
 * holds a lower slot. Compacting each shelter independently makes priority a
 * property of the retained reservations, not an accident of old slot numbers.
 */
function compactShelterReservations(state: SimulationState): void {
  const shelterIds = [
    ...new Set(
      state.creatures.flatMap((creature) => {
        const action = creature.activeAction;
        return action?.kind === "REST_SHELTERED" && action.targetEntityId !== null
          ? [action.targetEntityId]
          : [];
      }),
    ),
  ].sort((left, right) => left - right);

  for (const shelterId of shelterIds) {
    const shelter = state.structures.find((item) => item.id === shelterId);
    const reservations = state.creatures
      .filter(
        (creature) =>
          creature.activeAction?.kind === "REST_SHELTERED" &&
          creature.activeAction.targetEntityId === shelterId &&
          creature.activeAction.interactionClaim !== null,
      )
      .sort((left, right) => {
        const leftMember = isShelterStructure(shelter) && left.groupId === shelter.groupId;
        const rightMember =
          isShelterStructure(shelter) && right.groupId === shelter.groupId;
        return Number(rightMember) - Number(leftMember) || left.id - right.id;
      });

    if (!isShelterStructure(shelter) || shelter.kind !== "SHELTER") {
      for (const creature of reservations) blockShelterReservation(state, creature);
      continue;
    }

    const reservationsArePacked =
      reservations.length <= effectiveShelterCapacity(shelter) &&
      reservations.every((creature, slotIndex) => {
        const action = creature.activeAction;
        return (
          action?.interactionClaim?.slotIndex === slotIndex &&
          hasRetainableShelterRoute(state, creature, action)
        );
      });
    if (reservationsArePacked) {
      for (const creature of reservations) {
        const action = creature.activeAction!;
        const claim = action.interactionClaim!;
        if (creature.activeGoal) creature.activeGoal.targetTileIndex = claim.tileIndex;
        if (creature.activePlan) {
          creature.activePlan.targetTileIndex = claim.tileIndex;
          creature.activePlan.interactionClaim = claim;
        }
      }
      continue;
    }

    const available = inspectInteractionSlots(
      state,
      "REST_SHELTERED",
      shelter.id,
      shelter.tileIndex,
      null,
      true,
    ).available.sort((left, right) => left.slotIndex - right.slotIndex);
    const retainedSlots = new Set<number>();
    const crowdedIds: number[] = [];

    for (const creature of reservations) {
      if (shelterEligibility(state, creature, shelter) === "INELIGIBLE") {
        blockShelterReservation(state, creature);
        continue;
      }
      const freeSlots = available.filter((slot) => !retainedSlots.has(slot.slotIndex));
      let selection: {
        slot: InteractionClaim;
        route: NonNullable<ReturnType<typeof findWeightedPath>>;
      } | null = null;
      for (const slot of freeSlots) {
        const route = findWeightedPath(state.world, creature.tileIndex, slot.tileIndex);
        if (route) {
          selection = { slot, route };
          break;
        }
      }
      if (!selection) {
        if (freeSlots.length === 0) crowdedIds.push(creature.id);
        blockShelterReservation(state, creature);
        continue;
      }

      retainedSlots.add(selection.slot.slotIndex);
      const action = creature.activeAction;
      if (!action) continue;
      const oldClaim = action.interactionClaim;
      const claim = {
        ...selection.slot,
        claimedAtTick:
          oldClaim?.slotIndex === selection.slot.slotIndex
            ? oldClaim.claimedAtTick
            : state.tick,
      };
      const changed =
        oldClaim?.slotIndex !== claim.slotIndex ||
        oldClaim.tileIndex !== claim.tileIndex ||
        oldClaim.targetX !== claim.targetX ||
        oldClaim.targetY !== claim.targetY;
      action.interactionClaim = claim;
      action.targetTileIndex = claim.tileIndex;
      if (creature.activeGoal) creature.activeGoal.targetTileIndex = claim.tileIndex;
      if (creature.activePlan) {
        creature.activePlan.targetTileIndex = claim.tileIndex;
        creature.activePlan.interactionClaim = claim;
      }
      if (changed) {
        action.phase = "MOVING";
        action.progress = 0;
        action.path = selection.route.path;
        const atEndpoint =
          creature.tileIndex === claim.tileIndex &&
          creature.x === claim.targetX &&
          creature.y === claim.targetY;
        action.pathIndex = atEndpoint
          ? selection.route.path.length
          : selection.route.path.length <= 1
            ? 0
            : 1;
        action.navigationRevision = state.world.navigationRevision;
        if (atEndpoint) action.phase = "WORKING";
      }
    }

    if (crowdedIds.length > 0) {
      emitShelterCrowding(
        state,
        shelter.id,
        crowdedIds,
        `${crowdedIds.length.toString()} eligible creature${crowdedIds.length === 1 ? "" : "s"} lost a shelter reservation because usable capacity was full; member places were retained first.`,
      );
    }
  }
}

export function repairInteractionClaims(state: SimulationState): void {
  compactShelterReservations(state);
  const claimed = new Set<string>();
  const claimedEndpoints = new Set<string>();
  for (const creature of [...state.creatures].sort((a, b) => {
    const aShelter =
      a.activeAction?.kind === "REST_SHELTERED"
        ? state.structures.find((item) => item.id === a.activeAction?.targetEntityId)
        : null;
    const bShelter =
      b.activeAction?.kind === "REST_SHELTERED"
        ? state.structures.find((item) => item.id === b.activeAction?.targetEntityId)
        : null;
    const aPriority =
      isShelterStructure(aShelter) && a.groupId === aShelter.groupId ? 0 : 1;
    const bPriority =
      isShelterStructure(bShelter) && b.groupId === bShelter.groupId ? 0 : 1;
    return aPriority - bPriority || a.id - b.id;
  })) {
    const action = creature.activeAction;
    const claim = action?.interactionClaim;
    if (!action || !claim) {
      if (action && requiresInteractionClaim(action.kind)) {
        creature.activeAction = null;
        creature.activeGoal = null;
        if (creature.activePlan) recordPlanTransition(state, creature, "BLOCKED");
        creature.nextDecisionTick = Math.min(creature.nextDecisionTick, state.tick + 1);
      }
      if (creature.activePlan) creature.activePlan.interactionClaim = null;
      continue;
    }
    const key = `${claim.anchorKind}:${claim.anchorId}:${claim.slotIndex}`;
    const endpointKey = `${claim.targetX}:${claim.targetY}`;
    const invalid =
      claimed.has(key) ||
      claimedEndpoints.has(endpointKey) ||
      !isWalkableTile(state, claim.tileIndex) ||
      claim.slotIndex < 0 ||
      claim.slotIndex >= capacityForAnchor(state, action.kind, claim.anchorId) ||
      (action.kind === "REST_SHELTERED" &&
        !isCanonicalShelteredRestClaim(state, creature, action)) ||
      action.targetTileIndex !== claim.tileIndex;
    if (invalid) {
      creature.activeAction = null;
      creature.activeGoal = null;
      if (creature.activePlan) {
        creature.activePlan.interactionClaim = null;
        recordPlanTransition(state, creature, "BLOCKED");
      }
      creature.nextDecisionTick = Math.min(creature.nextDecisionTick, state.tick + 1);
      continue;
    }
    claimed.add(key);
    claimedEndpoints.add(endpointKey);
    if (creature.activePlan) creature.activePlan.interactionClaim = claim;
  }
}
