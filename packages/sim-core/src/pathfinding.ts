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
