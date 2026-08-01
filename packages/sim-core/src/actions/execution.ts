import { addHistory, emitDomainEvent } from "../events.js";
import { findPath, manhattanDistance } from "../pathfinding.js";
import { planCompletedAfterAction, recordPlanTransition } from "../plans.js";
import { keyedRandomU32, keyedRandomUnit } from "../rng.js";
import {
  addMemory,
  changeRelationship,
  currentDecisionIds,
  relationshipFrom,
} from "../social.js";
import {
  entityTile,
  getCreature,
  getGroup,
  getResourceNode,
  getStructure,
} from "../tick-context.js";
import type {
  ActionKind,
  ActiveAction,
  CreatureState,
  DomainEvent,
  GroupState,
  ResourceKind,
  SimulationState,
  StructureState,
} from "../types.js";
import { getActionDuration } from "./registry.js";
import {
  MOVEMENT_SPEED,
  UNIT_MAX,
  clamp,
  clampUnit,
  creatureTravelPosition,
  groupStorage,
  inventorySpace,
  removeGuardAssignment,
} from "./shared.js";

function refreshMovingTarget(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (action.interactionClaim) return true;
  if (
    action.targetEntityId === null ||
    action.kind === "FLEE" ||
    action.kind === "JOIN_GROUP"
  ) {
    return true;
  }
  const currentTargetTile = entityTile(state, action.targetEntityId);
  if (currentTargetTile === null) {
    return false;
  }
  if (currentTargetTile !== action.targetTileIndex && action.phase === "MOVING") {
    const path = findPath(state.world, creature.tileIndex, currentTargetTile);
    if (path.length === 0) {
      return false;
    }
    action.targetTileIndex = currentTargetTile;
    action.path = path;
    action.pathIndex = path.length <= 1 ? path.length : 1;
    action.navigationRevision = state.world.navigationRevision;
    if (path.length <= 1) {
      action.phase = "WORKING";
      action.progress = 0;
    }
  }
  return true;
}

function recordRouteSample(state: SimulationState, creature: CreatureState): void {
  const latest = creature.recentRoute.at(-1);
  if (latest?.tileIndex === creature.tileIndex && state.tick - latest.tick < 4) {
    return;
  }
  creature.recentRoute.push({
    tick: state.tick,
    tileIndex: creature.tileIndex,
    x: creature.x,
    y: creature.y,
  });
  if (creature.recentRoute.length > state.configuration.maxRouteSamplesPerCreature) {
    creature.recentRoute.splice(
      0,
      creature.recentRoute.length - state.configuration.maxRouteSamplesPerCreature,
    );
  }
}

function moveCreatureAlongPath(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): boolean {
  if (action.navigationRevision !== state.world.navigationRevision) {
    const path = findPath(
      state.world,
      creature.tileIndex,
      action.targetTileIndex ?? creature.tileIndex,
    );
    if (path.length === 0) {
      return false;
    }
    action.path = path;
    action.pathIndex = path.length <= 1 ? path.length : 1;
    action.navigationRevision = state.world.navigationRevision;
    if (path.length <= 1) {
      action.phase = "WORKING";
      action.progress = 0;
      return true;
    }
  }

  const nextTile = action.path[action.pathIndex];
  if (nextTile === undefined) {
    action.phase = "WORKING";
    action.progress = 0;
    return true;
  }
  const isFinalWaypoint = action.pathIndex === action.path.length - 1;
  const target =
    isFinalWaypoint && action.interactionClaim
      ? {
          x: action.interactionClaim.targetX,
          y: action.interactionClaim.targetY,
        }
      : creatureTravelPosition(state, nextTile, creature.id);
  const speed = Math.max(
    64,
    Math.floor((MOVEMENT_SPEED * (7_500 + creature.health / 4)) / UNIT_MAX),
  );
  const deltaX = target.x - creature.x;
  const deltaY = target.y - creature.y;
  if (Math.abs(deltaX) <= speed && Math.abs(deltaY) <= speed) {
    creature.x = target.x;
    creature.y = target.y;
    creature.tileIndex = nextTile;
    recordRouteSample(state, creature);
    action.pathIndex += 1;
    if (action.pathIndex >= action.path.length) {
      action.phase = "WORKING";
      action.progress = 0;
    }
  } else if (deltaX !== 0) {
    creature.x += Math.sign(deltaX) * Math.min(speed, Math.abs(deltaX));
  } else if (deltaY !== 0) {
    creature.y += Math.sign(deltaY) * Math.min(speed, Math.abs(deltaY));
  }
  return true;
}

