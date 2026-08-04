import type { SimulationState } from "./types.js";
import type { ScenarioReferenceV2 } from "./scenarios/types.js";
import { OUTCOME_SCHEMA_VERSION, SIMULATION_BEHAVIOR_VERSION } from "./versions.js";

export interface ExperimentOutcomeMetrics {
  readonly population: number;
  readonly wildFood: number;
  readonly wildMaterial: number;
  readonly storedFood: number;
  readonly storedMaterial: number;
  readonly groups: number;
  readonly averageTrust: number;
  readonly foodShared: number;
  readonly thefts: number;
  readonly attacks: number;
  readonly storagesCompleted: number;
}

export interface ExperimentOutcomeV1 extends ExperimentOutcomeMetrics {
  readonly schemaVersion: typeof OUTCOME_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly scenario: ScenarioReferenceV2;
  readonly tick: number;
}

export interface ExperimentOutcomeComparisonV1 {
  readonly schemaVersion: typeof OUTCOME_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly scenario: ScenarioReferenceV2;
  readonly tick: number;
  readonly baseline: ExperimentOutcomeMetrics;
  readonly intervention: ExperimentOutcomeMetrics;
  readonly delta: ExperimentOutcomeMetrics;
}

const METRIC_KEYS = [
  "population",
  "wildFood",
  "wildMaterial",
  "storedFood",
  "storedMaterial",
  "groups",
  "averageTrust",
  "foodShared",
  "thefts",
  "attacks",
  "storagesCompleted",
] as const satisfies readonly (keyof ExperimentOutcomeMetrics)[];

function metricsOf(outcome: ExperimentOutcomeV1): ExperimentOutcomeMetrics {
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [key, outcome[key]]),
  ) as unknown as ExperimentOutcomeMetrics;
}

/**
 * Projects the canonical experiment readout. "Stored" means resources under
 * creature or completed-storage control; construction material committed to a
 * site is not counted as available stock.
 */
export function createExperimentOutcome(state: SimulationState): ExperimentOutcomeV1 {
  const aliveCreatures = state.creatures.filter((creature) => creature.alive);
  const completedStorages = state.structures.filter(
    (structure) => structure.kind === "STORAGE",
  );
  const relationshipTrust = state.relationships.reduce(
    (total, relationship) => total + relationship.trust,
    0,
  );

  return {
    schemaVersion: OUTCOME_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    scenario: { ...state.scenario },
    tick: state.tick,
    population: aliveCreatures.length,
    wildFood: state.resourceNodes.reduce(
      (total, node) => total + (node.kind === "FOOD" ? node.currentStock : 0),
      0,
    ),
    wildMaterial: state.resourceNodes.reduce(
      (total, node) => total + (node.kind === "MATERIAL" ? node.currentStock : 0),
      0,
    ),
    storedFood:
      aliveCreatures.reduce((total, creature) => total + creature.inventory.food, 0) +
      completedStorages.reduce((total, structure) => total + structure.inventory.food, 0),
    storedMaterial:
      aliveCreatures.reduce((total, creature) => total + creature.inventory.material, 0) +
      completedStorages.reduce(
        (total, structure) => total + structure.inventory.material,
        0,
      ),
    groups: state.groups.length,
    averageTrust:
      state.relationships.length === 0 ? 0 : relationshipTrust / state.relationships.length,
    foodShared: state.metrics.foodShared,
    thefts: state.metrics.thefts,
    attacks: state.metrics.attacks,
    storagesCompleted: state.metrics.storagesCompleted,
  };
}

export function compareExperimentOutcomes(
  baseline: ExperimentOutcomeV1,
  intervention: ExperimentOutcomeV1,
): ExperimentOutcomeComparisonV1 {
  if (baseline.behaviorVersion !== intervention.behaviorVersion) {
    throw new Error("Experiment outcomes use incompatible behavior versions.");
  }
  const baselineIdentity = baseline.scenario;
  const interventionIdentity = intervention.scenario;
  if (
    baselineIdentity.scenarioId !== interventionIdentity.scenarioId ||
    baselineIdentity.scenarioVersion !== interventionIdentity.scenarioVersion ||
    baselineIdentity.mapGenerationVersion !== interventionIdentity.mapGenerationVersion ||
    baselineIdentity.seed !== interventionIdentity.seed
  ) {
    throw new Error("Experiment outcomes must use the same scenario identity and seed.");
  }
  if (baseline.tick !== intervention.tick) {
    throw new Error(
      `Experiment outcomes must share a tick; received ${baseline.tick.toString()} and ${intervention.tick.toString()}.`,
    );
  }
  const baselineMetrics = metricsOf(baseline);
  const interventionMetrics = metricsOf(intervention);
  const delta = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, interventionMetrics[key] - baselineMetrics[key]]),
  ) as unknown as ExperimentOutcomeMetrics;
  return {
    schemaVersion: OUTCOME_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    scenario: { ...baseline.scenario },
    tick: baseline.tick,
    baseline: baselineMetrics,
    intervention: interventionMetrics,
    delta,
  };
}
