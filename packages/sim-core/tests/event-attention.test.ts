import { describe, expect, it } from "vitest";
import {
  ATTENTION_PLAYBACK_SPEEDS,
  ATTENTION_TIERS,
  classifyAttentionTier,
  createEventClusterKey,
  decideBrowserEventPacing,
  describeEventCluster,
  EVENT_CLUSTER_WINDOW_TICKS,
  EVENT_PACING_PREFERENCES,
  eventClusterWindowTicks,
  isEventInAttentionCluster,
  type AttentionPlaybackSpeed,
  type AttentionTier,
  type AutomaticPacingAction,
  type BrowserEventPacingDecision,
  type EventAttentionInput,
  type EventPacingPreference,
} from "../src/index.js";

function attentionEvent(overrides: Partial<EventAttentionInput> = {}): EventAttentionInput {
  return {
    tick: 100,
    type: "FOOD_GATHERED",
    actorIds: [2],
    targetIds: [9],
    groupIds: [4],
    locationTileIndex: 12,
    resourceKind: "FOOD",
    causedByEventIds: [7],
    importance: 10,
    ...overrides,
  };
}

describe("event attention classification", () => {
  it.each([
    [-100, "ROUTINE"],
    [0, "ROUTINE"],
    [17.999, "ROUTINE"],
    [18, "NOTABLE"],
    [49.999, "NOTABLE"],
    [50, "SIGNIFICANT"],
    [79.999, "SIGNIFICANT"],
    [80, "CRITICAL"],
    [10_000, "CRITICAL"],
  ] as const)("classifies importance %s as %s", (importance, expected) => {
    expect(classifyAttentionTier(importance)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite importance %s",
    (importance) => {
      expect(() => classifyAttentionTier(importance)).toThrow(
        "Event importance must be finite.",
      );
    },
  );
});

describe("event attention clusters", () => {
  it("builds an order-independent key without mutating retained references", () => {
    const actorIds = [3, 1, 3, 2];
    const targetIds = [8, 7];
    const groupIds = [5, 4];
    const causedByEventIds = [22, 20, 22, 21];
    const event = attentionEvent({
      actorIds,
      targetIds,
      groupIds,
      causedByEventIds,
      importance: 18,
    });

    expect(createEventClusterKey(event)).toBe(
      "v1|tier:NOTABLE|type:FOOD_GATHERED|actors:1,2,3|targets:7,8|groups:4,5|location:12|resource:FOOD|causes:20,21,22",
    );
    expect(
      createEventClusterKey(
        attentionEvent({
          actorIds: [2, 3, 1],
          targetIds: [7, 8],
          groupIds: [4, 5],
          causedByEventIds: [21, 22, 20],
          importance: 18,
        }),
      ),
    ).toBe(createEventClusterKey(event));
    expect(actorIds).toEqual([3, 1, 3, 2]);
    expect(targetIds).toEqual([8, 7]);
    expect(groupIds).toEqual([5, 4]);
    expect(causedByEventIds).toEqual([22, 20, 22, 21]);
  });

  it("starts a new cluster for every explanatory identity dimension", () => {
    const base = attentionEvent();
    const keys = [
      createEventClusterKey(base),
      createEventClusterKey(attentionEvent({ type: "MATERIAL_GATHERED" })),
      createEventClusterKey(attentionEvent({ actorIds: [3] })),
      createEventClusterKey(attentionEvent({ targetIds: [10] })),
      createEventClusterKey(attentionEvent({ groupIds: [5] })),
      createEventClusterKey(attentionEvent({ locationTileIndex: 13 })),
      createEventClusterKey(attentionEvent({ resourceKind: "MATERIAL" })),
      createEventClusterKey(attentionEvent({ causedByEventIds: [8] })),
      createEventClusterKey(attentionEvent({ importance: 18 })),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ["ROUTINE", 30],
    ["NOTABLE", 60],
    ["SIGNIFICANT", 120],
    ["CRITICAL", 120],
  ] as const)("uses a bounded %s window of %s ticks", (tier, expected) => {
    expect(eventClusterWindowTicks(tier)).toBe(expected);
    expect(EVENT_CLUSTER_WINDOW_TICKS[tier]).toBe(expected);
  });

  it.each([
    [10, "ROUTINE"],
    [18, "NOTABLE"],
    [50, "SIGNIFICANT"],
    [80, "CRITICAL"],
  ] as const)(
    "includes the exact boundary and excludes later, earlier, causal, and escalation changes for %s",
    (importance, tier) => {
      const first = attentionEvent({ importance });
      const windowTicks = EVENT_CLUSTER_WINDOW_TICKS[tier];
      expect(describeEventCluster(first)).toEqual({
        key: createEventClusterKey(first),
        windowTicks,
      });
      expect(
        isEventInAttentionCluster(
          first,
          attentionEvent({ tick: first.tick + windowTicks, importance }),
        ),
      ).toBe(true);
      expect(
        isEventInAttentionCluster(
          first,
          attentionEvent({ tick: first.tick + windowTicks + 1, importance }),
        ),
      ).toBe(false);
      expect(
        isEventInAttentionCluster(
          first,
          attentionEvent({ tick: first.tick - 1, importance }),
        ),
      ).toBe(false);
      expect(
        isEventInAttentionCluster(
          first,
          attentionEvent({
            tick: first.tick + 1,
            importance,
            causedByEventIds: [999],
          }),
        ),
      ).toBe(false);
      const escalatedImportance =
        tier === "ROUTINE"
          ? 18
          : tier === "NOTABLE"
            ? 50
            : tier === "SIGNIFICANT"
              ? 80
              : 79;
      expect(
        isEventInAttentionCluster(
          first,
          attentionEvent({ tick: first.tick + 1, importance: escalatedImportance }),
        ),
      ).toBe(false);
    },
  );
});

const PRESENTATION_EXPECTATIONS = {
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
} as const satisfies Record<
  AttentionTier,
  Pick<BrowserEventPacingDecision, "cue" | "addChronicleMarker" | "queueMoment">
>;

const ACCELERATED_ACTION_EXPECTATIONS = {
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
} as const satisfies Record<
  EventPacingPreference,
  Record<AttentionTier, AutomaticPacingAction>
>;

interface PacingCase {
  tier: AttentionTier;
  speed: AttentionPlaybackSpeed;
  preference: EventPacingPreference;
  expected: BrowserEventPacingDecision;
}

const PACING_CASES: PacingCase[] = ATTENTION_PLAYBACK_SPEEDS.flatMap((speed) =>
  EVENT_PACING_PREFERENCES.flatMap((preference) =>
    ATTENTION_TIERS.map((tier) => {
      const automaticAction =
        speed === 1 ? "KEEP_SPEED" : ACCELERATED_ACTION_EXPECTATIONS[preference][tier];
      return {
        tier,
        speed,
        preference,
        expected: {
          ...PRESENTATION_EXPECTATIONS[tier],
          automaticAction,
          restoreSpeed: automaticAction === "KEEP_SPEED" ? null : speed,
        },
      };
    }),
  ),
);

describe("browser event pacing", () => {
  it("covers all 36 tier, speed, and preference combinations", () => {
    expect(PACING_CASES).toHaveLength(4 * 3 * 3);
  });

  it.each(PACING_CASES)(
    "$tier at $speed x with $preference",
    ({ tier, speed, preference, expected }) => {
      expect(decideBrowserEventPacing(tier, speed, preference)).toEqual(expected);
    },
  );
});
