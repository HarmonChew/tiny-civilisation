import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreatureView, WorldView } from "../model";
import { DEFAULT_SCENARIO_VIEW } from "../experiment/scenario-presets";
import { WorldStage } from "./WorldStage";

vi.mock("./PixiWorld", () => ({
  PixiWorld: ({ replayCamera }: { replayCamera?: { eventId: number } | null }) => (
    <div
      data-testid="pixi-world"
      data-replay-event={replayCamera?.eventId.toString() ?? "live"}
    />
  ),
}));

const makeCreature = (id: number, name: string, action: string): CreatureView => ({
  id,
  name,
  color: id === 1 ? 0x8ea66c : 0xd4775f,
  x: id,
  y: id,
  alive: true,
  role: "Forager",
  desire: id === 1 ? "SECURE_PROVISIONS" : "PROTECT_PERSON_OR_GROUP",
  plan: "TRAVEL_TO_TARGET",
  goal: "GATHER_FOOD",
  action,
  actionPhase: "WORKING",
  reason: "Known stock",
  summary: {
    desire: `${name} wants provisions.`,
    plan: `${name} plans to travel.`,
    action: `${name} is acting.`,
    reason: `${name} knows a useful location.`,
  },
  route: [],
  health: 90,
  hunger: 30,
  fatigue: 20,
  thirst: 40,
  traits: [],
  inventory: [],
  candidates: [],
  memories: [],
  relationships: [],
});

const view: WorldView = {
  scenario: DEFAULT_SCENARIO_VIEW,
  tick: 8,
  timeLabel: "Dawn",
  hash: "dish-readability",
  width: 12,
  height: 12,
  tiles: [],
  creatures: [makeCreature(1, "Aro", "GATHER_FOOD"), makeCreature(2, "Bela", "GUARD")],
  resources: [],
  structures: [],
  groups: [],
  events: [],
  population: 2,
  foodStock: 4,
};

const callbacks = {
  onTool: vi.fn(),
  onOverlay: vi.fn(),
  onSelect: vi.fn(),
  onHover: vi.fn(),
  onWorldAction: vi.fn(),
};

describe("WorldStage dish subject label", () => {
  it("keeps the selected creature visible ahead of a transient focus", () => {
    render(
      <WorldStage
        seed={11}
        view={view}
        selectedId={1}
        focusedId={2}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: false, traffic: true }}
        feedback="Ready"
        {...callbacks}
      />,
    );

    const label = screen.getByLabelText("Selected creature: Aro");
    expect(label.textContent).toContain("Gather food · Working");
    expect(label.textContent).toContain("Wants secure provisions");
    expect(screen.queryByLabelText("Focused creature: Bela")).toBeNull();
  });

  it("shows a concise focus label when nothing is selected", () => {
    render(
      <WorldStage
        seed={11}
        view={view}
        selectedId={null}
        focusedId={2}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: false, traffic: true }}
        feedback="Ready"
        {...callbacks}
      />,
    );

    const label = screen.getByLabelText("Focused creature: Bela");
    expect(label.textContent).toContain("Guard · Working");
    expect(label.textContent).toContain("Wants protect person or group");
  });

  it("passes a locked focal camera to the dish during isolated replay", () => {
    render(
      <WorldStage
        seed={11}
        view={view}
        selectedId={1}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: false, traffic: true }}
        feedback="Showing the action beat"
        replayCamera={{
          eventId: 91,
          subjectId: 1,
          actorIds: [1],
          targetIds: [2],
          locationTileIndex: 14,
        }}
        mutationDisabled
        {...callbacks}
      />,
    );

    expect(screen.getByTestId("pixi-world").getAttribute("data-replay-event")).toBe("91");
    expect(screen.getByText(/Replay framing is locked/)).toBeTruthy();
    expect(screen.getByText(/Replay camera locked/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Inspect" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("offers water and material interventions with a pressed traffic overlay control", () => {
    render(
      <WorldStage
        seed={11}
        view={view}
        selectedId={null}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: false, traffic: true }}
        feedback="Ready"
        {...callbacks}
      />,
    );

    const trails = screen.getByRole("button", { name: "Toggle traffic trails" });
    expect(trails.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Replenish water" }));
    expect(callbacks.onTool).toHaveBeenLastCalledWith("replenish-water");
    expect(screen.getByRole("button", { name: "Drain water" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));
    expect(callbacks.onTool).toHaveBeenLastCalledWith("add-material");
    expect(screen.getByRole("button", { name: "Remove material" })).toBeTruthy();
    expect(screen.getByText("water source")).toBeTruthy();
    expect(screen.getByText("shelter / site")).toBeTruthy();
    expect(screen.getByText("recent traffic")).toBeTruthy();
  });
});
