import type { ShelterStructureState, SimulationState } from "./types.js";
import type { ScenarioReferenceV2 } from "./scenarios/types.js";
import { OUTCOME_SCHEMA_VERSION, SIMULATION_BEHAVIOR_VERSION } from "./versions.js";
import { estimateInteractionTravelIgnoringOccupancy } from "./interaction-slots.js";
import { isShelterStructure } from "./shelters.js";

export interface ExperimentOutcomeMetrics {
  readonly population: number;
  readonly wildFood: number;
  readonly wildMaterial: number;
  readonly wildWater: number;
  readonly storedFood: number;
  readonly storedMaterial: number;
  readonly carriedWater: number;
  readonly averageThirst: number;
  readonly severeThirst: number;
  readonly severeThirstExposureTicks: number;
  readonly groups: number;
  readonly averageTrust: number;
  readonly foodShared: number;
  readonly waterGathered: number;
  readonly waterDrunk: number;
  readonly waterShared: number;
  /** Claim attempts that encountered an occupied interaction slot. */
  readonly interactionContentions: number;
  readonly waterGatherContentions: number;
  /** Creature/source pairs with no currently reachable water interaction slot. */
  readonly unreachableWaterAccessPairs: number;
  /** Mean weighted cost to each living creature's cheapest reachable source. */
  readonly averageWaterAccessCost: number;
  /** Dominant recent undirected edge share across all observed creature traffic. */
  readonly routeConcentration: number;
  readonly thefts: number;
  readonly attacks: number;
  readonly storagesCompleted: number;
  readonly sheltersCompleted: number;
  readonly activeShelters: number;
  readonly shelteredRests: number;
  readonly outdoorRests: number;
  readonly meanShelterCondition: number;
  readonly shelterMaintenanceMaterial: number;
  readonly shelterDeniedClaims: number;
  readonly shelterGuestUses: number;
  readonly shelterRelocations: number;
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
  "wildWater",
  "storedFood",
  "storedMaterial",
  "carriedWater",
  "averageThirst",
  "severeThirst",
  "severeThirstExposureTicks",
  "groups",
  "averageTrust",
  "foodShared",
  "waterGathered",
  "waterDrunk",
  "waterShared",
  "interactionContentions",
  "waterGatherContentions",
  "unreachableWaterAccessPairs",
  "averageWaterAccessCost",
  "routeConcentration",
  "thefts",
  "attacks",
  "storagesCompleted",
  "sheltersCompleted",
  "activeShelters",
  "shelteredRests",
  "outdoorRests",
  "meanShelterCondition",
  "shelterMaintenanceMaterial",
  "shelterDeniedClaims",
  "shelterGuestUses",
  "shelterRelocations",
] as const satisfies readonly (keyof ExperimentOutcomeMetrics)[];

function metricsOf(outcome: ExperimentOutcomeV1): ExperimentOutcomeMetrics {
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [key, outcome[key]]),
  ) as unknown as ExperimentOutcomeMetrics;
}

function waterAccessMetrics(
  state: SimulationState,
  creatures: readonly SimulationState["creatures"][number][],
): Pick<
  ExperimentOutcomeMetrics,
  "averageWaterAccessCost" | "unreachableWaterAccessPairs"
> {
  const sources = state.resourceNodes.filter((node) => node.kind === "WATER");
  let nearestCostTotal = 0;
  let creaturesWithReachableSource = 0;
  let unreachableWaterAccessPairs = 0;
  for (const creature of creatures) {
    let nearestCost = Number.POSITIVE_INFINITY;
    for (const source of sources) {
      const estimate = estimateInteractionTravelIgnoringOccupancy(
        state,
        creature,
        "GATHER_WATER",
        source.id,
        source.tileIndex,
      );
      if (estimate === null) {
        unreachableWaterAccessPairs += 1;
      } else {
        nearestCost = Math.min(nearestCost, estimate.cost);
      }
    }
    if (Number.isFinite(nearestCost)) {
      nearestCostTotal += nearestCost;
      creaturesWithReachableSource += 1;
    }
  }
  return {
    averageWaterAccessCost:
      creaturesWithReachableSource === 0
        ? 0
        : nearestCostTotal / creaturesWithReachableSource,
    unreachableWaterAccessPairs,
  };
}

