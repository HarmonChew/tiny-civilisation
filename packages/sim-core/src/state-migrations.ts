import { desireForAction, desireStrength, planForAction } from "./desires.js";
import { classifyAttentionTier, createEventClusterKey } from "./event-attention.js";
import { claimInteractionSlot } from "./interaction-slots.js";
import { findPath } from "./pathfinding.js";
import { captureReasonFact, selectStrongestReason } from "./reason-facts.js";
import type {
  ActionKind,
  CreatureState,
  DecisionCandidate,
  DecisionRecord,
  DomainEvent,
  SimulationState,
  UtilityFactor,
} from "./types.js";
import { SIMULATION_STATE_VERSION } from "./versions.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Legacy simulation state ${key} must be an array.`);
  }
  return value;
}

function enrichFactor(
  state: SimulationState,
  creature: CreatureState,
  factor: UnknownRecord,
  targetId: number | null,
  decisionTick: number,
): UtilityFactor {
  const key = typeof factor.key === "string" ? factor.key : "retained factor";
  const contribution =
    typeof factor.contribution === "number" ? Math.round(factor.contribution) : 0;
  const evidenceEventIds = Array.isArray(factor.evidenceEventIds)
    ? factor.evidenceEventIds.filter(
        (value): value is number => Number.isSafeInteger(value) && value > 0,
      )
    : [];
  const fact = captureReasonFact(
    state,
    creature,
    key,
    contribution,
    evidenceEventIds,
    targetId,
  );
  if (fact) fact.capturedAtTick = decisionTick;
  return { key, contribution, evidenceEventIds, fact };
}

function enrichDecision(state: SimulationState, value: UnknownRecord): DecisionRecord {
  const actor = state.creatures.find((creature) => creature.id === value.actorId);
  if (!actor) throw new Error("Legacy decision references a missing actor.");
  const tick = typeof value.tick === "number" ? value.tick : state.tick;
  const candidates = (Array.isArray(value.candidates) ? value.candidates : []).map(
    (candidateValue): DecisionCandidate => {
      if (!isRecord(candidateValue) || typeof candidateValue.action !== "string") {
        throw new Error("Legacy decision contains an invalid candidate.");
      }
      const action = candidateValue.action as ActionKind;
      const targetEntityId =
        typeof candidateValue.targetEntityId === "number"
          ? candidateValue.targetEntityId
          : null;
      const factors = (
        Array.isArray(candidateValue.factors) ? candidateValue.factors : []
      ).map((factorValue) =>
        enrichFactor(
          state,
          actor,
          isRecord(factorValue) ? factorValue : {},
          targetEntityId,
          tick,
        ),
      );
      return {
        action,
        desire: desireForAction(state, actor, action),
        plan: planForAction(action),
        targetEntityId,
        targetTileIndex:
          typeof candidateValue.targetTileIndex === "number"
            ? candidateValue.targetTileIndex
            : null,
        utility:
          typeof candidateValue.utility === "number"
            ? Math.round(candidateValue.utility)
            : factors.reduce((total, factor) => total + factor.contribution, 0),
        factors,
      };
    },
  );
  const selectedAction = value.selectedAction as ActionKind;
  const selected =
    candidates.find(
      (candidate) =>
        candidate.action === selectedAction &&
        candidate.targetEntityId ===
          (typeof value.selectedTargetId === "number" ? value.selectedTargetId : null),
    ) ?? candidates[0];
  if (!selected) throw new Error("Legacy decision has no candidate.");
  return {
    ...(value as unknown as DecisionRecord),
    selectedDesire: selected.desire,
    selectedPlan: selected.plan,
    strongestReason: selectStrongestReason(selected.factors),
    candidates,
  };
}

function enrichEvent(value: UnknownRecord): DomainEvent {
  const importance = typeof value.importance === "number" ? value.importance : 10;
  const event = {
    ...(value as unknown as DomainEvent),
    attentionTier: classifyAttentionTier(importance),
    clusterKey: "",
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
  };
  event.clusterKey = createEventClusterKey(event);
  return event;
}

