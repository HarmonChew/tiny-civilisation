import { emitDomainEvent, historicallyProtectedDecisionIds } from "../events.js";
import {
  desireForAction,
  desireStrength,
  desireSupportsAction,
  planForAction,
} from "../desires.js";
import {
  attemptInteractionSlotClaim,
  interactionCrowding,
  requiresInteractionClaim,
} from "../interaction-slots.js";
import { findNearestWalkable } from "../navigation.js";
import {
  findPath,
  manhattanDistance,
  tileCoordinates,
  tileIndexAt,
} from "../pathfinding.js";
import { rankHierarchicalCandidates, recordPlanTransition } from "../plans.js";
import { keyedRandomU32, keyedRandomUnit } from "../rng.js";
import { captureReasonFact, selectStrongestReason } from "../reason-facts.js";
import { relationshipFrom } from "../social.js";
import { entityTile, getCreature, getGroup, getStructure } from "../tick-context.js";
import type {
  ActionKind,
  CreatureState,
  DecisionCandidate,
  DecisionRecord,
  DecisionSwitchReason,
  DomainEventType,
  RelationshipEdge,
  ResourceKind,
  ResourceNode,
  SimulationState,
  UtilityFactor,
} from "../types.js";
import {
  UNIT_MAX,
  clamp,
  groupStorage,
  inventorySpace,
  removeGuardAssignment,
} from "./shared.js";

function factor(
  key: string,
  contribution: number,
  evidenceEventIds: number[] = [],
): UtilityFactor {
  return {
    key,
    contribution: Math.round(contribution),
    evidenceEventIds: [...evidenceEventIds],
    fact: null,
  };
}

function scoredCandidate(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: number | null,
  targetTileIndex: number | null,
  factors: UtilityFactor[],
): DecisionCandidate {
  const noise =
    (keyedRandomUnit(
      state.seed,
      `decision-${action}`,
      state.tick,
      creature.id,
      targetEntityId ?? targetTileIndex ?? 0,
    ) %
      161) -
    80;
  const crowding =
    targetTileIndex === null
      ? null
      : interactionCrowding(state, action, targetEntityId, targetTileIndex);
  const crowdingPenalty = crowding
    ? Math.round((crowding.claimed * 900) / Math.max(1, crowding.capacity))
    : 0;
  const allFactors = [
    ...factors,
    ...(crowdingPenalty > 0 ? [factor("crowded interaction", -crowdingPenalty)] : []),
    factor("bounded decision variation", noise),
  ].map((item) => ({
    ...item,
    fact: captureReasonFact(
      state,
      creature,
      item.key,
      item.contribution,
      item.evidenceEventIds,
      targetEntityId,
    ),
  }));
  return {
    action,
    desire: desireForAction(state, creature, action, targetEntityId),
    plan: planForAction(action),
    targetEntityId,
    targetTileIndex,
    utility: allFactors.reduce(
      (total, utilityFactor) => total + utilityFactor.contribution,
      0,
    ),
    factors: allFactors,
  };
}

function nearestResourceCandidates(
  state: SimulationState,
  creature: CreatureState,
  kind: ResourceKind,
): ResourceNode[] {
  return state.resourceNodes
    .filter((node) => node.kind === kind && node.currentStock > 0)
    .sort(
      (left, right) =>
        manhattanDistance(state.world, creature.tileIndex, left.tileIndex) -
          manhattanDistance(state.world, creature.tileIndex, right.tileIndex) ||
        left.id - right.id,
    )
    .slice(0, 2);
}

function recentEvidence(edge: RelationshipEdge | null): number[] {
  if (!edge || edge.significantEventIds.length === 0) {
    return [];
  }
  return edge.significantEventIds.slice(-2);
}

function recentInterventionEvidence(
  state: SimulationState,
  targetEntityId: number,
): number[] {
  const earliestTick = state.tick - 120;
  for (let index = state.domainEvents.length - 1; index >= 0; index -= 1) {
    const event = state.domainEvents[index];
    if (!event) continue;
    if (event.tick < earliestTick) break;
    if (event.commandOutcome === "APPLIED" && event.targetIds.includes(targetEntityId)) {
      return [event.id];
    }
  }
  return [];
}

