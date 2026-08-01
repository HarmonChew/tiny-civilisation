import {
  decideBrowserEventPacing,
  eventClusterWindowTicks,
  type AttentionPlaybackSpeed,
  type AutomaticPacingAction,
  type BrowserEventPacingDecision,
  type EventPacingPreference,
} from "@tiny-civ/sim-core";
import type { TimelineEventView } from "../model";

export const DEFAULT_MOMENT_QUEUE_LIMIT = 8;
export const DEFAULT_MOMENT_EXPIRY_TICKS = 5_000;

export interface MomentPresentationDecision extends BrowserEventPacingDecision {
  readonly persistent: boolean;
}

export interface MomentQueueItem {
  readonly id: number;
  readonly clusterKey: string;
  readonly attentionTier: "SIGNIFICANT" | "CRITICAL";
  readonly firstEvent: TimelineEventView;
  readonly latestEvent: TimelineEventView;
  readonly firstTick: number;
  readonly latestTick: number;
  readonly occurrenceCount: number;
  readonly pacingAction: AutomaticPacingAction;
  readonly restoreSpeed: AttentionPlaybackSpeed | null;
}

export interface MomentQueueState {
  readonly moments: readonly MomentQueueItem[];
  readonly activeMomentId: number | null;
}

export interface MomentPacingRequest {
  readonly momentId: number;
  readonly event: TimelineEventView;
  readonly action: Exclude<AutomaticPacingAction, "KEEP_SPEED">;
  readonly restoreSpeed: AttentionPlaybackSpeed;
}

export interface MomentQueueUpdate {
  readonly state: MomentQueueState;
  readonly pacingRequests: readonly MomentPacingRequest[];
  readonly removedMoments: readonly MomentQueueItem[];
}

export interface IngestMomentOptions {
  readonly currentTick: number;
  readonly speed: AttentionPlaybackSpeed;
  readonly preference: EventPacingPreference;
  readonly playing: boolean;
  readonly maxMoments?: number;
  readonly expiryTicks?: number;
}

export function createMomentQueueState(): MomentQueueState {
  return { moments: [], activeMomentId: null };
}

export function decideMomentPresentation(
  event: Pick<TimelineEventView, "attentionTier">,
  speed: AttentionPlaybackSpeed,
  preference: EventPacingPreference,
  playing: boolean,
): MomentPresentationDecision {
  const policy = decideBrowserEventPacing(event.attentionTier, speed, preference);
  if (!playing) {
    return {
      ...policy,
      automaticAction: "KEEP_SPEED",
      restoreSpeed: null,
      persistent: policy.queueMoment,
    };
  }
  return { ...policy, persistent: policy.queueMoment };
}

function normalizedLimit(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_MOMENT_QUEUE_LIMIT));
}

function normalizedExpiry(value: number | undefined): number {
  return Math.max(0, Math.floor(value ?? DEFAULT_MOMENT_EXPIRY_TICKS));
}

function orderedUniqueEvents(events: readonly TimelineEventView[]): TimelineEventView[] {
  const byId = new Map<number, TimelineEventView>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort(
    (left, right) => left.tick - right.tick || left.id - right.id,
  );
}

function isPersistentMoment(event: TimelineEventView): event is TimelineEventView & {
  attentionTier: "SIGNIFICANT" | "CRITICAL";
} {
  return event.attentionTier === "SIGNIFICANT" || event.attentionTier === "CRITICAL";
}

function coalescingIndex(
  moments: readonly MomentQueueItem[],
  event: TimelineEventView,
): number {
  return moments.findIndex((moment) => {
    if (moment.clusterKey !== event.clusterKey) return false;
    const elapsed = event.tick - moment.latestTick;
    return elapsed >= 0 && elapsed <= eventClusterWindowTicks(moment.attentionTier);
  });
}

