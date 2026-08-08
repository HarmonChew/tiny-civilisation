import { applyScheduledCommands } from "./commands.js";
import { executeActiveActions, runScheduledDecisions } from "./actions/runtime.js";
import { beginEventRetentionContext, endEventRetentionContext } from "./events.js";
import { updateGroups } from "./groups.js";
import {
  finalizeLifecycleDeaths,
  followDependentCaregivers,
  clearRecoveredCriticalStates,
  processCriticalMortality,
  processMemorialsAndEstates,
  processNaturalMortality,
  processPregnanciesAndBirths,
  updateLifecycleAges,
  updateLifecycleGroupExtinction,
} from "./lifecycle.js";
import { updateProximityRelationships } from "./social.js";
import { updateShelters } from "./shelters.js";
import {
  maintainBoundedSocialState,
  validateAuthoritativeInvariants,
} from "./systems/maintenance.js";
import { regenerateResources, updateNeeds } from "./systems/needs-resources.js";
import { beginTickContext, endTickContext } from "./tick-context.js";
import type { SimulationState } from "./types.js";

export const AUTHORITATIVE_TICK_PIPELINE = [
  "applyScheduledCommands",
  "updateLifecycleAges",
  "updateNeeds",
  "processCriticalMortality",
  "processNaturalMortality",
  "regenerateResources",
  "followDependentCaregivers",
  "updateProximityRelationships",
  "executeActiveActions",
  "clearRecoveredCriticalStates",
  "processPregnanciesAndBirths",
  "processMemorialsAndEstates",
  "updateLifecycleGroupExtinction",
  "finalizeLifecycleDeaths",
  "updateShelters",
  "updateGroups",
  "runScheduledDecisions",
  "maintainBoundedSocialState",
  "validateAuthoritativeInvariants",
  "incrementTick",
] as const;

export function advanceSimulation(state: SimulationState, ticks = 1): SimulationState {
  const tickCount = Math.max(0, Math.floor(ticks));
  if (tickCount === 0) return state;
  beginTickContext(state);
  beginEventRetentionContext(state);
  try {
    for (let iteration = 0; iteration < tickCount; iteration += 1) {
      applyScheduledCommands(state);
      updateLifecycleAges(state);
      updateNeeds(state);
      processCriticalMortality(state);
      processNaturalMortality(state);
      regenerateResources(state);
      followDependentCaregivers(state);
      updateProximityRelationships(state);
      executeActiveActions(state);
      clearRecoveredCriticalStates(state);
      processPregnanciesAndBirths(state);
      processMemorialsAndEstates(state);
      updateLifecycleGroupExtinction(state);
      finalizeLifecycleDeaths(state);
      updateShelters(state);
      updateGroups(state);
      runScheduledDecisions(state);
      maintainBoundedSocialState(state);
      validateAuthoritativeInvariants(state);
      state.tick += 1;
    }
  } finally {
    endEventRetentionContext(state);
    endTickContext(state);
  }
  return state;
}
