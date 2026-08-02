import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TimelineEventView } from "../model";
import { useMomentQueue, type UseMomentQueueOptions } from "./useMomentQueue";

function momentEvent(
  id: number,
  attentionTier: "SIGNIFICANT" | "CRITICAL",
): TimelineEventView {
  return {
    id,
    tick: id * 10,
    category: attentionTier === "CRITICAL" ? "conflict" : "social",
    type: attentionTier === "CRITICAL" ? "CREATURE_ATTACKED" : "FOOD_SHARED",
    title: attentionTier === "CRITICAL" ? "A confrontation" : "Food was shared",
    detail: "A retained factual description.",
    actorIds: [1],
    targetIds: [2],
    causedByEventIds: [],
    importance: attentionTier === "CRITICAL" ? 80 : 50,
    attentionTier,
    clusterKey: `${attentionTier}:${id}`,
    playerCaused: false,
  };
}

describe("useMomentQueue", () => {
  it("requests an explicit critical pause once, then supports inspect and dismiss", async () => {
    const critical = momentEvent(7, "CRITICAL");
    const onInspect = vi.fn();
    const onPacingRequest = vi.fn();
    const onPacingRelease = vi.fn();
    const initialProps: UseMomentQueueOptions = {
      events: [],
      currentTick: 0,
      speed: 4,
      preference: "PAUSE_CRITICAL",
      playing: true,
      onInspect,
      onPacingRequest,
      onPacingRelease,
    };
    const { result, rerender } = renderHook(
      (props: UseMomentQueueOptions) => useMomentQueue(props),
      { initialProps },
    );

    rerender({
      ...initialProps,
      events: [critical],
      currentTick: critical.tick,
    });
    await waitFor(() => expect(result.current.moments).toHaveLength(1));
    expect(onPacingRequest).toHaveBeenCalledTimes(1);
    expect(onPacingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        momentId: critical.id,
        action: "PAUSE",
        restoreSpeed: 4,
      }),
    );

    rerender({
      ...initialProps,
      events: [critical],
      currentTick: critical.tick,
    });
    expect(onPacingRequest).toHaveBeenCalledTimes(1);

    act(() => result.current.inspectMoment(critical.id));
    expect(onInspect).toHaveBeenCalledWith(critical);
    expect(result.current.moments).toHaveLength(1);

    act(() => result.current.continueMoment(critical.id));
    expect(result.current.moments).toHaveLength(0);
    expect(onPacingRelease).toHaveBeenCalledWith({
      momentId: critical.id,
      restoreSpeed: 4,
      reason: "CONTINUED",
    });
  });

  it("never requests a pause for significant events and resets on a tick rewind", async () => {
    const significant = momentEvent(4, "SIGNIFICANT");
    const onPacingRequest = vi.fn();
    const onPacingRelease = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseMomentQueueOptions) => useMomentQueue(props),
      {
        initialProps: {
          events: [significant],
          currentTick: significant.tick,
          speed: 4,
          preference: "PAUSE_CRITICAL",
          playing: true,
          onPacingRequest,
          onPacingRelease,
        },
      },
    );
    await waitFor(() => expect(result.current.moments).toHaveLength(1));
    expect(onPacingRequest).not.toHaveBeenCalled();

    rerender({
      events: [],
      currentTick: 0,
      speed: 4,
      preference: "PAUSE_CRITICAL",
      playing: false,
      onPacingRequest,
      onPacingRelease,
    });
    await waitFor(() => expect(result.current.moments).toHaveLength(0));
    expect(onPacingRelease).not.toHaveBeenCalled();
  });

  it("treats mount and rewind timelines as backfill without pacing requests", async () => {
    const critical = momentEvent(9, "CRITICAL");
    const onPacingRequest = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseMomentQueueOptions) => useMomentQueue(props),
      {
        initialProps: {
          events: [critical],
          currentTick: critical.tick,
          speed: 4,
          preference: "PAUSE_CRITICAL",
          playing: true,
          onPacingRequest,
        },
      },
    );

    await waitFor(() => expect(result.current.moments).toHaveLength(1));
    expect(onPacingRequest).not.toHaveBeenCalled();

    rerender({
      events: [momentEvent(3, "CRITICAL")],
      currentTick: 30,
      speed: 4,
      preference: "PAUSE_CRITICAL",
      playing: true,
      onPacingRequest,
    });
    await waitFor(() => expect(result.current.activeMomentId).toBe(3));
    expect(onPacingRequest).not.toHaveBeenCalled();
  });

  it("replaces same-tick moments when the authoritative timeline changes", async () => {
    const original = momentEvent(4, "SIGNIFICANT");
    const replacement = {
      ...momentEvent(4, "CRITICAL"),
      title: "A different branch confrontation",
    };
    const initialProps: UseMomentQueueOptions = {
      events: [original],
      currentTick: original.tick,
      speed: 2,
      preference: "HIGHLIGHT_ONLY",
      playing: false,
      streamKey: "4182:0",
    };
    const { result, rerender } = renderHook(
      (props: UseMomentQueueOptions) => useMomentQueue(props),
      { initialProps },
    );

    await waitFor(() =>
      expect(result.current.moments[0]?.latestEvent.title).toBe(original.title),
    );
    rerender({
      ...initialProps,
      events: [replacement],
      streamKey: "4182:1",
    });

    await waitFor(() =>
      expect(result.current.moments[0]?.latestEvent.title).toBe(replacement.title),
    );
    expect(result.current.moments).toHaveLength(1);
  });
});
