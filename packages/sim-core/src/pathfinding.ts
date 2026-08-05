import type { WorldState } from "./types.js";

export function tileIndexAt(
  world: Pick<WorldState, "width" | "height">,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
    return -1;
  }
  return y * world.width + x;
}

export function tileCoordinates(
  world: Pick<WorldState, "width" | "height">,
  tileIndex: number,
): { x: number; y: number } {
  if (tileIndex < 0 || tileIndex >= world.width * world.height) {
    return { x: -1, y: -1 };
  }
  return {
    x: tileIndex % world.width,
    y: Math.floor(tileIndex / world.width),
  };
}

export function manhattanDistance(
  world: Pick<WorldState, "width" | "height">,
  a: number,
  b: number,
): number {
  const pointA = tileCoordinates(world, a);
  const pointB = tileCoordinates(world, b);
  return Math.abs(pointA.x - pointB.x) + Math.abs(pointA.y - pointB.y);
}

/**
 * Returns the authoritative weighted cost of a path. The starting tile is not
 * charged; every entered tile contributes its walk cost. Invalid, empty, or
 * discontinuous paths return null so callers cannot accidentally score an
 * unreachable route as free.
 */
export function pathTravelCost(world: WorldState, path: readonly number[]): number | null {
  if (path.length === 0) return null;
  let cost = 0;
  for (let index = 0; index < path.length; index += 1) {
    const tileIndex = path[index]!;
    const tile = world.tiles[tileIndex];
    if (!tile || tile.blocked) return null;
    if (index === 0) continue;
    const previous = path[index - 1]!;
    if (manhattanDistance(world, previous, tileIndex) !== 1) return null;
    cost += tile.walkCost;
  }
  return cost;
}

export interface WeightedPath {
  readonly path: number[];
  readonly cost: number;
}

/** Finds a deterministic path together with the same weighted cost A* used. */
export function findWeightedPath(
  world: WorldState,
  startTileIndex: number,
  goalTileIndex: number,
): WeightedPath | null {
  const path = findPath(world, startTileIndex, goalTileIndex);
  const cost = pathTravelCost(world, path);
  return cost === null ? null : { path, cost };
}

function neighbours(world: WorldState, index: number): number[] {
  const { x, y } = tileCoordinates(world, index);
  const result: number[] = [];
  // A fixed order plus deterministic tie breaking below is part of the replay
  // contract.
  const candidates = [
    tileIndexAt(world, x, y - 1),
    tileIndexAt(world, x - 1, y),
    tileIndexAt(world, x + 1, y),
    tileIndexAt(world, x, y + 1),
  ];
  for (const candidate of candidates) {
    if (candidate < 0) {
      continue;
    }
    const tile = world.tiles[candidate];
    if (tile && !tile.blocked) {
      result.push(candidate);
    }
  }
  return result;
}

export const UNREACHABLE_TRAVEL_COST = 0x3fffffff;

interface CostHeapEntry {
  readonly tileIndex: number;
  readonly cost: number;
}

function pushCostHeap(heap: CostHeapEntry[], entry: CostHeapEntry): void {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentEntry = heap[parent]!;
    if (
      parentEntry.cost < entry.cost ||
      (parentEntry.cost === entry.cost && parentEntry.tileIndex <= entry.tileIndex)
    ) {
      break;
    }
    heap[index] = parentEntry;
    index = parent;
  }
  heap[index] = entry;
}

function popCostHeap(heap: CostHeapEntry[]): CostHeapEntry | null {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first ?? null;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let child = left;
    const leftEntry = heap[left]!;
    const rightEntry = heap[right];
    if (
      rightEntry &&
      (rightEntry.cost < leftEntry.cost ||
        (rightEntry.cost === leftEntry.cost && rightEntry.tileIndex < leftEntry.tileIndex))
    ) {
      child = right;
    }
    const childEntry = heap[child]!;
    if (
      last.cost < childEntry.cost ||
      (last.cost === childEntry.cost && last.tileIndex <= childEntry.tileIndex)
    ) {
      break;
    }
    heap[index] = childEntry;
    index = child;
  }
  heap[index] = last;
  return first;
}

