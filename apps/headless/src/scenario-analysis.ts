import {
  SCENARIO_CALIBRATION_SEEDS,
  SCENARIO_CATALOG,
  SCENARIO_HOLDOUT_SEEDS,
  SCENARIO_MEASUREMENT_HORIZONS,
  SCENARIO_NIGHTLY_SEEDS,
  SCENARIO_PR_SMOKE_SEEDS,
  sameScenarioReference,
  type ScenarioId,
  type ScenarioReferenceV2,
} from "@tiny-civ/sim-core";

import type { ActivityProfile, BinaryOutcomeAggregate } from "./activity-collector.js";
import { PHASE_4_2_HOLDOUT_SEEDS, PHASE_4_2_MATRIX_TICKS } from "./phase-4.2-corpora.js";
import {
  PHASE_4_3_CALIBRATION_SEEDS,
  PHASE_4_3_HOLDOUT_SEEDS,
  PHASE_4_3_MATRIX_TICKS,
} from "./phase-4.3-corpora.js";
import {
  PAIRED_MACRO_BANDS,
  PAIRED_MACRO_BAND_TABLE_VERSION,
  PHASE_4_1_CALIBRATION_SEED_COUNT,
  PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
  PHASE_4_2_CALIBRATION_PROVENANCE,
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
  SETTLEMENT_NEGLECT_LOW_CONDITION_RATE,
  SETTLEMENT_NEGLECT_MINIMUM_ACTIVE_SHELTER_TICKS,
  phase42BandsAreFrozen,
  type CalibrationProvenance,
  type FrozenPairedMacroMetricId,
  type FrozenPhase3MacroDimension,
  type PairedMacroBandDefinition,
  type PairedMacroEligiblePairPolicy,
  type PairedMacroMissingValuePolicy,
  type ScenarioBandMetricId,
  type ScenarioOutcomeDominanceRationaleDefinition,
  type ScenarioOutcomeIncidenceBandDefinition,
  type ScenarioOutcomeLabelId,
} from "./scenario-bands.js";
import {
  summarizeScenarioIdentity,
  type ScenarioDefinitionIdentity,
} from "./scenario-reporting.js";

export const SCENARIO_ANALYSIS_SCHEMA_VERSION = 5 as const;
export const OUTCOME_CLASSIFIER_VERSION = 4 as const;

export type ScenarioCorpusName =
  | "smoke"
  | "nightly"
  | "calibration"
  | "holdout"
  | "phase-4.2-calibration"
  | "phase-4.2-holdout"
  | "phase-4.3-calibration"
  | "phase-4.3-holdout";

export type OutcomeLabelId = ScenarioOutcomeLabelId;

export type EvaluationStatus = "PASS" | "FAIL" | "NOT_EVALUATED";
export type EvaluationSummaryStatus = EvaluationStatus | "PARTIAL";

export interface ScenarioAnalysisRun {
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
  readonly finalHash: string;
  readonly profile: ActivityProfile;
}

export interface ScenarioAnalysisContext {
  readonly corpus: ScenarioCorpusName;
  readonly seeds: readonly number[];
  readonly requestedTicks: number;
  readonly phase42DefinitionFingerprint?: string;
  readonly phase42Definitions?: Phase42AnalysisDefinitionOverride;
}

export interface Phase42ClassifierRules {
  readonly establishedSettlementMinimumActiveShelters: number;
  readonly chronicNeglectMinimumActiveShelterTicks: number;
  readonly chronicNeglectMinimumLowConditionExposureRate: number;
  readonly shelterCrowdingMinimumEvents: number;
  readonly guestShelteringMinimumEvents: number;
  readonly settlementRelocationMinimumCount: number;
}

export const PHASE_4_2_CLASSIFIER_RULES: Phase42ClassifierRules = Object.freeze({
  establishedSettlementMinimumActiveShelters: 1,
  chronicNeglectMinimumActiveShelterTicks: SETTLEMENT_NEGLECT_MINIMUM_ACTIVE_SHELTER_TICKS,
  chronicNeglectMinimumLowConditionExposureRate: SETTLEMENT_NEGLECT_LOW_CONDITION_RATE,
  shelterCrowdingMinimumEvents: 1,
  guestShelteringMinimumEvents: 1,
  settlementRelocationMinimumCount: 1,
});

export interface Phase43ClassifierRules {
  readonly visibleNewGenerationMinimumBirths: number;
  readonly dependentYouthCareMinimumActions: number;
  readonly mourningAndMemoryMinimumMournings: number;
  readonly estateTransferredMinimumClaims: number;
}

/** Prospective classifier-v4 facts; calibration may review incidence, not rewrite predicates. */
export const PHASE_4_3_CLASSIFIER_RULES: Phase43ClassifierRules = Object.freeze({
  visibleNewGenerationMinimumBirths: 1,
  dependentYouthCareMinimumActions: 1,
  mourningAndMemoryMinimumMournings: 1,
  estateTransferredMinimumClaims: 1,
});

/**
 * Trusted, already-validated Phase 4.2 tables embedded in a calibration
 * artifact. Authentication uses these data-only definitions to reproduce the
 * artifact under the exact candidate/frozen contract that created it.
 */
export interface Phase42AnalysisDefinitionOverride {
  readonly status: "CANDIDATE" | "FROZEN";
  readonly classifierRules: Phase42ClassifierRules;
  readonly incidenceBands: readonly ScenarioOutcomeIncidenceBandDefinition[];
  readonly dominanceRationales: readonly ScenarioOutcomeDominanceRationaleDefinition[];
  readonly pairedMacroBands: readonly PairedMacroBandDefinition[];
}

function phase42ClassifierRulesForContext(
  context: ScenarioAnalysisContext,
): Phase42ClassifierRules {
  return context.phase42Definitions?.classifierRules ?? PHASE_4_2_CLASSIFIER_RULES;
}

function phase42DefinitionsAreFrozenForContext(context: ScenarioAnalysisContext): boolean {
  return context.phase42Definitions?.status === "FROZEN"
    ? true
    : context.phase42Definitions?.status === "CANDIDATE"
      ? false
      : phase42BandsAreFrozen(context.phase42DefinitionFingerprint);
}

export interface OutcomeEvidence {
  readonly metricPath: string;
  readonly value: number | boolean;
  readonly comparison: "EQ" | "GTE" | "GT" | "LTE";
  readonly threshold: number | boolean;
}

export interface OutcomeLabel {
  readonly id: OutcomeLabelId;
  readonly title: string;
  readonly factualSummary: string;
  readonly evidence: readonly OutcomeEvidence[];
}

export interface RunOutcomeSummary {
  readonly classifierVersion: typeof OUTCOME_CLASSIFIER_VERSION;
  readonly multiLabel: true;
  readonly interpretation: "FACTUAL_NON_EXCLUSIVE_NO_WINNER";
  readonly seed: number;
  readonly labels: readonly OutcomeLabel[];
  readonly evaluatedLabelIds: readonly OutcomeLabelId[];
  readonly notEvaluatedLabelIds: readonly OutcomeLabelId[];
}

export interface OutcomeLabelIncidence extends BinaryOutcomeAggregate {
  readonly labelId: OutcomeLabelId;
  readonly title: string;
  readonly totalRuns: number;
  readonly eligibleRuns: number;
}

export interface HardInvariantEvaluation {
  readonly id: string;
  readonly classification: "LOCKED_CONTRACT_SAFETY_INVARIANT";
  readonly status: EvaluationStatus;
  readonly metricPath: string;
  readonly observed: number | null;
  readonly comparison: "EQ" | "GTE" | "LT";
  readonly threshold: number;
  readonly reason: string | null;
}

export interface RunHardInvariantReport {
  readonly seed: number;
  readonly status: EvaluationSummaryStatus;
  readonly evaluations: readonly HardInvariantEvaluation[];
}

export interface ScenarioBandEvaluation {
  readonly metricId: ScenarioBandMetricId;
  readonly metricPath: string;
  readonly status: EvaluationStatus;
  readonly observed: number | null;
  readonly comparison: "GTE" | "LT";
  readonly threshold: number;
  readonly reason: string | null;
  readonly bandType: "CONTRACT_SAFETY_FLOOR";
  readonly provenance: (typeof SCENARIO_EXPECTED_BANDS)[number]["provenance"];
}

export interface ScenarioOutcomeBandEvaluation {
  readonly tableVersion: typeof SCENARIO_OUTCOME_BAND_TABLE_VERSION;
  readonly labelId: OutcomeLabelId;
  readonly metricPath: string;
  readonly status: EvaluationStatus;
  readonly observed: number | null;
  readonly eligibleRuns: number;
  readonly comparison: "GTE";
  readonly threshold: number;
  readonly requiredEligibleRuns: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly reason: string | null;
  readonly provenance: CalibrationProvenance;
}

export interface ScenarioOutcomeDominanceEvaluation {
  readonly labelId: OutcomeLabelId;
  readonly metricPath: string;
  readonly status: EvaluationStatus;
  readonly incidence: number | null;
  readonly occurrences: number;
  readonly eligibleRuns: number;
  readonly comparison: "GT";
  readonly threshold: typeof SCENARIO_OUTCOME_DOMINANCE_THRESHOLD;
  readonly rationaleRequired: boolean;
  readonly rationale: ScenarioOutcomeDominanceRationaleDefinition | null;
  readonly reason: string | null;
}

export interface ScenarioOutcomeBandReport {
  readonly tableVersion: typeof SCENARIO_OUTCOME_BAND_TABLE_VERSION;
  readonly status: EvaluationSummaryStatus;
  readonly eligibility: {
    readonly status:
      | "FULL_CALIBRATION"
      | "FULL_HOLDOUT"
      | "PHASE_4_2_CALIBRATION_CANDIDATE"
      | "FULL_PHASE_4_2_CALIBRATION"
      | "FULL_PHASE_4_2_HOLDOUT"
      | "PHASE_4_3_CALIBRATION_CANDIDATE"
      | "PHASE_4_3_NOT_FROZEN"
      | "PHASE_4_2_NOT_FROZEN"
      | "NOT_EVALUATED";
    readonly reason: string | null;
  };
  readonly releaseClaim: false;
  readonly provenance: CalibrationProvenance;
  readonly evaluations: readonly ScenarioOutcomeBandEvaluation[];
  readonly dominance: {
    readonly status: EvaluationSummaryStatus;
    readonly threshold: typeof SCENARIO_OUTCOME_DOMINANCE_THRESHOLD;
    readonly evaluations: readonly ScenarioOutcomeDominanceEvaluation[];
    readonly rationaleFailures: readonly OutcomeLabelId[];
  };
}

export interface ScenarioExpectedBandReport {
  readonly tableVersion: typeof SCENARIO_EXPECTED_BAND_TABLE_VERSION;
  readonly status: EvaluationSummaryStatus;
  readonly corpusValidation: {
    readonly status: "MATCHED_LOCKED_CORPUS" | "CORPUS_MISMATCH" | "HORIZON_MISMATCH";
    readonly expectedSeeds: readonly number[];
    readonly observedSeeds: readonly number[];
    readonly expectedTicks: number;
    readonly observedTicks: number;
  };
  readonly provenance: {
    readonly releaseOutcomeClaim: false;
    readonly calibrationEvidence:
      | "SMOKE_SUBSET_ONLY"
      | "NIGHTLY_SUBSET_ONLY"
      | "FULL_CALIBRATION_PRESENT"
      | "PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT"
      | "FULL_PHASE_4_2_CALIBRATION_PRESENT"
      | "PHASE_4_3_CANDIDATE_CALIBRATION_PRESENT"
      | "NOT_PRESENT";
    readonly holdoutEvidence:
      "FULL_HOLDOUT_PRESENT" | "FULL_PHASE_4_2_HOLDOUT_PRESENT" | "NOT_PRESENT";
  };
  readonly evaluations: readonly ScenarioBandEvaluation[];
  readonly scenarioOutcomeBands: ScenarioOutcomeBandReport;
}