function finishCreatureAction(state: SimulationState, creature: CreatureState): void {
  const action = creature.activeAction;
  if (!action) {
    return;
  }
  resolveAction(state, creature, action);
  creature.actionCounts[action.kind] += 1;
  creature.lastActionKind = action.kind;
  creature.lastActionTick = state.tick;
  if (action.kind === "GUARD") {
    removeGuardAssignment(state, creature);
  }
  if (creature.activePlan) {
    creature.activePlan.interactionClaim = null;
    if (planCompletedAfterAction(state, creature, action.kind)) {
      recordPlanTransition(state, creature, "COMPLETED");
    }
  }
  creature.activeAction = null;
  creature.activeGoal = null;
  creature.nextDecisionTick = state.tick + 1;
}

export function executeActiveActions(state: SimulationState): void {
  const ordered = [...state.creatures].sort((left, right) => left.id - right.id);
  for (const creature of ordered) {
    const action = creature.activeAction;
    if (!creature.alive || !action) {
      continue;
    }
    if (!refreshMovingTarget(state, creature, action)) {
      if (action.kind === "GUARD") {
        removeGuardAssignment(state, creature);
      }
      creature.activeAction = null;
      creature.activeGoal = null;
      if (creature.activePlan) {
        creature.activePlan.interactionClaim = null;
        recordPlanTransition(state, creature, "BLOCKED");
      }
      creature.nextDecisionTick = state.tick + 1;
      continue;
    }
    if (action.phase === "MOVING") {
      if (!moveCreatureAlongPath(state, creature, action)) {
        state.metrics.invalidPathFailures += 1;
        creature.activeAction = null;
        creature.activeGoal = null;
        if (creature.activePlan) {
          creature.activePlan.interactionClaim = null;
          recordPlanTransition(state, creature, "BLOCKED");
        }
        creature.nextDecisionTick = state.tick + 3;
      }
      continue;
    }
    if (action.kind === "GUARD" && action.targetEntityId !== null) {
      const structure = getStructure(state, action.targetEntityId);
      if (structure && !structure.guardIds.includes(creature.id)) {
        structure.guardIds.push(creature.id);
        structure.guardIds.sort((a, b) => a - b);
      }
    }
    action.progress = Math.min(
      action.workRequired,
      action.progress + Math.ceil(UNIT_MAX / getActionDuration(action.kind)),
    );
    if (action.progress >= action.workRequired) {
      finishCreatureAction(state, creature);
    }
  }
}

function gatherResource(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
  kind: ResourceKind,
): void {
  const node =
    action.targetEntityId === null ? null : getResourceNode(state, action.targetEntityId);
  if (!node || node.kind !== kind || node.currentStock <= 0) {
    return;
  }
  const capacity = inventorySpace(creature.inventory);
  if (capacity <= 0) {
    return;
  }
  const skillBonus = kind === "FOOD" && creature.skills.foraging >= 6_000 ? 1 : 0;
  const quantity = Math.min(node.currentStock, capacity, 2 + skillBonus);
  node.currentStock -= quantity;
  if (kind === "FOOD") {
    creature.inventory.food += quantity;
    creature.skills.foraging = clampUnit(creature.skills.foraging + 5);
    state.metrics.foodGathered += quantity;
    emitDomainEvent(state, {
      type: "FOOD_GATHERED",
      actorIds: [creature.id],
      targetIds: [node.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: node.tileIndex,
      resourceKind: kind,
      quantity,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} gathered ${quantity} food.`,
    });
  } else {
    creature.inventory.material += quantity;
    emitDomainEvent(state, {
      type: "MATERIAL_GATHERED",
      actorIds: [creature.id],
      targetIds: [node.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: node.tileIndex,
      resourceKind: kind,
      quantity,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} gathered ${quantity} material.`,
    });
  }
}

function shareFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const recipient = targetId === null ? null : getCreature(state, targetId);
  if (!recipient?.alive || creature.inventory.food <= 0) {
    return;
  }
  if (inventorySpace(recipient.inventory) <= 0) {
    return;
  }
  creature.inventory.food -= 1;
  recipient.inventory.food += 1;
  state.metrics.foodShared += 1;
  const event = emitDomainEvent(state, {
    type: "FOOD_SHARED",
    actorIds: [creature.id],
    targetIds: [recipient.id],
    groupIds:
      creature.groupId !== null && creature.groupId === recipient.groupId
        ? [creature.groupId]
        : [],
    locationTileIndex: creature.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    importance: recipient.needs.hunger > 8_000 ? 32 : 18,
    summary: `${creature.name} shared food with ${recipient.name}.`,
  });
  changeRelationship(
    state,
    recipient.id,
    creature.id,
    {
      trust: 1_050 + Math.floor(recipient.needs.hunger / 20),
      familiarity: 450,
    },
    event.id,
  );
  changeRelationship(
    state,
    creature.id,
    recipient.id,
    { trust: 180, familiarity: 300 },
    event.id,
  );
  addMemory(
    state,
    recipient,
    "HELP_RECEIVED",
    creature.id,
    creature.tileIndex,
    4_500,
    5_500 + recipient.needs.hunger / 4,
    [event.id],
  );
  const group = getGroup(state, creature.groupId ?? -1);
  if (group && recipient.groupId === group.id) {
    group.sharingNorm = clamp(group.sharingNorm + 90, -UNIT_MAX, UNIT_MAX);
  }
}

function witnessTheft(
  state: SimulationState,
  thief: CreatureState,
  theftEvent: DomainEvent,
  targetGroupId: number | null,
): void {
  const witnesses = state.creatures.filter(
    (observer) =>
      observer.alive &&
      observer.id !== thief.id &&
      manhattanDistance(
        state.world,
        observer.tileIndex,
        theftEvent.locationTileIndex ?? thief.tileIndex,
      ) <= (observer.groupId === targetGroupId ? 5 : 3),
  );
  if (witnesses.length === 0) {
    return;
  }
  state.metrics.witnessedThefts += 1;
  const witnessEvent = emitDomainEvent(state, {
    type: "THEFT_WITNESSED",
    actorIds: witnesses.map((witness) => witness.id),
    targetIds: [thief.id],
    groupIds: targetGroupId === null ? [] : [targetGroupId],
    locationTileIndex: theftEvent.locationTileIndex,
    resourceKind: "FOOD",
    quantity: theftEvent.quantity,
    causedByEventIds: [theftEvent.id],
    decisionRecordIds: theftEvent.decisionRecordIds,
    importance: 58,
    summary: `${witnesses.map((witness) => witness.name).join(", ")} witnessed ${thief.name}'s theft.`,
  });
  for (const witness of witnesses) {
    changeRelationship(
      state,
      witness.id,
      thief.id,
      {
        trust: -2_300,
        fear: 350 + thief.traits.aggression / 20,
        rivalry: 3_500,
        familiarity: 400,
      },
      witnessEvent.id,
    );
    addMemory(
      state,
      witness,
      "THEFT_OBSERVED",
      thief.id,
      theftEvent.locationTileIndex,
      -7_000,
      8_000,
      [theftEvent.id, witnessEvent.id],
    );
    witness.nextDecisionTick = Math.min(witness.nextDecisionTick, state.tick + 1);
  }
}

function stealFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  if (targetId === null || inventorySpace(creature.inventory) <= 0) {
    return;
  }
  const structure = getStructure(state, targetId);
  const victim = getCreature(state, targetId);
  let targetGroupId: number | null;
  let location: number;
  let victimIds: number[];
  if (structure?.kind === "STORAGE" && structure.inventory.food > 0) {
    structure.inventory.food -= 1;
    targetGroupId = structure.groupId;
    location = structure.tileIndex;
    victimIds = [structure.id];
  } else if (victim?.alive && victim.inventory.food > 0) {
    victim.inventory.food -= 1;
    targetGroupId = victim.groupId;
    location = victim.tileIndex;
    victimIds = [victim.id];
  } else {
    return;
  }
  creature.inventory.food += 1;
  state.metrics.thefts += 1;
  const event = emitDomainEvent(state, {
    type: "THEFT_COMMITTED",
    actorIds: [creature.id],
    targetIds: victimIds,
    groupIds: targetGroupId === null ? [] : [targetGroupId],
    locationTileIndex: location,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    importance: 62,
    summary: `${creature.name} took food without permission.`,
  });
  addMemory(state, creature, "RESOURCE_FOUND", targetId, location, 1_000, 4_000, [
    event.id,
  ]);
  const targetGroup = targetGroupId === null ? null : getGroup(state, targetGroupId);
  if (targetGroup) {
    targetGroup.sharingNorm = clamp(targetGroup.sharingNorm + 140, -UNIT_MAX, UNIT_MAX);
  }
  addHistory(
    state,
    "THEFT",
    `${creature.name} stole from ${targetGroup?.name ?? "another creature"}`,
    event.summary,
    [event.id],
    [creature.id],
    targetGroupId === null ? [] : [targetGroupId],
    62,
  );
  witnessTheft(state, creature, event, targetGroupId);
}

function ensureStorageSite(state: SimulationState, group: GroupState): StructureState {
  const existing = groupStorage(state, group.id);
  if (existing) {
    return existing;
  }
  const site: StructureState = {
    id: state.nextEntityId++,
    kind: "STORAGE_SITE",
    tileIndex: group.homeTileIndex,
    groupId: group.id,
    material: 0,
    materialRequired: 12,
    progress: 0,
    workRequired: UNIT_MAX,
    inventory: {
      capacity: 80,
      food: 0,
      material: 0,
    },
    guardIds: [],
    completedTick: null,
  };
  state.structures.push(site);
  group.storageStructureId = site.id;
  const event = emitDomainEvent(state, {
    type: "STORAGE_SITE_STARTED",
    groupIds: [group.id],
    targetIds: [site.id],
    locationTileIndex: site.tileIndex,
    importance: 42,
    summary: `The ${group.name} group began a shared store.`,
  });
  group.majorEventIds.push(event.id);
  return site;
}

