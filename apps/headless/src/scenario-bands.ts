import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

import {
  PHASE_4_2_BAND_FREEZE_STATUS,
  PHASE_4_2_CALIBRATION_STATUS,
  PHASE_4_2_HOLDOUT_POLICY,
  PHASE_4_2_MATRIX_TICKS,
  type PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
  type Phase42HoldoutPolicy,
} from "./phase-4.2-corpora.js";

export const PHASE_4_1_CALIBRATION_ARTIFACT =
  "docs/baselines/phase-4.1-calibration-v1.json.gz" as const;
export const PHASE_4_1_CALIBRATION_SHA256 =
  "18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828" as const;
export const PHASE_4_1_CALIBRATION_SEED_COUNT = 64 as const;
export const PHASE_4_1_MATRIX_TICKS = 10_000 as const;

export const SCENARIO_EXPECTED_BAND_TABLE_VERSION = 2 as const;

export type ScenarioBandMetricId =
  | "MINIMUM_RUN_OCCUPIED_TILE_P10"
  | "MINIMUM_RUN_OCCUPIED_TILE_MEDIAN"
  | "MAXIMUM_RUN_EXACT_OVERLAP_RATE"
  | "CORPUS_KEEP_SHARE"
  | "MAXIMUM_RUN_KEEP_SHARE"
  | "OBSERVED_ACTION_FAMILY_COUNT"
  | "OBSERVED_DESIRE_FAMILY_COUNT";

export interface ScenarioExpectedBandDefinition {
  readonly tableVersion: typeof SCENARIO_EXPECTED_BAND_TABLE_VERSION;
  readonly scenarioId: ScenarioId;
  readonly metricId: ScenarioBandMetricId;
  readonly metricPath: string;
  readonly comparison: "GTE" | "LT";
  readonly threshold: number;
  readonly bandType: "CONTRACT_SAFETY_FLOOR";
  readonly provenance: {
    readonly source: "docs/phase-3-execution-plan.md#range-policy";
    readonly basis: "LOCKED_PHASE_3_CONTRACT";
    readonly calibrationEvidence: "LOCKED_PHASE_4_1_CALIBRATION";
    readonly calibrationArtifact: typeof PHASE_4_1_CALIBRATION_ARTIFACT;
    readonly calibrationArtifactSha256: typeof PHASE_4_1_CALIBRATION_SHA256;
    readonly holdoutEvidence: "PENDING_FULL_64_SEED_CORPUS";
    readonly releaseClaim: false;
  };
}

const SHARED_CONTRACT_BANDS: readonly Omit<
  ScenarioExpectedBandDefinition,
  "tableVersion" | "scenarioId" | "bandType" | "provenance"
>[] = [
  {
    metricId: "MINIMUM_RUN_OCCUPIED_TILE_P10",
    metricPath: "runs[].profile.spatial.occupiedTiles.p10|min",
    comparison: "GTE",
    threshold: 3,
  },
  {
    metricId: "MINIMUM_RUN_OCCUPIED_TILE_MEDIAN",
    metricPath: "runs[].profile.spatial.occupiedTiles.median|min",
    comparison: "GTE",
    threshold: 4,
  },
  {
    metricId: "MAXIMUM_RUN_EXACT_OVERLAP_RATE",
    metricPath: "runs[].profile.spatial.exactOverlap.rate|max",
    comparison: "LT",
    threshold: 0.01,
  },
  {
    metricId: "CORPUS_KEEP_SHARE",
    metricPath: "runs[].profile.actions.byKind[KEEP].count|sum/completedActions|sum",
    comparison: "LT",
    threshold: 0.35,
  },
  {
    metricId: "MAXIMUM_RUN_KEEP_SHARE",
    metricPath: "runs[].profile.actions.byKind[KEEP].share|max",
    comparison: "LT",
    threshold: 0.5,
  },
  {
    metricId: "OBSERVED_ACTION_FAMILY_COUNT",
    metricPath: "runs[].profile.actions.byKind[count>0].kind|distinctCount",
    comparison: "GTE",
    threshold: 6,
  },
  {
    metricId: "OBSERVED_DESIRE_FAMILY_COUNT",
    metricPath:
      "runs[].profile.desires.byFamily[exposureCreatureTicks>0].family|distinctCount",
    comparison: "GTE",
    threshold: 4,
  },
];

