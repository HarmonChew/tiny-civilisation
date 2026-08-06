import { createHash } from "node:crypto";

import {
  SCENARIO_DEFINITION_VERSION,
  SCENARIO_IDS,
  SCENARIO_MAP_GENERATION_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
} from "@tiny-civ/sim-core";

import { ACTIVITY_PROFILE_SCHEMA_VERSION } from "./activity-collector.js";
import {
  OUTCOME_CLASSIFIER_VERSION,
  PHASE_4_2_CLASSIFIER_RULES,
  SCENARIO_ANALYSIS_SCHEMA_VERSION,
  phase42AnalysisSemanticContract,
} from "./scenario-analysis.js";
import {
  PAIRED_MACRO_BANDS,
  PAIRED_MACRO_BAND_TABLE_VERSION,
  PHASE_4_1_CALIBRATION_SHA256,
  PHASE_4_2_PAIRED_MACRO_BANDS,
  PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES,
  PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS,
  REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS,
  REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS,
  SCENARIO_EXPECTED_BANDS,
  SCENARIO_EXPECTED_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_DOMINANCE_RATIONALES,
  SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,
  SCENARIO_OUTCOME_INCIDENCE_BANDS,
  SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
  phase42BandValidationSemanticContract,
  type PairedMacroBandDefinition,
  type ScenarioExpectedBandDefinition,
  type ScenarioOutcomeDominanceRationaleDefinition,
  type ScenarioOutcomeIncidenceBandDefinition,
} from "./scenario-bands.js";
import { canonicalPhase42DefinitionJson } from "./phase-4.2-canonical-json.js";

export { canonicalPhase42DefinitionJson } from "./phase-4.2-canonical-json.js";

export const PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM =
  "SHA256_CANONICAL_JSON_V1" as const;

/**
 * Reviewed data policy for the Phase 4.2 settlement-incidence floors. This is
 * intentionally separate from the inherited/candidate eight-occurrence
 * default: the four frozen ESTABLISHED_SETTLEMENT floors are literal reviewed
 * data derived from the discovery corpus and are not prediction limits.
 */
export const PHASE_4_2_INCIDENCE_BAND_POLICY = Object.freeze({
  appliesToDefinitionStatus: "FROZEN" as const,
  appliesToLabelId: "ESTABLISHED_SETTLEMENT" as const,
  candidateAndInheritedDefaultOccurrences: SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
  reviewedFloorMethod:
    "FLOOR_TWO_SIDED_95_PERCENT_WILSON_LOWER_BOUND_TIMES_REQUIRED_ELIGIBLE_RUNS" as const,
  confidenceLevel: 0.95 as const,
  zScore: 1.95996398454 as const,
  minimumFloorWhenObserved: 1 as const,
  minimumFloorAppliesOnlyWhenObserved: true as const,
  requiredEligibleRuns: 64 as const,
  interpretation: "RECURRENCE_EVIDENCE_NOT_PREDICTIVE_GUARANTEES" as const,
});

export type Phase42IncidenceBandPolicy = typeof PHASE_4_2_INCIDENCE_BAND_POLICY;

function expectedBandSemantics(definition: ScenarioExpectedBandDefinition) {
  return {
    tableVersion: definition.tableVersion,
    scenarioId: definition.scenarioId,
    metricId: definition.metricId,
    metricPath: definition.metricPath,
    comparison: definition.comparison,
    threshold: definition.threshold,
    bandType: definition.bandType,
  };
}

function incidenceBandSemantics(definition: ScenarioOutcomeIncidenceBandDefinition) {
  return {
    tableVersion: definition.tableVersion,
    scenarioId: definition.scenarioId,
    labelId: definition.labelId,
    metricPath: definition.metricPath,
    comparison: definition.comparison,
    threshold: definition.threshold,
    requiredEligibleRuns: definition.requiredEligibleRuns,
  };
}

function dominanceRationaleSemantics(
  definition: ScenarioOutcomeDominanceRationaleDefinition,
) {
  return {
    scenarioId: definition.scenarioId,
    labelId: definition.labelId,
    rationaleId: definition.rationaleId,
    mechanicsAndScenarioBasis: definition.mechanicsAndScenarioBasis,
    interpretation: definition.interpretation,
  };
}

