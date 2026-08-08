import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatureView, TimelineEventView, WorldView } from "../model";
import { DEFAULT_SCENARIO_VIEW } from "../experiment/scenario-presets";
import { WorldAttentionAnnouncer, WorldNavigator } from "./WorldNavigator";

const makeCreature = (
  id: number,
  name: string,
  x: number,
  y: number,
  alive = true,
): CreatureView => ({
  id,
  name,
  color: id === 1 ? 0x8ea66c : 0xd4775f,
  x,
  y,
  alive,
  role: id === 1 ? "Forager" : "Scout",
  desire: id === 1 ? "SECURE_PROVISIONS" : "BELONG",
  plan: id === 1 ? "TRAVEL_TO_RESOURCE" : "SEEK_COMPANY",
  goal: id === 1 ? "GATHER_FOOD" : "JOIN_GROUP",
  action: id === 1 ? "GATHER_FOOD" : "EXPLORE",
  actionPhase: "WORKING",
  reason: "A retained fact supports this choice.",
  summary: {
    desire: `${name} wants a secure supply.`,
    plan: `${name} plans to reach a known place.`,
    action: `${name} is acting now.`,
    reason: `${name} has retained evidence for this choice.`,
  },
  route: [],
  health: 90,
  hunger: 35,
  fatigue: 20,
  thirst: 35,
  traits: [],
  inventory: [],
  candidates: [],
  memories: [],
  relationships: [],
});

const makeEvent = (
  id: number,
  tick: number,
  attentionTier: TimelineEventView["attentionTier"],
  title: string,
): TimelineEventView => ({
  id,
  tick,
  category: "social",
  type: title.toUpperCase().replace(/\s+/g, "_"),
  title,
  detail: `${title} has a retained factual detail`,
  actorIds: [1],
  targetIds: [],
  causedByEventIds: [],
  importance: attentionTier === "CRITICAL" ? 90 : 50,
  attentionTier,
  clusterKey: `event:${id}`,
  playerCaused: false,
});

const baseView: WorldView = {
  scenario: DEFAULT_SCENARIO_VIEW,
  tick: 10,
  timeLabel: "Dawn",
  hash: "navigator",
  width: 12,
  height: 8,
  tiles: [],
  creatures: [
    makeCreature(1, "Alpha", 2, 2),
    makeCreature(9, "Gone", 0, 0, false),
    makeCreature(2, "Beta", 5, 1),
  ],
  resources: [
    { id: 6, kind: "FOOD", x: 2, y: 2, stock: 4, capacity: 12 },
    { id: 7, kind: "MATERIAL", x: 1, y: 1, stock: 3, capacity: 9 },
  ],
  structures: [
    {
      id: 1,
      kind: "STORAGE_SITE",
      x: 2,
      y: 2,
      progress: 48,
      stored: 0,
      capacity: 10,
    },
    {
      id: 3,
      kind: "STORAGE_SITE",
      x: 4,
      y: 0,
      progress: 100,
      stored: 5,
      capacity: 10,
    },
  ],
  groups: [],
  events: [],
  population: 2,
  foodStock: 4,
};

const callbacks = () => ({
  onSelect: vi.fn(),
  onKeyboardFocus: vi.fn(),
  onHover: vi.fn(),
});

afterEach(() => vi.useRealTimers());

