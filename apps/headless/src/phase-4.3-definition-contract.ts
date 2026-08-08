import { createHash } from "node:crypto";

import {
  ADULT_MIN_AGE_TICKS,
  CAUSAL_EVIDENCE_SCHEMA_VERSION,
  COMMAND_SCHEMA_VERSION,
  CRITICAL_DEATH_AFTER_TICKS,
  CRITICAL_HEALTH_THRESHOLD,
  ELDER_MIN_AGE_TICKS,
  EXPERIMENT_SCHEMA_VERSION,
  FERTILITY_MAX_AGE_TICKS,
  FERTILITY_MIN_AGE_TICKS,
  GESTATION_TICKS,
  INTERVENTION_RESPONSE_SCHEMA_VERSION,
  JUVENILE_MAX_AGE_TICKS,
  MAX_LIVING_POPULATION,
  MAX_TOTAL_IDENTITIES,
  MEMORIAL_LIFETIME_TICKS,
  NATURAL_LIFESPAN_MIN_TICKS,
  NATURAL_LIFESPAN_SPAN_TICKS,
  OUTCOME_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  REPRODUCTION_COOLDOWN_TICKS,
  SAVE_SCHEMA_VERSION,
  SCENARIO_DEFINITION_VERSION,
  SCENARIO_IDS,
  SCENARIO_MAP_GENERATION_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  clearRecoveredCriticalStates,
  completeCareForYoung,
  completeEstateClaim,
  completeFamilyFormation,
  completeMourning,
  eligibleCareDependents,
  eligibleEstateMemorials,
  eligibleFamilyPartners,
  eligibleMemorialsForMourner,
  finalizeLifecycleDeaths,
  isActionAllowedForLifeStage,
  lifeStageForAge,
  lifecycleWorkRate,
  populationFamilyPressure,
  processAgesAndNaturalMortality,
  processCriticalMortality,
  processMemorialsAndEstates,
  processNaturalMortality,
  processPregnanciesAndBirths,
  queryLifeRecords,
  recordCriticalDamage,
  reproductionEligibility,
  transitionToDead,
  updateLifecycleAges,
  updateLifecycleGroupExtinction,
} from "@tiny-civ/sim-core";

import {
  ACTION_KINDS,
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  DESIRE_FAMILY_BY_KIND,
  DESIRE_KINDS,
  INTERACTION_PURPOSES,
} from "./activity-collector.js";
import {
  LIFECYCLE_EVENT_TYPES,
  StreamingLifecycleActivityCollector,
  summarizeLifecycleProfiles,
} from "./lifecycle-activity.js";
import { PHASE_4_2_DEFINITION_FINGERPRINT } from "./phase-4.2-definition-contract.js";
import { canonicalPhase43DefinitionJson } from "./phase-4.3-canonical-json.js";
import {
  PHASE_4_3_CALIBRATION_SEEDS,
  PHASE_4_3_HOLDOUT_SEEDS,
  PHASE_4_3_MATRIX_TICKS,
} from "./phase-4.3-corpora.js";
import {
  OUTCOME_CLASSIFIER_VERSION,
  PHASE_4_3_CLASSIFIER_RULES,
  SCENARIO_ANALYSIS_SCHEMA_VERSION,
  phase43AnalysisSemanticContract,
} from "./scenario-analysis.js";

export { canonicalPhase43DefinitionJson } from "./phase-4.3-canonical-json.js";

export const PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM =
  "SHA256_CANONICAL_JSON_V1" as const;
export const PHASE_4_3_DEFINITION_STATUS = "CANDIDATE" as const;

const lifecycleImplementation = Object.freeze({
  lifeStageForAge: lifeStageForAge.toString(),
  lifecycleWorkRate: lifecycleWorkRate.toString(),
  isActionAllowedForLifeStage: isActionAllowedForLifeStage.toString(),
  populationFamilyPressure: populationFamilyPressure.toString(),
  reproductionEligibility: reproductionEligibility.toString(),
  eligibleFamilyPartners: eligibleFamilyPartners.toString(),
  completeFamilyFormation: completeFamilyFormation.toString(),
  processPregnanciesAndBirths: processPregnanciesAndBirths.toString(),
  eligibleCareDependents: eligibleCareDependents.toString(),
  completeCareForYoung: completeCareForYoung.toString(),
  transitionToDead: transitionToDead.toString(),
  recordCriticalDamage: recordCriticalDamage.toString(),
  clearRecoveredCriticalStates: clearRecoveredCriticalStates.toString(),
  processCriticalMortality: processCriticalMortality.toString(),
  updateLifecycleAges: updateLifecycleAges.toString(),
  processNaturalMortality: processNaturalMortality.toString(),
  processAgesAndNaturalMortality: processAgesAndNaturalMortality.toString(),
  eligibleMemorialsForMourner: eligibleMemorialsForMourner.toString(),
  completeMourning: completeMourning.toString(),
  eligibleEstateMemorials: eligibleEstateMemorials.toString(),
  completeEstateClaim: completeEstateClaim.toString(),
  processMemorialsAndEstates: processMemorialsAndEstates.toString(),
  updateLifecycleGroupExtinction: updateLifecycleGroupExtinction.toString(),
  finalizeLifecycleDeaths: finalizeLifecycleDeaths.toString(),
  queryLifeRecords: queryLifeRecords.toString(),
});

