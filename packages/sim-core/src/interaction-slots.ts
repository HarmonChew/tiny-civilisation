import { isWalkableTile } from "./navigation.js";
import {
  findWeightedPath,
  tileCoordinates,
  tileIndexAt,
  UNREACHABLE_TRAVEL_COST,
  weightedTravelCostsFrom,
} from "./pathfinding.js";
import { recordPlanTransition } from "./plans.js";
import {
  TILE_FIXED_UNITS,
  type ActionKind,
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
const travelCostCache = new WeakMap<
  SimulationState["world"],
  { navigationRevision: number; byOrigin: Map<number, Int32Array> }
>();
const canonicalTravelCostCache = new Map<string, Map<number, Int32Array>>();

function cachedTravelCosts(state: SimulationState, origin: number): Int32Array {
  if (state.world.navigationRevision === 0) {
    let shared = canonicalTravelCostCache.get(state.compiledMapHash);
    if (!shared) {
      shared = new Map<number, Int32Array>();
      canonicalTravelCostCache.set(state.compiledMapHash, shared);
    }
    const retained = shared.get(origin);
    if (retained) return retained;
    const costs = weightedTravelCostsFrom(state.world, origin);
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
      return 5;
    case "DEPOSIT":
    case "WITHDRAW":
    case "STEAL":
      return 4;
    case "GUARD":
      return 4;
    case "REST":
    case "JOIN_GROUP":
      return 6;
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
  const capacity = interactionCapacity(action);
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
  for (let slotIndex = 0; slotIndex < Math.min(capacity, OFFSETS.length); slotIndex += 1) {
    if (usedSlots.has(slotIndex)) {
      occupiedSlotCount += 1;
      continue;
    }
    const [offsetX, offsetY] = OFFSETS[slotIndex]!;
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
  const anchorId = targetEntityId ?? -(anchorTileIndex + 1);
  const availability = inspectInteractionSlots(
    state,
    action,
    anchorId,
    anchorTileIndex,
    creature.id,
  );
  const claim =
    availability.available
      .map((candidate) => ({
        candidate,
        route: findWeightedPath(state.world, creature.tileIndex, candidate.tileIndex),
      }))
      .filter(
        (
          entry,
        ): entry is {
          candidate: InteractionClaim;
          route: NonNullable<ReturnType<typeof findWeightedPath>>;
        } => entry.route !== null,
      )
      .sort(
        (left, right) =>
          left.route.cost - right.route.cost ||
          left.candidate.slotIndex - right.candidate.slotIndex,
      )[0]?.candidate ?? null;
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
  return { claimed, capacity: interactionCapacity(action) };
}

export function validateInteractionClaims(state: SimulationState): string[] {
  const errors: string[] = [];
  const owners = new Map<string, number>();
  const endpointOwners = new Map<string, number>();
  for (const creature of [...state.creatures].sort((a, b) => a.id - b.id)) {
    const claim = creature.activeAction?.interactionClaim;
    if (!claim) continue;
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
      claim.slotIndex >= interactionCapacity(creature.activeAction!.kind)
    ) {
      errors.push(`creature ${creature.id} claims invalid slot ${claim.slotIndex}`);
    }
  }
  return errors;
}

export function repairInteractionClaims(state: SimulationState): void {
  const claimed = new Set<string>();
  const claimedEndpoints = new Set<string>();
  for (const creature of [...state.creatures].sort((a, b) => a.id - b.id)) {
    const action = creature.activeAction;
    const claim = action?.interactionClaim;
    if (!action || !claim) {
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
      claim.slotIndex >= interactionCapacity(action.kind) ||
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