const SAFETY_BAND_PROVENANCE = Object.freeze({
  source: "docs/phase-3-execution-plan.md#range-policy" as const,
  basis: "LOCKED_PHASE_3_CONTRACT" as const,
  calibrationEvidence: "LOCKED_PHASE_4_1_CALIBRATION" as const,
  calibrationArtifact: PHASE_4_1_CALIBRATION_ARTIFACT,
  calibrationArtifactSha256: PHASE_4_1_CALIBRATION_SHA256,
  holdoutEvidence: "PENDING_FULL_64_SEED_CORPUS" as const,
  releaseClaim: false as const,
});

export const SCENARIO_EXPECTED_BANDS: readonly ScenarioExpectedBandDefinition[] =
  Object.freeze(
    SCENARIO_IDS.flatMap((scenarioId) =>
      SHARED_CONTRACT_BANDS.map((band) =>
        Object.freeze({
          ...band,
          tableVersion: SCENARIO_EXPECTED_BAND_TABLE_VERSION,
          scenarioId,
          bandType: "CONTRACT_SAFETY_FLOOR" as const,
          provenance: SAFETY_BAND_PROVENANCE,
        }),
      ),
    ),
  );

export type ScenarioOutcomeLabelId =
  | "COOPERATIVE_SHARED_STORAGE"
  | "FRAGMENTED_SOCIAL_STRUCTURE"
  | "PERSISTENT_PRIVATE_RESERVES"
  | "RECURRING_CONFLICT"
  | "SHARED_HYDRATION"
  | "SOURCE_BOTTLENECK"
  | "PERSISTENT_DEHYDRATION"
  | "CONCENTRATED_WATER_ROUTES"
  | "ESTABLISHED_SETTLEMENT"
  | "CHRONIC_SHELTER_NEGLECT"
  | "SHELTER_CROWDING"
  | "GUEST_SHELTERING"
  | "SETTLEMENT_RELOCATION"
  | "QUIET_STALEMATE";

/** Candidate classifier-v3 rules. Freeze them only after the Phase 4.2 calibration review. */
export const SETTLEMENT_NEGLECT_MINIMUM_ACTIVE_SHELTER_TICKS = 1_000 as const;
export const SETTLEMENT_NEGLECT_LOW_CONDITION_RATE = 0.5 as const;

export const SCENARIO_OUTCOME_BAND_TABLE_VERSION = 1 as const;
export const SCENARIO_OUTCOME_MINIMUM_OCCURRENCES = 8 as const;
export const SCENARIO_OUTCOME_DOMINANCE_THRESHOLD = 0.85 as const;

export interface ScenarioOutcomeIncidenceBandDefinition {
  readonly tableVersion: typeof SCENARIO_OUTCOME_BAND_TABLE_VERSION;
  readonly scenarioId: ScenarioId;
  readonly labelId: ScenarioOutcomeLabelId;
  readonly metricPath: string;
  readonly comparison: "GTE";
  /** Reviewed occurrence floor for this scenario/label pair. */
  readonly threshold: number;
  readonly requiredEligibleRuns: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly provenance: CalibrationProvenance;
}

export interface FrozenCalibrationProvenance {
  readonly basis: "LOCKED_PHASE_4_1_CALIBRATION";
  readonly artifact: typeof PHASE_4_1_CALIBRATION_ARTIFACT;
  readonly artifactSha256: typeof PHASE_4_1_CALIBRATION_SHA256;
  readonly classifierVersion: 2;
  readonly calibrationSeedCount: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly ticksPerRun: typeof PHASE_4_1_MATRIX_TICKS;
  readonly holdoutPolicy: "EVALUATE_UNCHANGED_THRESHOLDS";
  readonly releaseClaim: false;
}

