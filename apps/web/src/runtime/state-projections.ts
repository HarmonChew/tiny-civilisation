import type {
  CommandRejectionReason,
  ScheduledPlayerCommand,
  SimulationState,
} from "@tiny-civ/sim-core";
import type { RuntimeInterventionOutcomeProjection } from "./types";

export const MAX_PROJECTED_INTERVENTION_OUTCOMES = 256;

function rejectionGuidance(reason: CommandRejectionReason): string {
  switch (reason) {
    case "OCCUPIED_TILE":
      return "The target tile was occupied by a creature, resource, or structure. Choose an empty tile and try again.";
    case null:
      return "The simulation rejected this intervention. Review the target and try again.";
  }
}

export function projectInterventionOutcomes(
  state: SimulationState,
  commands: readonly ScheduledPlayerCommand[],
): readonly RuntimeInterventionOutcomeProjection[] {
  if (commands.length > MAX_PROJECTED_INTERVENTION_OUTCOMES) {
    throw new RangeError(
      `Intervention outcome queries cannot contain more than ${MAX_PROJECTED_INTERVENTION_OUTCOMES.toString()} commands.`,
    );
  }
  const eventByCommandId = new Map(
    state.domainEvents
      .filter((event) => event.commandId !== null && event.commandOutcome !== null)
      .map((event) => [event.commandId as number, event] as const),
  );
  return commands.map((command) => {
    const event = eventByCommandId.get(command.commandId);
    if (!event || event.commandOutcome === null) {
      return { commandId: command.commandId, outcome: null };
    }
    return {
      commandId: command.commandId,
      outcome: {
        status: event.commandOutcome,
        appliedAtTick: command.applyAtTick,
        resolvedTileIndex: command.tileIndex,
        quantity: event.quantity,
        blocked: command.blocked,
        eventIds: [event.id],
        reason:
          event.commandOutcome === "REJECTED"
            ? rejectionGuidance(event.commandRejectionReason)
            : null,
      },
    };
  });
}
