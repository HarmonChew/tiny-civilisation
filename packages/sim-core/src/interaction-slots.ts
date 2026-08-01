import { isWalkableTile } from "./navigation.js";
import {
  findPath,
  manhattanDistance,
  tileCoordinates,
  tileIndexAt,
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

const PURPOSE_BY_ACTION: Record<ActionKind, InteractionPurpose> = {
  EXPLORE: "EXPLORE",
  GATHER_FOOD: "GATHER",
  GATHER_MATERIAL: "GATHER",
  EAT: "REST",
  REST: "REST",
  SHARE: "SOCIAL",
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
    case "ATTACK":
      return 2;
    default:
      return 1;
  }
}

export function requiresInteractionClaim(action: ActionKind): boolean {
  return action !== "EXPLORE" && action !== "EAT" && action !== "FLEE";
}

function anchorKindFor(action: ActionKind, targetEntityId: number | null) {
  if (action === "REST" || action === "JOIN_GROUP") {
    return "GROUP_HOME" as const;
  }
  if (targetEntityId === null) return "TILE" as const;
  if (action === "GATHER_FOOD" || action === "GATHER_MATERIAL") {
    return "RESOURCE" as const;
  }
  if (action === "SHARE" || action === "ATTACK") return "CREATURE" as const;
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
): InteractionSlotAvailability {
  const anchor = tileCoordinates(state.world, anchorTileIndex);
  const capacity = interactionCapacity(action);
  const purpose = interactionPurpose(action);
  const anchorKind = anchorKindFor(action, anchorId > 0 ? anchorId : null);
  const usedSlots = new Set(
    activeClaims(state)
      .filter((claim) => claim.anchorKind === anchorKind && claim.anchorId === anchorId)
      .map((claim) => claim.slotIndex),
  );
  const usedEndpoints = new Set([
    ...activeClaims(state).map((claim) => `${claim.targetX}:${claim.targetY}`),
    ...state.creatures
      .filter((creature) => creature.alive && creature.id !== requestingCreatureId)
      .map((creature) => `${creature.x}:${creature.y}`),
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
  const ordered = [...availability.available].sort((left, right) => {
    const leftDistance = manhattanDistance(state.world, left.tileIndex, creature.tileIndex);
    const rightDistance = manhattanDistance(
      state.world,
      right.tileIndex,
      creature.tileIndex,
    );
    return leftDistance - rightDistance || left.slotIndex - right.slotIndex;
  });
  const claim =
    ordered.find(
      (candidate) =>
        findPath(state.world, creature.tileIndex, candidate.tileIndex).length > 0,
    ) ?? null;
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