function pairedBandSemantics(definition: PairedMacroBandDefinition) {
  return {
    tableVersion: definition.tableVersion,
    dimension: definition.dimension,
    leftScenarioId: definition.leftScenarioId,
    rightScenarioId: definition.rightScenarioId,
    metricId: definition.metricId,
    metricPath: definition.metricPath,
    deltaStatistic: definition.deltaStatistic,
    minimumAbsoluteMeanDelta: definition.minimumAbsoluteMeanDelta,
    effectStatistic: definition.effectStatistic,
    minimumAbsoluteCohenDz: definition.minimumAbsoluteCohenDz,
    requiredPairedSeeds: definition.requiredPairedSeeds,
    missingValuePolicy: definition.missingValuePolicy,
    eligiblePairPolicy: definition.eligiblePairPolicy,
  };
}

/**
 * Semantic inputs whose exact runtime implementation is reviewed between the
 * discovery and v2 calibration. Provenance and process status are excluded to
 * avoid a hash cycle with the review artifacts that cite this fingerprint.
 */
export const PHASE_4_2_DEFINITION_CONTRACT = Object.freeze({
  schemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
  fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
  versions: {
    behavior: SIMULATION_BEHAVIOR_VERSION,
    activityProfile: ACTIVITY_PROFILE_SCHEMA_VERSION,
    scenarioEnvelope: SCENARIO_SCHEMA_VERSION,
    scenarioDefinition: SCENARIO_DEFINITION_VERSION,
    mapGeneration: SCENARIO_MAP_GENERATION_VERSION,
    scenarioAnalysis: SCENARIO_ANALYSIS_SCHEMA_VERSION,
    outcomeClassifier: OUTCOME_CLASSIFIER_VERSION,
  },
  corpus: {
    scenarios: [...SCENARIO_IDS],
    seedCount: 64,
    ticksPerRun: 10_000,
  },
  gates: {
    scenarioExpectedBandTableVersion: SCENARIO_EXPECTED_BAND_TABLE_VERSION,
    scenarioOutcomeBandTableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
    pairedMacroBandTableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
    minimumOutcomeOccurrences: SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
    outcomeDominanceThreshold: SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,
    requiredPassingInheritedMacroDimensions: REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS,
    requiredPassingSettlementBands: REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS,
  },
  analysisImplementation: phase42AnalysisSemanticContract(),
  bandValidationImplementation: phase42BandValidationSemanticContract(),
  inheritedPhase41: {
    reviewedCalibrationSha256: PHASE_4_1_CALIBRATION_SHA256,
    expectedBands: SCENARIO_EXPECTED_BANDS.map(expectedBandSemantics),
    incidenceBands: SCENARIO_OUTCOME_INCIDENCE_BANDS.map(incidenceBandSemantics),
    dominanceRationales: SCENARIO_OUTCOME_DOMINANCE_RATIONALES.map(
      dominanceRationaleSemantics,
    ),
    pairedMacroBands: PAIRED_MACRO_BANDS.map(pairedBandSemantics),
  },
  phase42: {
    classifierRules: { ...PHASE_4_2_CLASSIFIER_RULES },
    incidenceBandPolicy: { ...PHASE_4_2_INCIDENCE_BAND_POLICY },
    incidenceBands: PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS.map(incidenceBandSemantics),
    dominanceRationales: PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES.map(
      dominanceRationaleSemantics,
    ),
    settlementPairedMacroBands: PHASE_4_2_PAIRED_MACRO_BANDS.map(pairedBandSemantics),
  },
});

export function phase42DefinitionFingerprint(
  contract: unknown = PHASE_4_2_DEFINITION_CONTRACT,
): string {
  return createHash("sha256")
    .update(canonicalPhase42DefinitionJson(contract), "utf8")
    .digest("hex");
}

export const PHASE_4_2_DEFINITION_FINGERPRINT = phase42DefinitionFingerprint();
