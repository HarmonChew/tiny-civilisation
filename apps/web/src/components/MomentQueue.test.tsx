import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TimelineEventView } from "../model";
import { createMomentQueueState, ingestMomentEvents } from "../moments/event-presentation";
import { MomentQueue } from "./MomentQueue";

function event(
  id: number,
  tick: number,
  title: string,
  clusterKey: string,
): TimelineEventView {
  return {
    id,
    tick,
    category: id === 3 ? "conflict" : "social",
    type: id === 3 ? "CREATURE_ATTACKED" : "FOOD_SHARED",
    title,
    detail: `${title} has an immediate, factual consequence.`,
    reason: "A retained threat fact supported the selected plan.",
    actorIds: [1],
    targetIds: [2],
    causedByEventIds: [],
    importance: id === 3 ? 80 : 50,
    attentionTier: id === 3 ? "CRITICAL" : "SIGNIFICANT",
    clusterKey,
    playerCaused: false,
  };
}

describe("MomentQueue", () => {
  it("renders a named, recoverable moment with inspect, dismiss, and queue navigation", () => {
    const queue = ingestMomentEvents(
      createMomentQueueState(),
      [
        event(1, 10, "Aro shared food", "share"),
        event(2, 20, "Aro shared food again", "share"),
        event(3, 30, "Taro confronted Aro", "conflict"),
      ],
      {
        currentTick: 30,
        speed: 1,
        preference: "HIGHLIGHT_ONLY",
        playing: true,
      },
    ).state;
    const onSelectMoment = vi.fn();
    const onInspectMoment = vi.fn();
    const onReplayMoment = vi.fn();
    const onContinueMoment = vi.fn();
    const onDismissMoment = vi.fn();
    const onPacingPreferenceChange = vi.fn();
    render(
      <MomentQueue
        moments={queue.moments}
        activeMomentId={queue.activeMomentId}
        resolveParticipantName={(id) => ({ 1: "Aro", 2: "Taro" })[id]}
        onSelectMoment={onSelectMoment}
        onInspectMoment={onInspectMoment}
        onReplayMoment={onReplayMoment}
        onContinueMoment={onContinueMoment}
        onDismissMoment={onDismissMoment}
        pacingPreference="HIGHLIGHT_ONLY"
        onPacingPreferenceChange={onPacingPreferenceChange}
      />,
    );

    expect(screen.getByRole("region", { name: "Moment queue" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Taro confronted Aro" })).toBeTruthy();
    expect(screen.getByText("Aro, Taro")).toBeTruthy();
    expect(screen.getByText("Factual reason").parentElement?.textContent).toContain(
      "retained threat fact",
    );
    expect(screen.getByText("Recorded outcome").parentElement?.textContent).toContain(
      "immediate, factual consequence",
    );
    expect(screen.getByText("1 more retained")).toBeTruthy();
    expect(screen.queryByText(/Critical moment:/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Inspect evidence" }));
    expect(onInspectMoment).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(onReplayMoment).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinueMoment).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByRole("combobox", { name: "Pacing" }), {
      target: { value: "PAUSE_CRITICAL" },
    });
    expect(onPacingPreferenceChange).toHaveBeenCalledWith("PAUSE_CRITICAL");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissMoment).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Show older queued moment" }));
    expect(onSelectMoment).toHaveBeenCalledWith(1);
  });

  it("does not render an empty notification shell", () => {
    const { container } = render(
      <MomentQueue
        moments={[]}
        activeMomentId={null}
        onSelectMoment={vi.fn()}
        onInspectMoment={vi.fn()}
        onReplayMoment={vi.fn()}
        onContinueMoment={vi.fn()}
        onDismissMoment={vi.fn()}
        pacingPreference="HIGHLIGHT_ONLY"
        onPacingPreferenceChange={vi.fn()}
      />,
    );
    expect(container.childElementCount).toBe(0);
  });

  it("states when no linked factual reason was retained", () => {
    const queue = ingestMomentEvents(
      createMomentQueueState(),
      [{ ...event(4, 40, "A store was completed", "storage"), reason: undefined }],
      {
        currentTick: 40,
        speed: 1,
        preference: "HIGHLIGHT_ONLY",
        playing: true,
      },
    ).state;
    render(
      <MomentQueue
        moments={queue.moments}
        activeMomentId={queue.activeMomentId}
        onSelectMoment={vi.fn()}
        onInspectMoment={vi.fn()}
        onReplayMoment={vi.fn()}
        onContinueMoment={vi.fn()}
        onDismissMoment={vi.fn()}
        pacingPreference="HIGHLIGHT_ONLY"
        onPacingPreferenceChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Factual reason").parentElement?.textContent).toContain(
      "No linked decision reason was retained",
    );
  });
});