function buildStorage(state: SimulationState, creature: CreatureState): void {
  const group = creature.groupId === null ? null : getGroup(state, creature.groupId);
  if (!group) {
    return;
  }
  const site = ensureStorageSite(state, group);
  if (site.kind !== "STORAGE_SITE") {
    return;
  }
  const materialNeeded = Math.max(0, site.materialRequired - site.material);
  const deposited = Math.min(creature.inventory.material, materialNeeded);
  if (deposited > 0) {
    creature.inventory.material -= deposited;
    site.material += deposited;
    emitDomainEvent(state, {
      type: "MATERIAL_DEPOSITED",
      actorIds: [creature.id],
      targetIds: [site.id],
      groupIds: [group.id],
      locationTileIndex: site.tileIndex,
      resourceKind: "MATERIAL",
      quantity: deposited,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `${creature.name} added ${deposited} material to the shared store.`,
    });
  }
  const previousProgress = site.progress;
  site.progress = clampUnit(
    site.progress + 1_250 + Math.floor(creature.traits.loyalty / 12),
  );
  for (const threshold of [2_500, 5_000, 7_500] as const) {
    if (previousProgress >= threshold || site.progress < threshold) continue;
    emitDomainEvent(state, {
      type: "STORAGE_WORK_ADVANCED",
      actorIds: [creature.id],
      targetIds: [site.id],
      groupIds: [group.id],
      locationTileIndex: site.tileIndex,
      quantity: threshold,
      decisionRecordIds: currentDecisionIds(creature),
      importance: threshold === 7_500 ? 48 : 30,
      summary: `${creature.name} advanced ${group.name}'s shared store to ${threshold / 100}% completion.`,
    });
  }
  if (site.material >= site.materialRequired && site.progress >= site.workRequired) {
    site.kind = "STORAGE";
    site.completedTick = state.tick;
    group.stage = "PERSISTENT";
    state.metrics.storagesCompleted += 1;
    const event = emitDomainEvent(state, {
      type: "STORAGE_COMPLETED",
      actorIds: [creature.id],
      targetIds: [site.id],
      groupIds: [group.id],
      locationTileIndex: site.tileIndex,
      importance: 85,
      decisionRecordIds: currentDecisionIds(creature),
      summary: `The ${group.name} group completed its first shared store.`,
    });
    group.majorEventIds.push(event.id);
    addHistory(
      state,
      "STORAGE_BUILT",
      `${group.name}'s shared store was completed`,
      event.summary,
      [event.id],
      group.memberIds,
      [group.id],
      85,
    );
  }
}

function depositFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const storage = targetId === null ? null : getStructure(state, targetId);
  if (
    storage?.kind !== "STORAGE" ||
    creature.groupId !== storage.groupId ||
    creature.inventory.food <= 0 ||
    inventorySpace(storage.inventory) <= 0
  ) {
    return;
  }
  const quantity = Math.min(
    Math.max(1, creature.inventory.food - 1),
    inventorySpace(storage.inventory),
  );
  creature.inventory.food -= quantity;
  storage.inventory.food += quantity;
  const group = getGroup(state, storage.groupId);
  const event = emitDomainEvent(state, {
    type: "FOOD_DEPOSITED",
    actorIds: [creature.id],
    targetIds: [storage.id],
    groupIds: [storage.groupId],
    locationTileIndex: storage.tileIndex,
    resourceKind: "FOOD",
    quantity,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} deposited ${quantity} food in the shared store.`,
  });
  if (group) {
    group.sharingNorm = clamp(group.sharingNorm + 70 * quantity, -UNIT_MAX, UNIT_MAX);
  }
  for (const memberId of group?.memberIds ?? []) {
    if (memberId !== creature.id) {
      changeRelationship(
        state,
        memberId,
        creature.id,
        { trust: 80 * quantity, familiarity: 25 },
        event.id,
      );
    }
  }
}

function withdrawFood(
  state: SimulationState,
  creature: CreatureState,
  targetId: number | null,
): void {
  const storage = targetId === null ? null : getStructure(state, targetId);
  if (
    storage?.kind !== "STORAGE" ||
    creature.groupId !== storage.groupId ||
    storage.inventory.food <= 0 ||
    inventorySpace(creature.inventory) <= 0
  ) {
    return;
  }
  storage.inventory.food -= 1;
  creature.inventory.food += 1;
  emitDomainEvent(state, {
    type: "FOOD_WITHDRAWN",
    actorIds: [creature.id],
    targetIds: [storage.id],
    groupIds: [storage.groupId],
    locationTileIndex: storage.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} withdrew food under the group's hunger rule.`,
  });
}

