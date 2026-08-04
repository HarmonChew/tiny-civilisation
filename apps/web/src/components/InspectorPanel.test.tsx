import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreatureView, WorldView } from "../model";
import { DEFAULT_SCENARIO_VIEW } from "../experiment/scenario-presets";
import { InspectorPanel } from "./InspectorPanel";

const creature: CreatureView = {
  id: 1,
  name: "Aro",
  color: 0x6f8a58,
  x: 4.5,
  y: 6.5,
  alive: true,
  role: "Guard",
  desire: "PROTECT_PERSON_OR_GROUP",
  plan: "GUARD_SHARED_ASSET",
  goal: "PROTECT_PERSON_OR_GROUP",
  action: "GUARD",
  actionPhase: "WORKING",
  reason: "Protect shared storage",
  summary: {
    desire: "Aro wants to keep their people safe.",
    plan: "Aro plans to guard a shared asset.",
    action: "Aro is guarding.",
    reason: "Aro is doing this because the shared store needs watching.",
  },
  route: [],
  health: 92,
  hunger: 31,
  fatigue: 22,
  traits: [],
  inventory: [{ kind: "food", quantity: 2 }],
  candidates: [
    {
      action: "GUARD",
      desire: "PROTECT_PERSON_OR_GROUP",
      plan: "GUARD_SHARED_ASSET",
      utility: 7_100,
      selected: true,
      factors: [
        {
          key: "protect shared storage",
          label: "Protect shared storage",
          contribution: 1_250,
          evidenceEventIds: [],
          factLabel: "Shared store needs watching",
          factValue: 2,
        },
      ],
    },
  ],
  memories: [],
  relationships: [],
};

const view: WorldView = {
  scenario: DEFAULT_SCENARIO_VIEW,
  tick: 120,
  timeLabel: "Day 1 · 00:12",
  hash: "0123456789abcdef",
  width: 48,
  height: 32,
  tiles: [],
  creatures: [creature],
  resources: [],
  structures: [],
  groups: [],
  events: [],
  population: 1,
  foodStock: 0,
};

describe("InspectorPanel", () => {
  it("leads with authoritative desire, plan/action, and factual reason", () => {
    render(
      <InspectorPanel
        creature={creature}
        view={view}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const summary = screen.getByLabelText("Aro current summary");
    expect(
      within(summary)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Desire", "Plan / action", "Reason"]);
    expect(within(summary).getByText(creature.summary.desire)).toBeTruthy();
    expect(within(summary).getByText(/Aro plans to guard.*Aro is guarding/u)).toBeTruthy();
    expect(within(summary).getByText(creature.summary.reason)).toBeTruthy();
    expect(screen.getByText(/Protect person or group.*Guard shared asset/u)).toBeTruthy();
    expect(screen.getByText("retained value 2")).toBeTruthy();
  });
});
