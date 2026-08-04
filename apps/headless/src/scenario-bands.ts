import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

export const SCENARIO_EXPECTED_BAND_TABLE_VERSION = 1 as const;

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
    readonly calibrationEvidence: "PENDING_FULL_64_SEED_CORPUS";
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

export const SCENARIO_EXPECTED_BANDS: readonly ScenarioExpectedBandDefinition[] =
  Object.freeze(
    SCENARIO_IDS.flatMap((scenarioId) =>
      SHARED_CONTRACT_BANDS.map((band) =>
        Object.freeze({
          ...band,
          tableVersion: SCENARIO_EXPECTED_BAND_TABLE_VERSION,
          scenarioId,
          bandType: "CONTRACT_SAFETY_FLOOR" as const,
          provenance: Object.freeze({
            source: "docs/phase-3-execution-plan.md#range-policy" as const,
            basis: "LOCKED_PHASE_3_CONTRACT" as const,
            calibrationEvidence: "PENDING_FULL_64_SEED_CORPUS" as const,
            holdoutEvidence: "PENDING_FULL_64_SEED_CORPUS" as const,
            releaseClaim: false as const,
          }),
        }),
      ),
    ),
  );

export const PENDING_SCENARIO_OUTCOME_BAND_DIMENSIONS = Object.freeze([
  "SOCIAL_STRUCTURE",
  "RESOURCE_AND_STORAGE_PATTERN",
  "CONFLICT_AND_COOPERATION_CADENCE",
  "SPATIAL_PATTERN",
  "TIME_TO_EVENT",
] as const);