export interface ScenarioAnalysisReport {
  readonly schemaVersion: typeof SCENARIO_ANALYSIS_SCHEMA_VERSION;
  readonly scenario: ScenarioDefinitionIdentity;
  readonly compiledMapHashes: readonly string[];
  readonly outcomes: {
    readonly perRun: readonly RunOutcomeSummary[];
    readonly incidence: readonly OutcomeLabelIncidence[];
  };
  readonly hardInvariants: {
    readonly status: EvaluationSummaryStatus;
    readonly perRun: readonly RunHardInvariantReport[];
    readonly corpus: readonly HardInvariantEvaluation[];
  };
  readonly expectedBands: ScenarioExpectedBandReport;
}

type MacroDimension =
  "SOCIAL" | "STORAGE" | "CONFLICT" | "SPATIAL" | "HYDRATION" | "SETTLEMENT";

type MacroMetricId =
  | "GROUP_COUNT"
  | "RELATIONSHIP_COMPONENT_COUNT"
  | "COMPLETED_STORAGE_COUNT"
  | "STORED_RESOURCE_UNITS"
  | "ATTACK_EVENT_COUNT"
  | "CREATURE_PAIR_DISTANCE_MEDIAN"
  | "ROUTE_HERFINDAHL_INDEX"
  | "SEVERE_THIRST_EXPOSURE_RATE"
  | "DEPLETED_WATER_SOURCE_TICKS"
  | "WATER_SHARED_UNITS"
  | "WATER_ROUTE_HERFINDAHL_INDEX"
  | "ACTIVE_SHELTER_COUNT"
  | "SHELTERED_REST_SHARE"
  | "MEAN_SHELTER_CONDITION"
  | "SHELTER_GUEST_USE_EVENTS"
  | "SETTLEMENT_RELOCATION_COUNT";

export interface PairedMetricDelta {
  readonly seed: number;
  readonly leftValue: number;
  readonly rightValue: number;
  readonly delta: number;
}

export interface PairedMetricSummary {
  readonly metricId: MacroMetricId;
  readonly dimension: MacroDimension;
  readonly metricPath: string;
  readonly missingValuePolicy: "ZERO_IS_OBSERVED" | "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING";
  readonly deltaDirection: "RIGHT_MINUS_LEFT";
  readonly pairs: readonly PairedMetricDelta[];
  readonly summary: {
    readonly pairedSeedCount: number;
    readonly meanDelta: number | null;
    readonly medianDelta: number | null;
    readonly meanAbsoluteDelta: number | null;
    readonly sampleStandardDeviationDelta: number | null;
    readonly positiveDeltas: number;
    readonly zeroDeltas: number;
    readonly negativeDeltas: number;
  };
  readonly effect: {
    readonly method: "PAIRED_STANDARDIZED_MEAN_DELTA_COHEN_DZ";
    readonly value: number | null;
    readonly interpretation: "DESCRIPTIVE_NON_CAUSAL";
  };
}

export interface PairedScenarioComparison {
  readonly leftScenarioId: ScenarioId;
  readonly rightScenarioId: ScenarioId;
  readonly comparisonKind: "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL";
  readonly pairedSeeds: readonly number[];
  readonly metrics: readonly PairedMetricSummary[];
}

export interface FrozenPairedMacroBandEvaluation {
  readonly tableVersion: typeof PAIRED_MACRO_BAND_TABLE_VERSION;
  readonly dimension: FrozenPhase3MacroDimension;
  readonly leftScenarioId: ScenarioId;
  readonly rightScenarioId: ScenarioId;
  readonly metricId: FrozenPairedMacroMetricId;
  readonly metricPath: string;
  readonly status: EvaluationStatus;
  readonly pairedSeedCount: number;
  readonly requiredPairedSeeds: number;
  readonly missingValuePolicy: PairedMacroMissingValuePolicy;
  readonly eligiblePairPolicy: PairedMacroEligiblePairPolicy;
  readonly meanDelta: number | null;
  readonly absoluteMeanDelta: number | null;
  readonly minimumAbsoluteMeanDelta: number;
  readonly cohenDz: number | null;
  readonly absoluteCohenDz: number | null;
  readonly minimumAbsoluteCohenDz: number;
  readonly reason: string | null;
  readonly provenance: CalibrationProvenance;
}

export interface FrozenPairedMacroBandReport {
  readonly tableVersion: typeof PAIRED_MACRO_BAND_TABLE_VERSION;
  readonly status: EvaluationStatus;
  readonly bandEvaluationStatus: EvaluationSummaryStatus;
  readonly releaseClaim: false;
  readonly provenance: CalibrationProvenance;
  readonly corpusValidation: {
    readonly status:
      | "FULL_CALIBRATION"
      | "FULL_HOLDOUT"
      | "PHASE_4_2_CALIBRATION_CANDIDATE"
      | "FULL_PHASE_4_2_CALIBRATION"
      | "FULL_PHASE_4_2_HOLDOUT"
      | "PHASE_4_2_NOT_FROZEN"
      | "NOT_FULL_CALIBRATION_OR_HOLDOUT"
      | "CORPUS_MISMATCH"
      | "HORIZON_MISMATCH";
    readonly expectedSeeds: readonly number[];
    readonly observedSeedsByScenario: Readonly<Record<ScenarioId, readonly number[]>>;
    readonly expectedTicks: number;
    readonly observedTicks: number;
    readonly reason: string | null;
  };
  readonly evaluations: readonly FrozenPairedMacroBandEvaluation[];
  readonly dimensionRequirement: {
    readonly status: EvaluationStatus;
    readonly metricPath: "evaluations[status=PASS].dimension|distinctCount";
    readonly observed: number | null;
    readonly comparison: "GTE";
    readonly threshold: typeof REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS;
    readonly passingDimensions: readonly FrozenPhase3MacroDimension[];
    readonly reason: string | null;
  };
  readonly settlementRequirement: {
    readonly status: EvaluationStatus;
    readonly metricPath: "evaluations[dimension=SETTLEMENT,status=PASS]|count";
    readonly observed: number | null;
    readonly comparison: "GTE";
    readonly threshold: typeof REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS;
    readonly reason: string | null;
  };
}

export interface ConvergenceDiagnostic {
  readonly leftScenarioId: ScenarioId;
  readonly rightScenarioId: ScenarioId;
  readonly dimension: MacroDimension;
  readonly status: "EXACT_CONVERGENCE" | "DIFFERENCE_OBSERVED" | "NOT_EVALUATED";
  readonly method: "EXACT_PAIRED_VALUE_EQUALITY";
  readonly comparedMetricCount: number;
  readonly pairedValueCount: number;
  readonly exactPairRate: number | null;
  readonly exactlyEqualMetricIds: readonly MacroMetricId[];
  readonly interpretation: "DESCRIPTIVE_NON_CAUSAL_DIAGNOSTIC";
}

const OUTCOME_LABEL_ORDER: readonly OutcomeLabelId[] = [
  "COOPERATIVE_SHARED_STORAGE",
  "FRAGMENTED_SOCIAL_STRUCTURE",
  "PERSISTENT_PRIVATE_RESERVES",
  "RECURRING_CONFLICT",
  "SHARED_HYDRATION",
  "SOURCE_BOTTLENECK",
  "PERSISTENT_DEHYDRATION",
  "CONCENTRATED_WATER_ROUTES",
  "ESTABLISHED_SETTLEMENT",
  "CHRONIC_SHELTER_NEGLECT",
  "SHELTER_CROWDING",
  "GUEST_SHELTERING",
  "SETTLEMENT_RELOCATION",
  "VISIBLE_NEW_GENERATION",
  "DEPENDENT_YOUTH_CARED_FOR",
  "MOURNING_AND_MEMORY",
  "ESTATE_TRANSFERRED",
  "POPULATION_GROWTH",
  "POPULATION_DECLINE",
  "POPULATION_EXTINCTION",
  "QUIET_STALEMATE",
];

/** Classifier-3 surface retained for Phase 4.2 dominance review. */
const PHASE_4_2_OUTCOME_LABEL_ORDER: readonly OutcomeLabelId[] = [
  "COOPERATIVE_SHARED_STORAGE",
  "FRAGMENTED_SOCIAL_STRUCTURE",
  "PERSISTENT_PRIVATE_RESERVES",
  "RECURRING_CONFLICT",
  "SHARED_HYDRATION",
  "SOURCE_BOTTLENECK",
  "PERSISTENT_DEHYDRATION",
  "CONCENTRATED_WATER_ROUTES",
  "ESTABLISHED_SETTLEMENT",
  "CHRONIC_SHELTER_NEGLECT",
  "SHELTER_CROWDING",
  "GUEST_SHELTERING",
  "SETTLEMENT_RELOCATION",
  "QUIET_STALEMATE",
];

/** Classifier-2 surface retained by the historical Phase 4.1 corpus gates. */
const PHASE_4_1_OUTCOME_LABEL_ORDER: readonly OutcomeLabelId[] = [
  "COOPERATIVE_SHARED_STORAGE",
  "FRAGMENTED_SOCIAL_STRUCTURE",
  "PERSISTENT_PRIVATE_RESERVES",
  "RECURRING_CONFLICT",
  "SHARED_HYDRATION",
  "SOURCE_BOTTLENECK",
  "PERSISTENT_DEHYDRATION",
  "CONCENTRATED_WATER_ROUTES",
  "QUIET_STALEMATE",
];

const OUTCOME_LABEL_TITLES: Readonly<Record<OutcomeLabelId, string>> = {
  COOPERATIVE_SHARED_STORAGE: "Cooperative shared storage",
  FRAGMENTED_SOCIAL_STRUCTURE: "Fragmented social structure",
  PERSISTENT_PRIVATE_RESERVES: "Persistent private reserves",
  RECURRING_CONFLICT: "Recurring conflict",
  SHARED_HYDRATION: "Shared hydration",
  SOURCE_BOTTLENECK: "Source bottleneck",
  PERSISTENT_DEHYDRATION: "Persistent dehydration",
  CONCENTRATED_WATER_ROUTES: "Concentrated water routes",
  ESTABLISHED_SETTLEMENT: "Established settlement",
  CHRONIC_SHELTER_NEGLECT: "Chronic shelter neglect",
  SHELTER_CROWDING: "Shelter crowding",
  GUEST_SHELTERING: "Guest sheltering",
  SETTLEMENT_RELOCATION: "Settlement relocation",
  VISIBLE_NEW_GENERATION: "Visible new generation",
  DEPENDENT_YOUTH_CARED_FOR: "Dependent youth cared for",
  MOURNING_AND_MEMORY: "Mourning and memory",
  ESTATE_TRANSFERRED: "Estate transferred",
  POPULATION_GROWTH: "Population growth",
  POPULATION_DECLINE: "Population decline",
  POPULATION_EXTINCTION: "Population extinction",
  QUIET_STALEMATE: "Quiet stalemate",
};

const CORPUS_CONTRACT: Readonly<
  Record<ScenarioCorpusName, { readonly seeds: readonly number[]; readonly ticks: number }>