function findFleeTile(
  state: SimulationState,
  creature: CreatureState,
  threat: CreatureState,
): number {
  const position = tileCoordinates(state.world, creature.tileIndex);
  const threatPosition = tileCoordinates(state.world, threat.tileIndex);
  const xDirection = position.x >= threatPosition.x ? 1 : -1;
  const yDirection = position.y >= threatPosition.y ? 1 : -1;
  const preferred = tileIndexAt(
    state.world,
    clamp(position.x + xDirection * 7, 1, state.world.width - 2),
    clamp(position.y + yDirection * 5, 1, state.world.height - 2),
  );
  return findNearestWalkable(state, preferred);
}

function ticksSinceActorEvent(
  state: SimulationState,
  type: DomainEventType,
  actorId: number,
  targetId: number | null = null,
): number {
  for (let index = state.domainEvents.length - 1; index >= 0; index -= 1) {
    const event = state.domainEvents[index];
    if (
      event?.type === type &&
      event.actorIds.includes(actorId) &&
      (targetId === null || event.targetIds.includes(targetId))
    ) {
      return state.tick - event.tick;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function generateCandidates(
  state: SimulationState,
  creature: CreatureState,
): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = [];
  const hunger = creature.needs.hunger;
  const fatigue = creature.needs.fatigue;
  const space = inventorySpace(creature.inventory);
  const ownGroup = getGroup(state, creature.groupId ?? -1);
  const ownStorage = groupStorage(state, creature.groupId);

  if (creature.inventory.food > 0 && hunger >= 2_000) {
    candidates.push(
      scoredCandidate(state, creature, "EAT", null, creature.tileIndex, [
        factor("eating opportunity", 900),
        factor("personal hunger", (hunger * 11) / 10),
        factor("low health", (UNIT_MAX - creature.health) / 4),
      ]),
    );
  }

  if (space > 0 && (hunger >= 2_500 || creature.inventory.food === 0)) {
    for (const node of nearestResourceCandidates(state, creature, "FOOD")) {
      const distance = manhattanDistance(state.world, creature.tileIndex, node.tileIndex);
      candidates.push(
        scoredCandidate(state, creature, "GATHER_FOOD", node.id, node.tileIndex, [
          factor("survival work", 1_300),
          factor("personal hunger", (hunger * 4) / 5),
          factor("empty food reserve", creature.inventory.food === 0 ? 1_300 : 0),
          factor("foraging confidence", creature.skills.foraging / 5),
          factor(
            "known stock",
            Math.min(1_000, node.currentStock * 35),
            recentInterventionEvidence(state, node.id),
          ),
          factor("travel cost", -distance * 52),
        ]),
      );
    }
  }

  if (fatigue >= 2_400) {
    const restTile = ownGroup?.homeTileIndex ?? creature.tileIndex;
    const distance = manhattanDistance(state.world, creature.tileIndex, restTile);
    candidates.push(
      scoredCandidate(state, creature, "REST", null, restTile, [
        factor("need for rest", fatigue),
        factor("familiar home", ownGroup ? 700 : 100),
        factor("travel cost", -distance * 35),
        factor("urgent hunger", hunger > 8_000 ? -2_500 : 0),
      ]),
    );
  }

  if (creature.inventory.food > 0) {
    const recipients = state.creatures
      .filter(
        (other) =>
          other.alive &&
          other.id !== creature.id &&
          other.needs.hunger >= 5_300 &&
          (creature.traits.generosity >= 3_200 ||
            (relationshipFrom(state, creature.id, other.id)?.trust ?? 0) >= 2_500) &&
          manhattanDistance(state.world, creature.tileIndex, other.tileIndex) <= 7,
      )
      .sort((left, right) => right.needs.hunger - left.needs.hunger || left.id - right.id)
      .slice(0, 2);
    for (const recipient of recipients) {
      const edge = relationshipFrom(state, creature.id, recipient.id);
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        recipient.tileIndex,
      );
      candidates.push(
        scoredCandidate(state, creature, "SHARE", recipient.id, recipient.tileIndex, [
          factor("sharing opportunity", 450),
          factor("generous disposition", (creature.traits.generosity * 2) / 5),
          factor("recipient hunger", (recipient.needs.hunger * 2) / 5),
          factor("trust in recipient", (edge?.trust ?? 0) / 5, recentEvidence(edge)),
          factor("communal expectation", (ownGroup?.sharingNorm ?? 0) / 4),
          factor("own hunger", (-hunger * 7) / 20),
          factor("travel cost", -distance * 45),
        ]),
      );
    }
    const recentlyKept =
      creature.lastActionKind === "KEEP" && state.tick - creature.lastActionTick < 180;
    if (creature.inventory.food >= 2 && hunger < 4_200 && !recentlyKept) {
      candidates.push(
        scoredCandidate(state, creature, "KEEP", null, creature.tileIndex, [
          factor("keep a reserve", 400),
          factor("private preference", (UNIT_MAX - creature.traits.generosity) / 5),
          factor("communal expectation", -(ownGroup?.sharingNorm ?? 0) / 5),
        ]),
      );
    }
  }

  const storageComplete = ownStorage?.kind === "STORAGE" ? ownStorage : null;
  if (
    storageComplete &&
    creature.inventory.food >= 2 &&
    storageComplete.inventory.food < storageComplete.inventory.capacity
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "DEPOSIT",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("communal contribution", 1_000),
          factor("group loyalty", (creature.traits.loyalty * 2) / 5),
          factor("sharing norm", (ownGroup?.sharingNorm ?? 0) / 3),
          factor("surplus food", creature.inventory.food * 350),
          factor("own hunger", (-hunger * 3) / 10),
          factor("travel cost", -distance * 40),
        ],
      ),
    );
  }
  if (
    storageComplete &&
    creature.inventory.food === 0 &&
    hunger >= 5_800 &&
    storageComplete.inventory.food > 0
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "WITHDRAW",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("authorized access", 1_200),
          factor("personal hunger", hunger),
          factor("available group food", storageComplete.inventory.food * 180),
          factor("travel cost", -distance * 45),
        ],
      ),
    );
  }

  if (ownGroup && (!ownStorage || ownStorage.kind === "STORAGE_SITE")) {
    if (space > 0 && creature.inventory.material < 3) {
      for (const node of nearestResourceCandidates(state, creature, "MATERIAL").slice(
        0,
        1,
      )) {
        const distance = manhattanDistance(state.world, creature.tileIndex, node.tileIndex);
        candidates.push(
          scoredCandidate(state, creature, "GATHER_MATERIAL", node.id, node.tileIndex, [
            factor("group needs a store", 2_500),
            factor("group loyalty", (creature.traits.loyalty * 2) / 5),
            factor("material opportunity", 1_000),
            factor("urgent hunger", hunger > 7_000 ? -3_500 : 0),
            factor("travel cost", -distance * 40),
          ]),
        );
      }
    }
    const siteReadyForWork =
      ownStorage?.kind === "STORAGE_SITE" &&
      (ownStorage.material >= ownStorage.materialRequired ||
        creature.inventory.material > 0);
    if (creature.inventory.material > 0 || siteReadyForWork) {
      const targetTile = ownStorage?.tileIndex ?? ownGroup.homeTileIndex;
      const distance = manhattanDistance(state.world, creature.tileIndex, targetTile);
      candidates.push(
        scoredCandidate(
          state,
          creature,
          "BUILD_STORAGE",
          ownStorage?.id ?? null,
          targetTile,
          [
            factor("shared storage opportunity", 2_800),
            factor("carried material", creature.inventory.material * 650),
            factor("group loyalty", (creature.traits.loyalty * 2) / 5),
            factor("construction progress", (ownStorage?.progress ?? 0) / 5),
            factor("urgent hunger", hunger > 7_500 ? -4_000 : 0),
            factor("travel cost", -distance * 42),
          ],
        ),
      );
    }
  }

  const completedStorages = state.structures
    .filter((structure) => structure.kind === "STORAGE" && structure.inventory.food > 0)
    .sort(
      (left, right) =>
        manhattanDistance(state.world, creature.tileIndex, left.tileIndex) -
          manhattanDistance(state.world, creature.tileIndex, right.tileIndex) ||
        left.id - right.id,
    );
  const theftCoolingDown =
    ticksSinceActorEvent(state, "THEFT_COMMITTED", creature.id) < 1_800;
  if (
    inventorySpace(creature.inventory) > 0 &&
    hunger >= 1_200 &&
    (creature.traits.aggression >= 4_500 || hunger >= 7_500) &&
    !theftCoolingDown &&
    completedStorages.length > 0
  ) {
    const target = completedStorages[0];
    if (target) {
      const targetGroup = getGroup(state, target.groupId);
      const unauthorized = creature.groupId !== target.groupId;
      if (unauthorized || hunger >= 8_300) {
        const witnesses = state.creatures.filter(
          (other) =>
            other.alive &&
            other.id !== creature.id &&
            other.groupId === target.groupId &&
            manhattanDistance(state.world, other.tileIndex, target.tileIndex) <= 5,
        );
        const guardPenalty = target.guardIds.length > 0 ? 1_800 : 0;
        const groupFear = Math.max(
          0,
          ...(targetGroup?.memberIds.map(
            (memberId) => relationshipFrom(state, creature.id, memberId)?.fear ?? 0,
          ) ?? []),
        );
        const distance = manhattanDistance(
          state.world,
          creature.tileIndex,
          target.tileIndex,
        );
        candidates.push(
          scoredCandidate(state, creature, "STEAL", target.id, target.tileIndex, [
            factor("desperation", (hunger * 3) / 4),
            factor("aggressive opportunism", (creature.traits.aggression * 9) / 20),
            factor("food in storage", Math.min(2_200, target.inventory.food * 300)),
            factor("outsider access", unauthorized ? 1_800 : -900),
            factor("visible witnesses", -witnesses.length * 180),
            factor("active guard", -Math.min(1_200, guardPenalty)),
            factor("fear of defenders", -groupFear),
            factor("injury risk", -(UNIT_MAX - creature.health) / 2),
            factor("group loyalty", unauthorized ? 0 : -creature.traits.loyalty / 2),
            factor("travel cost", -distance * 48),
          ]),
        );
      }
    }
  }

  if (
    storageComplete &&
    (storageComplete.inventory.food >= 2 ||
      state.tick - storageComplete.completedTick! < 500) &&
    creature.traits.loyalty >= 4_000 &&
    (storageComplete.guardIds.length < 2 || storageComplete.guardIds.includes(creature.id))
  ) {
    const distance = manhattanDistance(
      state.world,
      creature.tileIndex,
      storageComplete.tileIndex,
    );
    candidates.push(
      scoredCandidate(
        state,
        creature,
        "GUARD",
        storageComplete.id,
        storageComplete.tileIndex,
        [
          factor("protect shared storage", 1_250),
          factor("group loyalty", creature.traits.loyalty / 3),
          factor("stored wealth", storageComplete.inventory.food * 170),
          factor("guard already present", -storageComplete.guardIds.length * 900),
          factor("personal fatigue", -fatigue / 4),
          factor("urgent hunger", hunger > 7_000 ? -3_000 : 0),
          factor("travel cost", -distance * 35),
        ],
      ),
    );
  }

  for (const edge of state.relationships) {
    if (edge.fromId !== creature.id || edge.rivalry < 900) {
      continue;
    }
    const target = getCreature(state, edge.toId);
    if (!target?.alive) {
      continue;
    }
    const attackCoolingDown =
      ticksSinceActorEvent(state, "CREATURE_ATTACKED", creature.id, target.id) < 90;
    const grievanceSettling =
      ticksSinceActorEvent(state, "THEFT_WITNESSED", creature.id, target.id) < 30;
    const distance = manhattanDistance(state.world, creature.tileIndex, target.tileIndex);
    if (distance > 8) {
      continue;
    }
    if (
      !attackCoolingDown &&
      !grievanceSettling &&
      creature.health > 3_000 &&
      target.health > 2_500
    ) {
      candidates.push(
        scoredCandidate(state, creature, "ATTACK", target.id, target.tileIndex, [
          factor("aggressive disposition", (creature.traits.aggression * 2) / 5),
          factor("remembered grievance", edge.rivalry, recentEvidence(edge)),
          factor(
            "defend the group",
            creature.groupId !== null && creature.groupId !== target.groupId ? 1_800 : 0,
            recentEvidence(edge),
          ),
          factor("confidence in combat", creature.skills.combat / 5),
          factor("fear of target", -edge.fear / 3, recentEvidence(edge)),
          factor("poor health", -(UNIT_MAX - creature.health) / 2),
          factor("travel cost", -distance * 55),
        ]),
      );
    }
    if (edge.fear >= 1_600 || creature.health < 5_000) {
      const fleeTile = findFleeTile(state, creature, target);
      candidates.push(
        scoredCandidate(state, creature, "FLEE", target.id, fleeTile, [
          factor("fear of aggressor", (edge.fear * 3) / 5, recentEvidence(edge)),
          factor("injury", UNIT_MAX - creature.health),
          factor("escape route", 1_200),
          factor("aggressive disposition", -creature.traits.aggression / 4),
        ]),
      );
    }
  }

  if (creature.groupId === null && creature.traits.sociability >= 3_500) {
    for (const group of state.groups) {
      const distance = manhattanDistance(
        state.world,
        creature.tileIndex,
        group.homeTileIndex,
      );
      if (distance > 14) {
        continue;
      }
      let affinity = 0;
      for (const memberId of group.memberIds) {
        affinity += relationshipFrom(state, creature.id, memberId)?.trust ?? 0;
      }
      candidates.push(
        scoredCandidate(state, creature, "JOIN_GROUP", group.id, group.homeTileIndex, [
          factor("social disposition", creature.traits.sociability / 2),
          factor("known member affinity", affinity / Math.max(1, group.memberIds.length)),
          factor("group safety", group.cohesion / 4),
          factor("loss of autonomy", -(UNIT_MAX - creature.traits.loyalty) / 5),
          factor("travel cost", -distance * 55),
        ]),
      );
    }
  }

  if (candidates.length === 0) {
    const point = tileCoordinates(state.world, creature.tileIndex);
    const xOffset =
      (keyedRandomU32(state.seed, "explore-x", state.tick, creature.id) % 15) - 7;
    const yOffset =
      (keyedRandomU32(state.seed, "explore-y", state.tick, creature.id) % 11) - 5;
    const target = findNearestWalkable(
      state,
      tileIndexAt(
        state.world,
        clamp(point.x + xOffset, 1, state.world.width - 2),
        clamp(point.y + yOffset, 1, state.world.height - 2),
      ),
    );
    candidates.push(
      scoredCandidate(state, creature, "EXPLORE", null, target, [
        factor("no pressing need", 900),
        factor("nearby novelty", 400),
        factor("fatigue", -fatigue / 8),
      ]),
    );
  }

  if (creature.activeGoal) {
    for (const candidate of candidates) {
      if (
        candidate.action === creature.activeGoal.kind &&
        candidate.targetEntityId === creature.activeGoal.targetEntityId
      ) {
        const completion = creature.activeAction?.progress ?? 0;
        const continuation = Math.round(500 + completion / 8);
        candidate.factors.push(factor("goal continuity", continuation));
        candidate.utility += continuation;
      }
    }
  }
  if (creature.activePlan) {
    for (const candidate of candidates) {
      if (
        candidate.plan === creature.activePlan.kind &&
        candidate.targetEntityId === creature.activePlan.targetEntityId
      ) {
        const continuation = 650;
        candidate.factors.push(factor("plan continuity", continuation));
        candidate.utility += continuation;
      }
    }
  }

  return candidates
    .sort(
      (left, right) =>
        right.utility - left.utility ||
        (left.action < right.action ? -1 : left.action > right.action ? 1 : 0) ||
        (left.targetEntityId ?? -1) - (right.targetEntityId ?? -1),
    )
    .slice(0, 10);
}

