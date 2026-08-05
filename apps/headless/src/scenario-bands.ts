import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

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
  | "QUIET_STALEMATE";

export const SCENARIO_OUTCOME_BAND_TABLE_VERSION = 1 as const;
export const SCENARIO_OUTCOME_MINIMUM_OCCURRENCES = 8 as const;
export const SCENARIO_OUTCOME_DOMINANCE_THRESHOLD = 0.85 as const;

export interface ScenarioOutcomeIncidenceBandDefinition {
  readonly tableVersion: typeof SCENARIO_OUTCOME_BAND_TABLE_VERSION;
  readonly scenarioId: ScenarioId;
  readonly labelId: ScenarioOutcomeLabelId;
  readonly metricPath: string;
  readonly comparison: "GTE";
  readonly threshold: typeof SCENARIO_OUTCOME_MINIMUM_OCCURRENCES;
  readonly requiredEligibleRuns: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly provenance: FrozenCalibrationProvenance;
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
  readonly provenance: FrozenCalibrationProvenance;
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

export const PAIRED_MACRO_BAND_TABLE_VERSION = 1 as const;
export const REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS = 3 as const;

export type FrozenPhase3MacroDimension = "SOCIAL" | "STORAGE" | "CONFLICT" | "SPATIAL";

export type FrozenPairedMacroMetricId =
  | "GROUP_COUNT"
  | "STORED_RESOURCE_UNITS"
  | "ATTACK_EVENT_COUNT"
  | "CREATURE_PAIR_DISTANCE_MEDIAN";

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
  readonly requiredPairedSeeds: typeof PHASE_4_1_CALIBRATION_SEED_COUNT;
  readonly provenance: FrozenCalibrationProvenance;
}

function pairedBand(
  definition: Omit<PairedMacroBandDefinition, "tableVersion" | "provenance">,
): PairedMacroBandDefinition {
  return Object.freeze({
    ...definition,
    tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
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