> = {
  smoke: {
    seeds: SCENARIO_PR_SMOKE_SEEDS,
    ticks: SCENARIO_MEASUREMENT_HORIZONS.smokeTicks,
  },
  nightly: {
    seeds: SCENARIO_NIGHTLY_SEEDS,
    ticks: SCENARIO_MEASUREMENT_HORIZONS.matrixTicks,
  },
  calibration: {
    seeds: SCENARIO_CALIBRATION_SEEDS,
    ticks: SCENARIO_MEASUREMENT_HORIZONS.matrixTicks,
  },
  holdout: {
    seeds: SCENARIO_HOLDOUT_SEEDS,
    ticks: SCENARIO_MEASUREMENT_HORIZONS.matrixTicks,
  },
  "phase-4.2-calibration": {
    seeds: SCENARIO_CALIBRATION_SEEDS,
    ticks: PHASE_4_2_MATRIX_TICKS,
  },
  "phase-4.2-holdout": {
    seeds: PHASE_4_2_HOLDOUT_SEEDS,
    ticks: PHASE_4_2_MATRIX_TICKS,
  },
  "phase-4.3-calibration": {
    seeds: PHASE_4_3_CALIBRATION_SEEDS,
    ticks: PHASE_4_3_MATRIX_TICKS,
  },
  "phase-4.3-holdout": {
    seeds: PHASE_4_3_HOLDOUT_SEEDS,
    ticks: PHASE_4_3_MATRIX_TICKS,
  },
};

function round(value: number, decimalPlaces = 6): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return null;
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  return left === undefined ? right : round((left + right) / 2);
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : round(values.reduce((total, value) => total + value, 0) / values.length);
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  if (average === null) return null;
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    (values.length - 1);
  return round(Math.sqrt(variance));
}

function wilsonOutcome(occurrences: number, runs: number): BinaryOutcomeAggregate {
  if (occurrences < 0 || runs < 0 || occurrences > runs) {
    throw new RangeError("Wilson interval counts must satisfy 0 <= occurrences <= runs.");
  }
  if (runs === 0) {
    return {
      runs,
      occurrences,
      incidence: null,
      wilson95: { confidence: 0.95, lower: null, upper: null },
    };
  }
  const z = 1.959963984540054;
  const zSquared = z * z;
  const proportion = occurrences / runs;
  const denominator = 1 + zSquared / runs;
  const centre = (proportion + zSquared / (2 * runs)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / runs + zSquared / (4 * runs * runs));
  return {
    runs,
    occurrences,
    incidence: round(proportion),
    wilson95: {
      confidence: 0.95,
      lower: round(Math.max(0, centre - margin)),
      upper: round(Math.min(1, centre + margin)),
    },
  };
}

function action(profile: ActivityProfile, kind: string): { count: number; share: number } {
  return (
    profile.actions.byKind.find((item) => item.kind === kind) ?? {
      count: 0,
      share: 0,
    }
  );
}

function interactionCount(profile: ActivityProfile, eventType: string): number {
  return (
    profile.interactions.byType.find((item) => item.eventType === eventType)?.count ?? 0
  );
}

function outcomeEvidence(
  metricPath: string,
  value: number | boolean,
  comparison: OutcomeEvidence["comparison"],
  threshold: number | boolean,
): OutcomeEvidence {
  return { metricPath, value, comparison, threshold };
}

