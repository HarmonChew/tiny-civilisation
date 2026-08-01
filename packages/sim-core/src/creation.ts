import { TICKS_PER_SECOND } from "./constants.js";
import { emitDomainEvent } from "./events.js";
import type { SimulationState } from "./types.js";
import { SIMULATION_STATE_VERSION } from "./versions.js";
import { createPetriWorld, populateInitialWorld } from "./world.js";

export function createSimulation(seed = 4_182): SimulationState {
  const normalizedSeed = seed >>> 0;
  const state: SimulationState = {
    schemaVersion: SIMULATION_STATE_VERSION,
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
    world: createPetriWorld(),
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
      maxDecisionRecords: 512,
      maxMemoriesPerCreature: 48,
      maxRelationshipsPerCreature: 32,
      maxIntentHistoryPerCreature: 32,
      maxRouteSamplesPerCreature: 24,
    },
  };
  populateInitialWorld(state);
  emitDomainEvent(state, {
    type: "SIMULATION_STARTED",
    importance: 30,
    summary: `The Petri world began with seed ${normalizedSeed}.`,
  });
  return state;
}
