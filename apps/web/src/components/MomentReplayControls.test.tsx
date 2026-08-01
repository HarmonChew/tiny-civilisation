import { createSimulation } from "@tiny-civ/sim-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MomentReplayPresentation } from "../hooks/useExperimentWorkspace";
import { makeWorldView } from "../sim-adapter";
import { MomentReplayControls } from "./MomentReplayControls";

function replayPresentation(): MomentReplayPresentation {
  const view = makeWorldView(createSimulation(4_182));
  const labels = ["Approach", "Decision", "Action", "Aftermath"] as const;
  const ids = ["APPROACH", "DECISION", "ACTION", "AFTERMATH"] as const;
  return {
    eventId: 9,
    title: "A meal was shared",
    activeBeatIndex: 1,
    beats: labels.map((label, index) => ({
      id: ids[index]!,
      label,
      tick: index + 10,
      summary: `${label} retained facts.`,
      view: { ...view, tick: index + 10 },
    })),
  };
}

describe("MomentReplayControls", () => {
  it("exposes every reconstructed beat and lets the player return live", () => {
    const onSelectBeat = vi.fn();
    const onExit = vi.fn();
    render(
      <MomentReplayControls
        replay={replayPresentation()}
        onSelectBeat={onSelectBeat}
        onExit={onExit}
      />,
    );

    expect(screen.getByRole("heading", { name: "A meal was shared" })).toBeTruthy();
    expect(screen.getByText("Decision retained facts.")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "A meal was shared" }),
    );
    expect(
      screen.getByRole("button", { name: /Decision/i }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText(/replay camera locked/i).textContent).toContain(
      "restores your live view",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next beat" }));
    expect(onSelectBeat).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Return to live world" }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
