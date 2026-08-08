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

export function interventionResponseMaterialSignature(
  trace: InterventionResponseTrace,
): string {
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

interface TraceStreamToken {
  readonly key: string;
  readonly epoch: number;
}

interface RenderedTraceStream extends TraceStreamToken {
  readonly tick: number;
}

interface QueuedTrace {
  readonly stream: TraceStreamToken;
  readonly trace: InterventionResponseTrace;
}

interface QueuedPublication {
  readonly stream: TraceStreamToken;
  readonly traces: ReadonlyMap<number, InterventionResponseTrace>;
}

function sameStream(left: TraceStreamToken, right: TraceStreamToken): boolean {
  return left.key === right.key && left.epoch === right.epoch;
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
  const persistenceQueueRef = useRef(new Map<number, QueuedTrace>());
  const publicationRef = useRef<QueuedPublication | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const materialChangeCallbackRef = useRef(onMaterialChange);
  const streamRef = useRef({ key: streamKey, tick: view.tick });
  const renderedStreamRef = useRef<RenderedTraceStream>({
    key: streamKey,
    epoch: 0,
    tick: view.tick,
  });
  const renderedBefore = renderedStreamRef.current;
  const renderedStream: RenderedTraceStream = {
    key: streamKey,
    epoch:
      renderedBefore.key !== streamKey || view.tick < renderedBefore.tick
        ? renderedBefore.epoch + 1
        : renderedBefore.epoch,
    tick: view.tick,
  };
  renderedStreamRef.current = renderedStream;
  materialChangeCallbackRef.current = onMaterialChange;

  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      for (const commandId of persistenceQueueRef.current.keys()) {
        pendingPersistenceRef.current.delete(commandId);
      }
      persistenceQueueRef.current.clear();
      publicationRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const reset = streamRef.current.key !== streamKey || view.tick < streamRef.current.tick;
    streamRef.current = { key: streamKey, tick: view.tick };
    const working = reset
      ? persistedTraces(commandLog)
      : new Map<number, InterventionResponseTrace>(workingRef.current);
    if (reset) {
      pendingPersistenceRef.current.clear();
      persistenceQueueRef.current.clear();
      publicationRef.current = null;
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    }

    const retainedCommandIds = new Set(commandLog.map((entry) => entry.command.commandId));
    let publish = reset;
    for (const commandId of working.keys()) {
      if (retainedCommandIds.has(commandId)) continue;
      working.delete(commandId);
      pendingPersistenceRef.current.delete(commandId);
      persistenceQueueRef.current.delete(commandId);
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
      const persistedSignature =
        persisted === null ? null : interventionResponseMaterialSignature(persisted);
      const pendingSignature = pendingPersistenceRef.current.get(commandId);
      let previous = working.get(commandId);

      if (pendingSignature !== undefined) {
        if (persistedSignature === pendingSignature) {
          pendingPersistenceRef.current.delete(commandId);
        }
      } else if (persisted !== null) {
        if (
          !previous ||
          interventionResponseMaterialSignature(previous) !== persistedSignature
        ) {
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

      if (
        interventionResponseMaterialSignature(observed) !==
        interventionResponseMaterialSignature(before)
      ) {
        const signature = interventionResponseMaterialSignature(observed);
        pendingPersistenceRef.current.set(commandId, signature);
        materialChanges.push([commandId, observed]);
        publish = true;
      }
    }

    workingRef.current = working;
    const stream = { key: renderedStream.key, epoch: renderedStream.epoch };
    if (publish) {
      publicationRef.current = { stream, traces: new Map(working) };
    }
    for (const [commandId, trace] of materialChanges) {
      persistenceQueueRef.current.set(commandId, { stream, trace });
    }
    if (
      (publicationRef.current !== null ||
        (onMaterialChange && persistenceQueueRef.current.size > 0)) &&
      flushTimerRef.current === null
    ) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        const currentStream = renderedStreamRef.current;
        const publication = publicationRef.current;
        publicationRef.current = null;
        if (publication && sameStream(publication.stream, currentStream)) {
          setTraces(publication.traces);
        }

        const queued = [...persistenceQueueRef.current.entries()].sort(
          ([left], [right]) => left - right,
        );
        const callback = materialChangeCallbackRef.current;
        for (const [commandId, queuedTrace] of queued) {
          if (!sameStream(queuedTrace.stream, currentStream)) {
            persistenceQueueRef.current.delete(commandId);
            pendingPersistenceRef.current.delete(commandId);
            continue;
          }
          if (!callback) continue;
          persistenceQueueRef.current.delete(commandId);
          callback(commandId, queuedTrace.trace);
        }
      }, 0);
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
