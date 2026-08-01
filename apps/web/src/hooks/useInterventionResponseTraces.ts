import {
  createInterventionResponseTrace,
  observeInterventionResponse,
  type InterventionLogEntryV1,
  type InterventionResponseTrace,
} from "@tiny-civ/sim-core";
import { useEffect, useRef, useState } from "react";
import type { WorldView } from "../model";

interface InterventionResponseTraceOptions {
  readonly streamKey: string;
  readonly commandLog: readonly InterventionLogEntryV1[];
  readonly view: WorldView;
  readonly onMaterialChange?: (commandId: number, trace: InterventionResponseTrace) => void;
}

function materialSignature(trace: InterventionResponseTrace): string {
  return JSON.stringify({
    schemaVersion: trace.schemaVersion,
    phase: trace.phase,
    outcome: trace.outcome,
    windowStartTick: trace.windowStartTick,
    windowEndTick: trace.windowEndTick,
    closedAtTick: trace.closedAtTick,
    closureReason: trace.closureReason,
    responses: trace.responses,
    unclassifiedParticipantIds: trace.unclassifiedParticipantIds,
  });
}

function persistedTraces(
  commandLog: readonly InterventionLogEntryV1[],
): Map<number, InterventionResponseTrace> {
  return new Map(
    commandLog.flatMap((entry) =>
      entry.responseTrace === null
        ? []
        : [[entry.command.commandId, entry.responseTrace] as const],
    ),
  );
}

export function useInterventionResponseTraces({
  streamKey,
  commandLog,
  view,
  onMaterialChange,
}: InterventionResponseTraceOptions): ReadonlyMap<number, InterventionResponseTrace> {
  const [traces, setTraces] = useState<ReadonlyMap<number, InterventionResponseTrace>>(() =>
    persistedTraces(commandLog),
  );
  const workingRef = useRef(persistedTraces(commandLog));
  const pendingPersistenceRef = useRef(new Map<number, string>());
  const streamRef = useRef({ key: streamKey, tick: view.tick });

  useEffect(() => {
    const reset = streamRef.current.key !== streamKey || view.tick < streamRef.current.tick;
    streamRef.current = { key: streamKey, tick: view.tick };
    const working = reset
      ? persistedTraces(commandLog)
      : new Map<number, InterventionResponseTrace>(workingRef.current);
    if (reset) pendingPersistenceRef.current.clear();

    const retainedCommandIds = new Set(commandLog.map((entry) => entry.command.commandId));
    let publish = reset;
    for (const commandId of working.keys()) {
      if (retainedCommandIds.has(commandId)) continue;
      working.delete(commandId);
      pendingPersistenceRef.current.delete(commandId);
      publish = true;
    }

    const participantIds = view.creatures
      .filter((creature) => creature.alive)
      .map((creature) => creature.id)
      .sort((left, right) => left - right);
    const materialChanges: Array<readonly [number, InterventionResponseTrace]> = [];

    for (const entry of [...commandLog].sort(
      (left, right) => left.command.commandId - right.command.commandId,
    )) {
      const commandId = entry.command.commandId;
      const persisted = entry.responseTrace;
      const persistedSignature = persisted === null ? null : materialSignature(persisted);
      const pendingSignature = pendingPersistenceRef.current.get(commandId);
      let previous = working.get(commandId);

      if (pendingSignature !== undefined) {
        if (persistedSignature === pendingSignature) {
          pendingPersistenceRef.current.delete(commandId);
        }
      } else if (persisted !== null) {
        if (!previous || materialSignature(previous) !== persistedSignature) {
          previous = persisted;
          working.set(commandId, persisted);
          publish = true;
        }
      } else if (previous && previous.phase !== "WAITING_FOR_OUTCOME") {
        previous = undefined;
        working.delete(commandId);
        publish = true;
      }

      if (entry.outcome.status === "PENDING") continue;
      const before =
        previous ?? createInterventionResponseTrace(entry.command, participantIds);
      const observed = observeInterventionResponse(before, {
        tick: view.tick,
        width: view.width,
        creatures: view.creatures,
        events: view.events,
      });
      working.set(commandId, observed);
      if (!previous) publish = true;

      if (materialSignature(observed) !== materialSignature(before)) {
        const signature = materialSignature(observed);
        pendingPersistenceRef.current.set(commandId, signature);
        materialChanges.push([commandId, observed]);
        publish = true;
      }
    }

    workingRef.current = working;
    if (publish) setTraces(new Map(working));
    for (const [commandId, trace] of materialChanges) {
      onMaterialChange?.(commandId, trace);
    }
  }, [
    commandLog,
    onMaterialChange,
    streamKey,
    view.creatures,
    view.events,
    view.tick,
    view.width,
  ]);

  return traces;
}