/**
 * Prospective semantics to review and freeze after Phase 4.3 calibration.
 * Mutable evidence status, artifact hashes, and release decisions are excluded.
 */
export const PHASE_4_3_DEFINITION_CONTRACT = Object.freeze({
  schemaVersion: PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
  fingerprintAlgorithm: PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
  versions: {
    behavior: SIMULATION_BEHAVIOR_VERSION,
    state: SIMULATION_STATE_VERSION,
    activityProfile: ACTIVITY_PROFILE_SCHEMA_VERSION,
    command: COMMAND_SCHEMA_VERSION,
    snapshot: SNAPSHOT_SCHEMA_VERSION,
    replay: REPLAY_SCHEMA_VERSION,
    save: SAVE_SCHEMA_VERSION,
    scenarioEnvelope: SCENARIO_SCHEMA_VERSION,
    scenarioDefinition: SCENARIO_DEFINITION_VERSION,
    mapGeneration: SCENARIO_MAP_GENERATION_VERSION,
    experiment: EXPERIMENT_SCHEMA_VERSION,
    outcome: OUTCOME_SCHEMA_VERSION,
    causalEvidence: CAUSAL_EVIDENCE_SCHEMA_VERSION,
    interventionResponse: INTERVENTION_RESPONSE_SCHEMA_VERSION,
    scenarioAnalysis: SCENARIO_ANALYSIS_SCHEMA_VERSION,
    outcomeClassifier: OUTCOME_CLASSIFIER_VERSION,
  },
  inheritedPhase42: {
    recordedDefinitionFingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
    interpretation: "HISTORICAL_REVIEWED_EVIDENCE_NOT_REGENERATED",
  },
  corpus: {
    scenarios: [...SCENARIO_IDS],
    calibrationSeeds: [...PHASE_4_3_CALIBRATION_SEEDS],
    holdoutSeeds: [...PHASE_4_3_HOLDOUT_SEEDS],
    ticksPerRun: PHASE_4_3_MATRIX_TICKS,
    holdoutExecution: "ONCE_AFTER_FROZEN_DEFINITION_AND_RELEASE_CANDIDATE_GATES",
    replacementAfterConsumedFailure: "NEW_DEFINITION_VERSION_AND_4001_TO_4064_ONLY",
  },
  lifecycleRules: {
    lifeStages: {
      juvenileMaximumAgeTicks: JUVENILE_MAX_AGE_TICKS,
      adultMinimumAgeTicks: ADULT_MIN_AGE_TICKS,
      elderMinimumAgeTicks: ELDER_MIN_AGE_TICKS,
    },
    fertility: {
      minimumAgeTicks: FERTILITY_MIN_AGE_TICKS,
      maximumAgeTicks: FERTILITY_MAX_AGE_TICKS,
      gestationTicks: GESTATION_TICKS,
      reproductionCooldownTicks: REPRODUCTION_COOLDOWN_TICKS,
      requiresTwoKnownOppositeSexParents: true,
    },
    mortality: {
      naturalLifespanMinimumTicks: NATURAL_LIFESPAN_MIN_TICKS,
      naturalLifespanVariationSpanTicks: NATURAL_LIFESPAN_SPAN_TICKS,
      criticalHealthThreshold: CRITICAL_HEALTH_THRESHOLD,
      criticalDeathAfterTicks: CRITICAL_DEATH_AFTER_TICKS,
    },
    memoryAndEstate: {
      memorialLifetimeTicks: MEMORIAL_LIFETIME_TICKS,
      goodsTransferOnly: true,
      traitsAndSkillsRemainHistoricalFacts: true,
    },
    caps: {
      maximumLivingPopulation: MAX_LIVING_POPULATION,
      maximumTotalIdentities: MAX_TOTAL_IDENTITIES,
    },
  },
  observability: {
    desires: [...DESIRE_KINDS],
    desireFamilies: { ...DESIRE_FAMILY_BY_KIND },
    actions: [...ACTION_KINDS],
    interactionPurposes: [...INTERACTION_PURPOSES],
    lifecycleEvents: [...LIFECYCLE_EVENT_TYPES],
    lifecycleProfileImplementation: {
      collector: StreamingLifecycleActivityCollector.toString(),
      summarize: summarizeLifecycleProfiles.toString(),
    },
  },
  analysis: {
    classifierRules: { ...PHASE_4_3_CLASSIFIER_RULES },
    semanticContract: phase43AnalysisSemanticContract(),
    outcomeInterpretation: "FACTUAL_NON_EXCLUSIVE_NO_CAUSAL_WINNER",
  },
  unifiedHumanProtocol: {
    version: 1,
    formativeParticipants: 5,
    confirmatoryParticipants: 5,
    participantsMustDifferAcrossRounds: true,
    passingParticipantsRequiredPerRubricRow: 4,
    finalNvdaRequiredBeforeHoldout: true,
    confirmatoryRoundOccursAfterHoldout: true,
    automatedEvidenceCannotSubstituteForHumanOrNvdaEvidence: true,
  },
  lifecycleImplementation,
});

export function phase43DefinitionFingerprint(
  contract: unknown = PHASE_4_3_DEFINITION_CONTRACT,
): string {
  return createHash("sha256")
    .update(canonicalPhase43DefinitionJson(contract), "utf8")
    .digest("hex");
}

export const PHASE_4_3_DEFINITION_FINGERPRINT = phase43DefinitionFingerprint();
