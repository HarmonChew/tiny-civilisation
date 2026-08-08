import { emitDomainEvent } from "../events.js";
import { recordCriticalDamage } from "../lifecycle.js";
import type { SimulationState } from "../types.js";

const UNIT_MAX = 10_000;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

const clampUnit = (value: number): number => clamp(value, 0, UNIT_MAX);

export function updateNeeds(state: SimulationState): void {
  for (const creature of state.creatures) {
    if (!creature.alive) continue;
    const moving = creature.activeAction?.phase === "MOVING";
    const previousThirst = creature.needs.thirst;
    creature.needs.hunger = clampUnit(creature.needs.hunger + 4);
    creature.needs.thirst = clampUnit(creature.needs.thirst + 5 + (moving ? 2 : 0));
    if (creature.needs.thirst >= 8_000) state.metrics.severeThirstCreatureTicks += 1;
    creature.needs.fatigue = clampUnit(
      creature.needs.fatigue + (moving ? 4 : creature.activeAction ? 3 : 1),
    );
    const starvationDamage = creature.needs.hunger >= 9_400 ? 2 : 0;
    const exhaustionDamage = creature.needs.fatigue >= 9_500 ? 1 : 0;
    const dehydrationDamage = creature.needs.thirst >= 9_400 ? 3 : 0;
    const hardshipDamage = starvationDamage + exhaustionDamage + dehydrationDamage;
    creature.health = clamp(creature.health - hardshipDamage, 0, UNIT_MAX);
    const criticalCauseEventIds: number[] = [];
    if (previousThirst < 8_000 && creature.needs.thirst >= 8_000) {
      const severeThirstEvent = emitDomainEvent(state, {
        type: "SEVERE_THIRST_STARTED",
        actorIds: [creature.id],
        groupIds: creature.groupId === null ? [] : [creature.groupId],
        locationTileIndex: creature.tileIndex,
        quantity: creature.needs.thirst,
        importance: 58,
        summary: `${creature.name} entered severe thirst.`,
      });
      criticalCauseEventIds.push(severeThirstEvent.id);
      creature.nextDecisionTick = Math.min(creature.nextDecisionTick, state.tick + 1);
    }
    recordCriticalDamage(
      state,
      creature,
      {
        starvation: starvationDamage,
        dehydration: dehydrationDamage,
        exhaustion: exhaustionDamage,
      },
      criticalCauseEventIds,
    );
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