function targetTileForCandidate(
  state: SimulationState,
  candidate: DecisionCandidate,
): number | null {
  if (candidate.targetTileIndex !== null) {
    return candidate.targetTileIndex;
  }
  if (candidate.targetEntityId === null) {
    return null;
  }
  if (candidate.action === "JOIN_GROUP") {
    return getGroup(state, candidate.targetEntityId)?.homeTileIndex ?? null;
  }
  return entityTile(state, candidate.targetEntityId);
}

function beginAction(
  state: SimulationState,
  creature: CreatureState,
  candidate: DecisionCandidate,
  decisionId: number,
): boolean {
  const previousDesire = creature.activeDesire?.kind ?? null;
  const shouldRetainDesire =
    creature.activeDesire !== null &&
    creature.activeDesire.kind === candidate.desire &&
    desireSupportsAction(creature.activeDesire.kind, candidate.action);
  if (!shouldRetainDesire) {
    creature.activeDesire = {
      kind: candidate.desire,
      subjectEntityId: candidate.targetEntityId,
      startedAtTick: state.tick,
      minimumCommitUntilTick: state.tick + 36,
      nextReconsiderationTick: state.tick + 72,
      strength: desireStrength(creature, candidate.desire),
      selectedByDecisionId: decisionId,
    };
    emitDomainEvent(state, {
      type: "DESIRE_CHANGED",
      actorIds: [creature.id],
      targetIds: candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
      locationTileIndex: creature.tileIndex,
      decisionRecordIds: [decisionId],
      importance: previousDesire === null ? 18 : 24,
      summary: `${creature.name} now wants to ${candidate.desire.toLowerCase().replaceAll("_", " ")}.`,
    });
  } else if (creature.activeDesire) {
    if (state.tick >= creature.activeDesire.nextReconsiderationTick) {
      creature.activeDesire.nextReconsiderationTick = state.tick + 72;
    }
    creature.activeDesire.strength = desireStrength(creature, candidate.desire);
  }

  const previousPlan = creature.activePlan;
  const shouldRetainPlan =
    previousPlan !== null &&
    previousPlan.kind === candidate.plan &&
    previousPlan.desireKind === candidate.desire &&
    previousPlan.status !== "BLOCKED";
  if (!shouldRetainPlan && previousPlan?.status === "ACTIVE") {
    recordPlanTransition(state, creature, "ABANDONED");
  }

  const anchorTile = targetTileForCandidate(state, candidate) ?? creature.tileIndex;
  const claimAttempt = attemptInteractionSlotClaim(
    state,
    creature,
    candidate.action,
    candidate.targetEntityId,
    anchorTile,
  );
  const claim = claimAttempt.claim;
  const needsClaim = requiresInteractionClaim(candidate.action);
  if (claimAttempt.contended) state.metrics.interactionContentions += 1;
  if (claimAttempt.failed) state.metrics.failedInteractionClaims += 1;
  if (needsClaim && !claim) {
    creature.activePlan = {
      kind: candidate.plan,
      desireKind: candidate.desire,
      targetEntityId: candidate.targetEntityId,
      targetTileIndex: anchorTile,
      startedAtTick: state.tick,
      status: "BLOCKED",
      selectedByDecisionId: decisionId,
      expectedUtility: candidate.utility,
      strongestReason: selectStrongestReason(candidate.factors),
      interactionClaim: null,
    };
    recordPlanTransition(state, creature, "BLOCKED");
    emitDomainEvent(state, {
      type: "PLAN_BLOCKED",
      actorIds: [creature.id],
      targetIds: candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
      locationTileIndex: anchorTile,
      decisionRecordIds: [decisionId],
      importance: 24,
      summary: `${creature.name}'s approach was blocked because every safe position was occupied.`,
    });
    creature.nextDecisionTick = state.tick + 4;
    return false;
  }
  const targetTile = claim?.tileIndex ?? anchorTile;
  const path = findPath(state.world, creature.tileIndex, targetTile);
  if (path.length === 0) {
    state.metrics.invalidPathFailures += 1;
    creature.activeGoal = null;
    creature.activeAction = null;
    creature.activePlan = {
      kind: candidate.plan,
      desireKind: candidate.desire,
      targetEntityId: candidate.targetEntityId,
      targetTileIndex: targetTile,
      startedAtTick: shouldRetainPlan ? previousPlan.startedAtTick : state.tick,
      status: "BLOCKED",
      selectedByDecisionId: decisionId,
      expectedUtility: candidate.utility,
      strongestReason: selectStrongestReason(candidate.factors),
      interactionClaim: null,
    };
    recordPlanTransition(state, creature, "BLOCKED");
    emitDomainEvent(state, {
      type: "PLAN_BLOCKED",
      actorIds: [creature.id],
      targetIds: candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
      locationTileIndex: anchorTile,
      decisionRecordIds: [decisionId],
      importance: 24,
      summary: `${creature.name}'s plan was blocked because no safe route remained.`,
    });
    creature.nextDecisionTick = state.tick + 3;
    return false;
  }
  const decisionInterval =
    12 +
    (keyedRandomU32(
      state.seed,
      "decision-interval",
      state.tick,
      creature.id,
      candidate.targetEntityId ?? targetTile,
    ) %
      13);
  creature.activeGoal = {
    kind: candidate.action,
    targetEntityId: candidate.targetEntityId,
    targetTileIndex: targetTile,
    selectedAtTick: state.tick,
    minimumCommitUntilTick: state.tick + Math.min(18, decisionInterval),
    nextReconsiderationTick: state.tick + decisionInterval,
    expectedUtility: candidate.utility,
    decisionRecordId: decisionId,
  };
  const strongestReason = selectStrongestReason(candidate.factors);
  creature.activePlan = {
    kind: candidate.plan,
    desireKind: candidate.desire,
    targetEntityId: candidate.targetEntityId,
    targetTileIndex: targetTile,
    startedAtTick: shouldRetainPlan ? previousPlan.startedAtTick : state.tick,
    status: "ACTIVE",
    selectedByDecisionId: decisionId,
    expectedUtility: candidate.utility,
    strongestReason,
    interactionClaim: claim,
  };
  if (!shouldRetainPlan || previousPlan.status !== "ACTIVE") {
    recordPlanTransition(state, creature, "ACTIVE");
  }
  if (!shouldRetainPlan) {
    emitDomainEvent(state, {
      type: "PLAN_CHANGED",
      actorIds: [creature.id],
      targetIds: candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
      locationTileIndex: creature.tileIndex,
      decisionRecordIds: [decisionId],
      importance: 18,
      summary: `${creature.name} plans to ${candidate.plan.toLowerCase().replaceAll("_", " ")}.`,
    });
  }
  const phase = path.length <= 1 ? "WORKING" : "MOVING";
  creature.activeAction = {
    kind: candidate.action,
    phase,
    startedAtTick: state.tick,
    targetEntityId: candidate.targetEntityId,
    targetTileIndex: targetTile,
    path,
    pathIndex: path.length <= 1 ? path.length : 1,
    progress: 0,
    workRequired: UNIT_MAX,
    navigationRevision: state.world.navigationRevision,
    interactionClaim: claim,
  };
  if (candidate.action === "GUARD" && candidate.targetEntityId !== null) {
    const structure = getStructure(state, candidate.targetEntityId);
    if (structure && !structure.guardIds.includes(creature.id)) {
      if (structure.guardIds.length >= 2) {
        creature.activeAction = null;
        creature.activeGoal = null;
        if (creature.activePlan) {
          creature.activePlan.interactionClaim = null;
          recordPlanTransition(state, creature, "BLOCKED");
        }
        creature.nextDecisionTick = state.tick + 4;
        return false;
      }
      structure.guardIds.push(creature.id);
      structure.guardIds.sort((left, right) => left - right);
    }
  }
  creature.nextDecisionTick = state.tick + decisionInterval;
  emitDomainEvent(state, {
    type: "ACTION_STARTED",
    actorIds: [creature.id],
    targetIds: candidate.targetEntityId === null ? [] : [candidate.targetEntityId],
    groupIds: creature.groupId === null ? [] : [creature.groupId],
    locationTileIndex: creature.tileIndex,
    decisionRecordIds: [decisionId],
    importance: 2,
    summary: `${creature.name} began ${candidate.action.toLowerCase().replaceAll("_", " ")}.`,
  });
  if (candidate.action === "FLEE") {
    const threat = state.creatures.find((other) => other.id === candidate.targetEntityId);
    emitDomainEvent(state, {
      type: "THREAT_NOTICED",
      actorIds: [creature.id],
      targetIds: threat ? [threat.id] : [],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: creature.tileIndex,
      decisionRecordIds: [decisionId],
      importance: 34,
      summary: `${creature.name} recognised${threat ? ` ${threat.name}` : " a nearby creature"} as a threat and began moving away.`,
    });
  } else if (candidate.action === "ATTACK") {
    const target = state.creatures.find((other) => other.id === candidate.targetEntityId);
    emitDomainEvent(state, {
      type: "CONFRONTATION_APPROACHED",
      actorIds: [creature.id],
      targetIds: target ? [target.id] : [],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: creature.tileIndex,
      decisionRecordIds: [decisionId],
      importance: 38,
      summary: `${creature.name} began closing in${target ? ` on ${target.name}` : " for a confrontation"}.`,
    });
  }
  return true;
}

