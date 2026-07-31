import { getGroup, getStructure } from "../tick-context.js";
import {
  TILE_FIXED_UNITS,
  type CreatureState,
  type Inventory,
  type SimulationState,
  type StructureState,
} from "../types.js";

export const UNIT_MAX = 10_000;
export const MOVEMENT_SPEED = 128;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function clampUnit(value: number): number {
  return clamp(value, 0, UNIT_MAX);
}

export function inventoryTotal(inventory: Inventory): number {
  return inventory.food + inventory.material;
}

export function inventorySpace(inventory: Inventory): number {
  return Math.max(0, inventory.capacity - inventoryTotal(inventory));
}

export function tileCenter(
  state: SimulationState,
  tileIndex: number,
): { x: number; y: number } {
  const x = tileIndex % state.world.width;
  const y = Math.floor(tileIndex / state.world.width);
  return {
    x: x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
    y: y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
  };
}

export function groupStorage(
  state: SimulationState,
  groupId: number | null,
): StructureState | null {
  if (groupId === null) return null;
  const group = getGroup(state, groupId);
  return group?.storageStructureId === null || group?.storageStructureId === undefined
    ? null
    : getStructure(state, group.storageStructureId);
}

export function removeGuardAssignment(
  state: SimulationState,
  creature: CreatureState,
): void {
  for (const structure of state.structures) {
    structure.guardIds = structure.guardIds.filter((id) => id !== creature.id);
  }
}
