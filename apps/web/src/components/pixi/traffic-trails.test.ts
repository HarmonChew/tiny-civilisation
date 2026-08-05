import { describe, expect, it } from "vitest";
import type { CreatureView } from "../../model";
import {
  MAX_TRAFFIC_TRAILS,
  deriveTrafficTrails,
  trafficTrailStyle,
} from "./traffic-trails";

function creature(id: number, route: CreatureView["route"]): CreatureView {
  return {
    id,
    name: `Creature ${id}`,
    color: 0x8ea66c,
    x: route.at(-1)?.x ?? 0.5,
    y: route.at(-1)?.y ?? 0.5,
    alive: true,
    role: "Forager",
    desire: "EXPLORE",
    plan: "EXPLORE_NEARBY",
    goal: "EXPLORE",
    action: "EXPLORE",
    actionPhase: "MOVING",
    reason: "Recent route",
    summary: {
      desire: "Exploring.",
      plan: "Following a route.",
      action: "Moving.",
      reason: "A nearby tile was chosen.",
    },
    route,
    health: 100,
    hunger: 20,
    fatigue: 20,
    thirst: 20,
    traits: [],
    inventory: [],
    candidates: [],
    memories: [],
    relationships: [],
  };
}

describe("traffic trail projection", () => {
  it("aggregates reverse traversals into deterministic undirected tile edges", () => {
    const trails = deriveTrafficTrails({
      width: 4,
      height: 3,
      creatures: [
        creature(1, [
          { tick: 1, x: 0.5, y: 0.5 },
          { tick: 2, x: 1.5, y: 0.5 },
          { tick: 3, x: 0.5, y: 0.5 },
        ]),
        creature(2, [
          { tick: 5, x: 1.5, y: 0.5 },
          { tick: 6, x: 0.5, y: 0.5 },
          { tick: 7, x: 0.5, y: 1.5 },
        ]),
      ],
    });

    expect(trails).toEqual([
      {
        key: "0:1",
        fromTileIndex: 0,
        toTileIndex: 1,
        from: { x: 0.5, y: 0.5 },
        to: { x: 1.5, y: 0.5 },
        count: 3,
        lastTick: 6,
      },
      {
        key: "0:4",
        fromTileIndex: 0,
        toTileIndex: 4,
        from: { x: 0.5, y: 0.5 },
        to: { x: 0.5, y: 1.5 },
        count: 1,
        lastTick: 7,
      },
    ]);
  });

  it("sorts by count, recency, then edge key and caps the visible set", () => {
    const route = Array.from({ length: 31 }, (_, index) => ({
      tick: index,
      x: (index % 4) + 0.5,
      y: Math.floor(index / 4) + 0.5,
    }));
    const trails = deriveTrafficTrails(
      { width: 4, height: 8, creatures: [creature(1, route)] },
      MAX_TRAFFIC_TRAILS,
    );

    expect(trails).toHaveLength(MAX_TRAFFIC_TRAILS);
    expect(trails[0]?.lastTick).toBeGreaterThan(trails.at(-1)?.lastTick ?? -1);
  });

  it("makes busier trails wider and newer trails more prominent", () => {
    const quiet = trafficTrailStyle({ count: 1, lastTick: 100 }, 100);
    const busy = trafficTrailStyle({ count: 12, lastTick: 100 }, 100);
    const old = trafficTrailStyle({ count: 12, lastTick: 0 }, 1_000);

    expect(busy.width).toBeGreaterThan(quiet.width);
    expect(busy.alpha).toBeGreaterThan(old.alpha);
    expect(busy.alpha).toBeLessThanOrEqual(0.42);
  });
});
