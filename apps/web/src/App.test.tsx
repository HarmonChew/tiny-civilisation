import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldView } from "./model";

const view = {
  tick: 120,
  timeLabel: "00:12",
  hash: "abcdef1234567890",
  width: 4,
  height: 3,
  population: 2,
  foodStock: 18,
  tiles: Array.from({ length: 12 }, (_, index) => ({
    index,
    x: index % 4,
    y: Math.floor(index / 4),
    terrain: "GROUND",
    blocked: false,
    fertility: 0,
    hazard: 0,
  })),
  resources: [{ id: 30, kind: "FOOD", x: 1, y: 1, stock: 18, capacity: 24 }],
  structures: [
    {
      id: 40,
      kind: "STORAGE",
      x: 2,
      y: 1,
      groupId: 1,
      progress: 100,
      stored: 6,
      capacity: 20,
    },
  ],
  groups: [
    {
      id: 1,
      name: "Mossbank",
      memberIds: [1, 2],
      leaderId: 1,
      home: { x: 2, y: 1 },
      cohesion: 74,
      sharingNorm: 0.4,
      conflictNorm: -0.2,
      storageIds: [40],
    },
  ],
  events: [
    {
      id: 5,
      tick: 110,
      category: "social",
      type: "FOOD_SHARED",
      title: "A portion was shared",
      detail: "Iri shared food with Nalo.",
      actorIds: [2, 1],
      targetIds: [2],
      causedByEventIds: [4],
      importance: 0.5,
      playerCaused: false,
      decisionActorId: 1,
    },
  ],
  creatures: [
    {
      id: 1,
      name: "Iri",
      color: 0x8da268,
      x: 1,
      y: 1,
      alive: true,
      groupId: 1,
      role: "Forager",
      goal: "SHARE",
      action: "MOVING",
      goalTarget: { x: 2, y: 1 },
      health: 92,
      hunger: 58,
      fatigue: 22,
      traits: [
        { key: "generosity", label: "Generosity", value: 72 },
        { key: "loyalty", label: "Loyalty", value: 61 },
      ],
      inventory: [{ kind: "FOOD", quantity: 2 }],
      candidates: [
        {
          action: "SHARE",
          targetId: 2,
          utility: 0.76,
          selected: true,
          factors: [
            {
              key: "recipient_hunger",
              label: "Recipient hunger",
              contribution: 0.31,
              evidenceEventIds: [],
            },
          ],
        },
        {
          action: "KEEP",
          utility: 0.51,
          selected: false,
          factors: [],
        },
      ],
      memories: [
        {
          id: 9,
          kind: "HELP_RECEIVED",
          subjectId: 2,
          strength: 80,
          valence: 0.7,
          ageTicks: 40,
          sourceEventIds: [4],
        },
      ],
      relationships: [
        {
          otherId: 2,
          otherName: "Nalo",
          direction: "toward",
          trust: 0.77,
          fear: 4,
          familiarity: 68,
          rivalry: 2,
        },
      ],
    },
    {
      id: 2,
      name: "Nalo",
      color: 0xd4775f,
      x: 2,
      y: 1,
      alive: true,
      groupId: 1,
      role: "Drifter",
      goal: "EAT",
      action: "WORKING",
      health: 84,
      hunger: 91,
      fatigue: 31,
      traits: [{ key: "sociability", label: "Sociability", value: 65 }],
      inventory: [{ kind: "FOOD", quantity: 1 }],
      candidates: [],
      memories: [],
      relationships: [],
    },
  ],
} satisfies WorldView;

vi.mock("./sim-adapter", () => ({
  ticksPerSecond: 10,
  makeWorldView: vi.fn(() => view),
}));

vi.mock("./components/PixiWorld", () => ({
  PixiWorld: ({
    onSelect,
    onWorldAction,
  }: {
    onSelect: (id: number) => void;
    onWorldAction: (action: {
      tile: WorldView["tiles"][number];
      worldPosition: { x: number; y: number };
    }) => void;
  }) => (
    <div aria-label="Mock living dish">
      <button type="button" onClick={() => onSelect(2)}>
        Select Nalo in dish
      </button>
      <button
        type="button"
        onClick={() =>
          onWorldAction({ tile: view.tiles[0]!, worldPosition: { x: 0.5, y: 0.5 } })
        }
      >
        Apply active tool
      </button>
    </div>
  ),
}));

import App from "./App";

describe("Tiny Civilisation workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows a factual, inspectable simulation workspace", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.getByText("Tiny Civilisation")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Living dish" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Field chronicle" })).toBeTruthy();
    expect(await screen.findByText("A portion was shared")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "A portion was shared. Inspect causal evidence.",
      }),
    );
    expect(screen.getByRole("heading", { name: "Iri" })).toBeTruthy();
    expect(screen.getByText("Recipient hunger")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Nalo in dish" }));
    expect(screen.getByRole("heading", { name: "Nalo" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "A portion was shared. Inspect causal evidence.",
      }),
    );
    expect(screen.getByRole("heading", { name: "Iri" })).toBeTruthy();
  });

  it("supports stepping, selecting, following, and a condition-only intervention", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await screen.findByText("Observation paused");

    const stepButton = screen.getByRole("button", { name: /Advance one tick/ });
    expect((stepButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stepButton);
    await waitFor(() => expect((stepButton as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText("Observation paused")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Nalo in dish" }));
    expect(screen.getByRole("heading", { name: "Nalo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Follow Nalo" }));
    expect(screen.getByRole("button", { name: "Stop following Nalo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add food" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply active tool" }));
    expect(await screen.findByText(/Food addition of 12 units scheduled/)).toBeTruthy();
  });
});