export interface Phase42CalibrationProvenance {
  readonly basis:
    "PHASE_4_2_DISCOVERY_CALIBRATION_CANDIDATE" | "LOCKED_PHASE_4_2_CALIBRATION";
  readonly artifact: typeof PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH;
  readonly artifactSha256: string | null;
  readonly freezeReviewArtifact: string;
  readonly freezeReviewArtifactSha256: string | null;
  readonly classifierVersion: 3;
  readonly calibrationSeedCount: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly ticksPerRun: typeof PHASE_4_2_MATRIX_TICKS;
  readonly calibrationStatus: typeof PHASE_4_2_CALIBRATION_STATUS;
  readonly bandFreezeStatus: typeof PHASE_4_2_BAND_FREEZE_STATUS;
  readonly holdoutPolicy:
    | "SEALED_PENDING_REVIEW"
    | "SEALED_PENDING_POST_FREEZE_VERIFICATION"
    | "EVALUATE_UNCHANGED_THRESHOLDS_ONCE";
  readonly releaseClaim: false;
}

export interface Phase42VerificationProvenance {
  readonly basis: "POST_FREEZE_PHASE_4_2_VERIFICATION";
  readonly artifact: string;
  readonly artifactSha256: string | null;
  readonly reviewArtifact: string;
  readonly reviewArtifactSha256: string | null;
  readonly classifierVersion: 3;
  readonly calibrationSeedCount: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly ticksPerRun: typeof PHASE_4_2_MATRIX_TICKS;
  readonly calibrationStatus: typeof PHASE_4_2_CALIBRATION_STATUS;
  readonly releaseClaim: false;
}

export type CalibrationProvenance =
  FrozenCalibrationProvenance | Phase42CalibrationProvenance;

export const PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE = Object.freeze({
  basis: "LOCKED_PHASE_4_1_CALIBRATION" as const,
  artifact: PHASE_4_1_CALIBRATION_ARTIFACT,
  artifactSha256: PHASE_4_1_CALIBRATION_SHA256,
  classifierVersion: 2 as const,
  calibrationSeedCount: PHASE_4_1_CALIBRATION_SEED_COUNT,
  ticksPerRun: PHASE_4_1_MATRIX_TICKS,
  holdoutPolicy: "EVALUATE_UNCHANGED_THRESHOLDS" as const,
  releaseClaim: false as const,
}) satisfies FrozenCalibrationProvenance;

export const PHASE_4_2_CALIBRATION_PROVENANCE: Phase42CalibrationProvenance = Object.freeze(
  {
    basis:
      PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN"
        ? "LOCKED_PHASE_4_2_CALIBRATION"
        : "PHASE_4_2_DISCOVERY_CALIBRATION_CANDIDATE",
    artifact: PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifact,
    artifactSha256: PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifactSha256,
    freezeReviewArtifact: PHASE_4_2_HOLDOUT_POLICY.provenance.freezeReviewArtifact,
    freezeReviewArtifactSha256:
      PHASE_4_2_HOLDOUT_POLICY.provenance.freezeReviewArtifactSha256,
    classifierVersion: 3,
    calibrationSeedCount: PHASE_4_1_CALIBRATION_SEED_COUNT,
    ticksPerRun: PHASE_4_2_MATRIX_TICKS,
    calibrationStatus: PHASE_4_2_CALIBRATION_STATUS,
    bandFreezeStatus: PHASE_4_2_BAND_FREEZE_STATUS,
    holdoutPolicy:
      PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN" &&
      PHASE_4_2_CALIBRATION_STATUS === "REVIEWED"
        ? "EVALUATE_UNCHANGED_THRESHOLDS_ONCE"
        : PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN"
          ? "SEALED_PENDING_POST_FREEZE_VERIFICATION"
          : "SEALED_PENDING_REVIEW",
    releaseClaim: false,
  },
);

export const PHASE_4_2_POST_FREEZE_VERIFICATION_PROVENANCE: Phase42VerificationProvenance =
  Object.freeze({
    basis: "POST_FREEZE_PHASE_4_2_VERIFICATION",
    artifact: PHASE_4_2_HOLDOUT_POLICY.provenance.verificationArtifact,
    artifactSha256: PHASE_4_2_HOLDOUT_POLICY.provenance.verificationArtifactSha256,
    reviewArtifact: PHASE_4_2_HOLDOUT_POLICY.provenance.verificationReviewArtifact,
    reviewArtifactSha256:
      PHASE_4_2_HOLDOUT_POLICY.provenance.verificationReviewArtifactSha256,
    classifierVersion: 3,
    calibrationSeedCount: PHASE_4_1_CALIBRATION_SEED_COUNT,
    ticksPerRun: PHASE_4_2_MATRIX_TICKS,
    calibrationStatus: PHASE_4_2_CALIBRATION_STATUS,
    releaseClaim: false,
  });

