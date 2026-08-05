import type { Inventory, SimulationState } from "../types.js";
import { repairInteractionClaims } from "../interaction-slots.js";

const UNIT_MAX = 10_000;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

const clampUnit = (value: number): number => clamp(value, 0, UNIT_MAX);
const inventoryTotal = (inventory: Inventory): number =>
  inventory.food + inventory.material + inventory.water;

export function maintainBoundedSocialState(state: SimulationState): void {
  if (state.tick === 0 || state.tick % 100 !== 0) return;
  for (const memory of state.memories) {
    memory.strength = clampUnit((memory.strength * 9_850) / UNIT_MAX);
  }
  for (const edge of state.relationships) {
    edge.rivalry = clampUnit((edge.rivalry * 9_200) / UNIT_MAX);
    edge.fear = clampUnit((edge.fear * 9_700) / UNIT_MAX);
  }
  const expiredIds = new Set(
    state.memories
      .filter(
        (memory) =>
          memory.strength < 180 &&
          memory.importance < 6_000 &&
          state.tick - memory.createdTick > 1_000,
      )
      .map((memory) => memory.id),
  );
  if (expiredIds.size === 0) return;
  state.memories = state.memories.filter((memory) => !expiredIds.has(memory.id));
  for (const creature of state.creatures) {
    creature.memoryIds = creature.memoryIds.filter((id) => !expiredIds.has(id));
  }
}

export function validateAuthoritativeInvariants(state: SimulationState): void {
  repairInteractionClaims(state);
  for (const creature of state.creatures) {
    creature.needs.thirst = clampUnit(creature.needs.thirst);
    creature.inventory.food = Math.max(0, Math.floor(creature.inventory.food));
    creature.inventory.material = Math.max(0, Math.floor(creature.inventory.material));
    creature.inventory.water = Math.max(0, Math.floor(creature.inventory.water));
    const overflow = inventoryTotal(creature.inventory) - creature.inventory.capacity;
    if (overflow > 0) {
      const materialReduction = Math.min(overflow, creature.inventory.material);
      creature.inventory.material -= materialReduction;
      const afterMaterial = overflow - materialReduction;
      const waterReduction = Math.min(afterMaterial, creature.inventory.water);
      creature.inventory.water -= waterReduction;
      const afterWater = afterMaterial - waterReduction;
      creature.inventory.food = Math.max(0, creature.inventory.food - afterWater);
    }
  }
  for (const node of state.resourceNodes) {
    node.currentStock = clamp(node.currentStock, 0, node.maximumStock);
  }
  for (const structure of state.structures) {
    structure.inventory.food = Math.max(0, structure.inventory.food);
    structure.inventory.material = Math.max(0, structure.inventory.material);
    structure.inventory.water = 0;
  }
}
