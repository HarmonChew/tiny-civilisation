import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttentionPlaybackSpeed, EventPacingPreference } from "@tiny-civ/sim-core";
import type { TimelineEventView } from "../model";
import {
  DEFAULT_MOMENT_EXPIRY_TICKS,
  DEFAULT_MOMENT_QUEUE_LIMIT,
  createMomentQueueState,
  dismissMoment,
  ingestMomentEvents,
  selectMoment,
  type MomentPacingRequest,
  type MomentQueueItem,
  type MomentQueueState,
} from "../moments/event-presentation";

const MAX_TRACKED_EVENT_IDS = 8_192;

export interface MomentPacingRelease {
  readonly momentId: number;
  readonly restoreSpeed: AttentionPlaybackSpeed;
  readonly reason: "CONTINUED" | "DISMISSED" | "QUEUE_REMOVED" | "RESET";
}

export interface UseMomentQueueOptions {
  readonly events: readonly TimelineEventView[];
  readonly currentTick: number;
  readonly speed: AttentionPlaybackSpeed;
  readonly preference: EventPacingPreference;
  readonly playing: boolean;
  readonly streamKey?: string | number;
  readonly maxMoments?: number;
  readonly expiryTicks?: number;
  readonly onInspect?: (event: TimelineEventView) => void;
  readonly onPacingRequest?: (request: MomentPacingRequest) => void;
  readonly onPacingRelease?: (release: MomentPacingRelease) => void;
}

export interface MomentQueueController {
  readonly moments: readonly MomentQueueItem[];
  readonly activeMoment: MomentQueueItem | null;
  readonly activeMomentId: number | null;
  readonly selectMoment: (momentId: number) => void;
  readonly inspectMoment: (momentId: number) => void;
  readonly continueMoment: (momentId: number) => void;
  readonly dismissMoment: (momentId: number) => void;
  readonly clearMoments: () => void;
}

function releasable(moment: MomentQueueItem): moment is MomentQueueItem & {
  restoreSpeed: AttentionPlaybackSpeed;
} {
  return moment.pacingAction !== "KEEP_SPEED" && moment.restoreSpeed !== null;
}

