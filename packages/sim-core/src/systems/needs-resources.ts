import type { SimulationState } from "../types.js";

const UNIT_MAX = 10_000;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

const clampUnit = (value: number): number => clamp(value, 0, UNIT_MAX);

export function updateNeeds(state: SimulationState): void {
  for (const creature of state.creatures) {
    if (!creature.alive) continue;
    const moving = creature.activeAction?.phase === "MOVING";
    creature.needs.hunger = clampUnit(creature.needs.hunger + 4);
    creature.needs.fatigue = clampUnit(
      creature.needs.fatigue + (moving ? 4 : creature.activeAction ? 3 : 1),
    );
    if (creature.needs.hunger >= 9_400) {
      creature.health = clamp(creature.health - 2, 1_200, UNIT_MAX);
    }
    if (creature.needs.fatigue >= 9_500) {
      creature.health = clamp(creature.health - 1, 1_200, UNIT_MAX);
    }
  }
}

export function regenerateResources(state: SimulationState): void {
  for (const node of state.resourceNodes) {
    if (
      node.regenerationEveryTicks > 0 &&
      state.tick > 0 &&
      state.tick % node.regenerationEveryTicks === 0
    ) {
      node.currentStock = Math.min(
        node.maximumStock,
        node.currentStock + node.regenerationAmount,
      );
    }
  }
}
