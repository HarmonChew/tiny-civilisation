import type {
  AttentionTier,
  DomainEventType,
  EntityId,
  GroupId,
  ResourceKind,
  Tick,
} from "./types.js";

export const ATTENTION_TIERS = [
  "ROUTINE",
  "NOTABLE",
  "SIGNIFICANT",
  "CRITICAL",
] as const satisfies readonly AttentionTier[];

export const ATTENTION_IMPORTANCE_THRESHOLDS = {
  NOTABLE: 18,
  SIGNIFICANT: 50,
  CRITICAL: 80,
} as const;

/**
 * The factual event fields that affect attention and clustering. The policy is
 * deliberately independent of SimulationState so it can run at emission,
 * projection, replay, and browser boundaries with identical results.
 */
export interface EventAttentionInput {
  readonly tick: Tick;
  readonly type: DomainEventType;
  readonly actorIds: readonly EntityId[];
  readonly targetIds: readonly EntityId[];
  readonly groupIds: readonly GroupId[];
  readonly locationTileIndex: number | null;
  readonly resourceKind: ResourceKind | null;
  readonly causedByEventIds: readonly number[];
  readonly importance: number;
}

export function classifyAttentionTier(importance: number): AttentionTier {
  if (!Number.isFinite(importance)) {
    throw new RangeError("Event importance must be finite.");
  }
  if (importance >= ATTENTION_IMPORTANCE_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (importance >= ATTENTION_IMPORTANCE_THRESHOLDS.SIGNIFICANT) {
    return "SIGNIFICANT";
  }
  if (importance >= ATTENTION_IMPORTANCE_THRESHOLDS.NOTABLE) return "NOTABLE";
  return "ROUTINE";
}

/** Three, six, and twelve simulated seconds at the current ten-tick clock. */
export const EVENT_CLUSTER_WINDOW_TICKS = {
  ROUTINE: 30,
  NOTABLE: 60,
  SIGNIFICANT: 120,
  CRITICAL: 120,
} as const satisfies Readonly<Record<AttentionTier, number>>;

export interface EventClusterDescriptor {
  readonly key: string;
  readonly windowTicks: number;
}

function stableIds(ids: readonly number[]): string {
  const ordered = [...new Set(ids)].sort((left, right) => left - right);
  return ordered.length === 0 ? "-" : ordered.join(",");
}

/**
 * Creates a key for repeated presentations of the same factual event shape.
 * Tick, event ID, and quantity are intentionally absent. A tier change records
 * escalation; a type or retained-cause change starts a new cluster.
 */
export function createEventClusterKey(event: EventAttentionInput): string {
  const tier = classifyAttentionTier(event.importance);
  return [
    "v1",
    `tier:${tier}`,
    `type:${event.type}`,
    `actors:${stableIds(event.actorIds)}`,
    `targets:${stableIds(event.targetIds)}`,
    `groups:${stableIds(event.groupIds)}`,
    `location:${event.locationTileIndex === null ? "-" : event.locationTileIndex.toString()}`,
    `resource:${event.resourceKind ?? "-"}`,
    `causes:${stableIds(event.causedByEventIds)}`,
  ].join("|");
}

export function eventClusterWindowTicks(tier: AttentionTier): number {
  return EVENT_CLUSTER_WINDOW_TICKS[tier];
}

export function describeEventCluster(event: EventAttentionInput): EventClusterDescriptor {
  const tier = classifyAttentionTier(event.importance);
  return {
    key: createEventClusterKey(event),
    windowTicks: eventClusterWindowTicks(tier),
  };
}

/**
 * Reports whether a later event may be summarised into an earlier event's
 * presentation cluster. Callers remain responsible for preserving the first
 * event and any terminal consequence.
 */
export function isEventInAttentionCluster(
  earlier: EventAttentionInput,
  later: EventAttentionInput,
): boolean {
  const elapsed = later.tick - earlier.tick;
  if (elapsed < 0) return false;
  const earlierCluster = describeEventCluster(earlier);
  const laterCluster = describeEventCluster(later);
  return earlierCluster.key === laterCluster.key && elapsed <= earlierCluster.windowTicks;
}

export const ATTENTION_PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type AttentionPlaybackSpeed = (typeof ATTENTION_PLAYBACK_SPEEDS)[number];

export const EVENT_PACING_PREFERENCES = [
  "HIGHLIGHT_ONLY",
  "SLOW_SIGNIFICANT",
  "PAUSE_CRITICAL",
] as const;
export type EventPacingPreference = (typeof EVENT_PACING_PREFERENCES)[number];

export type EventAttentionCue = "WORLD_FEEDBACK" | "HIGHLIGHT" | "STRONG_HIGHLIGHT";
export type AutomaticPacingAction = "KEEP_SPEED" | "SLOW_TO_1X" | "PAUSE";

export interface BrowserEventPacingDecision {
  readonly cue: EventAttentionCue;
  readonly addChronicleMarker: boolean;
  readonly queueMoment: boolean;
  readonly automaticAction: AutomaticPacingAction;
  /** Speed to restore after an automatic slow-down or pause. */
  readonly restoreSpeed: AttentionPlaybackSpeed | null;
}

const PRESENTATION_BY_TIER = {
  ROUTINE: {
    cue: "WORLD_FEEDBACK",
    addChronicleMarker: false,
    queueMoment: false,
  },
  NOTABLE: {
    cue: "HIGHLIGHT",
    addChronicleMarker: true,
    queueMoment: false,
  },
  SIGNIFICANT: {
    cue: "HIGHLIGHT",
    addChronicleMarker: true,
    queueMoment: true,
  },
  CRITICAL: {
    cue: "STRONG_HIGHLIGHT",
    addChronicleMarker: true,
    queueMoment: true,
  },
} as const satisfies Readonly<
  Record<
    AttentionTier,
    Pick<BrowserEventPacingDecision, "cue" | "addChronicleMarker" | "queueMoment">
  >
>;

const ACCELERATED_PACING_BY_PREFERENCE = {
  HIGHLIGHT_ONLY: {
    ROUTINE: "KEEP_SPEED",
    NOTABLE: "KEEP_SPEED",
    SIGNIFICANT: "KEEP_SPEED",
    CRITICAL: "KEEP_SPEED",
  },
  SLOW_SIGNIFICANT: {
    ROUTINE: "KEEP_SPEED",
    NOTABLE: "KEEP_SPEED",
    SIGNIFICANT: "SLOW_TO_1X",
    CRITICAL: "SLOW_TO_1X",
  },
  PAUSE_CRITICAL: {
    ROUTINE: "KEEP_SPEED",
    NOTABLE: "KEEP_SPEED",
    SIGNIFICANT: "KEEP_SPEED",
    CRITICAL: "PAUSE",
  },
} as const satisfies Readonly<
  Record<EventPacingPreference, Readonly<Record<AttentionTier, AutomaticPacingAction>>>
>;

/**
 * Maps authoritative attention to browser presentation. At 1x, cues and the
 * recoverable moment queue carry the event without changing playback. At 2x
 * and 4x, only the explicitly selected pacing preference changes speed.
 */
export function decideBrowserEventPacing(
  tier: AttentionTier,
  speed: AttentionPlaybackSpeed,
  preference: EventPacingPreference,
): BrowserEventPacingDecision {
  const presentation = PRESENTATION_BY_TIER[tier];
  const automaticAction =
    speed === 1 ? "KEEP_SPEED" : ACCELERATED_PACING_BY_PREFERENCE[preference][tier];
  return {
    ...presentation,
    automaticAction,
    restoreSpeed: automaticAction === "KEEP_SPEED" ? null : speed,
  };
}