/**
 * Computes deterministic weighted costs from one tile to the whole world.
 * Unreachable destinations contain `null`; the start tile costs zero.
 */
export function weightedTravelCostsFrom(
  world: WorldState,
  startTileIndex: number,
): Int32Array {
  const tileCount = world.width * world.height;
  const costs = new Int32Array(tileCount);
  costs.fill(UNREACHABLE_TRAVEL_COST);
  if (
    startTileIndex < 0 ||
    startTileIndex >= tileCount ||
    world.tiles[startTileIndex]?.blocked
  ) {
    return costs;
  }
  costs[startTileIndex] = 0;
  const heap: CostHeapEntry[] = [];
  pushCostHeap(heap, { tileIndex: startTileIndex, cost: 0 });
  while (heap.length > 0) {
    const current = popCostHeap(heap)!;
    if (current.cost !== costs[current.tileIndex]) continue;
    for (const neighbour of neighbours(world, current.tileIndex)) {
      const nextCost = current.cost + (world.tiles[neighbour]?.walkCost ?? 10);
      if (nextCost >= costs[neighbour]!) continue;
      costs[neighbour] = nextCost;
      pushCostHeap(heap, { tileIndex: neighbour, cost: nextCost });
    }
  }
  return costs;
}

/**
 * Deterministic four-way grid A*. The result includes both start and goal.
 * An empty array means the goal is invalid or unreachable.
 */
export function findPath(
  world: WorldState,
  startTileIndex: number,
  goalTileIndex: number,
): number[] {
  const tileCount = world.width * world.height;
  if (
    startTileIndex < 0 ||
    goalTileIndex < 0 ||
    startTileIndex >= tileCount ||
    goalTileIndex >= tileCount
  ) {
    return [];
  }
  if (world.tiles[startTileIndex]?.blocked || world.tiles[goalTileIndex]?.blocked) {
    return [];
  }
  if (startTileIndex === goalTileIndex) {
    return [startTileIndex];
  }

  const cameFrom = new Int32Array(tileCount);
  cameFrom.fill(-1);
  const gScore = new Int32Array(tileCount);
  gScore.fill(0x3fffffff);
  gScore[startTileIndex] = 0;
  const open: number[] = [startTileIndex];
  const openMembership = new Uint8Array(tileCount);
  openMembership[startTileIndex] = 1;
  const closed = new Uint8Array(tileCount);

  while (open.length > 0) {
    let bestOpenIndex = 0;
    let current = open[0] ?? -1;
    let currentG = gScore[current] ?? 0x3fffffff;
    let currentH = manhattanDistance(world, current, goalTileIndex);
    let currentF = currentG + currentH * 10;

    for (let index = 1; index < open.length; index += 1) {
      const candidate = open[index] ?? -1;
      const candidateG = gScore[candidate] ?? 0x3fffffff;
      const candidateH = manhattanDistance(world, candidate, goalTileIndex);
      const candidateF = candidateG + candidateH * 10;
      if (
        candidateF < currentF ||
        (candidateF === currentF && candidateH < currentH) ||
        (candidateF === currentF && candidateH === currentH && candidate < current)
      ) {
        bestOpenIndex = index;
        current = candidate;
        currentG = candidateG;
        currentH = candidateH;
        currentF = candidateF;
      }
    }

    open.splice(bestOpenIndex, 1);
    openMembership[current] = 0;

    if (current === goalTileIndex) {
      const path = [current];
      let cursor = current;
      while (cursor !== startTileIndex) {
        cursor = cameFrom[cursor] ?? -1;
        if (cursor < 0) {
          return [];
        }
        path.push(cursor);
      }
      path.reverse();
      return path;
    }

    closed[current] = 1;
    for (const neighbour of neighbours(world, current)) {
      if (closed[neighbour]) {
        continue;
      }
      const walkCost = world.tiles[neighbour]?.walkCost ?? 10;
      const tentative = currentG + walkCost;
      if (tentative >= (gScore[neighbour] ?? 0x3fffffff)) {
        continue;
      }
      cameFrom[neighbour] = current;
      gScore[neighbour] = tentative;
      if (!openMembership[neighbour]) {
        open.push(neighbour);
        openMembership[neighbour] = 1;
      }
    }
  }

  return [];
}