export function useMomentQueue({
  events,
  currentTick,
  speed,
  preference,
  playing,
  streamKey = "default",
  maxMoments = DEFAULT_MOMENT_QUEUE_LIMIT,
  expiryTicks = DEFAULT_MOMENT_EXPIRY_TICKS,
  onInspect,
  onPacingRequest,
  onPacingRelease,
}: UseMomentQueueOptions): MomentQueueController {
  const [state, setState] = useState<MomentQueueState>(createMomentQueueState);
  const stateRef = useRef(state);
  const seenEventIdsRef = useRef(new Set<number>());
  const seenEventOrderRef = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const streamRef = useRef<{ key: string | number; tick: number }>({
    key: streamKey,
    tick: currentTick,
  });
  const onInspectRef = useRef(onInspect);
  const onPacingRequestRef = useRef(onPacingRequest);
  const onPacingReleaseRef = useRef(onPacingRelease);
  onInspectRef.current = onInspect;
  onPacingRequestRef.current = onPacingRequest;
  onPacingReleaseRef.current = onPacingRelease;

  const releaseMoments = useCallback(
    (moments: readonly MomentQueueItem[], reason: MomentPacingRelease["reason"]) => {
      for (const moment of moments) {
        if (!releasable(moment)) continue;
        onPacingReleaseRef.current?.({
          momentId: moment.id,
          restoreSpeed: moment.restoreSpeed,
          reason,
        });
      }
    },
    [],
  );

  const commit = useCallback((next: MomentQueueState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const streamChanged = streamRef.current.key !== streamKey;
    const tickRewound = currentTick < streamRef.current.tick;
    const isBackfill = !initializedRef.current || streamChanged || tickRewound;
    let baseState = stateRef.current;
    if (streamChanged || tickRewound) {
      releaseMoments(baseState.moments, "RESET");
      baseState = createMomentQueueState();
      seenEventIdsRef.current.clear();
      seenEventOrderRef.current = [];
    }
    streamRef.current = { key: streamKey, tick: currentTick };

    const ordered = [...events].sort(
      (left, right) => left.tick - right.tick || left.id - right.id,
    );
    const unseen: TimelineEventView[] = [];
    for (const event of ordered) {
      if (seenEventIdsRef.current.has(event.id)) continue;
      seenEventIdsRef.current.add(event.id);
      seenEventOrderRef.current.push(event.id);
      unseen.push(event);
    }

    const update = ingestMomentEvents(baseState, unseen, {
      currentTick,
      speed,
      preference,
      // A retained timeline supplied at mount/load/rewind is evidence, not a
      // new interruption. Queue it without asking the host to change playback.
      playing: isBackfill ? false : playing,
      maxMoments,
      expiryTicks,
    });
    initializedRef.current = true;
    commit(update.state);
    releaseMoments(update.removedMoments, "QUEUE_REMOVED");
    for (const request of update.pacingRequests) {
      onPacingRequestRef.current?.(request);
    }

    const protectedIds = new Set(events.map((event) => event.id));
    for (const moment of update.state.moments) {
      protectedIds.add(moment.firstEvent.id);
      protectedIds.add(moment.latestEvent.id);
    }
    if (seenEventOrderRef.current.length > MAX_TRACKED_EVENT_IDS) {
      const kept: number[] = [];
      for (const id of seenEventOrderRef.current) {
        if (seenEventIdsRef.current.size > MAX_TRACKED_EVENT_IDS && !protectedIds.has(id)) {
          seenEventIdsRef.current.delete(id);
        } else {
          kept.push(id);
        }
      }
      seenEventOrderRef.current = kept;
    }
  }, [
    commit,
    currentTick,
    events,
    expiryTicks,
    maxMoments,
    playing,
    preference,
    releaseMoments,
    speed,
    streamKey,
  ]);

  const handleSelectMoment = useCallback(
    (momentId: number) => commit(selectMoment(stateRef.current, momentId)),
    [commit],
  );

  const inspectMoment = useCallback(
    (momentId: number) => {
      const moment = stateRef.current.moments.find(
        (candidate) => candidate.id === momentId,
      );
      if (!moment) return;
      commit(selectMoment(stateRef.current, momentId));
      onInspectRef.current?.(moment.latestEvent);
    },
    [commit],
  );

  const removeMoment = useCallback(
    (momentId: number, reason: "CONTINUED" | "DISMISSED") => {
      const result = dismissMoment(stateRef.current, momentId);
      if (!result.removedMoment) return;
      commit(result.state);
      releaseMoments([result.removedMoment], reason);
    },
    [commit, releaseMoments],
  );

  const continueMoment = useCallback(
    (momentId: number) => removeMoment(momentId, "CONTINUED"),
    [removeMoment],
  );

  const handleDismissMoment = useCallback(
    (momentId: number) => removeMoment(momentId, "DISMISSED"),
    [removeMoment],
  );

  const clearMoments = useCallback(() => {
    const current = stateRef.current;
    if (current.moments.length === 0) return;
    releaseMoments(current.moments, "DISMISSED");
    commit(createMomentQueueState());
  }, [commit, releaseMoments]);

  const activeMoment = useMemo(
    () =>
      state.moments.find((moment) => moment.id === state.activeMomentId) ??
      state.moments[0] ??
      null,
    [state.activeMomentId, state.moments],
  );

  return {
    moments: state.moments,
    activeMoment,
    activeMomentId: activeMoment?.id ?? null,
    selectMoment: handleSelectMoment,
    inspectMoment,
    continueMoment,
    dismissMoment: handleDismissMoment,
    clearMoments,
  };
}