export function summarizeRunOutcome(
  profile: ActivityProfile,
  phase42Rules: Phase42ClassifierRules = PHASE_4_2_CLASSIFIER_RULES,
): RunOutcomeSummary {
  const labels: OutcomeLabel[] = [];
  const evaluatedLabelIds: OutcomeLabelId[] = [];
  const notEvaluatedLabelIds: OutcomeLabelId[] = [];
  const ordinaryLabels = OUTCOME_LABEL_ORDER.filter(
    (labelId) => labelId !== "QUIET_STALEMATE",
  );
  const hasObservationWindow = profile.window.observedTicks > 0;
  const stalemateEligible =
    profile.window.observedTicks === SCENARIO_MEASUREMENT_HORIZONS.matrixTicks &&
    profile.stalemate.observedWindowTicks ===
      SCENARIO_MEASUREMENT_HORIZONS.stalemateWindowTicks &&
    profile.stalemate.eligible;
  if (hasObservationWindow) evaluatedLabelIds.push(...ordinaryLabels);
  else notEvaluatedLabelIds.push(...ordinaryLabels);

  if (stalemateEligible) evaluatedLabelIds.push("QUIET_STALEMATE");
  else notEvaluatedLabelIds.push("QUIET_STALEMATE");

  if (hasObservationWindow) {
    const sharedFoodEvents = interactionCount(profile, "FOOD_SHARED");
    const storedResources =
      profile.horizon.storage.food +
      profile.horizon.storage.material +
      profile.horizon.storage.water;
    if (
      profile.horizon.storage.completedStorageCount >= 1 &&
      storedResources >= 1 &&
      profile.groups.horizon.groupedCreatureCount >= 2 &&
      sharedFoodEvents >= 1
    ) {
      labels.push({
        id: "COOPERATIVE_SHARED_STORAGE",
        title: OUTCOME_LABEL_TITLES.COOPERATIVE_SHARED_STORAGE,
        factualSummary:
          "A completed group store held resources after at least one observed food-sharing event.",
        evidence: [
          outcomeEvidence(
            "profile.horizon.storage.completedStorageCount",
            profile.horizon.storage.completedStorageCount,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.horizon.storage.food+profile.horizon.storage.material+profile.horizon.storage.water",
            storedResources,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.groups.horizon.groupedCreatureCount",
            profile.groups.horizon.groupedCreatureCount,
            "GTE",
            2,
          ),
          outcomeEvidence(
            "profile.interactions.byType[FOOD_SHARED].count",
            sharedFoodEvents,
            "GTE",
            1,
          ),
        ],
      });
    }

    if (profile.relationships.componentCount >= 2) {
      labels.push({
        id: "FRAGMENTED_SOCIAL_STRUCTURE",
        title: OUTCOME_LABEL_TITLES.FRAGMENTED_SOCIAL_STRUCTURE,
        factualSummary:
          "The relationship graph remained split across two or more connected components at the horizon.",
        evidence: [
          outcomeEvidence(
            "profile.relationships.componentCount",
            profile.relationships.componentCount,
            "GTE",
            2,
          ),
          outcomeEvidence(
            "profile.relationships.vertexCount",
            profile.relationships.vertexCount,
            "GTE",
            1,
          ),
        ],
      });
    }

    const keep = action(profile, "KEEP");
    const privateResources =
      profile.horizon.resources.ungroupedCarriedFood +
      profile.horizon.resources.ungroupedCarriedMaterial +
      profile.horizon.resources.ungroupedCarriedWater;
    if (
      keep.count >= 1 &&
      privateResources >= 1 &&
      profile.horizon.storage.completedStorageCount === 0
    ) {
      labels.push({
        id: "PERSISTENT_PRIVATE_RESERVES",
        title: OUTCOME_LABEL_TITLES.PERSISTENT_PRIVATE_RESERVES,
        factualSummary:
          "At least one KEEP action occurred and ungrouped creatures still carried resources without a completed store at the horizon.",
        evidence: [
          outcomeEvidence("profile.actions.byKind[KEEP].count", keep.count, "GTE", 1),
          outcomeEvidence(
            "profile.horizon.resources.ungroupedCarriedFood+profile.horizon.resources.ungroupedCarriedMaterial+profile.horizon.resources.ungroupedCarriedWater",
            privateResources,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.horizon.storage.completedStorageCount",
            profile.horizon.storage.completedStorageCount,
            "EQ",
            0,
          ),
        ],
      });
    }

    const attacks = interactionCount(profile, "CREATURE_ATTACKED");
    if (attacks >= 2) {
      labels.push({
        id: "RECURRING_CONFLICT",
        title: OUTCOME_LABEL_TITLES.RECURRING_CONFLICT,
        factualSummary:
          "Two or more creature-attack events occurred in the observed window.",
        evidence: [
          outcomeEvidence(
            "profile.interactions.byType[CREATURE_ATTACKED].count",
            attacks,
            "GTE",
            2,
          ),
        ],
      });
    }

    if (
      profile.hydration.flow.sharedUnits >= 4 &&
      profile.hydration.flow.distinctRecipients >= 3
    ) {
      labels.push({
        id: "SHARED_HYDRATION",
        title: OUTCOME_LABEL_TITLES.SHARED_HYDRATION,
        factualSummary:
          "At least four water units were shared across at least three distinct recipients.",
        evidence: [
          outcomeEvidence(
            "profile.hydration.flow.sharedUnits",
            profile.hydration.flow.sharedUnits,
            "GTE",
            4,
          ),
          outcomeEvidence(
            "profile.hydration.flow.distinctRecipients",
            profile.hydration.flow.distinctRecipients,
            "GTE",
            3,
          ),
        ],
      });
    }

    const depletedSourceBottleneck = profile.hydration.sources.depletedSourceTicks >= 500;
    const contentionBottleneck =
      profile.hydration.sources.gatherAttempts > 0 &&
      profile.hydration.sources.contentionRate >= 0.1;
    if (depletedSourceBottleneck || contentionBottleneck) {
      const evidence: OutcomeEvidence[] = [];
      if (depletedSourceBottleneck) {
        evidence.push(
          outcomeEvidence(
            "profile.hydration.sources.depletedSourceTicks",
            profile.hydration.sources.depletedSourceTicks,
            "GTE",
            500,
          ),
        );
      }
      if (contentionBottleneck) {
        evidence.push(
          outcomeEvidence(
            "profile.hydration.sources.contentionRate",
            profile.hydration.sources.contentionRate,
            "GTE",
            0.1,
          ),
        );
      }
      labels.push({
        id: "SOURCE_BOTTLENECK",
        title: OUTCOME_LABEL_TITLES.SOURCE_BOTTLENECK,
        factualSummary:
          "Potable-water access met the declared depletion or contention threshold.",
        evidence,
      });
    }

    const severeExposure = profile.hydration.need.severeExposureRate >= 0.1;
    const longSevereSpell = profile.hydration.need.longestSevereSpellTicks >= 1_000;
    if (severeExposure || longSevereSpell) {
      const evidence: OutcomeEvidence[] = [];
      if (severeExposure) {
        evidence.push(
          outcomeEvidence(
            "profile.hydration.need.severeExposureRate",
            profile.hydration.need.severeExposureRate,
            "GTE",
            0.1,
          ),
        );
      }
      if (longSevereSpell) {
        evidence.push(
          outcomeEvidence(
            "profile.hydration.need.longestSevereSpellTicks",
            profile.hydration.need.longestSevereSpellTicks,
            "GTE",
            1_000,
          ),
        );
      }
      labels.push({
        id: "PERSISTENT_DEHYDRATION",
        title: OUTCOME_LABEL_TITLES.PERSISTENT_DEHYDRATION,
        factualSummary:
          "Severe thirst met the declared exposure-share or continuous-spell threshold.",
        evidence,
      });
    }

    if (
      profile.hydration.routes.dominantEdgeShare >= 0.35 &&
      profile.hydration.routes.herfindahlIndex >= 0.15
    ) {
      labels.push({
        id: "CONCENTRATED_WATER_ROUTES",
        title: OUTCOME_LABEL_TITLES.CONCENTRATED_WATER_ROUTES,
        factualSummary:
          "Water-trip movement concentrated on a dominant corridor under both declared route thresholds.",
        evidence: [
          outcomeEvidence(
            "profile.hydration.routes.dominantEdgeShare",
            profile.hydration.routes.dominantEdgeShare,
            "GTE",
            0.35,
          ),
          outcomeEvidence(
            "profile.hydration.routes.herfindahlIndex",
            profile.hydration.routes.herfindahlIndex,
            "GTE",
            0.15,
          ),
        ],
      });
    }

    if (
      profile.settlement.horizon.activeShelterCount >=
      phase42Rules.establishedSettlementMinimumActiveShelters
    ) {
      labels.push({
        id: "ESTABLISHED_SETTLEMENT",
        title: OUTCOME_LABEL_TITLES.ESTABLISHED_SETTLEMENT,
        factualSummary:
          "The completed communal shelter count at the horizon met the declared threshold.",
        evidence: [
          outcomeEvidence(
            "profile.settlement.horizon.activeShelterCount",
            profile.settlement.horizon.activeShelterCount,
            "GTE",
            phase42Rules.establishedSettlementMinimumActiveShelters,
          ),
        ],
      });
    }

    if (
      profile.settlement.condition.activeShelterTicks >=
        phase42Rules.chronicNeglectMinimumActiveShelterTicks &&
      profile.settlement.condition.lowConditionExposureRate >=
        phase42Rules.chronicNeglectMinimumLowConditionExposureRate
    ) {
      labels.push({
        id: "CHRONIC_SHELTER_NEGLECT",
        title: OUTCOME_LABEL_TITLES.CHRONIC_SHELTER_NEGLECT,
        factualSummary:
          "Low-condition exposure met both declared active-shelter duration and exposure-rate thresholds.",
        evidence: [
          outcomeEvidence(
            "profile.settlement.condition.activeShelterTicks",
            profile.settlement.condition.activeShelterTicks,
            "GTE",
            phase42Rules.chronicNeglectMinimumActiveShelterTicks,
          ),
          outcomeEvidence(
            "profile.settlement.condition.lowConditionExposureRate",
            profile.settlement.condition.lowConditionExposureRate,
            "GTE",
            phase42Rules.chronicNeglectMinimumLowConditionExposureRate,
          ),
        ],
      });
    }

    if (
      profile.settlement.occupancy.crowdingEvents >=
      phase42Rules.shelterCrowdingMinimumEvents
    ) {
      labels.push({
        id: "SHELTER_CROWDING",
        title: OUTCOME_LABEL_TITLES.SHELTER_CROWDING,
        factualSummary: "Capacity-based shelter crowding met the declared event threshold.",
        evidence: [
          outcomeEvidence(
            "profile.settlement.occupancy.crowdingEvents",
            profile.settlement.occupancy.crowdingEvents,
            "GTE",
            phase42Rules.shelterCrowdingMinimumEvents,
          ),
        ],
      });
    }

    if (
      profile.settlement.rest.guestUseEvents >= phase42Rules.guestShelteringMinimumEvents
    ) {
      labels.push({
        id: "GUEST_SHELTERING",
        title: OUTCOME_LABEL_TITLES.GUEST_SHELTERING,
        factualSummary: "Non-member shelter use met the declared event threshold.",
        evidence: [
          outcomeEvidence(
            "profile.settlement.rest.guestUseEvents",
            profile.settlement.rest.guestUseEvents,
            "GTE",
            phase42Rules.guestShelteringMinimumEvents,
          ),
        ],
      });
    }

    if (
      profile.settlement.relocation.relocations >=
      phase42Rules.settlementRelocationMinimumCount
    ) {
      labels.push({
        id: "SETTLEMENT_RELOCATION",
        title: OUTCOME_LABEL_TITLES.SETTLEMENT_RELOCATION,
        factualSummary:
          "Completed settlement relocations met the declared count threshold.",
        evidence: [
          outcomeEvidence(
            "profile.settlement.relocation.relocations",
            profile.settlement.relocation.relocations,
            "GTE",
            phase42Rules.settlementRelocationMinimumCount,
          ),
        ],
      });
    }

    if (
      profile.lifecycle.population.births >=
        PHASE_4_3_CLASSIFIER_RULES.visibleNewGenerationMinimumBirths &&
      profile.lifecycle.generations.newGenerationIds.length >= 1 &&
      profile.lifecycle.reproduction.twoKnownParentBirths >= 1
    ) {
      labels.push({
        id: "VISIBLE_NEW_GENERATION",
        title: OUTCOME_LABEL_TITLES.VISIBLE_NEW_GENERATION,
        factualSummary:
          "At least one two-parent birth produced a retained new-generation identity in the observed window.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.population.births",
            profile.lifecycle.population.births,
            "GTE",
            PHASE_4_3_CLASSIFIER_RULES.visibleNewGenerationMinimumBirths,
          ),
          outcomeEvidence(
            "profile.lifecycle.generations.newGenerationIds.length",
            profile.lifecycle.generations.newGenerationIds.length,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.lifecycle.reproduction.twoKnownParentBirths",
            profile.lifecycle.reproduction.twoKnownParentBirths,
            "GTE",
            1,
          ),
        ],
      });
    }

    if (
      profile.lifecycle.generations.dependentYouthCreatureTicks >= 1 &&
      profile.lifecycle.care.actions >=
        PHASE_4_3_CLASSIFIER_RULES.dependentYouthCareMinimumActions
    ) {
      labels.push({
        id: "DEPENDENT_YOUTH_CARED_FOR",
        title: OUTCOME_LABEL_TITLES.DEPENDENT_YOUTH_CARED_FOR,
        factualSummary:
          "Dependent juvenile exposure and at least one care action were both observed.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.generations.dependentYouthCreatureTicks",
            profile.lifecycle.generations.dependentYouthCreatureTicks,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.lifecycle.care.actions",
            profile.lifecycle.care.actions,
            "GTE",
            PHASE_4_3_CLASSIFIER_RULES.dependentYouthCareMinimumActions,
          ),
        ],
      });
    }

    if (
      profile.lifecycle.population.deaths >= 1 &&
      profile.lifecycle.legacy.lifeRecordsAtHorizon >= 1 &&
      profile.lifecycle.legacy.mourningCompletions >=
        PHASE_4_3_CLASSIFIER_RULES.mourningAndMemoryMinimumMournings
    ) {
      labels.push({
        id: "MOURNING_AND_MEMORY",
        title: OUTCOME_LABEL_TITLES.MOURNING_AND_MEMORY,
        factualSummary:
          "A death, retained life record, and completed mourning were all observed.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.population.deaths",
            profile.lifecycle.population.deaths,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.lifecycle.legacy.lifeRecordsAtHorizon",
            profile.lifecycle.legacy.lifeRecordsAtHorizon,
            "GTE",
            1,
          ),
          outcomeEvidence(
            "profile.lifecycle.legacy.mourningCompletions",
            profile.lifecycle.legacy.mourningCompletions,
            "GTE",
            PHASE_4_3_CLASSIFIER_RULES.mourningAndMemoryMinimumMournings,
          ),
        ],
      });
    }

    if (
      profile.lifecycle.legacy.estatesClaimed >=
      PHASE_4_3_CLASSIFIER_RULES.estateTransferredMinimumClaims
    ) {
      labels.push({
        id: "ESTATE_TRANSFERRED",
        title: OUTCOME_LABEL_TITLES.ESTATE_TRANSFERRED,
        factualSummary: "At least one estate claim transferred retained goods.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.legacy.estatesClaimed",
            profile.lifecycle.legacy.estatesClaimed,
            "GTE",
            PHASE_4_3_CLASSIFIER_RULES.estateTransferredMinimumClaims,
          ),
        ],
      });
    }

    if (profile.lifecycle.population.netChange > 0) {
      labels.push({
        id: "POPULATION_GROWTH",
        title: OUTCOME_LABEL_TITLES.POPULATION_GROWTH,
        factualSummary: "The living population was larger at the horizon than at start.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.population.netChange",
            profile.lifecycle.population.netChange,
            "GT",
            0,
          ),
        ],
      });
    }

    if (profile.lifecycle.population.netChange < 0) {
      labels.push({
        id: "POPULATION_DECLINE",
        title: OUTCOME_LABEL_TITLES.POPULATION_DECLINE,
        factualSummary: "The living population was smaller at the horizon than at start.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.population.netChange",
            profile.lifecycle.population.netChange,
            "LTE",
            -1,
          ),
        ],
      });
    }

    if (profile.lifecycle.population.extinctAtHorizon) {
      labels.push({
        id: "POPULATION_EXTINCTION",
        title: OUTCOME_LABEL_TITLES.POPULATION_EXTINCTION,
        factualSummary: "No living creatures remained at the measurement horizon.",
        evidence: [
          outcomeEvidence(
            "profile.lifecycle.population.extinctAtHorizon",
            profile.lifecycle.population.extinctAtHorizon,
            "EQ",
            true,
          ),
        ],
      });
    }
  }

  if (stalemateEligible && profile.stalemate.declared) {
    labels.push({
      id: "QUIET_STALEMATE",
      title: OUTCOME_LABEL_TITLES.QUIET_STALEMATE,
      factualSummary:
        "The locked trailing-window stalemate rule found low movement, fewer than three transitions, no structural social change, and no significant event.",
      evidence: [
        outcomeEvidence(
          "profile.window.observedTicks",
          profile.window.observedTicks,
          "EQ",
          SCENARIO_MEASUREMENT_HORIZONS.matrixTicks,
        ),
        outcomeEvidence(
          "profile.stalemate.observedWindowTicks",
          profile.stalemate.observedWindowTicks,
          "EQ",
          SCENARIO_MEASUREMENT_HORIZONS.stalemateWindowTicks,
        ),
        outcomeEvidence("profile.stalemate.declared", true, "EQ", true),
        outcomeEvidence(
          "profile.stalemate.movementFixedUnitsPerLivingCreatureTick",
          profile.stalemate.movementFixedUnitsPerLivingCreatureTick,
          "LTE",
          profile.stalemate.thresholds.maximumMovementFixedUnitsPerLivingCreatureTick,
        ),
        outcomeEvidence(
          "profile.stalemate.actionTransitions",
          profile.stalemate.actionTransitions,
          "LTE",
          profile.stalemate.thresholds.maximumActionTransitions,
        ),
        outcomeEvidence(
          "profile.stalemate.structuralSocialChanges",
          profile.stalemate.structuralSocialChanges,
          "EQ",
          0,
        ),
        outcomeEvidence(
          "profile.stalemate.significantEvents",
          profile.stalemate.significantEvents,
          "EQ",
          0,
        ),
      ],
    });
  }

  return {
    classifierVersion: OUTCOME_CLASSIFIER_VERSION,
    multiLabel: true,
    interpretation: "FACTUAL_NON_EXCLUSIVE_NO_WINNER",
    seed: profile.seed,
    labels,
    evaluatedLabelIds,
    notEvaluatedLabelIds,
  };
}