function recordDecision(
  state: SimulationState,
  creature: CreatureState,
  candidates: DecisionCandidate[],
  switchReason: DecisionSwitchReason,
): DecisionRecord | null {
  const selected = candidates[0];
  if (!selected) {
    return null;
  }
  const record: DecisionRecord = {
    id: state.nextDecisionId++,
    tick: state.tick,
    actorId: creature.id,
    previousAction: creature.activeGoal?.kind ?? null,
    selectedAction: selected.action,
    selectedDesire: selected.desire,
    selectedPlan: selected.plan,
    selectedTargetId: selected.targetEntityId,
    strongestReason: selectStrongestReason(selected.factors),
    switchReason,
    candidates: candidates.slice(0, 5).map((candidate) => ({
      action: candidate.action,
      desire: candidate.desire,
      plan: candidate.plan,
      targetEntityId: candidate.targetEntityId,
      targetTileIndex: candidate.targetTileIndex,
      utility: candidate.utility,
      factors: candidate.factors.map((item) => ({
        key: item.key,
        contribution: item.contribution,
        evidenceEventIds: [...item.evidenceEventIds],
        fact: item.fact
          ? { ...item.fact, sourceEventIds: [...item.fact.sourceEventIds] }
          : null,
      })),
    })),
  };
  state.decisionRecords.push(record);
  while (state.decisionRecords.length > state.configuration.maxDecisionRecords) {
    const protectedDecisionIds = historicallyProtectedDecisionIds(state);
    const removableIndex = state.decisionRecords.findIndex(
      (candidate) => !protectedDecisionIds.has(candidate.id),
    );
    state.decisionRecords.splice(removableIndex < 0 ? 0 : removableIndex, 1);
  }
  return record;
}