/** Deterministically upgrades the authoritative v1 shape without claiming v1 hash parity. */
export function migrateSimulationState(value: unknown): SimulationState {
  if (!isRecord(value)) throw new Error("Simulation state must be an object.");
  if (value.schemaVersion === SIMULATION_STATE_VERSION) {
    return value as unknown as SimulationState;
  }
  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported simulation state version ${String(value.schemaVersion)}; expected 1 or ${SIMULATION_STATE_VERSION}.`,
    );
  }
  const migrated = cloneJson(value);
  if (!isRecord(migrated)) throw new Error("Legacy simulation state is invalid.");
  migrated.schemaVersion = SIMULATION_STATE_VERSION;
  const creatures = requireArray(migrated, "creatures");
  const decisions = requireArray(migrated, "decisionRecords");
  const events = requireArray(migrated, "domainEvents");
  const configuration = migrated.configuration;
  if (!isRecord(configuration)) {
    throw new Error("Legacy simulation state configuration must be an object.");
  }
  configuration.maxIntentHistoryPerCreature = 32;
  configuration.maxRouteSamplesPerCreature = 24;
  const metrics = migrated.metrics;
  if (!isRecord(metrics)) {
    throw new Error("Legacy simulation state metrics must be an object.");
  }
  metrics.interactionContentions = 0;
  metrics.failedInteractionClaims = 0;

  for (const creatureValue of creatures) {
    if (!isRecord(creatureValue)) throw new Error("Legacy creature must be an object.");
    creatureValue.activeDesire = null;
    creatureValue.activePlan = null;
    creatureValue.intentHistory = [];
    creatureValue.recentRoute = [
      {
        tick: typeof migrated.tick === "number" ? migrated.tick : 0,
        tileIndex: creatureValue.tileIndex,
        x: creatureValue.x,
        y: creatureValue.y,
      },
    ];
    const activeAction = creatureValue.activeAction;
    if (isRecord(activeAction)) activeAction.interactionClaim = null;
  }
  const state = migrated as unknown as SimulationState;
  state.domainEvents = events.map((event) => enrichEvent(isRecord(event) ? event : {}));
  state.decisionRecords = decisions.map((decision) =>
    enrichDecision(state, isRecord(decision) ? decision : {}),
  );

  for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
    const action = creature.activeAction;
    const goal = creature.activeGoal;
    if (!action || !goal) continue;
    const decision = state.decisionRecords.find(
      (record) => record.id === goal.decisionRecordId,
    );
    const desire =
      decision?.selectedDesire ?? desireForAction(state, creature, action.kind);
    const plan = decision?.selectedPlan ?? planForAction(action.kind);
    const reason = decision?.strongestReason ?? null;
    creature.activeDesire = {
      kind: desire,
      subjectEntityId: action.targetEntityId,
      startedAtTick: goal.selectedAtTick,
      minimumCommitUntilTick: Math.max(goal.minimumCommitUntilTick, state.tick),
      nextReconsiderationTick: Math.max(goal.nextReconsiderationTick, state.tick),
      strength: desireStrength(creature, desire),
      selectedByDecisionId: goal.decisionRecordId,
    };
    const anchorTile = action.targetTileIndex ?? creature.tileIndex;
    const claim = claimInteractionSlot(
      state,
      creature,
      action.kind,
      action.targetEntityId,
      anchorTile,
    );
    if (claim) {
      const path = findPath(state.world, creature.tileIndex, claim.tileIndex);
      if (path.length > 0) {
        action.interactionClaim = claim;
        action.targetTileIndex = claim.tileIndex;
        action.path = path;
        action.pathIndex = path.length <= 1 ? path.length : 1;
        goal.targetTileIndex = claim.tileIndex;
      }
    }
    creature.activePlan = {
      kind: plan,
      desireKind: desire,
      targetEntityId: action.targetEntityId,
      targetTileIndex: action.targetTileIndex,
      startedAtTick: goal.selectedAtTick,
      status: "ACTIVE",
      selectedByDecisionId: goal.decisionRecordId,
      expectedUtility: goal.expectedUtility,
      strongestReason: reason,
      interactionClaim: action.interactionClaim,
    };
    creature.intentHistory = [
      {
        tick: goal.selectedAtTick,
        desire,
        plan,
        status: "ACTIVE",
        reason,
      },
    ];
  }
  return state;
}
