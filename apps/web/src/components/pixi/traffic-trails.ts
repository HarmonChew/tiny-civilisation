import type { CreatureView, Point, WorldView } from "../../model";

export const MAX_TRAFFIC_TRAILS = 24;
const TRAFFIC_RECENCY_WINDOW_TICKS = 600;

export interface TrafficTrail {
  readonly key: string;
  readonly fromTileIndex: number;
  readonly toTileIndex: number;
  readonly from: Point;
  readonly to: Point;
  readonly count: number;
  readonly lastTick: number;
}

export interface TrafficTrailStyle {
  readonly width: number;
  readonly alpha: number;
}

interface RouteTile {
  readonly index: number;
  readonly tick: number;
}

interface MutableTrafficEdge {
  key: string;
  fromTileIndex: number;
  toTileIndex: number;
  count: number;
  lastTick: number;
}

function routeTile(
  sample: CreatureView["route"][number],
  width: number,
  height: number,
): RouteTile | null {
  const x = Math.floor(sample.x);
  const y = Math.floor(sample.y);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return { index: y * width + x, tick: sample.tick };
}

const tileCenter = (tileIndex: number, width: number): Point => ({
  x: (tileIndex % width) + 0.5,
  y: Math.floor(tileIndex / width) + 0.5,
});

/**
 * Derives stable, undirected traffic edges from the browser projection only.
 * No traffic aggregate is persisted back into authoritative simulation state.
 */
export function deriveTrafficTrails(
  view: Pick<WorldView, "creatures" | "width" | "height">,
  limit = MAX_TRAFFIC_TRAILS,
): TrafficTrail[] {
  const edges = new Map<string, MutableTrafficEdge>();

  for (const creature of view.creatures) {
    let previous: RouteTile | null = null;
    for (const sample of creature.route) {
      const current = routeTile(sample, view.width, view.height);
      if (!current) {
        previous = null;
        continue;
      }
      if (!previous || previous.index === current.index) {
        previous = current;
        continue;
      }

      const fromTileIndex = Math.min(previous.index, current.index);
      const toTileIndex = Math.max(previous.index, current.index);
      const key = `${fromTileIndex}:${toTileIndex}`;
      const traversalTick = Math.max(previous.tick, current.tick);
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastTick = Math.max(existing.lastTick, traversalTick);
      } else {
        edges.set(key, {
          key,
          fromTileIndex,
          toTileIndex,
          count: 1,
          lastTick: traversalTick,
        });
      }
      previous = current;
    }
  }

  return [...edges.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.lastTick - left.lastTick ||
        (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
    )
    .slice(0, Math.max(0, limit))
    .map((edge) => ({
      ...edge,
      from: tileCenter(edge.fromTileIndex, view.width),
      to: tileCenter(edge.toTileIndex, view.width),
    }));
}

export function trafficTrailStyle(
  trail: Pick<TrafficTrail, "count" | "lastTick">,
  currentTick: number,
): TrafficTrailStyle {
  const countStrength = Math.min(1, Math.log2(Math.max(1, trail.count) + 1) / 4);
  const age = Math.max(0, currentTick - trail.lastTick);
  const freshness = Math.max(0, 1 - age / TRAFFIC_RECENCY_WINDOW_TICKS);
  return {
    width: 0.055 + countStrength * 0.14,
    alpha: Math.min(0.42, 0.08 + countStrength * 0.14 + freshness * 0.2),
  };
}
