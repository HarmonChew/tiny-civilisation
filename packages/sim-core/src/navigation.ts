import { tileCoordinates, tileIndexAt } from "./pathfinding.js";
import type { SimulationState } from "./types.js";

export function isWalkableTile(state: SimulationState, tileIndex: number): boolean {
  const tile = state.world.tiles[tileIndex];
  return Boolean(tile && !tile.blocked);
}

export function findNearestWalkable(
  state: SimulationState,
  preferredTileIndex: number,
): number {
  if (isWalkableTile(state, preferredTileIndex)) return preferredTileIndex;
  const preferred = tileCoordinates(state.world, preferredTileIndex);
  for (let radius = 1; radius <= 8; radius += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        if (Math.abs(xOffset) !== radius && Math.abs(yOffset) !== radius) continue;
        const candidate = tileIndexAt(
          state.world,
          preferred.x + xOffset,
          preferred.y + yOffset,
        );
        if (candidate >= 0 && isWalkableTile(state, candidate)) return candidate;
      }
    }
  }
  return preferredTileIndex;
}