function hasEmergency(creature: CreatureState): boolean {
  if (!creature.activeGoal) {
    return false;
  }
  const survivalAction =
    creature.activeGoal.kind === "EAT" ||
    creature.activeGoal.kind === "GATHER_FOOD" ||
    creature.activeGoal.kind === "WITHDRAW" ||
    creature.activeGoal.kind === "STEAL" ||
    creature.activeGoal.kind === "FLEE";
  return creature.needs.hunger >= 9_200 && !survivalAction;
}

function decideCreature(state: SimulationState, creature: CreatureState): void {
  if (!creature.alive) {
    return;
  }
  const emergency = hasEmergency(creature);
  if (
    creature.activeGoal &&
    !emergency &&
    state.tick < creature.activeGoal.minimumCommitUntilTick
  ) {
    creature.nextDecisionTick = creature.activeGoal.minimumCommitUntilTick;
    return;
  }
  const candidates = rankHierarchicalCandidates(
    generateCandidates(state, creature),
    creature.activeDesire,
    creature.activePlan,
    state.tick,
    emergency,
  );
  const selected = candidates[0];
  if (!selected) {
    creature.nextDecisionTick = state.tick + 10;
    return;
  }

  if (creature.activeGoal && !emergency) {
    const sameChoice =
      creature.activeGoal.kind === selected.action &&
      creature.activeGoal.targetEntityId === selected.targetEntityId;
    if (sameChoice || selected.utility <= creature.activeGoal.expectedUtility + 1_100) {
      creature.nextDecisionTick = state.tick + 12;
      creature.activeGoal.nextReconsiderationTick = creature.nextDecisionTick;
      return;
    }
  }

  const switchReason: DecisionSwitchReason = emergency
    ? "EMERGENCY_INTERRUPT"
    : creature.activeGoal
      ? "NEW_OPTION_EXCEEDED_HYSTERESIS"
      : creature.lastActionKind
        ? "GOAL_COMPLETED"
        : "NO_ACTIVE_GOAL";
  const record = recordDecision(state, creature, candidates, switchReason);
  if (!record) {
    creature.nextDecisionTick = state.tick + 10;
    return;
  }
  if (creature.activeAction?.kind === "GUARD") {
    removeGuardAssignment(state, creature);
  }
  creature.activeAction = null;
  creature.activeGoal = null;
  beginAction(state, creature, selected, record.id);
}

export function runScheduledDecisions(state: SimulationState): void {
  const ordered = [...state.creatures].sort((left, right) => left.id - right.id);
  for (const creature of ordered) {
    if (creature.alive && state.tick >= creature.nextDecisionTick) {
      decideCreature(state, creature);
    }
  }
}