describe("WorldNavigator", () => {
  it("exposes temporary memorials and permanent records in a remembered view", () => {
    const actions = callbacks();
    const lifecycleView: WorldView = {
      ...baseView,
      memorials: [
        {
          id: 700,
          deceasedId: 77,
          deceasedName: "Iri",
          tileIndex: 26,
          x: 2,
          y: 2,
          createdTick: 8,
          expiresTick: 608,
          heirId: 1,
          estate: { food: 1, material: 2, water: 3 },
          mournersRemaining: 2,
        },
      ],
      lifeRecords: [
        {
          id: 77,
          name: "Iri",
          color: 0x8ea66c,
          sex: "FEMALE",
          childIds: [1],
          birthTick: -10_000,
          deathTick: 8,
          ageTicks: 10_008,
          finalLifeStage: "ADULT",
          deathCause: "DEHYDRATION",
          inheritedTraits: [],
          skillPotential: [],
          majorEventIds: [91],
          heirId: 1,
        },
      ],
    };
    render(
      <WorldNavigator
        view={lifecycleView}
        selectedRef={{ kind: "creature", id: 77 }}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...actions}
      />,
    );

    expect(
      screen.getByText(/Iri has died; selection remains on their permanent life record/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remembered" }));
    const remembered = screen.getByRole("list", {
      name: "Remembered in spatial order",
    });
    expect(within(remembered).getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen
        .getByRole("button", { name: /Iri, permanent life record/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /Iri's temporary memorial/ })).toBeTruthy();
  });

  it("renders one semantic list in deterministic spatial, ID, and kind order", () => {
    const actions = callbacks();
    render(
      <WorldNavigator
        view={baseView}
        selectedRef={null}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...actions}
      />,
    );

    const list = screen.getByRole("list", { name: "All in spatial order" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")?.split(",")[0]),
    ).toEqual([
      "Storage site 3",
      "Material resource 7",
      "Beta",
      "Alpha",
      "Storage site 1",
      "Food resource 6",
    ]);
    expect(screen.queryByRole("button", { name: /^Gone,/ })).toBeNull();
    expect(screen.getByText(/2 living creatures across 2 occupied tiles/)).toBeTruthy();
    expect(
      screen.getByText(/Named places: West bank, East bank, Central passage/),
    ).toBeTruthy();
    const westBank = screen.getByRole("button", { name: /^Inspect West bank,/ });
    fireEvent.click(westBank);
    expect(actions.onSelect).toHaveBeenCalledWith({
      kind: "tile",
      tileIndex: DEFAULT_SCENARIO_VIEW.landmarks[0]?.tileIndices[0],
    });
    const betaName = screen
      .getByRole("button", { name: /^Beta,/ })
      .getAttribute("aria-label");
    expect(betaName).toContain("reason: A retained fact supports this choice.");
    expect(betaName).toContain("thirst 35 percent");
    expect(betaName).not.toContain("no alert");

    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    expect(
      within(screen.getByRole("list", { name: "Resources in spatial order" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Resources" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("uses roving arrow focus, native selection keys, and Escape focus return", () => {
    const actions = callbacks();
    render(
      <WorldNavigator
        view={baseView}
        selectedRef={null}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...actions}
      />,
    );

    const first = screen.getByRole("button", { name: /^Storage site 3,/ });
    const second = screen.getByRole("button", { name: /^Material resource 7,/ });
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);

    fireEvent.keyDown(second, { key: "Enter" });
    fireEvent.keyDown(second, { key: " " });
    expect(actions.onSelect).toHaveBeenNthCalledWith(1, { kind: "resource", id: 7 });
    expect(actions.onSelect).toHaveBeenNthCalledWith(2, { kind: "resource", id: 7 });

    fireEvent.keyDown(second, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "All" }));
    expect(actions.onKeyboardFocus).toHaveBeenLastCalledWith(null);
  });

  it("mirrors external selected and focused refs and gives each subject a factual summary", () => {
    const actions = callbacks();
    const { rerender } = render(
      <WorldNavigator
        view={baseView}
        selectedRef={{ kind: "resource", id: 7 }}
        focusedRef={{ kind: "creature", id: 2 }}
        keyboardFocusedRef={null}
        {...actions}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /^Material resource 7,/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /^Beta,/ }).className).toContain(
      "is-focused",
    );
    expect(screen.getByText(/Material resource 7 at column 1, row 1/)).toBeTruthy();

    rerender(
      <WorldNavigator
        view={baseView}
        selectedRef={{ kind: "creature", id: 1 }}
        focusedRef={{ kind: "creature", id: 1 }}
        keyboardFocusedRef={{ kind: "creature", id: 1 }}
        {...actions}
      />,
    );
    expect(screen.getByText(/Alpha at column 2, row 2/).textContent).toContain(
      "Alpha wants a secure supply",
    );
  });

  it("moves focus to the next spatial item when the focused subject disappears", () => {
    const actions = callbacks();
    const focusedRef = { kind: "resource", id: 7 } as const;
    const { rerender } = render(
      <WorldNavigator
        view={baseView}
        selectedRef={null}
        focusedRef={focusedRef}
        keyboardFocusedRef={focusedRef}
        {...actions}
      />,
    );
    screen.getByRole("button", { name: /^Material resource 7,/ }).focus();

    rerender(
      <WorldNavigator
        view={{
          ...baseView,
          resources: baseView.resources.filter((resource) => resource.id !== 7),
        }}
        selectedRef={null}
        focusedRef={focusedRef}
        keyboardFocusedRef={focusedRef}
        {...actions}
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Storage site 3,/ }),
    );
    expect(actions.onKeyboardFocus).toHaveBeenLastCalledWith({
      kind: "structure",
      id: 3,
    });
  });

  it("exposes urgent creature state with visible and textual alert cues", () => {
    const atRisk = {
      ...makeCreature(1, "Alpha", 2, 2),
      health: 30,
      hunger: 80,
      action: "FLEE",
    } satisfies CreatureView;
    render(
      <WorldNavigator
        view={{ ...baseView, creatures: [atRisk] }}
        selectedRef={null}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...callbacks()}
      />,
    );

    const subject = screen.getByRole("button", { name: /^Alpha,/ });
    expect(subject.getAttribute("aria-label")).toContain(
      "alert: health risk, high hunger, fleeing a threat",
    );
    expect(screen.getByText(/Alert: health risk/).textContent).toContain(
      "fleeing a threat",
    );
  });

  it("exposes water stock, depletion, thirst, and carried water without color alone", () => {
    const thirsty = {
      ...makeCreature(1, "Alpha", 2, 2),
      thirst: 82,
      inventory: [{ kind: "WATER", quantity: 2 }],
    } satisfies CreatureView;
    render(
      <WorldNavigator
        view={{
          ...baseView,
          creatures: [thirsty],
          resources: [
            ...baseView.resources,
            {
              id: 8,
              kind: "WATER",
              x: 3,
              y: 4,
              stock: 0,
              capacity: 16,
              access: {
                interactionCapacity: 3,
                claimedInteractionSlots: 2,
                reachableCreatures: 1,
                livingCreatures: 1,
                nearestWeightedCost: 40,
                meanWeightedCost: 40,
              },
            },
          ],
        }}
        selectedRef={null}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...callbacks()}
      />,
    );

    const waterSource = screen.getByRole("button", { name: /^Water source 8,/ });
    expect(waterSource.getAttribute("aria-label")).toContain(
      "alert: water source depleted",
    );
    expect(waterSource.getAttribute("aria-label")).toContain(
      "2 of 3 interaction slots claimed",
    );
    expect(waterSource.getAttribute("aria-label")).toContain(
      "nearest weighted travel cost 40 move-cost units",
    );
    expect(screen.getByText(/thirst 82%/i).textContent).toContain("2 water carried");
    expect(screen.getByText(/Alert: water source depleted/i)).toBeTruthy();
    expect(screen.getByText(/1 water source holds 0 units/i)).toBeTruthy();
  });

  it("indexes settlement groups and shelter condition, capacity, occupancy, and upkeep in text", () => {
    const settlementView: WorldView = {
      ...baseView,
      structures: [
        ...baseView.structures,
        {
          id: 72,
          kind: "SHELTER",
          x: 7,
          y: 4,
          groupId: 12,
          progress: 100,
          stored: 0,
          capacity: 6,
          condition: 38,
          baseCapacity: 6,
          effectiveCapacity: 3,
          reservedSpaces: 3,
          restingCreatures: 2,
          memberOccupancy: 1,
          guestOccupancy: 1,
          upkeepNeeded: true,
        },
      ],
      groups: [
        {
          id: 12,
          name: "Mossbank",
          stage: "PERSISTENT",
          memberIds: [1, 2],
          leaderId: 1,
          home: { x: 7.5, y: 4.5 },
          cohesion: 76,
          sharingNorm: 0.3,
          conflictNorm: 0,
          storageIds: [3],
          activeShelterId: 72,
          shelterRelocations: 0,
          shelterCommitUntilTick: 80,
        },
      ],
    };
    const actions = callbacks();
    render(
      <WorldNavigator
        view={settlementView}
        selectedRef={{ kind: "group", id: 12 }}
        focusedRef={null}
        keyboardFocusedRef={null}
        {...actions}
      />,
    );

    const shelter = screen.getByRole("button", { name: /^Shelter 72,/ });
    expect(shelter.getAttribute("aria-label")).toContain("condition 38 percent");
    expect(shelter.getAttribute("aria-label")).toContain(
      "2 resting and 3 reserved of 3 usable spaces",
    );
    expect(shelter.getAttribute("aria-label")).toContain("alert: shelter needs upkeep");
    expect(shelter.getAttribute("aria-label")).toContain("all shelter spaces reserved");
    const group = screen.getByRole("button", { name: /^Mossbank,/ });
    expect(group.getAttribute("aria-pressed")).toBe("true");
    expect(group.getAttribute("aria-label")).toContain("home shelter 38 percent condition");
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(
      within(screen.getByRole("list", { name: "Groups in spatial order" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  it("debounces polite announcements and ignores routine or notable changes", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const existing = makeEvent(1, 9, "SIGNIFICANT", "Existing alliance");
    const { rerender } = render(
      <WorldAttentionAnnouncer view={{ ...baseView, events: [existing] }} />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    rerender(
      <WorldAttentionAnnouncer
        view={{
          ...baseView,
          tick: 11,
          events: [existing, makeEvent(2, 11, "ROUTINE", "Routine movement")],
        }}
      />,
    );
    rerender(
      <WorldAttentionAnnouncer
        view={{
          ...baseView,
          tick: 12,
          events: [existing, makeEvent(3, 12, "NOTABLE", "Notable gathering")],
        }}
      />,
    );
    act(() => vi.advanceTimersByTime(500));
    expect(status.textContent).toBe("");

    const significant = makeEvent(4, 13, "SIGNIFICANT", "Store completed");
    rerender(
      <WorldAttentionAnnouncer
        view={{ ...baseView, tick: 13, events: [existing, significant] }}
      />,
    );
    act(() => vi.advanceTimersByTime(200));
    expect(status.textContent).toBe("");

    const critical = makeEvent(5, 14, "CRITICAL", "Conflict erupted");
    rerender(
      <WorldAttentionAnnouncer
        view={{ ...baseView, tick: 14, events: [existing, significant, critical] }}
      />,
    );
    act(() => vi.advanceTimersByTime(399));
    expect(status.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(status.textContent).toContain("Critical event: Conflict erupted");
    expect(status.textContent).not.toContain("Store completed");
  });
});