function labelIncidence(
  summaries: readonly RunOutcomeSummary[],
  labelOrder: readonly OutcomeLabelId[] = OUTCOME_LABEL_ORDER,
): OutcomeLabelIncidence[] {
  return labelOrder.map((labelId) => {
    const eligible = summaries.filter((summary) =>
      summary.evaluatedLabelIds.includes(labelId),
    );
    const occurrences = eligible.filter((summary) =>
      summary.labels.some((label) => label.id === labelId),
    ).length;
    return {
      labelId,
      title: OUTCOME_LABEL_TITLES[labelId],
      totalRuns: summaries.length,
      eligibleRuns: eligible.length,
      ...wilsonOutcome(occurrences, eligible.length),
    };
  });
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  const normalizedLeft = [...new Set(left)].sort((a, b) => a - b);
  const normalizedRight = [...new Set(right)].sort((a, b) => a - b);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function corpusValidation(
  profiles: readonly ActivityProfile[],
  context: ScenarioAnalysisContext,
): ScenarioExpectedBandReport["corpusValidation"] {
  const contract = CORPUS_CONTRACT[context.corpus];
  const observedSeeds = profiles.map((profile) => profile.seed).sort((a, b) => a - b);
  const seedsMatch =
    context.seeds.length === contract.seeds.length &&
    observedSeeds.length === contract.seeds.length &&
    sameNumbers(context.seeds, contract.seeds) &&
    sameNumbers(observedSeeds, contract.seeds);
  const horizonMatches =
    context.requestedTicks === contract.ticks &&
    profiles.every((profile) => profile.window.observedTicks === contract.ticks);
  return {
    status: !seedsMatch
      ? "CORPUS_MISMATCH"
      : !horizonMatches
        ? "HORIZON_MISMATCH"
        : "MATCHED_LOCKED_CORPUS",
    expectedSeeds: contract.seeds,
    observedSeeds,
    expectedTicks: contract.ticks,
    observedTicks: context.requestedTicks,
  };
}

function minimumPresent(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.min(...present);
}

function maximum(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function bandMetricValue(
  metricId: ScenarioBandMetricId,
  profiles: readonly ActivityProfile[],
): number | null {
  switch (metricId) {
    case "MINIMUM_RUN_OCCUPIED_TILE_P10":
      return minimumPresent(profiles.map((profile) => profile.spatial.occupiedTiles.p10));
    case "MINIMUM_RUN_OCCUPIED_TILE_MEDIAN":
      return minimumPresent(
        profiles.map((profile) => profile.spatial.occupiedTiles.median),
      );
    case "MAXIMUM_RUN_EXACT_OVERLAP_RATE":
      return maximum(profiles.map((profile) => profile.spatial.exactOverlap.rate));
    case "CORPUS_KEEP_SHARE": {
      const completedActions = profiles.reduce(
        (total, profile) => total + profile.actions.completedActions,
        0,
      );
      const keepActions = profiles.reduce(
        (total, profile) => total + action(profile, "KEEP").count,
        0,
      );
      return completedActions === 0 ? null : round(keepActions / completedActions);
    }
    case "MAXIMUM_RUN_KEEP_SHARE":
      return maximum(profiles.map((profile) => action(profile, "KEEP").share));
    case "OBSERVED_ACTION_FAMILY_COUNT":
      return new Set(
        profiles.flatMap((profile) =>
          profile.actions.byKind.filter((item) => item.count > 0).map((item) => item.kind),
        ),
      ).size;
    case "OBSERVED_DESIRE_FAMILY_COUNT":
      return new Set(
        profiles.flatMap((profile) =>
          profile.desires.byFamily
            .filter((item) => item.exposureCreatureTicks > 0)
            .map((item) => item.family),
        ),
      ).size;
  }
}

function evaluationSummaryStatus(
  evaluations: readonly { readonly status: EvaluationStatus }[],
): EvaluationSummaryStatus {
  if (evaluations.some((evaluation) => evaluation.status === "FAIL")) return "FAIL";
  if (evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED")) {
    return "NOT_EVALUATED";
  }
  if (evaluations.some((evaluation) => evaluation.status === "NOT_EVALUATED")) {
    return "PARTIAL";
  }
  return "PASS";
}

function compareBand(
  observed: number,
  comparison: "GTE" | "LT",
  threshold: number,
): boolean {
  return comparison === "GTE" ? observed >= threshold : observed < threshold;
}

function outcomeBandEligibility(
  validation: ScenarioExpectedBandReport["corpusValidation"],
  context: ScenarioAnalysisContext,
): ScenarioOutcomeBandReport["eligibility"] {
  if (validation.status !== "MATCHED_LOCKED_CORPUS") {
    return {
      status: "NOT_EVALUATED",
      reason:
        validation.status === "CORPUS_MISMATCH"
          ? "Outcome-incidence bands require the complete locked 64-seed corpus."
          : "Outcome-incidence bands require the locked 10,000-tick horizon.",
    };
  }
  if (context.corpus === "calibration") {
    return { status: "FULL_CALIBRATION", reason: null };
  }
  if (context.corpus === "holdout") {
    return { status: "FULL_HOLDOUT", reason: null };
  }
  if (context.corpus === "phase-4.2-calibration") {
    return phase42DefinitionsAreFrozenForContext(context)
      ? { status: "FULL_PHASE_4_2_CALIBRATION", reason: null }
      : {
          status: "PHASE_4_2_CALIBRATION_CANDIDATE",
          reason:
            "Phase 4.2 discovery calibration reports candidate distributions; classifier and bands are not frozen.",
        };
  }
  if (context.corpus === "phase-4.2-holdout") {
    return phase42DefinitionsAreFrozenForContext(context)
      ? { status: "FULL_PHASE_4_2_HOLDOUT", reason: null }
      : {
          status: "PHASE_4_2_NOT_FROZEN",
          reason:
            "Phase 4.2 outcome-incidence and dominance bands are not frozen; the reserved holdout remains sealed.",
        };
  }
  if (context.corpus === "phase-4.3-calibration") {
    return {
      status: "PHASE_4_3_CALIBRATION_CANDIDATE",
      reason:
        "Phase 4.3 calibration reports prospective lifecycle incidence; no lifecycle outcome bands are frozen.",
    };
  }
  if (context.corpus === "phase-4.3-holdout") {
    return {
      status: "PHASE_4_3_NOT_FROZEN",
      reason:
        "Phase 4.3 lifecycle bands are not frozen and the reserved holdout remains sealed.",
    };
  }
  return {
    status: "NOT_EVALUATED",
    reason:
      "Frozen outcome-incidence bands evaluate only the full calibration or full holdout corpus.",
  };
}

export function evaluateScenarioOutcomeBands(
  scenarioId: ScenarioId,
  profiles: readonly ActivityProfile[],
  context: ScenarioAnalysisContext,
): ScenarioOutcomeBandReport {
  const validation = corpusValidation(profiles, context);
  const eligibility = outcomeBandEligibility(validation, context);
  const eligible =
    eligibility.status === "FULL_CALIBRATION" ||
    eligibility.status === "FULL_HOLDOUT" ||
    eligibility.status === "FULL_PHASE_4_2_CALIBRATION" ||
    eligibility.status === "FULL_PHASE_4_2_HOLDOUT";
  const phase42Context =
    context.corpus === "phase-4.2-calibration" || context.corpus === "phase-4.2-holdout";
  const incidences = labelIncidence(
    profiles.map((profile) =>
      summarizeRunOutcome(profile, phase42ClassifierRulesForContext(context)),
    ),
    context.corpus === "phase-4.3-calibration" || context.corpus === "phase-4.3-holdout"
      ? OUTCOME_LABEL_ORDER
      : context.corpus === "phase-4.2-calibration" || context.corpus === "phase-4.2-holdout"
        ? PHASE_4_2_OUTCOME_LABEL_ORDER
        : PHASE_4_1_OUTCOME_LABEL_ORDER,
  );
  const definitions = (
    phase42Context
      ? (context.phase42Definitions?.incidenceBands ??
        PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS)
      : SCENARIO_OUTCOME_INCIDENCE_BANDS
  ).filter((definition) => definition.scenarioId === scenarioId);
  const evaluations = definitions.map((definition): ScenarioOutcomeBandEvaluation => {
    const incidence = incidences.find(
      (candidate) => candidate.labelId === definition.labelId,
    );
    const observed = incidence?.occurrences ?? null;
    const eligibleRuns = incidence?.eligibleRuns ?? 0;
    const reason = !eligible
      ? eligibility.reason
      : incidence === undefined
        ? "The required outcome label is absent from the classifier incidence table."
        : eligibleRuns !== definition.requiredEligibleRuns
          ? `The label must be eligible in all ${definition.requiredEligibleRuns.toString()} locked runs.`
          : null;
    const status = !eligible
      ? "NOT_EVALUATED"
      : reason !== null || observed === null
        ? "FAIL"
        : observed >= definition.threshold
          ? "PASS"
          : "FAIL";
    return {
      tableVersion: definition.tableVersion,
      labelId: definition.labelId,
      metricPath: definition.metricPath,
      status,
      observed,
      eligibleRuns,
      comparison: definition.comparison,
      threshold: definition.threshold,
      requiredEligibleRuns: definition.requiredEligibleRuns,
      reason:
        reason ??
        (status === "FAIL"
          ? "The label incidence is below its frozen calibration minimum."
          : null),
      provenance: definition.provenance,
    };
  });

  const dominanceLabelOrder = phase42Context
    ? PHASE_4_2_OUTCOME_LABEL_ORDER
    : PHASE_4_1_OUTCOME_LABEL_ORDER;
  const dominanceEvaluations = dominanceLabelOrder.map(
    (labelId): ScenarioOutcomeDominanceEvaluation => {
      const incidence = incidences.find((candidate) => candidate.labelId === labelId);
      const rationale =
        (phase42Context
          ? (context.phase42Definitions?.dominanceRationales ??
            PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES)
          : SCENARIO_OUTCOME_DOMINANCE_RATIONALES
        ).find(
          (candidate) =>
            candidate.scenarioId === scenarioId && candidate.labelId === labelId,
        ) ?? null;
      const value = incidence?.incidence ?? null;
      const rationaleRequired =
        value !== null && value > SCENARIO_OUTCOME_DOMINANCE_THRESHOLD;
      const incomplete =
        incidence === undefined ||
        incidence.eligibleRuns !== PHASE_4_1_CALIBRATION_SEED_COUNT;
      const status = !eligible
        ? "NOT_EVALUATED"
        : incomplete || (rationaleRequired && rationale === null)
          ? "FAIL"
          : "PASS";
      return {
        labelId,
        metricPath: `analysis.outcomes.incidence[${labelId}].incidence`,
        status,
        incidence: value,
        occurrences: incidence?.occurrences ?? 0,
        eligibleRuns: incidence?.eligibleRuns ?? 0,
        comparison: "GT",
        threshold: SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,
        rationaleRequired,
        rationale,
        reason: !eligible
          ? eligibility.reason
          : incomplete
            ? `Dominance review requires ${PHASE_4_1_CALIBRATION_SEED_COUNT.toString()} eligible runs for every label.`
            : rationaleRequired && rationale === null
              ? "Incidence exceeds 85% without a checked-in mechanics-and-scenario rationale."
              : null,
      };
    },
  );
  const rationaleFailures = dominanceEvaluations
    .filter(
      (evaluation) =>
        evaluation.status === "FAIL" &&
        evaluation.rationaleRequired &&
        evaluation.rationale === null,
    )
    .map((evaluation) => evaluation.labelId);

  return {
    tableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
    status: evaluationSummaryStatus([...evaluations, ...dominanceEvaluations]),
    eligibility,
    releaseClaim: false,
    provenance: phase42Context
      ? PHASE_4_2_CALIBRATION_PROVENANCE
      : PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
    evaluations,
    dominance: {
      status: evaluationSummaryStatus(dominanceEvaluations),
      threshold: SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,
      evaluations: dominanceEvaluations,
      rationaleFailures,
    },
  };
}

export function evaluateScenarioExpectedBands(
  scenarioId: ScenarioId,
  profiles: readonly ActivityProfile[],
  context: ScenarioAnalysisContext,
): ScenarioExpectedBandReport {
  const validation = corpusValidation(profiles, context);
  const definitions = SCENARIO_EXPECTED_BANDS.filter(
    (definition) => definition.scenarioId === scenarioId,
  );
  const evaluations = definitions.map((definition): ScenarioBandEvaluation => {
    const observed = bandMetricValue(definition.metricId, profiles);
    const validationReason =
      validation.status === "CORPUS_MISMATCH"
        ? "The observed seeds do not match the locked corpus."
        : validation.status === "HORIZON_MISMATCH"
          ? "The observed horizon does not match the locked corpus horizon."
          : null;
    const status =
      validationReason !== null || observed === null
        ? "NOT_EVALUATED"
        : compareBand(observed, definition.comparison, definition.threshold)
          ? "PASS"
          : "FAIL";
    return {
      metricId: definition.metricId,
      metricPath: definition.metricPath,
      status,
      observed,
      comparison: definition.comparison,
      threshold: definition.threshold,
      reason:
        validationReason ?? (observed === null ? "The metric has no observations." : null),
      bandType: definition.bandType,
      provenance: definition.provenance,
    };
  });
  const scenarioOutcomeBands = evaluateScenarioOutcomeBands(scenarioId, profiles, context);
  const safetyStatus = evaluationSummaryStatus(evaluations);
  const phase42Candidate =
    context.corpus === "phase-4.2-calibration" &&
    !phase42DefinitionsAreFrozenForContext(context);
  return {
    tableVersion: SCENARIO_EXPECTED_BAND_TABLE_VERSION,
    status: phase42Candidate && safetyStatus !== "FAIL" ? "PARTIAL" : safetyStatus,
    corpusValidation: validation,
    provenance: {
      releaseOutcomeClaim: false,
      calibrationEvidence:
        validation.status !== "MATCHED_LOCKED_CORPUS"
          ? "NOT_PRESENT"
          : context.corpus === "calibration"
            ? "FULL_CALIBRATION_PRESENT"
            : context.corpus === "phase-4.2-calibration"
              ? phase42DefinitionsAreFrozenForContext(context)
                ? "FULL_PHASE_4_2_CALIBRATION_PRESENT"
                : "PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT"
              : context.corpus === "phase-4.3-calibration"
                ? "PHASE_4_3_CANDIDATE_CALIBRATION_PRESENT"
                : context.corpus === "nightly"
                  ? "NIGHTLY_SUBSET_ONLY"
                  : context.corpus === "smoke"
                    ? "SMOKE_SUBSET_ONLY"
                    : "NOT_PRESENT",
      holdoutEvidence:
        validation.status !== "MATCHED_LOCKED_CORPUS"
          ? "NOT_PRESENT"
          : context.corpus === "holdout"
            ? "FULL_HOLDOUT_PRESENT"
            : context.corpus === "phase-4.2-holdout" &&
                phase42DefinitionsAreFrozenForContext(context)
              ? "FULL_PHASE_4_2_HOLDOUT_PRESENT"
              : "NOT_PRESENT",
    },
    evaluations,
    scenarioOutcomeBands,
  };
}

function hardEvaluation(
  id: string,
  metricPath: string,
  observed: number | null,
  comparison: "EQ" | "GTE" | "LT",
  threshold: number,
  eligible: boolean,
  ineligibleReason: string,
): HardInvariantEvaluation {
  const passed =
    observed !== null &&
    (comparison === "EQ"
      ? observed === threshold
      : comparison === "GTE"
        ? observed >= threshold
        : observed < threshold);
  return {
    id,
    classification: "LOCKED_CONTRACT_SAFETY_INVARIANT",
    status: !eligible || observed === null ? "NOT_EVALUATED" : passed ? "PASS" : "FAIL",
    metricPath,
    observed,
    comparison,
    threshold,
    reason: !eligible ? ineligibleReason : observed === null ? "Metric is absent." : null,
  };
}

function runHardInvariants(
  run: ScenarioAnalysisRun,
  horizonEligible: boolean,
): RunHardInvariantReport {
  const profile = run.profile;
  const reason = "The run does not use the locked corpus horizon.";
  const keepShare = action(profile, "KEEP").share;
  const evaluations = [
    hardEvaluation(
      "PROFILE_SCENARIO_IDENTITY_MATCH",
      "run.profile.scenario",
      sameScenarioReference(profile.scenario, run.scenario) ? 1 : 0,
      "EQ",
      1,
      true,
      reason,
    ),
    hardEvaluation(
      "PROFILE_COMPILED_MAP_HASH_MATCH",
      "run.profile.compiledMapHash",
      profile.compiledMapHash === run.compiledMapHash ? 1 : 0,
      "EQ",
      1,
      true,
      reason,
    ),
    hardEvaluation(
      "CRITICAL_RESOURCE_REACHABILITY",
      "profile.horizon.resources.unreachableCreatureResourceKinds",
      profile.horizon.resources.unreachableCreatureResourceKinds,
      "EQ",
      0,
      true,
      reason,
    ),
    hardEvaluation(
      "LIFECYCLE_INVARIANTS_PASSED",
      "profile.lifecycle.invariants.passed",
      profile.lifecycle.invariants.passed ? 1 : 0,
      "EQ",
      1,
      true,
      reason,
    ),
    hardEvaluation(
      "LIVING_POPULATION_CAP_BREACHES",
      "profile.lifecycle.invariants.populationCapBreaches",
      profile.lifecycle.invariants.populationCapBreaches,
      "EQ",
      0,
      true,
      reason,
    ),
    hardEvaluation(
      "LIFECYCLE_METRIC_EVENT_MISMATCHES",
      "profile.lifecycle.invariants.metricEventMismatches.length",
      profile.lifecycle.invariants.metricEventMismatches.length,
      "EQ",
      0,
      true,
      reason,
    ),
    hardEvaluation(
      "OCCUPIED_TILE_P10",
      "profile.spatial.occupiedTiles.p10",
      profile.spatial.occupiedTiles.p10,
      "GTE",
      3,
      horizonEligible,
      reason,
    ),
    hardEvaluation(
      "OCCUPIED_TILE_MEDIAN",
      "profile.spatial.occupiedTiles.median",
      profile.spatial.occupiedTiles.median,
      "GTE",
      4,
      horizonEligible,
      reason,
    ),
    hardEvaluation(
      "EXACT_OVERLAP_RATE",
      "profile.spatial.exactOverlap.rate",
      profile.spatial.exactOverlap.rate,
      "LT",
      0.01,
      horizonEligible,
      reason,
    ),
    hardEvaluation(
      "PER_SEED_KEEP_SHARE",
      "profile.actions.byKind[KEEP].share",
      keepShare,
      "LT",
      0.5,
      horizonEligible,
      reason,
    ),
  ];
  return {
    seed: run.scenario.seed,
    status: evaluationSummaryStatus(evaluations),
    evaluations,
  };
}

function corpusHardInvariants(
  bandReport: ScenarioExpectedBandReport,
): HardInvariantEvaluation[] {
  return bandReport.evaluations.map((evaluation) => ({
    id: evaluation.metricId,
    classification: "LOCKED_CONTRACT_SAFETY_INVARIANT",
    status: evaluation.status,
    metricPath: evaluation.metricPath,
    observed: evaluation.observed,
    comparison: evaluation.comparison,
    threshold: evaluation.threshold,
    reason: evaluation.reason,
  }));
}

export function analyzeScenarioRuns(
  runs: readonly ScenarioAnalysisRun[],
  context: ScenarioAnalysisContext,
): ScenarioAnalysisReport {
  const identity = summarizeScenarioIdentity(runs);
  const scenarioId = runs[0]?.scenario.scenarioId;
  if (scenarioId === undefined)
    throw new Error("Scenario analysis requires at least one run.");
  const profiles = runs.map((run) => run.profile);
  const validation = corpusValidation(profiles, context);
  const outcomes = profiles.map((profile) =>
    summarizeRunOutcome(profile, phase42ClassifierRulesForContext(context)),
  );
  const incidenceLabelOrder =
    context.corpus === "phase-4.3-calibration" || context.corpus === "phase-4.3-holdout"
      ? OUTCOME_LABEL_ORDER
      : PHASE_4_2_OUTCOME_LABEL_ORDER;
  const expectedBands = evaluateScenarioExpectedBands(scenarioId, profiles, context);
  const horizonEligible = validation.status === "MATCHED_LOCKED_CORPUS";
  const perRunHardInvariants = runs.map((run) => runHardInvariants(run, horizonEligible));
  const corpus = corpusHardInvariants(expectedBands);
  return {
    schemaVersion: SCENARIO_ANALYSIS_SCHEMA_VERSION,
    ...identity,
    outcomes: {
      perRun: outcomes,
      incidence: labelIncidence(outcomes, incidenceLabelOrder),
    },
    hardInvariants: {
      status: evaluationSummaryStatus([
        ...perRunHardInvariants.flatMap((report) => report.evaluations),
        ...corpus,
      ]),
      perRun: perRunHardInvariants,
      corpus,
    },
    expectedBands,
  };
}

interface MacroMetricDefinition {
  readonly id: MacroMetricId;
  readonly dimension: MacroDimension;
  readonly metricPath: string;
  readonly missingValuePolicy?: "ZERO_IS_OBSERVED" | "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING";
  readonly read: (profile: ActivityProfile) => number | null;
}

const MACRO_METRICS: readonly MacroMetricDefinition[] = [
  {
    id: "GROUP_COUNT",
    dimension: "SOCIAL",
    metricPath: "profile.groups.horizon.groupCount",
    read: (profile) => profile.groups.horizon.groupCount,
  },
  {
    id: "RELATIONSHIP_COMPONENT_COUNT",
    dimension: "SOCIAL",
    metricPath: "profile.relationships.componentCount",
    read: (profile) => profile.relationships.componentCount,
  },
  {
    id: "COMPLETED_STORAGE_COUNT",
    dimension: "STORAGE",
    metricPath: "profile.horizon.storage.completedStorageCount",
    read: (profile) => profile.horizon.storage.completedStorageCount,
  },
  {
    id: "STORED_RESOURCE_UNITS",
    dimension: "STORAGE",
    metricPath: "profile.horizon.storage.food+profile.horizon.storage.material",
    read: (profile) => profile.horizon.storage.food + profile.horizon.storage.material,
  },
  {
    id: "ATTACK_EVENT_COUNT",
    dimension: "CONFLICT",
    metricPath: "profile.interactions.byType[CREATURE_ATTACKED].count",
    read: (profile) => interactionCount(profile, "CREATURE_ATTACKED"),
  },
  {
    id: "CREATURE_PAIR_DISTANCE_MEDIAN",
    dimension: "SPATIAL",
    metricPath: "profile.spatial.dispersion.creaturePairDistanceTiles.median",
    read: (profile) => profile.spatial.dispersion.creaturePairDistanceTiles.median,
  },
  {
    id: "ROUTE_HERFINDAHL_INDEX",
    dimension: "SPATIAL",
    metricPath: "profile.spatial.routes.herfindahlIndex",
    read: (profile) => profile.spatial.routes.herfindahlIndex,
  },
  {
    id: "SEVERE_THIRST_EXPOSURE_RATE",
    dimension: "HYDRATION",
    metricPath: "profile.hydration.need.severeExposureRate",
    read: (profile) => profile.hydration.need.severeExposureRate,
  },
  {
    id: "DEPLETED_WATER_SOURCE_TICKS",
    dimension: "HYDRATION",
    metricPath: "profile.hydration.sources.depletedSourceTicks",
    read: (profile) => profile.hydration.sources.depletedSourceTicks,
  },
  {
    id: "WATER_SHARED_UNITS",
    dimension: "HYDRATION",
    metricPath: "profile.hydration.flow.sharedUnits",
    read: (profile) => profile.hydration.flow.sharedUnits,
  },
  {
    id: "WATER_ROUTE_HERFINDAHL_INDEX",
    dimension: "HYDRATION",
    metricPath: "profile.hydration.routes.herfindahlIndex",
    read: (profile) => profile.hydration.routes.herfindahlIndex,
  },
  {
    id: "ACTIVE_SHELTER_COUNT",
    dimension: "SETTLEMENT",
    metricPath: "profile.settlement.horizon.activeShelterCount",
    read: (profile) => profile.settlement.horizon.activeShelterCount,
  },
  {
    id: "SHELTERED_REST_SHARE",
    dimension: "SETTLEMENT",
    metricPath: "profile.settlement.rest.shelteredRestShare",
    read: (profile) => profile.settlement.rest.shelteredRestShare,
  },
  {
    id: "MEAN_SHELTER_CONDITION",
    dimension: "SETTLEMENT",
    metricPath: "profile.settlement.condition.meanCondition",
    missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
    read: (profile) =>
      profile.settlement.condition.activeShelterTicks === 0
        ? null
        : profile.settlement.condition.meanCondition,
  },
  {
    id: "SHELTER_GUEST_USE_EVENTS",
    dimension: "SETTLEMENT",
    metricPath: "profile.settlement.rest.guestUseEvents",
    read: (profile) => profile.settlement.rest.guestUseEvents,
  },
  {
    id: "SETTLEMENT_RELOCATION_COUNT",
    dimension: "SETTLEMENT",
    metricPath: "profile.settlement.relocation.relocations",
    read: (profile) => profile.settlement.relocation.relocations,
  },
];

function pairedMetricSummary(
  definition: MacroMetricDefinition,
  leftBySeed: ReadonlyMap<number, ScenarioAnalysisRun>,
  rightBySeed: ReadonlyMap<number, ScenarioAnalysisRun>,
  pairedSeeds: readonly number[],
): PairedMetricSummary {
  const pairs: PairedMetricDelta[] = [];
  for (const seed of pairedSeeds) {
    const left = leftBySeed.get(seed);
    const right = rightBySeed.get(seed);
    if (!left || !right) continue;
    const leftValue = definition.read(left.profile);
    const rightValue = definition.read(right.profile);
    if (leftValue === null || rightValue === null) continue;
    pairs.push({ seed, leftValue, rightValue, delta: round(rightValue - leftValue) });
  }
  const deltas = pairs.map((pair) => pair.delta);
  const average = mean(deltas);
  const standardDeviation = sampleStandardDeviation(deltas);
  return {
    metricId: definition.id,
    dimension: definition.dimension,
    metricPath: definition.metricPath,
    missingValuePolicy: definition.missingValuePolicy ?? "ZERO_IS_OBSERVED",
    deltaDirection: "RIGHT_MINUS_LEFT",
    pairs,
    summary: {
      pairedSeedCount: pairs.length,
      meanDelta: average,
      medianDelta: median(deltas),
      meanAbsoluteDelta: mean(deltas.map((delta) => Math.abs(delta))),
      sampleStandardDeviationDelta: standardDeviation,
      positiveDeltas: deltas.filter((delta) => delta > 0).length,
      zeroDeltas: deltas.filter((delta) => delta === 0).length,
      negativeDeltas: deltas.filter((delta) => delta < 0).length,
    },
    effect: {
      method: "PAIRED_STANDARDIZED_MEAN_DELTA_COHEN_DZ",
      value:
        average === null || standardDeviation === null || standardDeviation === 0
          ? null
          : round(average / standardDeviation),
      interpretation: "DESCRIPTIVE_NON_CAUSAL",
    },
  };
}

export function pairedScenarioComparisons(
  runs: readonly ScenarioAnalysisRun[],
): PairedScenarioComparison[] {
  const byScenario = new Map<ScenarioId, Map<number, ScenarioAnalysisRun>>();
  for (const metadata of SCENARIO_CATALOG) byScenario.set(metadata.scenarioId, new Map());
  for (const run of runs)
    byScenario.get(run.scenario.scenarioId)?.set(run.scenario.seed, run);

  const comparisons: PairedScenarioComparison[] = [];
  for (let leftIndex = 0; leftIndex < SCENARIO_CATALOG.length; leftIndex += 1) {
    const leftScenario = SCENARIO_CATALOG[leftIndex];
    if (!leftScenario) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < SCENARIO_CATALOG.length;
      rightIndex += 1
    ) {
      const rightScenario = SCENARIO_CATALOG[rightIndex];
      if (!rightScenario) continue;
      const leftBySeed = byScenario.get(leftScenario.scenarioId) ?? new Map();
      const rightBySeed = byScenario.get(rightScenario.scenarioId) ?? new Map();
      const pairedSeeds = [...leftBySeed.keys()]
        .filter((seed) => rightBySeed.has(seed))
        .sort((left, right) => left - right);
      comparisons.push({
        leftScenarioId: leftScenario.scenarioId,
        rightScenarioId: rightScenario.scenarioId,
        comparisonKind: "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL",
        pairedSeeds,
        metrics: MACRO_METRICS.map((definition) =>
          pairedMetricSummary(definition, leftBySeed, rightBySeed, pairedSeeds),
        ),
      });
    }
  }
  return comparisons;
}

function sameNumbersWithCardinality(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length && sameNumbers(left, right);
}

export function evaluatePairedSeedEligibility(
  definition: Pick<
    PairedMacroBandDefinition,
    "eligiblePairPolicy" | "missingValuePolicy" | "requiredPairedSeeds"
  >,
  observedSeeds: readonly number[],
  expectedSeeds: readonly number[],
): { readonly eligible: boolean; readonly reason: string | null } {
  const uniqueObservedSeeds = [...new Set(observedSeeds)];
  const expectedSeedSet = new Set(expectedSeeds);
  if (
    uniqueObservedSeeds.length !== observedSeeds.length ||
    uniqueObservedSeeds.some((seed) => !expectedSeedSet.has(seed))
  ) {
    return {
      eligible: false,
      reason: "Eligible paired seeds must be unique members of the locked corpus.",
    };
  }

  if (definition.eligiblePairPolicy === "ALL_LOCKED_SEEDS") {
    if (
      definition.missingValuePolicy !== "ZERO_IS_OBSERVED" ||
      definition.requiredPairedSeeds !== expectedSeeds.length
    ) {
      return {
        eligible: false,
        reason:
          "An all-seed band must declare ZERO_IS_OBSERVED and require the complete locked corpus.",
      };
    }
    return sameNumbersWithCardinality(observedSeeds, expectedSeeds)
      ? { eligible: true, reason: null }
      : {
          eligible: false,
          reason: `The metric must contain all ${expectedSeeds.length.toString()} locked paired seeds exactly once.`,
        };
  }

  const thresholdValid =
    Number.isInteger(definition.requiredPairedSeeds) &&
    definition.requiredPairedSeeds >= 1 &&
    definition.requiredPairedSeeds <= expectedSeeds.length;
  if (
    definition.missingValuePolicy !== "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING" ||
    !thresholdValid
  ) {
    return {
      eligible: false,
      reason:
        "A missing-value exclusion band must freeze an eligible-pair threshold within the locked corpus size.",
    };
  }
  return observedSeeds.length >= definition.requiredPairedSeeds
    ? { eligible: true, reason: null }
    : {
        eligible: false,
        reason: `The metric has ${observedSeeds.length.toString()} eligible paired seeds; the frozen minimum is ${definition.requiredPairedSeeds.toString()}.`,
      };
}

function validateFrozenPairedMacroCorpus(
  runs: readonly ScenarioAnalysisRun[],
  context: ScenarioAnalysisContext,
): FrozenPairedMacroBandReport["corpusValidation"] {
  const contract = CORPUS_CONTRACT[context.corpus];
  const observedSeedsByScenario = Object.fromEntries(
    SCENARIO_CATALOG.map((scenario) => [
      scenario.scenarioId,
      runs
        .filter((run) => run.scenario.scenarioId === scenario.scenarioId)
        .map((run) => run.scenario.seed)
        .sort((left, right) => left - right),
    ]),
  ) as unknown as Record<ScenarioId, readonly number[]>;
  const base = {
    expectedSeeds: contract.seeds,
    observedSeedsByScenario,
    expectedTicks: contract.ticks,
    observedTicks: context.requestedTicks,
  };
  const supportedCorpus =
    context.corpus === "calibration" ||
    context.corpus === "holdout" ||
    context.corpus === "phase-4.2-calibration" ||
    context.corpus === "phase-4.2-holdout";
  if (!supportedCorpus) {
    return {
      ...base,
      status: "NOT_FULL_CALIBRATION_OR_HOLDOUT",
      reason:
        "Frozen paired macro bands evaluate only the full calibration or full holdout corpus.",
    };
  }
  const seedsMatch =
    sameNumbersWithCardinality(context.seeds, contract.seeds) &&
    SCENARIO_CATALOG.every((scenario) =>
      sameNumbersWithCardinality(
        observedSeedsByScenario[scenario.scenarioId],
        contract.seeds,
      ),
    );
  if (!seedsMatch) {
    return {
      ...base,
      status: "CORPUS_MISMATCH",
      reason:
        "Every catalog scenario must contain each locked seed exactly once before paired bands are evaluated.",
    };
  }
  const horizonMatches =
    context.requestedTicks === contract.ticks &&
    runs.every((run) => run.profile.window.observedTicks === contract.ticks);
  if (!horizonMatches) {
    return {
      ...base,
      status: "HORIZON_MISMATCH",
      reason: "Every paired run must use the locked 10,000-tick horizon.",
    };
  }
  if (context.corpus === "phase-4.2-calibration") {
    return phase42DefinitionsAreFrozenForContext(context)
      ? {
          ...base,
          status: "FULL_PHASE_4_2_CALIBRATION",
          reason: null,
        }
      : {
          ...base,
          status: "PHASE_4_2_CALIBRATION_CANDIDATE",
          reason:
            "Phase 4.2 discovery calibration reports candidate settlement effects; macro bands are not frozen.",
        };
  }
  if (context.corpus === "phase-4.2-holdout") {
    return phase42DefinitionsAreFrozenForContext(context)
      ? { ...base, status: "FULL_PHASE_4_2_HOLDOUT", reason: null }
      : {
          ...base,
          status: "PHASE_4_2_NOT_FROZEN",
          reason:
            "Phase 4.2 settlement macro bands are not frozen; the reserved holdout remains sealed.",
        };
  }
  return {
    ...base,
    status: context.corpus === "calibration" ? "FULL_CALIBRATION" : "FULL_HOLDOUT",
    reason: null,
  };
}

export function evaluateFrozenPairedMacroBands(
  runs: readonly ScenarioAnalysisRun[],
  comparisons: readonly PairedScenarioComparison[],
  context: ScenarioAnalysisContext,
): FrozenPairedMacroBandReport {
  const corpusValidation = validateFrozenPairedMacroCorpus(runs, context);
  const corpusEligible =
    corpusValidation.status === "FULL_CALIBRATION" ||
    corpusValidation.status === "FULL_HOLDOUT" ||
    corpusValidation.status === "FULL_PHASE_4_2_CALIBRATION" ||
    corpusValidation.status === "FULL_PHASE_4_2_HOLDOUT";
  const phase42Context =
    context.corpus === "phase-4.2-calibration" || context.corpus === "phase-4.2-holdout";
  const expectedSeeds = corpusValidation.expectedSeeds;
  const definitions = phase42Context
    ? [
        ...PAIRED_MACRO_BANDS,
        ...(context.phase42Definitions?.pairedMacroBands ?? PHASE_4_2_PAIRED_MACRO_BANDS),
      ]
    : PAIRED_MACRO_BANDS;
  const evaluations = definitions.map((definition): FrozenPairedMacroBandEvaluation => {
    const comparison = comparisons.find(
      (candidate) =>
        candidate.leftScenarioId === definition.leftScenarioId &&
        candidate.rightScenarioId === definition.rightScenarioId,
    );
    const metric = comparison?.metrics.find(
      (candidate) => candidate.metricId === definition.metricId,
    );
    const pairedSeeds = metric?.pairs.map((pair) => pair.seed) ?? [];
    const pairedSeedCount = metric?.summary.pairedSeedCount ?? 0;
    const meanDelta = metric?.summary.meanDelta ?? null;
    const cohenDz = metric?.effect.value ?? null;
    const absoluteMeanDelta = meanDelta === null ? null : Math.abs(meanDelta);
    const absoluteCohenDz = cohenDz === null ? null : Math.abs(cohenDz);
    const pairEligibility = evaluatePairedSeedEligibility(
      definition,
      pairedSeeds,
      expectedSeeds,
    );
    const pairedSeedCountMatches = pairedSeedCount === pairedSeeds.length;
    const missingValuePolicyMatches =
      metric?.missingValuePolicy === definition.missingValuePolicy;
    const evidencePresent =
      comparison !== undefined &&
      metric !== undefined &&
      pairedSeedCountMatches &&
      missingValuePolicyMatches &&
      pairEligibility.eligible &&
      absoluteMeanDelta !== null &&
      absoluteCohenDz !== null;
    const passed =
      evidencePresent &&
      absoluteMeanDelta >= definition.minimumAbsoluteMeanDelta &&
      absoluteCohenDz >= definition.minimumAbsoluteCohenDz;
    const status = !corpusEligible
      ? "NOT_EVALUATED"
      : evidencePresent
        ? passed
          ? "PASS"
          : "FAIL"
        : "FAIL";
    const reason = !corpusEligible
      ? corpusValidation.reason
      : comparison === undefined
        ? "The frozen scenario pair is absent."
        : metric === undefined
          ? "The frozen paired metric is absent."
          : !pairedSeedCountMatches
            ? "The reported paired-seed count does not match the retained eligible pairs."
            : !missingValuePolicyMatches
              ? "The observed metric does not use the frozen missing-value policy."
              : !pairEligibility.eligible
                ? pairEligibility.reason
                : absoluteMeanDelta === null || absoluteCohenDz === null
                  ? "Both paired mean delta and Cohen dz must be present."
                  : !passed
                    ? "The paired materiality magnitude is below one or both frozen thresholds."
                    : null;
    return {
      tableVersion: definition.tableVersion,
      dimension: definition.dimension,
      leftScenarioId: definition.leftScenarioId,
      rightScenarioId: definition.rightScenarioId,
      metricId: definition.metricId,
      metricPath: definition.metricPath,
      status,
      pairedSeedCount,
      requiredPairedSeeds: definition.requiredPairedSeeds,
      missingValuePolicy: definition.missingValuePolicy,
      eligiblePairPolicy: definition.eligiblePairPolicy,
      meanDelta,
      absoluteMeanDelta,
      minimumAbsoluteMeanDelta: definition.minimumAbsoluteMeanDelta,
      cohenDz,
      absoluteCohenDz,
      minimumAbsoluteCohenDz: definition.minimumAbsoluteCohenDz,
      reason,
      provenance: definition.provenance,
    };
  });
  const passingDimensions = [
    ...new Set(
      evaluations
        .filter(
          (evaluation) =>
            evaluation.status === "PASS" && evaluation.dimension !== "SETTLEMENT",
        )
        .map((evaluation) => evaluation.dimension),
    ),
  ];
  const dimensionStatus = !corpusEligible
    ? "NOT_EVALUATED"
    : passingDimensions.length >= REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS
      ? "PASS"
      : "FAIL";
  const passingSettlementBands = evaluations.filter(
    (evaluation) => evaluation.status === "PASS" && evaluation.dimension === "SETTLEMENT",
  ).length;
  const settlementStatus =
    !phase42Context || !corpusEligible
      ? "NOT_EVALUATED"
      : passingSettlementBands >= REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS
        ? "PASS"
        : "FAIL";
  const overallStatus = phase42Context
    ? !corpusEligible
      ? "NOT_EVALUATED"
      : dimensionStatus === "PASS" && settlementStatus === "PASS"
        ? "PASS"
        : "FAIL"
    : dimensionStatus;

  return {
    tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
    status: overallStatus,
    bandEvaluationStatus: evaluationSummaryStatus(evaluations),
    releaseClaim: false,
    provenance: phase42Context
      ? PHASE_4_2_CALIBRATION_PROVENANCE
      : PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
    corpusValidation,
    evaluations,
    dimensionRequirement: {
      status: dimensionStatus,
      metricPath: "evaluations[status=PASS].dimension|distinctCount",
      observed: corpusEligible ? passingDimensions.length : null,
      comparison: "GTE",
      threshold: REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS,
      passingDimensions,
      reason: !corpusEligible
        ? corpusValidation.reason
        : dimensionStatus === "FAIL"
          ? "Fewer than three distinct original Phase 3 macro dimensions pass their frozen materiality bands."
          : null,
    },
    settlementRequirement: {
      status: settlementStatus,
      metricPath: "evaluations[dimension=SETTLEMENT,status=PASS]|count",
      observed: phase42Context && corpusEligible ? passingSettlementBands : null,
      comparison: "GTE",
      threshold: REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS,
      reason: !phase42Context
        ? "The historical Phase 4.1 macro table has no settlement gate."
        : !corpusEligible
          ? corpusValidation.reason
          : settlementStatus === "FAIL"
            ? "No frozen SETTLEMENT materiality band passed."
            : null,
    },
  };
}

export function convergenceDiagnostics(
  comparisons: readonly PairedScenarioComparison[],
): ConvergenceDiagnostic[] {
  const dimensions: readonly MacroDimension[] = [
    "SOCIAL",
    "STORAGE",
    "CONFLICT",
    "SPATIAL",
    "HYDRATION",
    "SETTLEMENT",
  ];
  return comparisons.flatMap((comparison) =>
    dimensions.map((dimension): ConvergenceDiagnostic => {
      const metrics = comparison.metrics.filter((metric) => metric.dimension === dimension);
      const pairs = metrics.flatMap((metric) => metric.pairs);
      const exactPairs = pairs.filter((pair) => pair.delta === 0).length;
      const exactlyEqualMetricIds = metrics
        .filter(
          (metric) =>
            metric.pairs.length > 0 && metric.pairs.every((pair) => pair.delta === 0),
        )
        .map((metric) => metric.metricId)
        .sort(compareText);
      return {
        leftScenarioId: comparison.leftScenarioId,
        rightScenarioId: comparison.rightScenarioId,
        dimension,
        status:
          pairs.length === 0
            ? "NOT_EVALUATED"
            : exactPairs === pairs.length
              ? "EXACT_CONVERGENCE"
              : "DIFFERENCE_OBSERVED",
        method: "EXACT_PAIRED_VALUE_EQUALITY",
        comparedMetricCount: metrics.length,
        pairedValueCount: pairs.length,
        exactPairRate: pairs.length === 0 ? null : round(exactPairs / pairs.length),
        exactlyEqualMetricIds,
        interpretation: "DESCRIPTIVE_NON_CAUSAL_DIAGNOSTIC",
      };
    }),
  );
}

/**
 * Release-evidence fingerprint input for the behavior implemented in this
 * module. Function sources are included deliberately: Phase 4.2 evaluates the
 * complete classifier-v3 label surface and inherited paired metrics, so a
 * same-version predicate or metric-reader edit must invalidate reviewed v2
 * evidence instead of silently reusing it for the holdout.
 *
 * This object contains no artifact paths, review hashes, or mutable process
 * status. Those are bound separately by the corpus policy.
 */
export function phase42AnalysisSemanticContract() {
  return {
    scenarioAnalysisSchemaVersion: 4,
    outcomeClassifierVersion: 3,
    outcomeLabelOrder: [...PHASE_4_2_OUTCOME_LABEL_ORDER],
    outcomeLabelTitles: Object.fromEntries(
      PHASE_4_2_OUTCOME_LABEL_ORDER.map((labelId) => [
        labelId,
        OUTCOME_LABEL_TITLES[labelId],
      ]),
    ),
    historicalClassifier2LabelOrder: [...PHASE_4_1_OUTCOME_LABEL_ORDER],
    evaluationWindows: {
      anyObservedTickEnablesOrdinaryLabels: true,
      matrixTicks: SCENARIO_MEASUREMENT_HORIZONS.matrixTicks,
      stalemateWindowTicks: SCENARIO_MEASUREMENT_HORIZONS.stalemateWindowTicks,
    },
    phase42CorpusContracts: {
      calibration: {
        seeds: [...CORPUS_CONTRACT["phase-4.2-calibration"].seeds],
        ticks: CORPUS_CONTRACT["phase-4.2-calibration"].ticks,
      },
      holdout: {
        seeds: [...CORPUS_CONTRACT["phase-4.2-holdout"].seeds],
        ticks: CORPUS_CONTRACT["phase-4.2-holdout"].ticks,
      },
    },
    phase42ClassifierRuleKeys: Object.keys(PHASE_4_2_CLASSIFIER_RULES).sort(),
    classifierImplementation: {
      summarizeRunOutcome: summarizeRunOutcome.toString(),
      phase42ClassifierRulesForContext: phase42ClassifierRulesForContext.toString(),
      outcomeEvidence: outcomeEvidence.toString(),
      action: action.toString(),
      interactionCount: interactionCount.toString(),
      labelIncidence: labelIncidence.toString(),
      wilsonOutcome: wilsonOutcome.toString(),
      evaluateScenarioOutcomeBands: evaluateScenarioOutcomeBands.toString(),
      corpusValidation: corpusValidation.toString(),
      outcomeBandEligibility: outcomeBandEligibility.toString(),
      phase42DefinitionsAreFrozenForContext:
        phase42DefinitionsAreFrozenForContext.toString(),
      compareBand: compareBand.toString(),
      sameNumbers: sameNumbers.toString(),
      evaluationSummaryStatus: evaluationSummaryStatus.toString(),
    },
    safetyAndInvariantImplementation: {
      minimumPresent: minimumPresent.toString(),
      maximum: maximum.toString(),
      sameScenarioReference: sameScenarioReference.toString(),
      bandMetricValue: bandMetricValue.toString(),
      evaluateScenarioExpectedBands: evaluateScenarioExpectedBands.toString(),
      hardEvaluation: hardEvaluation.toString(),
      runHardInvariants: runHardInvariants.toString(),
      corpusHardInvariants: corpusHardInvariants.toString(),
      analyzeScenarioRuns: analyzeScenarioRuns.toString(),
    },
    pairedMetricRegistry: MACRO_METRICS.map((definition) => ({
      id: definition.id,
      dimension: definition.dimension,
      metricPath: definition.metricPath,
      missingValuePolicy: definition.missingValuePolicy ?? "ZERO_IS_OBSERVED",
      readImplementation: definition.read.toString(),
    })),
    pairedMetricImplementation: {
      pairedMetricSummary: pairedMetricSummary.toString(),
      pairedScenarioComparisons: pairedScenarioComparisons.toString(),
      evaluatePairedSeedEligibility: evaluatePairedSeedEligibility.toString(),
      validateFrozenPairedMacroCorpus: validateFrozenPairedMacroCorpus.toString(),
      evaluateFrozenPairedMacroBands: evaluateFrozenPairedMacroBands.toString(),
      sameNumbersWithCardinality: sameNumbersWithCardinality.toString(),
      round: round.toString(),
      mean: mean.toString(),
      median: median.toString(),
      sampleStandardDeviation: sampleStandardDeviation.toString(),
    },
  };
}

/** Prospective Phase 4.3 classifier-v4 contract. It contains no reviewed evidence. */
export function phase43AnalysisSemanticContract() {
  return {
    scenarioAnalysisSchemaVersion: SCENARIO_ANALYSIS_SCHEMA_VERSION,
    outcomeClassifierVersion: OUTCOME_CLASSIFIER_VERSION,
    outcomeLabelOrder: [...OUTCOME_LABEL_ORDER],
    outcomeLabelTitles: { ...OUTCOME_LABEL_TITLES },
    inheritedClassifier3LabelOrder: [...PHASE_4_2_OUTCOME_LABEL_ORDER],
    lifecycleClassifierRules: { ...PHASE_4_3_CLASSIFIER_RULES },
    phase43CorpusContracts: {
      calibration: {
        seeds: [...CORPUS_CONTRACT["phase-4.3-calibration"].seeds],
        ticks: CORPUS_CONTRACT["phase-4.3-calibration"].ticks,
      },
      holdout: {
        seeds: [...CORPUS_CONTRACT["phase-4.3-holdout"].seeds],
        ticks: CORPUS_CONTRACT["phase-4.3-holdout"].ticks,
      },
    },
    interpretation: "FACTUAL_NON_EXCLUSIVE_NO_WINNER",
    releaseClaim: false,
    classifierImplementation: {
      summarizeRunOutcome: summarizeRunOutcome.toString(),
      outcomeEvidence: outcomeEvidence.toString(),
      labelIncidence: labelIncidence.toString(),
      wilsonOutcome: wilsonOutcome.toString(),
    },
    lifecycleInvariantImplementation: {
      hardEvaluation: hardEvaluation.toString(),
      runHardInvariants: runHardInvariants.toString(),
      analyzeScenarioRuns: analyzeScenarioRuns.toString(),
    },
  };
}
