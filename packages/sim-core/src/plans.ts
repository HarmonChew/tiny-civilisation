import type {
  ActionKind,
  ActiveDesire,
  ActivePlan,
  CreatureState,
  DecisionCandidate,
  PlanStatus,
  SimulationState,
} from "./types.js";

const EMERGENCY_ACTIONS = new Set<ActionKind>([
  "EAT",
  "DRINK",
  "GATHER_FOOD",
  "GATHER_WATER",
  "WITHDRAW",
  "STEAL",
  "FLEE",
]);

function compareCandidates(left: DecisionCandidate, right: DecisionCandidate): number {
  return (
    right.utility - left.utility ||
    left.desire.localeCompare(right.desire) ||
    left.plan.localeCompare(right.plan) ||
    left.action.localeCompare(right.action) ||
    (left.targetEntityId ?? -1) - (right.targetEntityId ?? -1) ||
    (left.targetTileIndex ?? -1) - (right.targetTileIndex ?? -1)
  );
}

function bestUtility(candidates: readonly DecisionCandidate[]): number {
  return candidates.reduce(
    (highest, candidate) => Math.max(highest, candidate.utility),
    Number.NEGATIVE_INFINITY,
  );
}

/**
 * Selects desire, then plan, then physical action. Each tier uses stable
 * lexical/entity tie breaks, so caller insertion order is never authoritative.
 */
export function rankHierarchicalCandidates(
  candidates: readonly DecisionCandidate[],
  activeDesire: ActiveDesire | null,
  activePlan: ActivePlan | null,
  tick: number,
  emergency: boolean,
): DecisionCandidate[] {
  const ordered = [...candidates].sort(compareCandidates);
  if (ordered.length === 0) return [];

  const emergencyCandidates = emergency
    ? ordered.filter((candidate) => EMERGENCY_ACTIONS.has(candidate.action))
    : [];
  const eligible = emergencyCandidates.length > 0 ? emergencyCandidates : ordered;
  const committed =
    !emergency && activeDesire !== null && tick < activeDesire.minimumCommitUntilTick
      ? eligible.filter((candidate) => candidate.desire === activeDesire.kind)
      : [];
  const desirePool = committed.length > 0 ? committed : eligible;

  const byDesire = new Map<string, DecisionCandidate[]>();
  for (const candidate of desirePool) {
    const group = byDesire.get(candidate.desire) ?? [];
    group.push(candidate);
    byDesire.set(candidate.desire, group);
  }
  const selectedDesire = [...byDesire.entries()]
    .map(([desire, group]) => ({
      desire,
      score:
        bestUtility(group) +
        (activeDesire?.kind === desire
          ? tick < activeDesire.nextReconsiderationTick
            ? 1_100
            : 250
          : 0),
    }))
    .sort(
      (left, right) => right.score - left.score || left.desire.localeCompare(right.desire),
    )[0]!.desire;

  const selectedDesireCandidates = desirePool.filter(
    (candidate) => candidate.desire === selectedDesire,
  );
  const byPlan = new Map<string, DecisionCandidate[]>();
  for (const candidate of selectedDesireCandidates) {
    const group = byPlan.get(candidate.plan) ?? [];
    group.push(candidate);
    byPlan.set(candidate.plan, group);
  }
  const selectedPlan = [...byPlan.entries()]
    .map(([plan, group]) => ({
      plan,
      score:
        bestUtility(group) +
        (activePlan?.kind === plan && activePlan.status !== "BLOCKED" ? 700 : 0),
    }))
    .sort(
      (left, right) => right.score - left.score || left.plan.localeCompare(right.plan),
    )[0]!.plan;

  const selectedPlanCandidates = selectedDesireCandidates
    .filter((candidate) => candidate.plan === selectedPlan)
    .sort(compareCandidates);
  const selectedKeys = new Set(selectedPlanCandidates);
  return [
    ...selectedPlanCandidates,
    ...ordered.filter((candidate) => !selectedKeys.has(candidate)),
  ];
}

export function recordPlanTransition(
  state: SimulationState,
  creature: CreatureState,
  status: PlanStatus,
): void {
  const plan = creature.activePlan;
  if (!plan) return;
  plan.status = status;
  const latest = creature.intentHistory.at(-1);
  if (
    latest?.tick === state.tick &&
    latest.desire === plan.desireKind &&
    latest.plan === plan.kind &&
    latest.status === status
  ) {
    return;
  }
  creature.intentHistory.push({
    tick: state.tick,
    desire: plan.desireKind,
    plan: plan.kind,
    status,
    reason: plan.strongestReason,
  });
  if (creature.intentHistory.length > state.configuration.maxIntentHistoryPerCreature) {
    creature.intentHistory.splice(
      0,
      creature.intentHistory.length - state.configuration.maxIntentHistoryPerCreature,
    );
  }
}

export function planCompletedAfterAction(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
): boolean {
  if (creature.activePlan?.kind !== "COMPLETE_STORAGE") return true;
  if (action !== "GATHER_MATERIAL" && action !== "BUILD_STORAGE") return true;
  if (creature.groupId === null) return true;
  return state.structures.some(
    (structure) => structure.groupId === creature.groupId && structure.kind === "STORAGE",
  );
}
