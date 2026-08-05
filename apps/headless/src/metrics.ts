import type { SimulationState } from "@tiny-civ/sim-core";

export interface EventCounts {
  sharingEvents: number;
  waterGatheredUnits: number;
  waterDrunkUnits: number;
  waterSharedUnits: number;
  theftEvents: number;
  conflictEvents: number;
  storageEvents: number;
}

export interface SimulationMetrics extends EventCounts {
  finalTick: number;
  finalHash: string;
  simulationTime: string;
  population: number;
  groups: number;
}

export function readEventCounts(state: SimulationState): EventCounts {
  return {
    sharingEvents: state.metrics.foodShared,
    waterGatheredUnits: state.metrics.waterGathered,
    waterDrunkUnits: state.metrics.waterDrunk,
    waterSharedUnits: state.metrics.waterShared,
    theftEvents: state.metrics.thefts,
    conflictEvents: state.metrics.attacks,
    storageEvents: state.metrics.storagesCompleted,
  };
}

export function readFinalTick(state: SimulationState): number {
  return state.tick;
}

export function readPopulation(state: SimulationState): number {
  return state.creatures.filter((creature) => creature.alive).length;
}

export function readGroupCount(state: SimulationState): number {
  return state.groups.length;
}
