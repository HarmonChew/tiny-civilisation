import { TICKS_PER_SECOND } from "./constants.js";
import { emitDomainEvent } from "./events.js";
import type { SimulationState } from "./types.js";
import { SIMULATION_STATE_VERSION } from "./versions.js";
import { populateWorld } from "./world.js";
import {
  cloneScenarioReference,
  compileScenario,
  createScenarioReference,
  type ScenarioReferenceV2,
} from "./scenarios/index.js";

export function createSimulation(seed?: number): SimulationState;
export function createSimulation(reference: ScenarioReferenceV2): SimulationState;
export function createSimulation(
  scenarioOrSeed: ScenarioReferenceV2 | number = 4_182,
): SimulationState {
  const scenario =
    typeof scenarioOrSeed === "number"
      ? createScenarioReference(scenarioOrSeed >>> 0)
      : cloneScenarioReference(scenarioOrSeed);
  const normalizedSeed = scenario.seed;
  const compiled = compileScenario(scenario);
  const state: SimulationState = {
    schemaVersion: SIMULATION_STATE_VERSION,
    scenario,
    compiledMapHash: compiled.compiledMapHash,
    seed: normalizedSeed,
    tick: 0,
    nextEntityId: 1,
    nextCommandId: 1,
    nextEventId: 1,
    nextHistoryId: 1,
    nextDecisionId: 1,
    nextMemoryId: 1,
    nextRelationshipId: 1,
    nextGroupId: 1,
    randomState: (normalizedSeed ^ 0xa5a5a5a5) >>> 0,
    world: compiled.world,
    creatures: [],
    resourceNodes: [],
    structures: [],
    groups: [],
    relationships: [],
    memories: [],
    commandQueue: [],
    domainEvents: [],
    historyEvents: [],
    decisionRecords: [],
    metrics: {
      foodGathered: 0,
      foodShared: 0,
      waterGathered: 0,
      waterDrunk: 0,
      waterShared: 0,
      severeThirstCreatureTicks: 0,
      waterGatherContentions: 0,
      thefts: 0,
      witnessedThefts: 0,
      attacks: 0,
      groupsFormed: 0,
      storagesCompleted: 0,
      playerInterventions: 0,
      invalidPathFailures: 0,
      interactionContentions: 0,
      failedInteractionClaims: 0,
    },
    configuration: {
      ticksPerSecond: TICKS_PER_SECOND,
      maxDomainEvents: 2_000,
      maxHistoryEvents: 500,
      maxDecisionRecords: 352,
      maxMemoriesPerCreature: 48,
      maxRelationshipsPerCreature: 32,
      maxIntentHistoryPerCreature: 32,
      maxRouteSamplesPerCreature: 24,
    },
  };
  populateWorld(state, compiled);
  emitDomainEvent(state, {
    type: "SIMULATION_STARTED",
    importance: 30,
    summary:
      scenario.scenarioId === "petri-world"
        ? `The Petri world began with seed ${normalizedSeed}.`
        : `${compiled.metadata.name} began with seed ${normalizedSeed}.`,
  });
  return state;
}