const REQUIRED_OUTCOME_LABELS = Object.freeze({
  "petri-world": Object.freeze(["COOPERATIVE_SHARED_STORAGE", "SHARED_HYDRATION"] as const),
  "split-banks": Object.freeze([
    "PERSISTENT_PRIVATE_RESERVES",
    "SHARED_HYDRATION",
  ] as const),
  "scattered-plenty": Object.freeze([
    "PERSISTENT_PRIVATE_RESERVES",
    "SOURCE_BOTTLENECK",
  ] as const),
  "unequal-table": Object.freeze([
    "PERSISTENT_PRIVATE_RESERVES",
    "SHARED_HYDRATION",
  ] as const),
} satisfies Record<ScenarioId, readonly ScenarioOutcomeLabelId[]>);

export const SCENARIO_OUTCOME_INCIDENCE_BANDS: readonly ScenarioOutcomeIncidenceBandDefinition[] =
  Object.freeze(
    SCENARIO_IDS.flatMap((scenarioId) =>
      REQUIRED_OUTCOME_LABELS[scenarioId].map((labelId) =>
        Object.freeze({
          tableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
          scenarioId,
          labelId,
          metricPath: `analysis.outcomes.incidence[${labelId}].occurrences`,
          comparison: "GTE" as const,
          threshold: SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
          requiredEligibleRuns: PHASE_4_1_CALIBRATION_SEED_COUNT,
          provenance: PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
        }),
      ),
    ),
  );

export interface ScenarioOutcomeDominanceRationaleDefinition {
  readonly scenarioId: ScenarioId;
  readonly labelId: ScenarioOutcomeLabelId;
  readonly rationaleId: string;
  readonly mechanicsAndScenarioBasis: string;
  readonly interpretation: "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME";
  readonly provenance: CalibrationProvenance;
}

function rationale(
  scenarioId: ScenarioId,
  labelId: ScenarioOutcomeLabelId,
  rationaleId: string,
  mechanicsAndScenarioBasis: string,
): ScenarioOutcomeDominanceRationaleDefinition {
  return Object.freeze({
    scenarioId,
    labelId,
    rationaleId,
    mechanicsAndScenarioBasis,
    interpretation: "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME",
    provenance: PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
  });
}

