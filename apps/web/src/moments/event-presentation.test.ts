import {
  ATTENTION_PLAYBACK_SPEEDS,
  ATTENTION_TIERS,
  EVENT_PACING_PREFERENCES,
  type AttentionPlaybackSpeed,
  type AttentionTier,
  type EventPacingPreference,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";
import type { TimelineEventView } from "../model";
import {
  createMomentQueueState,
  decideMomentPresentation,
  dismissMoment,
  expireMomentQueue,
  ingestMomentEvents,
  selectMoment,
} from "./event-presentation";

function event(
  id: number,
  tick: number,
  attentionTier: AttentionTier,
  clusterKey = `cluster:${id}`,
): TimelineEventView {
  return {
    id,
    tick,
    category: attentionTier === "CRITICAL" ? "conflict" : "social",
    type: attentionTier === "CRITICAL" ? "CREATURE_ATTACKED" : "FOOD_SHARED",
    title: `Moment ${id}`,
    detail: `Observed detail ${id}.`,
    actorIds: [1],
    targetIds: [2],
    causedByEventIds: [],
    importance:
      attentionTier === "CRITICAL"
        ? 80
        : attentionTier === "SIGNIFICANT"
          ? 50
          : attentionTier === "NOTABLE"
            ? 18
            : 2,
    attentionTier,
    clusterKey,
    playerCaused: false,
  };
}

function expectedAction(
  tier: AttentionTier,
  speed: AttentionPlaybackSpeed,
  preference: EventPacingPreference,
) {
  if (speed === 1) return "KEEP_SPEED";
  if (
    preference === "SLOW_SIGNIFICANT" &&
    (tier === "SIGNIFICANT" || tier === "CRITICAL")
  ) {
    return "SLOW_TO_1X";
  }
  if (preference === "PAUSE_CRITICAL" && tier === "CRITICAL") return "PAUSE";
  return "KEEP_SPEED";
}

describe("web moment presentation policy", () => {
  it("covers every tier, speed, and preference without pausing significant events", () => {
    let combinations = 0;
    for (const tier of ATTENTION_TIERS) {
      for (const speed of ATTENTION_PLAYBACK_SPEEDS) {
        for (const preference of EVENT_PACING_PREFERENCES) {
          combinations += 1;
          const decision = decideMomentPresentation(
            { attentionTier: tier },
            speed,
            preference,
            true,
          );
          expect(decision.persistent).toBe(tier === "SIGNIFICANT" || tier === "CRITICAL");
          expect(decision.automaticAction).toBe(expectedAction(tier, speed, preference));
          if (tier === "SIGNIFICANT") {
            expect(decision.automaticAction).not.toBe("PAUSE");
          }
          if (decision.automaticAction === "PAUSE") {
            expect(tier).toBe("CRITICAL");
            expect(preference).toBe("PAUSE_CRITICAL");
            expect(speed).not.toBe(1);
          }
          expect(
            decideMomentPresentation({ attentionTier: tier }, speed, preference, false)
              .automaticAction,
          ).toBe("KEEP_SPEED");
        }
      }
    }
    expect(combinations).toBe(36);
  });

  it("coalesces rapid repeated events but preserves cause changes and cluster boundaries", () => {
    const update = ingestMomentEvents(
      createMomentQueueState(),
      [
        event(1, 10, "SIGNIFICANT", "shared-cause"),
        event(2, 20, "SIGNIFICANT", "shared-cause"),
        event(3, 21, "SIGNIFICANT", "changed-cause"),
        event(4, 141, "SIGNIFICANT", "shared-cause"),
      ],
      {
        currentTick: 141,
        speed: 4,
        preference: "SLOW_SIGNIFICANT",
        playing: true,
      },
    );

    expect(update.state.moments.map((moment) => moment.id)).toEqual([4, 3, 1]);
    expect(update.state.moments[2]).toMatchObject({
      id: 1,
      occurrenceCount: 2,
      firstTick: 10,
      latestTick: 20,
      latestEvent: { id: 2 },
    });
    expect(update.pacingRequests).toHaveLength(3);
    expect(update.pacingRequests.every((request) => request.action === "SLOW_TO_1X")).toBe(
      true,
    );
  });

  it("caps the newest-first queue and expires moments from their latest occurrence", () => {
    const capped = ingestMomentEvents(
      createMomentQueueState(),
      [event(1, 10, "SIGNIFICANT"), event(2, 20, "SIGNIFICANT"), event(3, 30, "CRITICAL")],
      {
        currentTick: 30,
        speed: 1,
        preference: "HIGHLIGHT_ONLY",
        playing: true,
        maxMoments: 2,
        expiryTicks: 40,
      },
    );
    expect(capped.state.moments.map((moment) => moment.id)).toEqual([3, 2]);
    expect(capped.removedMoments.map((moment) => moment.id)).toEqual([1]);

    const partlyExpired = expireMomentQueue(capped.state, 70, 40);
    expect(partlyExpired.state.moments.map((moment) => moment.id)).toEqual([3]);
    expect(partlyExpired.removedMoments.map((moment) => moment.id)).toEqual([2]);
    expect(expireMomentQueue(partlyExpired.state, 71, 40).state.moments).toEqual([]);
  });

  it("selects and dismisses by stable moment ID", () => {
    const queued = ingestMomentEvents(
      createMomentQueueState(),
      [event(1, 10, "SIGNIFICANT"), event(2, 20, "CRITICAL")],
      {
        currentTick: 20,
        speed: 1,
        preference: "HIGHLIGHT_ONLY",
        playing: true,
      },
    ).state;
    const selected = selectMoment(queued, 1);
    expect(selected.activeMomentId).toBe(1);
    const dismissed = dismissMoment(selected, 1);
    expect(dismissed.removedMoment?.id).toBe(1);
    expect(dismissed.state.moments.map((moment) => moment.id)).toEqual([2]);
    expect(dismissed.state.activeMomentId).toBe(2);
  });
});