function recentRouteConcentration(
  creatures: readonly SimulationState["creatures"][number][],
): number {
  const edgeCounts = new Map<string, number>();
  let traversals = 0;
  for (const creature of creatures) {
    for (let index = 1; index < creature.recentRoute.length; index += 1) {
      const previous = creature.recentRoute[index - 1]?.tileIndex;
      const current = creature.recentRoute[index]?.tileIndex;
      if (previous === undefined || current === undefined || previous === current) continue;
      const from = Math.min(previous, current);
      const to = Math.max(previous, current);
      const key = `${from}:${to}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      traversals += 1;
    }
  }
  if (traversals === 0) return 0;
  return Math.max(...edgeCounts.values()) / traversals;
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
  const activeShelters = state.structures.filter(
    (structure): structure is ShelterStructureState =>
      isShelterStructure(structure) && structure.kind === "SHELTER",
  );
  const relationshipTrust = state.relationships.reduce(
    (total, relationship) => total + relationship.trust,
    0,
  );
  const access = waterAccessMetrics(state, aliveCreatures);

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
    wildWater: state.resourceNodes.reduce(
      (total, node) => total + (node.kind === "WATER" ? node.currentStock : 0),
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
    carriedWater: aliveCreatures.reduce(
      (total, creature) => total + creature.inventory.water,
      0,
    ),
    averageThirst:
      aliveCreatures.length === 0
        ? 0
        : aliveCreatures.reduce((total, creature) => total + creature.needs.thirst, 0) /
          aliveCreatures.length,
    severeThirst: aliveCreatures.filter((creature) => creature.needs.thirst >= 8_000)
      .length,
    severeThirstExposureTicks: state.metrics.severeThirstCreatureTicks,
    groups: state.groups.length,
    averageTrust:
      state.relationships.length === 0 ? 0 : relationshipTrust / state.relationships.length,
    foodShared: state.metrics.foodShared,
    waterGathered: state.metrics.waterGathered,
    waterDrunk: state.metrics.waterDrunk,
    waterShared: state.metrics.waterShared,
    interactionContentions: state.metrics.interactionContentions,
    waterGatherContentions: state.metrics.waterGatherContentions,
    unreachableWaterAccessPairs: access.unreachableWaterAccessPairs,
    averageWaterAccessCost: access.averageWaterAccessCost,
    routeConcentration: recentRouteConcentration(aliveCreatures),
    thefts: state.metrics.thefts,
    attacks: state.metrics.attacks,
    storagesCompleted: state.metrics.storagesCompleted,
    sheltersCompleted: state.metrics.sheltersCompleted,
    activeShelters: activeShelters.length,
    shelteredRests: state.metrics.shelteredRests,
    outdoorRests: state.metrics.outdoorRests,
    meanShelterCondition:
      activeShelters.length === 0
        ? 0
        : activeShelters.reduce((total, shelter) => total + shelter.condition, 0) /
          activeShelters.length,
    shelterMaintenanceMaterial: state.metrics.shelterMaintenanceMaterial,
    shelterDeniedClaims: state.metrics.shelterDeniedClaims,
    shelterGuestUses: state.metrics.shelterGuestUses,
    shelterRelocations: state.metrics.shelterRelocations,
  };
}

export function assertExperimentOutcome(
  value: unknown,
): asserts value is ExperimentOutcomeV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Experiment outcome must be an object.");
  }
  const outcome = value as Record<string, unknown>;
  if (outcome.schemaVersion !== OUTCOME_SCHEMA_VERSION) {
    throw new Error(
      `Experiment outcome schema version ${String(outcome.schemaVersion)} is incompatible with ${OUTCOME_SCHEMA_VERSION.toString()}.`,
    );
  }
  if (outcome.behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(
      `Experiment outcome behavior version ${String(outcome.behaviorVersion)} is incompatible with ${SIMULATION_BEHAVIOR_VERSION.toString()}.`,
    );
  }
  for (const key of METRIC_KEYS) {
    const metric = outcome[key];
    if (typeof metric !== "number" || !Number.isFinite(metric)) {
      throw new Error(`Experiment outcome metric ${key} must be finite.`);
    }
  }
  const condition = outcome.meanShelterCondition as number;
  if (condition < 0 || condition > 10_000) {
    throw new Error("Experiment outcome mean shelter condition must be bounded.");
  }
}

export function compareExperimentOutcomes(
  baseline: ExperimentOutcomeV1,
  intervention: ExperimentOutcomeV1,
): ExperimentOutcomeComparisonV1 {
  if (baseline.behaviorVersion !== intervention.behaviorVersion) {
    throw new Error("Experiment outcomes use incompatible behavior versions.");
  }
  assertExperimentOutcome(baseline);
  assertExperimentOutcome(intervention);
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