export const SCENARIO_OUTCOME_DOMINANCE_RATIONALES: readonly ScenarioOutcomeDominanceRationaleDefinition[] =
  Object.freeze([
    rationale(
      "petri-world",
      "SOURCE_BOTTLENECK",
      "PETRI_SINGLE_EASTERN_SOURCE",
      "Eight creatures share one eastern potable source that begins at 24/40, renews one unit every 180 ticks, and exposes only three simultaneous gather slots. Those finite-source and access facts explain the label's calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "petri-world",
      "PERSISTENT_DEHYDRATION",
      "PETRI_THIRST_AND_TRAVEL_PRESSURE",
      "Thirst rises every tick and rises faster while moving, severe thirst begins at 8,000, and all eight creatures must travel to the single eastern source. Those declared need, travel, stock, and slot mechanics explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "split-banks",
      "SOURCE_BOTTLENECK",
      "SPLIT_BANKS_PASSAGE_SOURCE",
      "Both four-creature banks share one passage source that begins at 18/30, renews one unit every 240 ticks, and exposes three gather slots. Those declared topology, stock, regeneration, and slot facts explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "split-banks",
      "PERSISTENT_DEHYDRATION",
      "SPLIT_BANKS_SLOW_RENEWAL",
      "All eight creatures begin with thirst around 3,200 and rely on the single slowly renewing passage source while movement adds thirst. Those declared starting-need and hydration mechanics explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "scattered-plenty",
      "PERSISTENT_PRIVATE_RESERVES",
      "SCATTERED_LOCAL_PLENTY",
      "Four separated pairs begin beside abundant local food while building material is central and contact or group formation may arrive late. Those declared starting and resource-distribution facts explain the prevalence of retained ungrouped resources; they do not prescribe or script an outcome.",
    ),
    rationale(
      "scattered-plenty",
      "SOURCE_BOTTLENECK",
      "SCATTERED_FINITE_DISTRIBUTED_SOURCES",
      "The four distributed potable sources are finite at 18/24 each, renew one unit every 140 ticks, and each exposes three gather slots. The bottleneck classifier also records prolonged depletion as well as contention. Those declared mechanics explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "unequal-table",
      "PERSISTENT_PRIVATE_RESERVES",
      "UNEQUAL_CROSS_BANK_SOCIAL_CONTRAST",
      "Five western starters and three eastern starters begin on opposite sides of the passage with contrasting social traits and access. Cross-bank joining and storage are contingent rather than guaranteed. Those declared scenario facts explain private-reserve prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "unequal-table",
      "SHARED_HYDRATION",
      "UNEQUAL_NEED_AND_DONOR_CONTRAST",
      "Western starters begin thirstier at roughly 4,500 while eastern starters begin around 2,200 beside two eastern sources; sharing requires a recipient at or above 6,000 and a giver below 7,000. Those declared need, access, and sharing mechanics explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
    rationale(
      "unequal-table",
      "SOURCE_BOTTLENECK",
      "UNEQUAL_EASTERN_FINITE_SOURCES",
      "Eight creatures rely on two eastern sources that each begin at 16/28, renew one unit every 220 ticks, and expose three gather slots, while thirstier western starters cross the passage. Those declared stock, regeneration, access, and slot facts explain calibration prevalence; they do not prescribe or script an outcome.",
    ),
  ]);

/**
 * The discovery corpus observed an established settlement in 30, 13, 6, and
 * 3 of 64 runs respectively. These floors are the whole-run lower bounds from
 * each two-sided 95% Wilson interval (`floor(lower * 64)`, with a minimum of
 * one when the factual label was observed). That preserves the fixed
 * classifier rule while giving rarer scenario outcomes an honest, reviewed
 * band instead of relabelling absence as settlement.
 */
export const PHASE_4_2_ESTABLISHED_SETTLEMENT_OCCURRENCE_FLOORS = Object.freeze({
  "petri-world": 22,
  "split-banks": 7,
  "scattered-plenty": 2,
  "unequal-table": 1,
} satisfies Record<ScenarioId, number>);

export const PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS: readonly ScenarioOutcomeIncidenceBandDefinition[] =
  Object.freeze(
    SCENARIO_IDS.map((scenarioId) =>
      Object.freeze({
        tableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
        scenarioId,
        labelId: "ESTABLISHED_SETTLEMENT" as const,
        metricPath: "analysis.outcomes.incidence[ESTABLISHED_SETTLEMENT].occurrences",
        comparison: "GTE" as const,
        threshold: PHASE_4_2_ESTABLISHED_SETTLEMENT_OCCURRENCE_FLOORS[scenarioId],
        requiredEligibleRuns: PHASE_4_1_CALIBRATION_SEED_COUNT,
        provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
      }),
    ),
  );

/**
 * Discovery found the same nine >85% incidences already explained by the
 * declared Phase 4.1 mechanics. They are repeated with Phase 4.2 provenance
 * because the new corpus is an independent reviewed evidence boundary.
 */
export const PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES: readonly ScenarioOutcomeDominanceRationaleDefinition[] =
  Object.freeze(
    SCENARIO_OUTCOME_DOMINANCE_RATIONALES.map((definition) =>
      Object.freeze({
        ...definition,
        rationaleId: `PHASE_4_2_${definition.rationaleId}`,
        provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
      }),
    ),
  );

export const PAIRED_MACRO_BAND_TABLE_VERSION = 1 as const;
export const REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS = 3 as const;
export const REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS = 1 as const;

export type FrozenPhase3MacroDimension =
  "SOCIAL" | "STORAGE" | "CONFLICT" | "SPATIAL" | "SETTLEMENT";

export type FrozenPairedMacroMetricId =
  | "GROUP_COUNT"
  | "STORED_RESOURCE_UNITS"
  | "ATTACK_EVENT_COUNT"
  | "CREATURE_PAIR_DISTANCE_MEDIAN"
  | "ACTIVE_SHELTER_COUNT"
  | "SHELTERED_REST_SHARE"
  | "MEAN_SHELTER_CONDITION"
  | "SHELTER_GUEST_USE_EVENTS"
  | "SETTLEMENT_RELOCATION_COUNT";

export type PairedMacroMissingValuePolicy =
  "ZERO_IS_OBSERVED" | "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING";

export type PairedMacroEligiblePairPolicy =
  "ALL_LOCKED_SEEDS" | "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION";

export interface PairedMacroBandDefinition {
  readonly tableVersion: typeof PAIRED_MACRO_BAND_TABLE_VERSION;
  readonly dimension: FrozenPhase3MacroDimension;
  readonly leftScenarioId: ScenarioId;
  readonly rightScenarioId: ScenarioId;
  readonly metricId: FrozenPairedMacroMetricId;
  readonly metricPath: string;
  readonly deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT";
  readonly minimumAbsoluteMeanDelta: number;
  readonly effectStatistic: "ABSOLUTE_COHEN_DZ";
  readonly minimumAbsoluteCohenDz: number;
  /**
   * Exact cardinality for ALL_LOCKED_SEEDS, or a frozen minimum when the
   * metric's declared missing-value policy excludes an otherwise valid pair.
   */
  readonly requiredPairedSeeds: number;
  readonly missingValuePolicy: PairedMacroMissingValuePolicy;
  readonly eligiblePairPolicy: PairedMacroEligiblePairPolicy;
  readonly provenance: CalibrationProvenance;
}

function pairedBand(
  definition: Omit<
    PairedMacroBandDefinition,
    "tableVersion" | "provenance" | "missingValuePolicy" | "eligiblePairPolicy"
  >,
): PairedMacroBandDefinition {
  return Object.freeze({
    ...definition,
    tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
    missingValuePolicy: "ZERO_IS_OBSERVED" as const,
    eligiblePairPolicy: "ALL_LOCKED_SEEDS" as const,
    provenance: PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,
  });
}

export const PAIRED_MACRO_BANDS: readonly PairedMacroBandDefinition[] = Object.freeze([
  pairedBand({
    dimension: "SOCIAL",
    leftScenarioId: "petri-world",
    rightScenarioId: "unequal-table",
    metricId: "GROUP_COUNT",
    metricPath: "pairedComparisons[petri-world->unequal-table].GROUP_COUNT",
    deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
    minimumAbsoluteMeanDelta: 0.25,
    effectStatistic: "ABSOLUTE_COHEN_DZ",
    minimumAbsoluteCohenDz: 0.5,
    requiredPairedSeeds: PHASE_4_1_CALIBRATION_SEED_COUNT,
  }),
  pairedBand({
    dimension: "STORAGE",
    leftScenarioId: "petri-world",
    rightScenarioId: "unequal-table",
    metricId: "STORED_RESOURCE_UNITS",
    metricPath: "pairedComparisons[petri-world->unequal-table].STORED_RESOURCE_UNITS",
    deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
    minimumAbsoluteMeanDelta: 20,
    effectStatistic: "ABSOLUTE_COHEN_DZ",
    minimumAbsoluteCohenDz: 0.5,
    requiredPairedSeeds: PHASE_4_1_CALIBRATION_SEED_COUNT,
  }),
  pairedBand({
    dimension: "CONFLICT",
    leftScenarioId: "petri-world",
    rightScenarioId: "scattered-plenty",
    metricId: "ATTACK_EVENT_COUNT",
    metricPath: "pairedComparisons[petri-world->scattered-plenty].ATTACK_EVENT_COUNT",
    deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
    minimumAbsoluteMeanDelta: 2,
    effectStatistic: "ABSOLUTE_COHEN_DZ",
    minimumAbsoluteCohenDz: 0.3,
    requiredPairedSeeds: PHASE_4_1_CALIBRATION_SEED_COUNT,
  }),
  pairedBand({
    dimension: "SPATIAL",
    leftScenarioId: "scattered-plenty",
    rightScenarioId: "unequal-table",
    metricId: "CREATURE_PAIR_DISTANCE_MEDIAN",
    metricPath:
      "pairedComparisons[scattered-plenty->unequal-table].CREATURE_PAIR_DISTANCE_MEDIAN",
    deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
    minimumAbsoluteMeanDelta: 2,
    effectStatistic: "ABSOLUTE_COHEN_DZ",
    minimumAbsoluteCohenDz: 0.5,
    requiredPairedSeeds: PHASE_4_1_CALIBRATION_SEED_COUNT,
  }),
]);

/**
 * Discovery measured a Petri World -> Unequal Table active-shelter mean delta
 * of -0.421875 and paired Cohen dz of -0.756174. The frozen minima leave
 * material margin below both observed magnitudes while retaining all 64
 * paired seeds and the declared right-minus-left orientation.
 */
export const PHASE_4_2_PAIRED_MACRO_BANDS: readonly PairedMacroBandDefinition[] =
  Object.freeze([
    Object.freeze({
      tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
      dimension: "SETTLEMENT",
      leftScenarioId: "petri-world",
      rightScenarioId: "unequal-table",
      metricId: "ACTIVE_SHELTER_COUNT",
      metricPath: "pairedComparisons[petri-world->unequal-table].ACTIVE_SHELTER_COUNT",
      deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
      minimumAbsoluteMeanDelta: 0.25,
      effectStatistic: "ABSOLUTE_COHEN_DZ",
      minimumAbsoluteCohenDz: 0.5,
      requiredPairedSeeds: PHASE_4_1_CALIBRATION_SEED_COUNT,
      missingValuePolicy: "ZERO_IS_OBSERVED",
      eligiblePairPolicy: "ALL_LOCKED_SEEDS",
      provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
    }),
  ]);

export interface Phase42FrozenDefinitionSet {
  readonly policy?: Phase42HoldoutPolicy;
  readonly incidenceBands?: readonly ScenarioOutcomeIncidenceBandDefinition[];
  readonly dominanceRationales?: readonly ScenarioOutcomeDominanceRationaleDefinition[];
  readonly pairedMacroBands?: readonly PairedMacroBandDefinition[];
  readonly currentDefinitionFingerprint?: string;
}

function isSha256(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{64}$/u.test(value);
}

function hasFrozenPhase42Provenance(
  provenance: CalibrationProvenance,
  policy: Phase42HoldoutPolicy,
): boolean {
  return (
    provenance.basis === "LOCKED_PHASE_4_2_CALIBRATION" &&
    provenance.artifact === policy.provenance.discoveryArtifact &&
    provenance.artifactSha256 === policy.provenance.discoveryArtifactSha256 &&
    provenance.freezeReviewArtifact === policy.provenance.freezeReviewArtifact &&
    provenance.freezeReviewArtifactSha256 ===
      policy.provenance.freezeReviewArtifactSha256 &&
    provenance.classifierVersion === 3 &&
    provenance.calibrationSeedCount === PHASE_4_1_CALIBRATION_SEED_COUNT &&
    provenance.ticksPerRun === PHASE_4_2_MATRIX_TICKS &&
    provenance.calibrationStatus === policy.calibrationStatus &&
    provenance.bandFreezeStatus === policy.bandFreezeStatus
  );
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

function phase42PairDefinitionIsValid(
  definition: PairedMacroBandDefinition,
  policy: Phase42HoldoutPolicy,
): boolean {
  const thresholdValid =
    Number.isInteger(definition.requiredPairedSeeds) &&
    definition.requiredPairedSeeds >= 1 &&
    definition.requiredPairedSeeds <= PHASE_4_1_CALIBRATION_SEED_COUNT;
  if (
    definition.dimension !== "SETTLEMENT" ||
    !thresholdValid ||
    !hasFrozenPhase42Provenance(definition.provenance, policy)
  ) {
    return false;
  }
  if (definition.metricId === "MEAN_SHELTER_CONDITION") {
    return (
      definition.missingValuePolicy === "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING" &&
      definition.eligiblePairPolicy === "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION"
    );
  }
  return (
    definition.missingValuePolicy === "ZERO_IS_OBSERVED" &&
    definition.eligiblePairPolicy === "ALL_LOCKED_SEEDS" &&
    definition.requiredPairedSeeds === PHASE_4_1_CALIBRATION_SEED_COUNT
  );
}

/**
 * Validates the checked-in definition set independently of post-freeze
 * verification status so the v2 calibration can evaluate the frozen rules.
 */
export function phase42DefinitionsAreFrozen(
  definitions: Phase42FrozenDefinitionSet = {},
): boolean {
  const policy = definitions.policy ?? PHASE_4_2_HOLDOUT_POLICY;
  const incidenceBands =
    definitions.incidenceBands ?? PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS;
  const dominanceRationales =
    definitions.dominanceRationales ?? PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES;
  const pairedMacroBands = definitions.pairedMacroBands ?? PHASE_4_2_PAIRED_MACRO_BANDS;
  const currentDefinitionFingerprint = definitions.currentDefinitionFingerprint;
  const discoverySha = policy.provenance.discoveryArtifactSha256;
  const freezeReviewSha = policy.provenance.freezeReviewArtifactSha256;
  return (
    policy.bandFreezeStatus === "FROZEN" &&
    policy.calibrationStatus !== "NOT_RUN" &&
    isSha256(policy.frozenDefinitionFingerprint) &&
    currentDefinitionFingerprint === policy.frozenDefinitionFingerprint &&
    isSha256(discoverySha) &&
    isSha256(freezeReviewSha) &&
    incidenceBands.length > 0 &&
    SCENARIO_IDS.every((scenarioId) =>
      incidenceBands.some((definition) => definition.scenarioId === scenarioId),
    ) &&
    uniqueBy(
      incidenceBands,
      (definition) => `${definition.scenarioId}:${definition.labelId}`,
    ) &&
    incidenceBands.every(
      (definition) =>
        definition.requiredEligibleRuns === PHASE_4_1_CALIBRATION_SEED_COUNT &&
        hasFrozenPhase42Provenance(definition.provenance, policy),
    ) &&
    uniqueBy(
      dominanceRationales,
      (definition) => `${definition.scenarioId}:${definition.labelId}`,
    ) &&
    dominanceRationales.every((definition) =>
      hasFrozenPhase42Provenance(definition.provenance, policy),
    ) &&
    pairedMacroBands.length >= REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS &&
    uniqueBy(
      pairedMacroBands,
      (definition) =>
        `${definition.leftScenarioId}:${definition.rightScenarioId}:${definition.metricId}`,
    ) &&
    pairedMacroBands.every((definition) => phase42PairDefinitionIsValid(definition, policy))
  );
}

export function phase42BandsAreFrozen(currentDefinitionFingerprint?: string): boolean {
  return (
    PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN" &&
    phase42DefinitionsAreFrozen(
      currentDefinitionFingerprint === undefined ? {} : { currentDefinitionFingerprint },
    )
  );
}

/** Executable definition-validation semantics included in the release fingerprint. */
export function phase42BandValidationSemanticContract() {
  return {
    constants: {
      phase41CalibrationSeedCount: PHASE_4_1_CALIBRATION_SEED_COUNT,
      phase42MatrixTicks: PHASE_4_2_MATRIX_TICKS,
      minimumOutcomeOccurrences: SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
      dominanceThreshold: SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,
      requiredInheritedDimensions: REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS,
      requiredSettlementBands: REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS,
    },
    implementation: {
      isSha256: isSha256.toString(),
      hasFrozenPhase42Provenance: hasFrozenPhase42Provenance.toString(),
      uniqueBy: uniqueBy.toString(),
      phase42PairDefinitionIsValid: phase42PairDefinitionIsValid.toString(),
      phase42DefinitionsAreFrozen: phase42DefinitionsAreFrozen.toString(),
      phase42BandsAreFrozen: phase42BandsAreFrozen.toString(),
    },
  };
}