function attackCreature(
  state: SimulationState,
  attacker: CreatureState,
  targetId: number | null,
): void {
  const target = targetId === null ? null : getCreature(state, targetId);
  if (!target?.alive) {
    return;
  }
  const hitRoll = keyedRandomUnit(
    state.seed,
    "combat-hit",
    state.tick,
    attacker.id,
    target.id,
    attacker.actionCounts.ATTACK,
  );
  const hitThreshold = clamp(
    5_200 +
      attacker.skills.combat / 4 -
      target.skills.combat / 5 +
      (attacker.health - target.health) / 10,
    1_800,
    8_600,
  );
  const hit = hitRoll <= hitThreshold;
  const damage = hit
    ? 420 +
      (keyedRandomU32(
        state.seed,
        "combat-damage",
        state.tick,
        attacker.id,
        target.id,
        attacker.actionCounts.ATTACK,
      ) %
        760) +
      Math.floor(attacker.skills.combat / 28)
    : 0;
  target.health = clamp(target.health - damage, 1_200, UNIT_MAX);
  state.metrics.attacks += 1;
  const evidence =
    relationshipFrom(state, attacker.id, target.id)?.significantEventIds.slice(-2) ?? [];
  const event = emitDomainEvent(state, {
    type: "CREATURE_ATTACKED",
    actorIds: [attacker.id],
    targetIds: [target.id],
    groupIds: [attacker.groupId, target.groupId].filter(
      (groupId): groupId is number => groupId !== null,
    ),
    locationTileIndex: attacker.tileIndex,
    quantity: damage,
    causedByEventIds: evidence,
    decisionRecordIds: currentDecisionIds(attacker),
    importance: 55 + Math.floor(damage / 100),
    summary: hit
      ? `${attacker.name} struck ${target.name}, causing ${damage} injury.`
      : `${attacker.name} confronted ${target.name}, but the blow missed.`,
  });
  emitDomainEvent(state, {
    type: "CONFRONTATION_AFTERMATH",
    actorIds: [attacker.id],
    targetIds: [target.id],
    groupIds: [attacker.groupId, target.groupId].filter(
      (groupId): groupId is number => groupId !== null,
    ),
    locationTileIndex: target.tileIndex,
    quantity: target.health,
    causedByEventIds: [event.id],
    decisionRecordIds: currentDecisionIds(attacker),
    importance: 32,
    summary: `${target.name} remained at ${Math.floor(target.health / 100)}% health after ${attacker.name}'s confrontation.`,
  });
  changeRelationship(
    state,
    target.id,
    attacker.id,
    {
      trust: -1_400,
      fear: 1_100 + damage,
      rivalry: 1_250,
      familiarity: 250,
    },
    event.id,
  );
  changeRelationship(
    state,
    attacker.id,
    target.id,
    { rivalry: -3_200, familiarity: 100 },
    event.id,
  );
  addMemory(
    state,
    target,
    "HARM_RECEIVED",
    attacker.id,
    attacker.tileIndex,
    -8_000,
    8_500,
    [event.id],
  );
  target.nextDecisionTick = Math.min(target.nextDecisionTick, state.tick + 1);
  const existingFight = state.historyEvents.some(
    (history) =>
      history.type === "CONFRONTATION" &&
      state.tick - history.tick < 120 &&
      (history.actorIds.includes(attacker.id) || history.actorIds.includes(target.id)),
  );
  if (!existingFight) {
    addHistory(
      state,
      "CONFRONTATION",
      `${attacker.name} confronted ${target.name}`,
      event.summary,
      [event.id, ...evidence],
      [attacker.id, target.id],
      [attacker.groupId, target.groupId].filter(
        (groupId): groupId is number => groupId !== null,
      ),
      58,
    );
  }
}

function joinGroup(
  state: SimulationState,
  creature: CreatureState,
  groupId: number | null,
): void {
  if (groupId === null || creature.groupId !== null) {
    return;
  }
  const group = getGroup(state, groupId);
  if (!group || creature.traits.sociability < 3_500) {
    return;
  }
  let acceptance = creature.skills.foraging + creature.traits.sociability;
  for (const memberId of group.memberIds) {
    acceptance += relationshipFrom(state, memberId, creature.id)?.trust ?? 0;
  }
  if (acceptance < 4_000) {
    return;
  }
  creature.groupId = group.id;
  group.memberIds.push(creature.id);
  group.memberIds.sort((a, b) => a - b);
  const event = emitDomainEvent(state, {
    type: "CREATURE_JOINED_GROUP",
    actorIds: [creature.id],
    groupIds: [group.id],
    locationTileIndex: group.homeTileIndex,
    decisionRecordIds: currentDecisionIds(creature),
    importance: 45,
    summary: `${creature.name} joined the ${group.name} group.`,
  });
  group.majorEventIds.push(event.id);
}

