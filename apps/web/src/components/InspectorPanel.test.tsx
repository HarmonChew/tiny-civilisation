import { fireEvent, render, screen, within } from "@testing-library/react";
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
  thirst: 42,
  waterAccess: {
    sourceId: 91,
    sourceStock: 18,
    sourceCapacity: 30,
    weightedCost: 120,
    reachableSources: 1,
    totalSources: 1,
    interactionCapacity: 3,
    claimedInteractionSlots: 1,
  },
  shelterAccess: {
    shelterId: 72,
    weightedCost: 84,
    eligibility: "MEMBER",
    condition: 68,
    effectiveCapacity: 4,
    reservedSpaces: 3,
    restingCreatures: 2,
    destination: "SHELTERED",
    reason: "The group shelter has a member space and recovers fatigue faster.",
  },
  traits: [],
  inventory: [
    { kind: "food", quantity: 2 },
    { kind: "water", quantity: 3 },
  ],
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
        {
          key: "weighted travel cost",
          label: "Weighted travel cost",
          contribution: -700,
          evidenceEventIds: [],
          factLabel: "Weighted travel cost",
          factValue: 70,
          factUnit: "MOVE_COST",
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
  it("discloses lifecycle, caregiver, lineage, and inherited potential facts", () => {
    const youth: CreatureView = {
      ...creature,
      sex: "FEMALE",
      ageTicks: 1_200,
      lifeStage: "JUVENILE",
      naturalLifespanTicks: 19_500,
      birthTick: -1_080,
      motherId: 2,
      fatherId: 3,
      caregiverId: 2,
      childIds: [],
      dependent: true,
      pregnant: false,
      inheritedTraits: [{ key: "loyalty", label: "Loyalty", value: 72 }],
      skillPotential: [{ key: "foraging", label: "Foraging", value: 64 }],
    };
    const lifecycleView: WorldView = {
      ...view,
      creatures: [
        youth,
        { ...creature, id: 2, name: "Iri" },
        { ...creature, id: 3, name: "Nalo" },
      ],
    };
    render(
      <InspectorPanel
        creature={youth}
        view={lifecycleView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Lifecycle and lineage")).toBeTruthy();
    expect(screen.getByText(/Female \/ Juvenile/)).toBeTruthy();
    expect(screen.getByText("Iri and Nalo")).toBeTruthy();
    expect(screen.getByText("Caregiver: Iri")).toBeTruthy();
    expect(screen.getByText(/Loyalty 72%/)).toBeTruthy();
    expect(screen.getByText(/Foraging 64%/)).toBeTruthy();
  });

  it("keeps a dead selected creature readable through its permanent life record", () => {
    const rememberedView: WorldView = {
      ...view,
      creatures: [],
      lifeRecords: [
        {
          id: 1,
          name: "Aro",
          color: creature.color,
          sex: "MALE",
          motherId: 2,
          childIds: [4],
          birthTick: -11_000,
          deathTick: 240,
          ageTicks: 11_240,
          finalLifeStage: "ADULT",
          deathCause: "INJURY",
          inheritedTraits: [{ key: "generosity", label: "Generosity", value: 72 }],
          skillPotential: [{ key: "foraging", label: "Foraging", value: 64 }],
          majorEventIds: [44],
          heirId: 4,
        },
      ],
    };
    render(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "creature", id: 1 }}
        view={rememberedView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Permanent life record")).toBeTruthy();
    expect(screen.getByText("Injury")).toBeTruthy();
    expect(screen.getByText(/Generosity 72%/)).toBeTruthy();
    expect(screen.getByText(/Foraging 64%/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Follow Aro/ })).toBeNull();
  });

  it("links a temporary memorial to its named heir and permanent record", () => {
    const onSelectSubject = vi.fn();
    const memorialView: WorldView = {
      ...view,
      creatures: [{ ...creature, id: 2, name: "Iri" }],
      memorials: [
        {
          id: 50,
          deceasedId: 1,
          deceasedName: "Aro",
          tileIndex: 10,
          x: 10,
          y: 0,
          createdTick: 120,
          expiresTick: 720,
          heirId: 2,
          estate: { food: 3, material: 2, water: 4 },
          mournersRemaining: 1,
        },
      ],
      lifeRecords: [
        {
          id: 1,
          name: "Aro",
          color: creature.color,
          sex: "MALE",
          childIds: [2],
          birthTick: -11_000,
          deathTick: 120,
          ageTicks: 11_120,
          finalLifeStage: "ADULT",
          deathCause: "INJURY",
          inheritedTraits: [],
          skillPotential: [],
          majorEventIds: [],
          heirId: 2,
        },
      ],
    };
    render(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "memorial", id: 50 }}
        view={memorialView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
        onSelectSubject={onSelectSubject}
      />,
    );

    expect(screen.getByText("Temporary memorial")).toBeTruthy();
    expect(screen.getByText("Iri")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open permanent life record for Aro",
      }),
    );
    expect(onSelectSubject).toHaveBeenCalledWith({ kind: "life-record", id: 1 });
  });

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
    expect(screen.getByText("weighted travel cost 70 move-cost units")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Thirst: 42 percent" })).toBeTruthy();
    expect(screen.getByText("Water")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    const waterAccess = screen.getByLabelText("Aro water access").textContent ?? "";
    expect(waterAccess).toContain("Source 91: 18/30");
    expect(waterAccess).toContain("120 move-cost units");
    expect(waterAccess).toContain("1/3 claimed");
    const shelterAccess = screen.getByLabelText("Aro shelter access").textContent ?? "";
    expect(shelterAccess).toContain("Shelter 72");
    expect(shelterAccess).toContain("Member");
    expect(shelterAccess).toContain("3/4 spaces reserved");
  });

  it("switches between inspectable group and shelter notebooks with factual upkeep and site rationale", () => {
    const shelterView: WorldView = {
      ...view,
      events: [
        {
          id: 401,
          tick: 90,
          category: "group",
          type: "SHELTER_CONDITION_LOW",
          title: "Shelter condition became low",
          detail: "Use and time reduced the home below its low-condition threshold.",
          actorIds: [],
          targetIds: [],
          groupIds: [8],
          causedByEventIds: [],
          importance: 42,
          attentionTier: "NOTABLE",
          clusterKey: "shelter:8:condition",
          playerCaused: false,
        },
      ],
      groups: [
        {
          id: 8,
          name: "Mossbank",
          stage: "PERSISTENT",
          memberIds: [1],
          leaderId: 1,
          home: { x: 8.5, y: 6.5 },
          cohesion: 72,
          sharingNorm: 0.4,
          conflictNorm: 0,
          storageIds: [60],
          activeShelterId: 72,
          shelterRelocations: 0,
          shelterCommitUntilTick: 240,
        },
      ],
      structures: [
        {
          id: 72,
          kind: "SHELTER",
          x: 8,
          y: 6,
          groupId: 8,
          progress: 100,
          stored: 0,
          capacity: 6,
          condition: 44,
          baseCapacity: 6,
          effectiveCapacity: 3,
          reservedSpaces: 3,
          restingCreatures: 2,
          memberOccupancy: 1,
          guestOccupancy: 1,
          upkeepNeeded: true,
          siteAssessment: {
            selectedAtTick: 40,
            memberTravelCost: 21,
            storageTravelCost: 13,
            foodAccessCost: 18,
            materialAccessCost: 9,
            waterAccessCost: 16,
            crowdingCost: 2,
            constructionInvestmentCost: 5,
            relocationChangeCost: 0,
            totalScore: 84,
          },
        },
      ],
    };
    const onSelectSubject = vi.fn();
    const { rerender } = render(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "structure", id: 72 }}
        view={shelterView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
        onSelectSubject={onSelectSubject}
      />,
    );

    expect(screen.getByRole("heading", { name: "Shelter" })).toBeTruthy();
    expect(screen.getByText("Active; upkeep needed")).toBeTruthy();
    expect(screen.getByText("3 of 6")).toBeTruthy();
    expect(screen.getByText("1 members; 1 guests")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Why this site" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mossbank" }));
    expect(onSelectSubject).toHaveBeenCalledWith({ kind: "group", id: 8 });

    rerender(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "group", id: 8 }}
        view={shelterView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
        onSelectSubject={onSelectSubject}
      />,
    );
    expect(screen.getByRole("heading", { name: "Mossbank" })).toBeTruthy();
    expect(screen.getByText(/Shelter 72 at 44 percent condition/)).toBeTruthy();
    expect(screen.getByText("Shelter condition became low")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Active shelter 72/ }));
    expect(onSelectSubject).toHaveBeenLastCalledWith({ kind: "structure", id: 72 });
  });

  it("keeps absent and abandoned settlement states explicit with long subject names", () => {
    const longName =
      "The Windward Mossbank Fellowship With A Deliberately Long Observational Name";
    const abandonedView: WorldView = {
      ...view,
      groups: [
        {
          id: 18,
          name: longName,
          stage: "PERSISTENT",
          memberIds: [1],
          leaderId: 1,
          home: { x: 4.5, y: 5.5 },
          cohesion: 64,
          sharingNorm: 0.2,
          conflictNorm: 0,
          storageIds: [60],
          shelterRelocations: 0,
          shelterCommitUntilTick: 0,
        },
      ],
      structures: [
        {
          id: 73,
          kind: "ABANDONED_SHELTER",
          x: 3,
          y: 5,
          groupId: 18,
          progress: 100,
          stored: 0,
          capacity: 6,
          condition: 36,
          baseCapacity: 6,
          effectiveCapacity: 0,
          reservedSpaces: 0,
          restingCreatures: 0,
          memberOccupancy: 0,
          guestOccupancy: 0,
          upkeepNeeded: false,
        },
      ],
    };
    const { rerender } = render(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "group", id: 18 }}
        view={abandonedView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: longName })).toBeTruthy();
    expect(screen.getByText("No communal shelter")).toBeTruthy();
    expect(screen.getByText("No active home to relocate")).toBeTruthy();

    rerender(
      <InspectorPanel
        creature={null}
        subjectRef={{ kind: "structure", id: 73 }}
        view={abandonedView}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Abandoned former home")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Former home record" })).toBeTruthy();
    expect(
      screen.getByText("Inspectable history only; no rest or upkeep claims"),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Use and upkeep" })).toBeNull();
  });

  it("states when outdoor rest is the selected fallback", () => {
    render(
      <InspectorPanel
        creature={{
          ...creature,
          action: "REST",
          shelterAccess: {
            shelterId: null,
            weightedCost: null,
            eligibility: null,
            condition: null,
            effectiveCapacity: 0,
            reservedSpaces: 0,
            restingCreatures: 0,
            destination: "OUTDOOR",
            reason: "No reachable eligible shelter claim exists.",
          },
          summary: {
            ...creature.summary,
            reason: "Aro is exhausted and has no eligible shelter claim.",
          },
        }}
        view={view}
        evidenceEvent={null}
        followed={false}
        onFollow={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const shelterAccess = screen.getByLabelText("Aro shelter access");
    expect(shelterAccess.textContent).toContain("Outdoor rest selected");
    expect(shelterAccess.textContent).toContain("No reachable eligible shelter route");
    expect(shelterAccess.textContent).toContain("Not applicable to outdoor rest");
    expect(shelterAccess.textContent).toContain(
      "No reachable eligible shelter claim exists.",
    );
  });

  it("retains storage contents and separates site material from work progress", () => {
    const structureView: WorldView = {
      ...view,
      structures: [
        {
          id: 60,
          kind: "STORAGE",
          x: 4,
          y: 4,
          groupId: 8,
          progress: 100,
          stored: 9,
          storedMaterial: 4,
          capacity: 40,
          materialDeposited: 12,
          materialRequired: 12,
          workRequired: 7_000,
        },
        {
          id: 72,
          kind: "SHELTER_SITE",
          x: 8,
          y: 6,
          groupId: 8,
          progress: 72,
          stored: 0,
          storedMaterial: 0,
          capacity: 6,
          materialDeposited: 18,
          materialRequired: 18,
          workRequired: 10_000,
        },
      ],
    };
    const commonProps = {
      creature: null,
      view: structureView,
      evidenceEvent: null,
      followed: false,
      onFollow: vi.fn(),
      onSelect: vi.fn(),
    } as const;
    const { rerender } = render(
      <InspectorPanel {...commonProps} subjectRef={{ kind: "structure", id: 60 }} />,
    );

    expect(screen.getByRole("heading", { name: "Stored provisions" })).toBeTruthy();
    expect(screen.getByText("9 units")).toBeTruthy();
    expect(screen.getByText("4 units")).toBeTruthy();
    expect(screen.getByText("13 of 40 units used")).toBeTruthy();

    rerender(
      <InspectorPanel {...commonProps} subjectRef={{ kind: "structure", id: 72 }} />,
    );
    expect(screen.getByRole("heading", { name: "Construction inputs" })).toBeTruthy();
    expect(screen.getByText("18 of 18 units")).toBeTruthy();
    expect(screen.getAllByText("72 percent")).not.toHaveLength(0);
    expect(screen.getByText("10000 work units")).toBeTruthy();
  });
});