export function expireMomentQueue(
  state: MomentQueueState,
  currentTick: number,
  expiryTicks = DEFAULT_MOMENT_EXPIRY_TICKS,
): MomentQueueUpdate {
  const expiry = normalizedExpiry(expiryTicks);
  const kept: MomentQueueItem[] = [];
  const removed: MomentQueueItem[] = [];
  for (const moment of state.moments) {
    if (currentTick - moment.latestTick > expiry) removed.push(moment);
    else kept.push(moment);
  }
  if (removed.length === 0) {
    return { state, pacingRequests: [], removedMoments: [] };
  }
  const activeMomentId = kept.some((moment) => moment.id === state.activeMomentId)
    ? state.activeMomentId
    : (kept[0]?.id ?? null);
  return {
    state: { moments: kept, activeMomentId },
    pacingRequests: [],
    removedMoments: removed,
  };
}

export function ingestMomentEvents(
  state: MomentQueueState,
  events: readonly TimelineEventView[],
  options: IngestMomentOptions,
): MomentQueueUpdate {
  const expired = expireMomentQueue(
    state,
    options.currentTick,
    normalizedExpiry(options.expiryTicks),
  );
  const moments = [...expired.state.moments];
  let activeMomentId = expired.state.activeMomentId;
  const pacingRequests: MomentPacingRequest[] = [];
  const removedMoments = [...expired.removedMoments];
  const limit = normalizedLimit(options.maxMoments);

  for (const event of orderedUniqueEvents(events)) {
    if (!isPersistentMoment(event)) continue;
    const existingIndex = coalescingIndex(moments, event);
    if (existingIndex >= 0) {
      const existing = moments[existingIndex];
      if (!existing) continue;
      const coalesced: MomentQueueItem = {
        ...existing,
        latestEvent: event,
        latestTick: event.tick,
        occurrenceCount: existing.occurrenceCount + 1,
      };
      moments.splice(existingIndex, 1);
      moments.unshift(coalesced);
      activeMomentId = coalesced.id;
      continue;
    }

    const presentation = decideMomentPresentation(
      event,
      options.speed,
      options.preference,
      options.playing,
    );
    if (!presentation.persistent) continue;
    const moment: MomentQueueItem = {
      id: event.id,
      clusterKey: event.clusterKey,
      attentionTier: event.attentionTier,
      firstEvent: event,
      latestEvent: event,
      firstTick: event.tick,
      latestTick: event.tick,
      occurrenceCount: 1,
      pacingAction: presentation.automaticAction,
      restoreSpeed: presentation.restoreSpeed,
    };
    moments.unshift(moment);
    activeMomentId = moment.id;
    if (
      presentation.automaticAction !== "KEEP_SPEED" &&
      presentation.restoreSpeed !== null
    ) {
      pacingRequests.push({
        momentId: moment.id,
        event,
        action: presentation.automaticAction,
        restoreSpeed: presentation.restoreSpeed,
      });
    }
    if (moments.length > limit) {
      removedMoments.push(...moments.splice(limit));
    }
  }

  const changed =
    expired.state !== state ||
    moments.length !== state.moments.length ||
    moments.some((moment, index) => moment !== state.moments[index]) ||
    activeMomentId !== state.activeMomentId;
  return {
    state: changed ? { moments, activeMomentId } : state,
    pacingRequests,
    removedMoments,
  };
}

export function selectMoment(state: MomentQueueState, momentId: number): MomentQueueState {
  if (
    state.activeMomentId === momentId ||
    !state.moments.some((moment) => moment.id === momentId)
  ) {
    return state;
  }
  return { ...state, activeMomentId: momentId };
}

export function dismissMoment(
  state: MomentQueueState,
  momentId: number,
): { state: MomentQueueState; removedMoment: MomentQueueItem | null } {
  const removedMoment = state.moments.find((moment) => moment.id === momentId) ?? null;
  if (!removedMoment) return { state, removedMoment: null };
  const moments = state.moments.filter((moment) => moment.id !== momentId);
  return {
    state: {
      moments,
      activeMomentId:
        state.activeMomentId === momentId ? (moments[0]?.id ?? null) : state.activeMomentId,
    },
    removedMoment,
  };
}