type ActionResolver = (
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
) => void;

const noActionResolution: ActionResolver = () => {};

const resolveEat: ActionResolver = (state, creature) => {
  if (creature.inventory.food <= 0) return;
  creature.inventory.food -= 1;
  creature.needs.hunger = clampUnit(creature.needs.hunger - 5_300);
  creature.health = clampUnit(creature.health + 180);
  emitDomainEvent(state, {
    type: "FOOD_EATEN",
    actorIds: [creature.id],
    groupIds: creature.groupId === null ? [] : [creature.groupId],
    locationTileIndex: creature.tileIndex,
    resourceKind: "FOOD",
    quantity: 1,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} ate one food.`,
  });
};

const resolveRest: ActionResolver = (_state, creature) => {
  creature.needs.fatigue = clampUnit(creature.needs.fatigue - 5_200);
  creature.health = clampUnit(creature.health + 120);
};

const resolveGuard: ActionResolver = (state, creature, action) => {
  const structure =
    action.targetEntityId === null ? null : getStructure(state, action.targetEntityId);
  emitDomainEvent(state, {
    type: "CREATURE_GUARDED",
    actorIds: [creature.id],
    targetIds: structure ? [structure.id] : [],
    groupIds: creature.groupId === null ? [] : [creature.groupId],
    locationTileIndex: structure?.tileIndex ?? creature.tileIndex,
    decisionRecordIds: currentDecisionIds(creature),
    summary: `${creature.name} completed a watch at the shared store.`,
  });
};

const resolveFlee: ActionResolver = (state, creature, action) => {
  const threat =
    action.targetEntityId === null ? null : getCreature(state, action.targetEntityId);
  emitDomainEvent(state, {
    type: "CREATURE_FLED",
    actorIds: [creature.id],
    targetIds: threat ? [threat.id] : [],
    groupIds: creature.groupId === null ? [] : [creature.groupId],
    locationTileIndex: creature.tileIndex,
    decisionRecordIds: currentDecisionIds(creature),
    importance: 28,
    summary: `${creature.name} fled${threat ? ` from ${threat.name}` : ""}.`,
  });
};

const ACTION_RESOLVERS: Record<ActionKind, ActionResolver> = {
  EXPLORE: noActionResolution,
  GATHER_FOOD: (state, creature, action) => gatherResource(state, creature, action, "FOOD"),
  GATHER_MATERIAL: (state, creature, action) =>
    gatherResource(state, creature, action, "MATERIAL"),
  EAT: resolveEat,
  REST: resolveRest,
  SHARE: (state, creature, action) => shareFood(state, creature, action.targetEntityId),
  KEEP: noActionResolution,
  STEAL: (state, creature, action) => stealFood(state, creature, action.targetEntityId),
  DEPOSIT: (state, creature, action) => depositFood(state, creature, action.targetEntityId),
  WITHDRAW: (state, creature, action) =>
    withdrawFood(state, creature, action.targetEntityId),
  BUILD_STORAGE: (state, creature) => buildStorage(state, creature),
  GUARD: resolveGuard,
  ATTACK: (state, creature, action) =>
    attackCreature(state, creature, action.targetEntityId),
  FLEE: resolveFlee,
  JOIN_GROUP: (state, creature, action) =>
    joinGroup(state, creature, action.targetEntityId),
};

function resolveAction(
  state: SimulationState,
  creature: CreatureState,
  action: ActiveAction,
): void {
  ACTION_RESOLVERS[action.kind](state, creature, action);
}
