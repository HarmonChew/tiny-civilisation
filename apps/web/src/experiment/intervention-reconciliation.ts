import {
  settleExperimentIntervention,
  type ExperimentV1,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { projectInterventionOutcomes } from "../runtime/state-projections";
import type { RuntimeInterventionOutcomeProjection } from "../runtime/types";

export function reconcileProjectedInterventions(
  experiment: ExperimentV1,
  branchId: string,
  projections: readonly RuntimeInterventionOutcomeProjection[],
): ExperimentV1 {
  const branch = experiment.branches.find((candidate) => candidate.id === branchId);
  if (!branch) return experiment;
  const outcomeByCommandId = new Map(
    projections.map((projection) => [projection.commandId, projection.outcome] as const),
  );
  let next = experiment;
  for (const entry of branch.commandLog) {
    if (entry.outcome.status !== "PENDING") continue;
    const outcome = outcomeByCommandId.get(entry.command.commandId);
    if (!outcome) continue;
    next = settleExperimentIntervention(next, branchId, entry.command.commandId, outcome);
  }
  return next;
}

export function reconcilePendingInterventions(
  experiment: ExperimentV1,
  branchId: string,
  state: SimulationState,
): ExperimentV1 {
  const branch = experiment.branches.find((candidate) => candidate.id === branchId);
  if (!branch) return experiment;
  const pendingCommands = branch.commandLog
    .filter((entry) => entry.outcome.status === "PENDING")
    .map((entry) => entry.command);
  return reconcileProjectedInterventions(
    experiment,
    branchId,
    projectInterventionOutcomes(state, pendingCommands),
  );
}
