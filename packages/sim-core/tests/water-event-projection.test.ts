import { describe, expect, it } from "vitest";
import {
  createRenderSnapshot,
  createSimulation,
  type DomainEvent,
  type SimulationState,
} from "../src/index.js";

function waterEvent(
  id: number,
  tick: number,
  type: DomainEvent["type"],
  attentionTier: DomainEvent["attentionTier"],
  importance: number,
  summary: string,
  overrides: Partial<DomainEvent> = {},
): DomainEvent {
  return {
    id,
    tick,
    type,
    actorIds: [1],
    targetIds: [],
    groupIds: [],
    locationTileIndex: 10,
    resourceKind: "WATER",
    quantity: 1,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance,
    attentionTier,
    clusterKey: `authoritative:${id}`,
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary,
    ...overrides,
  };
}

describe("water event projection", () => {
  it("projects compact hydration observations without mutating authoritative events", () => {
    const state = createSimulation(73) as SimulationState;
    state.domainEvents = [
      waterEvent(101, 10, "WATER_DRUNK", "ROUTINE", 8, "Aster drank one water."),
      waterEvent(102, 20, "WATER_DRUNK", "ROUTINE", 8, "Bramble drank one water."),
      waterEvent(103, 30, "WATER_DRUNK", "ROUTINE", 8, "Aster drank one water.", {
        causedByEventIds: [91],
      }),
      waterEvent(
        104,
        40,
        "WATER_SHARED",
        "NOTABLE",
        28,
        "Aster shared water with Bramble.",
        { targetIds: [2], causedByEventIds: [92] },
      ),
      waterEvent(
        105,
        50,
        "WATER_SHARED",
        "NOTABLE",
        28,
        "Bramble shared water with Aster.",
        { actorIds: [2], targetIds: [1] },
      ),
      waterEvent(
        106,
        60,
        "WATER_SHARED",
        "NOTABLE",
        28,
        "Aster shared water with Bramble.",
        { targetIds: [2], causedByEventIds: [93] },
      ),
      waterEvent(
        107,
        70,
        "WATER_SOURCE_DEPLETED",
        "SIGNIFICANT",
        64,
        "Aster drew the potable water source empty.",
        { targetIds: [80], quantity: 0 },
      ),
      waterEvent(
        108,
        80,
        "SEVERE_THIRST_STARTED",
        "SIGNIFICANT",
        58,
        "Bramble entered severe thirst.",
        { actorIds: [2], quantity: 8_004 },
      ),
    ];
    state.metrics.waterDrunk = 3;
    state.metrics.waterShared = 3;

    const snapshot = createRenderSnapshot(state, false);
    expect(snapshot.recentEvents.filter((event) => event.type === "WATER_DRUNK")).toEqual([
      expect.objectContaining({
        id: 103,
        quantity: 3,
        clusterKey: "presentation:water-drinking:routine",
        causedByEventIds: [91],
        summary: "3 routine drinks were recorded; latest: Aster drank one water.",
      }),
    ]);
    expect(snapshot.recentEvents.filter((event) => event.type === "WATER_SHARED")).toEqual([
      expect.objectContaining({
        id: 104,
        quantity: 1,
        clusterKey: "presentation:water-share:first",
        causedByEventIds: [92],
      }),
      expect.objectContaining({
        id: 106,
        quantity: 2,
        clusterKey: "presentation:water-share:continued",
        causedByEventIds: [93],
        summary:
          "2 later water shares were recorded; latest: Aster shared water with Bramble.",
      }),
    ]);
    expect(snapshot.recentEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["WATER_SOURCE_DEPLETED", "SEVERE_THIRST_STARTED"]),
    );

    expect(state.domainEvents).toHaveLength(8);
    expect(state.domainEvents[0]?.clusterKey).toBe("authoritative:101");
    expect(state.domainEvents[3]?.clusterKey).toBe("authoritative:104");
    expect(state.domainEvents[3]?.summary).toBe("Aster shared water with Bramble.");
  });
});
