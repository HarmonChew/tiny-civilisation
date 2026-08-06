import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";

import {
  SCENARIO_IDS,
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  hashSimulationState,
  type ScenarioId,
} from "@tiny-civ/sim-core";

import {
  ACTIVITY_SAMPLE_EVERY_TICKS,
  StreamingActivityCollector,
} from "./activity-collector.js";
import {
  deriveMatrixEvidenceReport,
  type DeterministicMatrixRun,
  type Phase42DefinitionEvidence,
} from "./matrix-report-derivation.js";
import {
  PHASE_4_2_CALIBRATION_SEEDS,
  PHASE_4_2_MATRIX_TICKS,
} from "./phase-4.2-corpora.js";
import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
  PHASE_4_2_INCIDENCE_BAND_POLICY,
  phase42DefinitionFingerprint,
  type Phase42IncidenceBandPolicy,
} from "./phase-4.2-definition-contract.js";
import { assertCompletePhase42CalibrationMatrixEvidence } from "./phase-4.2-matrix-contract.js";
import type {
  Phase42AnalysisDefinitionOverride,
  Phase42ClassifierRules,
} from "./scenario-analysis.js";
import {
  PAIRED_MACRO_BAND_TABLE_VERSION,
  PHASE_4_1_CALIBRATION_SEED_COUNT,
  PHASE_4_2_CALIBRATION_PROVENANCE,
  SCENARIO_OUTCOME_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
  type FrozenPairedMacroMetricId,
  type PairedMacroBandDefinition,
  type PairedMacroEligiblePairPolicy,
  type PairedMacroMissingValuePolicy,
  type ScenarioOutcomeDominanceRationaleDefinition,
  type ScenarioOutcomeIncidenceBandDefinition,
  type ScenarioOutcomeLabelId,
} from "./scenario-bands.js";

export type Phase42DefinitionStatus = "CANDIDATE" | "FROZEN";

export interface Phase42CalibrationRunRequest {
  readonly scenarioId: ScenarioId;
  readonly seed: number;
  readonly ticks: typeof PHASE_4_2_MATRIX_TICKS;
}

export type Phase42CalibrationRunRegenerator = (
  request: Phase42CalibrationRunRequest,
) => DeterministicMatrixRun;

const OUTCOME_LABEL_IDS = new Set<string>([
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
]);

const SETTLEMENT_METRIC_IDS = new Set<FrozenPairedMacroMetricId>([
  "ACTIVE_SHELTER_COUNT",
  "SHELTERED_REST_SHARE",
  "MEAN_SHELTER_CONDITION",
  "SHELTER_GUEST_USE_EVENTS",
  "SETTLEMENT_RELOCATION_COUNT",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Phase 4.2 ${label} must be an object.`);
  return value;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Phase 4.2 ${label} must be an array.`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  if (!isDeepStrictEqual(actual, normalizedExpected)) {
    throw new Error(`Phase 4.2 ${label} has unexpected or missing semantic fields.`);
  }
}

function scenarioIdAt(value: unknown, label: string): ScenarioId {
  if (typeof value !== "string" || !SCENARIO_IDS.includes(value as ScenarioId)) {
    throw new Error(`Phase 4.2 ${label} must identify a catalog scenario.`);
  }
  return value as ScenarioId;
}

function outcomeLabelAt(value: unknown, label: string): ScenarioOutcomeLabelId {
  if (typeof value !== "string" || !OUTCOME_LABEL_IDS.has(value)) {
    throw new Error(`Phase 4.2 ${label} must identify a classifier-v3 outcome label.`);
  }
  return value as ScenarioOutcomeLabelId;
}

function finiteNumberAt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Phase 4.2 ${label} must be a finite number.`);
  }
  return value;
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Phase 4.2 ${label} must be a non-empty string.`);
  }
  return value;
}

function phase42StaticContractProjection(value: unknown): unknown {
  const projection = structuredClone(recordAt(value, "definition contract"));
  const phase42 = recordAt(projection.phase42, "definition contract phase42 tables");
  phase42.classifierRules = {};
  delete phase42.incidenceBandPolicy;
  phase42.incidenceBands = [];
  phase42.dominanceRationales = [];
  phase42.settlementPairedMacroBands = [];
  return projection;
}

function positiveSafeIntegerAt(value: unknown, label: string): number {
  const number = finiteNumberAt(value, label);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Phase 4.2 ${label} must be a positive safe integer.`);
  }
  return number;
}

export function hydratePhase42IncidenceBandPolicy(
  value: unknown,
  status: Phase42DefinitionStatus,
): Phase42IncidenceBandPolicy | null {
  if (status === "CANDIDATE") {
    if (value !== undefined) {
      throw new Error(
        "Phase 4.2 candidate definitions may not claim the reviewed frozen incidence-band policy.",
      );
    }
    return null;
  }

  const policy = recordAt(value, "definition incidence-band policy");
  exactKeys(
    policy,
    [
      "appliesToDefinitionStatus",
      "appliesToLabelId",
      "candidateAndInheritedDefaultOccurrences",
      "reviewedFloorMethod",
      "confidenceLevel",
      "zScore",
      "minimumFloorWhenObserved",
      "minimumFloorAppliesOnlyWhenObserved",
      "requiredEligibleRuns",
      "interpretation",
    ],
    "definition incidence-band policy",
  );
  if (!isDeepStrictEqual(policy, PHASE_4_2_INCIDENCE_BAND_POLICY)) {
    throw new Error(
      "Phase 4.2 frozen definition incidence-band policy does not match the reviewed Wilson-floor policy.",
    );
  }
  return PHASE_4_2_INCIDENCE_BAND_POLICY;
}

function hydrateClassifierRules(value: unknown): Phase42ClassifierRules {
  const rules = recordAt(value, "definition classifier rules");
  exactKeys(
    rules,
    [
      "establishedSettlementMinimumActiveShelters",
      "chronicNeglectMinimumActiveShelterTicks",
      "chronicNeglectMinimumLowConditionExposureRate",
      "shelterCrowdingMinimumEvents",
      "guestShelteringMinimumEvents",
      "settlementRelocationMinimumCount",
    ],
    "definition classifier rules",
  );
  const chronicNeglectMinimumActiveShelterTicks = positiveSafeIntegerAt(
    rules.chronicNeglectMinimumActiveShelterTicks,
    "definition chronic-neglect active-shelter ticks",
  );
  const chronicNeglectMinimumLowConditionExposureRate = finiteNumberAt(
    rules.chronicNeglectMinimumLowConditionExposureRate,
    "definition chronic-neglect low-condition rate",
  );
  if (
    chronicNeglectMinimumActiveShelterTicks > PHASE_4_2_MATRIX_TICKS ||
    chronicNeglectMinimumLowConditionExposureRate <= 0 ||
    chronicNeglectMinimumLowConditionExposureRate > 1
  ) {
    throw new Error(
      "Phase 4.2 definition chronic-neglect rules exceed the locked observation domain.",
    );
  }
  return {
    establishedSettlementMinimumActiveShelters: positiveSafeIntegerAt(
      rules.establishedSettlementMinimumActiveShelters,
      "definition established-settlement active shelters",
    ),
    chronicNeglectMinimumActiveShelterTicks,
    chronicNeglectMinimumLowConditionExposureRate,
    shelterCrowdingMinimumEvents: positiveSafeIntegerAt(
      rules.shelterCrowdingMinimumEvents,
      "definition shelter-crowding events",
    ),
    guestShelteringMinimumEvents: positiveSafeIntegerAt(
      rules.guestShelteringMinimumEvents,
      "definition guest-sheltering events",
    ),
    settlementRelocationMinimumCount: positiveSafeIntegerAt(
      rules.settlementRelocationMinimumCount,
      "definition settlement relocations",
    ),
  };
}

export function hydratePhase42IncidenceBands(
  value: unknown,
  status: Phase42DefinitionStatus,
  policy: Phase42IncidenceBandPolicy | null = status === "FROZEN"
    ? PHASE_4_2_INCIDENCE_BAND_POLICY
    : null,
): ScenarioOutcomeIncidenceBandDefinition[] {
  const observed = new Set<string>();
  return arrayAt(value, "definition incidence bands").map((item, index) => {
    const definition = recordAt(item, `definition incidence band ${index.toString()}`);
    exactKeys(
      definition,
      [
        "tableVersion",
        "scenarioId",
        "labelId",
        "metricPath",
        "comparison",
        "threshold",
        "requiredEligibleRuns",
      ],
      `definition incidence band ${index.toString()}`,
    );
    const scenarioId = scenarioIdAt(
      definition.scenarioId,
      `definition incidence band ${index.toString()} scenario`,
    );
    const labelId = outcomeLabelAt(
      definition.labelId,
      `definition incidence band ${index.toString()} label`,
    );
    const key = `${scenarioId}:${labelId}`;
    if (observed.has(key)) {
      throw new Error(`Phase 4.2 definition contains duplicate incidence band ${key}.`);
    }
    observed.add(key);
    const threshold = positiveSafeIntegerAt(
      definition.threshold,
      `definition incidence band ${index.toString()} threshold`,
    );
    const expectedMetricPath = `analysis.outcomes.incidence[${labelId}].occurrences`;
    if (
      definition.tableVersion !== SCENARIO_OUTCOME_BAND_TABLE_VERSION ||
      definition.comparison !== "GTE" ||
      definition.requiredEligibleRuns !== PHASE_4_1_CALIBRATION_SEED_COUNT ||
      definition.metricPath !== expectedMetricPath ||
      threshold > PHASE_4_1_CALIBRATION_SEED_COUNT ||
      (status === "CANDIDATE" && threshold !== SCENARIO_OUTCOME_MINIMUM_OCCURRENCES) ||
      (status === "FROZEN" &&
        (policy === null ||
          labelId !== policy.appliesToLabelId ||
          definition.requiredEligibleRuns !== policy.requiredEligibleRuns ||
          threshold < policy.minimumFloorWhenObserved))
    ) {
      throw new Error(
        `Phase 4.2 definition incidence band ${index.toString()} violates the locked gate semantics.`,
      );
    }
    return {
      tableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
      scenarioId,
      labelId,
      metricPath: expectedMetricPath,
      comparison: "GTE",
      threshold,
      requiredEligibleRuns: PHASE_4_1_CALIBRATION_SEED_COUNT,
      provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
    };
  });
}

function hydrateDominanceRationales(
  value: unknown,
): ScenarioOutcomeDominanceRationaleDefinition[] {
  const observed = new Set<string>();
  return arrayAt(value, "definition dominance rationales").map((item, index) => {
    const definition = recordAt(item, `definition dominance rationale ${index.toString()}`);
    exactKeys(
      definition,
      [
        "scenarioId",
        "labelId",
        "rationaleId",
        "mechanicsAndScenarioBasis",
        "interpretation",
      ],
      `definition dominance rationale ${index.toString()}`,
    );
    const scenarioId = scenarioIdAt(
      definition.scenarioId,
      `definition dominance rationale ${index.toString()} scenario`,
    );
    const labelId = outcomeLabelAt(
      definition.labelId,
      `definition dominance rationale ${index.toString()} label`,
    );
    const key = `${scenarioId}:${labelId}`;
    if (observed.has(key)) {
      throw new Error(
        `Phase 4.2 definition contains duplicate dominance rationale ${key}.`,
      );
    }
    observed.add(key);
    if (
      definition.interpretation !== "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME"
    ) {
      throw new Error(
        `Phase 4.2 definition dominance rationale ${index.toString()} has an invalid interpretation.`,
      );
    }
    return {
      scenarioId,
      labelId,
      rationaleId: stringAt(
        definition.rationaleId,
        `definition dominance rationale ${index.toString()} id`,
      ),
      mechanicsAndScenarioBasis: stringAt(
        definition.mechanicsAndScenarioBasis,
        `definition dominance rationale ${index.toString()} basis`,
      ),
      interpretation: "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME",
      provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
    };
  });
}

function hydratePairedMacroBands(value: unknown): PairedMacroBandDefinition[] {
  const observed = new Set<string>();
  return arrayAt(value, "definition settlement paired bands").map((item, index) => {
    const definition = recordAt(
      item,
      `definition settlement paired band ${index.toString()}`,
    );
    exactKeys(
      definition,
      [
        "tableVersion",
        "dimension",
        "leftScenarioId",
        "rightScenarioId",
        "metricId",
        "metricPath",
        "deltaStatistic",
        "minimumAbsoluteMeanDelta",
        "effectStatistic",
        "minimumAbsoluteCohenDz",
        "requiredPairedSeeds",
        "missingValuePolicy",
        "eligiblePairPolicy",
      ],
      `definition settlement paired band ${index.toString()}`,
    );
    const leftScenarioId = scenarioIdAt(
      definition.leftScenarioId,
      `definition settlement paired band ${index.toString()} left scenario`,
    );
    const rightScenarioId = scenarioIdAt(
      definition.rightScenarioId,
      `definition settlement paired band ${index.toString()} right scenario`,
    );
    const metricId = definition.metricId;
    if (
      definition.tableVersion !== PAIRED_MACRO_BAND_TABLE_VERSION ||
      definition.dimension !== "SETTLEMENT" ||
      typeof metricId !== "string" ||
      !SETTLEMENT_METRIC_IDS.has(metricId as FrozenPairedMacroMetricId) ||
      leftScenarioId === rightScenarioId ||
      definition.deltaStatistic !== "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT" ||
      definition.effectStatistic !== "ABSOLUTE_COHEN_DZ"
    ) {
      throw new Error(
        `Phase 4.2 definition settlement paired band ${index.toString()} violates the locked metric semantics.`,
      );
    }
    const missingValuePolicy = definition.missingValuePolicy;
    const eligiblePairPolicy = definition.eligiblePairPolicy;
    const requiredPairedSeeds = finiteNumberAt(
      definition.requiredPairedSeeds,
      `definition settlement paired band ${index.toString()} required seeds`,
    );
    const validMissingPolicy =
      missingValuePolicy === "ZERO_IS_OBSERVED" ||
      missingValuePolicy === "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING";
    const validPairPolicy =
      eligiblePairPolicy === "ALL_LOCKED_SEEDS" ||
      eligiblePairPolicy === "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION";
    if (
      !Number.isInteger(requiredPairedSeeds) ||
      requiredPairedSeeds < 1 ||
      requiredPairedSeeds > PHASE_4_1_CALIBRATION_SEED_COUNT ||
      !validMissingPolicy ||
      !validPairPolicy ||
      (metricId === "MEAN_SHELTER_CONDITION"
        ? missingValuePolicy !== "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING" ||
          eligiblePairPolicy !== "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION"
        : missingValuePolicy !== "ZERO_IS_OBSERVED" ||
          eligiblePairPolicy !== "ALL_LOCKED_SEEDS" ||
          requiredPairedSeeds !== PHASE_4_1_CALIBRATION_SEED_COUNT)
    ) {
      throw new Error(
        `Phase 4.2 definition settlement paired band ${index.toString()} has an invalid eligibility policy.`,
      );
    }
    const key = `${leftScenarioId}:${rightScenarioId}:${metricId}`;
    if (observed.has(key)) {
      throw new Error(`Phase 4.2 definition contains duplicate settlement band ${key}.`);
    }
    observed.add(key);
    const minimumAbsoluteMeanDelta = finiteNumberAt(
      definition.minimumAbsoluteMeanDelta,
      `definition settlement paired band ${index.toString()} mean threshold`,
    );
    const minimumAbsoluteCohenDz = finiteNumberAt(
      definition.minimumAbsoluteCohenDz,
      `definition settlement paired band ${index.toString()} effect threshold`,
    );
    if (minimumAbsoluteMeanDelta < 0 || minimumAbsoluteCohenDz < 0) {
      throw new Error(
        `Phase 4.2 definition settlement paired band ${index.toString()} thresholds must be non-negative.`,
      );
    }
    return {
      tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
      dimension: "SETTLEMENT",
      leftScenarioId,
      rightScenarioId,
      metricId: metricId as FrozenPairedMacroMetricId,
      metricPath: stringAt(
        definition.metricPath,
        `definition settlement paired band ${index.toString()} metric path`,
      ),
      deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
      minimumAbsoluteMeanDelta,
      effectStatistic: "ABSOLUTE_COHEN_DZ",
      minimumAbsoluteCohenDz,
      requiredPairedSeeds,
      missingValuePolicy: missingValuePolicy as PairedMacroMissingValuePolicy,
      eligiblePairPolicy: eligiblePairPolicy as PairedMacroEligiblePairPolicy,
      provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
    };
  });
}

function definitionEvidenceFromReport(
  report: Record<string, unknown>,
  expectedStatus: Phase42DefinitionStatus,
): Phase42DefinitionEvidence {
  const configuration = recordAt(report.configuration, "calibration configuration");
  const contract = recordAt(
    configuration.phase42DefinitionContract,
    "calibration definition contract",
  );
  const fingerprint = phase42DefinitionFingerprint(contract);
  if (
    configuration.phase42DefinitionContractSchemaVersion !==
      PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION ||
    configuration.phase42DefinitionFingerprintAlgorithm !==
      PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM ||
    configuration.phase42DefinitionStatus !== expectedStatus ||
    configuration.phase42DefinitionFingerprint !== fingerprint
  ) {
    throw new Error(
      "Phase 4.2 calibration artifact does not authenticate its embedded definition contract.",
    );
  }
  if (
    !isDeepStrictEqual(
      phase42StaticContractProjection(contract),
      phase42StaticContractProjection(PHASE_4_2_DEFINITION_CONTRACT),
    )
  ) {
    throw new Error(
      "Phase 4.2 calibration embedded contract changes non-table analysis semantics.",
    );
  }
  if (
    expectedStatus === "FROZEN" &&
    !isDeepStrictEqual(contract, PHASE_4_2_DEFINITION_CONTRACT)
  ) {
    throw new Error(
      "Phase 4.2 verification calibration must use the exact current frozen definition contract.",
    );
  }
  const phase42 = recordAt(contract.phase42, "calibration definition phase42 tables");
  const incidenceBandPolicy = hydratePhase42IncidenceBandPolicy(
    phase42.incidenceBandPolicy,
    expectedStatus,
  );
  const analysisDefinitions: Phase42AnalysisDefinitionOverride = {
    status: expectedStatus,
    classifierRules: hydrateClassifierRules(phase42.classifierRules),
    incidenceBands: hydratePhase42IncidenceBands(
      phase42.incidenceBands,
      expectedStatus,
      incidenceBandPolicy,
    ),
    dominanceRationales: hydrateDominanceRationales(phase42.dominanceRationales),
    pairedMacroBands: hydratePairedMacroBands(phase42.settlementPairedMacroBands),
  };
  return {
    contractSchemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
    fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
    status: expectedStatus,
    fingerprint,
    contract,
    analysisDefinitions,
  };
}

function stripProcessProvenance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripProcessProvenance);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "provenance")
      .map(([key, item]) => [key, stripProcessProvenance(item)]),
  );
}

function rawRunProjection(value: unknown, label: string): DeterministicMatrixRun {
  const run = recordAt(value, label);
  return {
    seed: run.seed as number,
    scenario: run.scenario as DeterministicMatrixRun["scenario"],
    compiledMapHash: run.compiledMapHash as string,
    requestedTicks: run.requestedTicks as number,
    finalHash: run.finalHash as string,
    profile: run.profile as DeterministicMatrixRun["profile"],
  };
}

function regeneratePhase42CalibrationRun(
  request: Phase42CalibrationRunRequest,
): DeterministicMatrixRun {
  const state = createSimulation(createScenarioReference(request.scenarioId, request.seed));
  const collector = new StreamingActivityCollector(state);
  for (let tick = 0; tick < request.ticks; tick += ACTIVITY_SAMPLE_EVERY_TICKS) {
    advanceSimulation(state, ACTIVITY_SAMPLE_EVERY_TICKS);
    collector.observe(state);
  }
  return {
    seed: request.seed,
    scenario: { ...state.scenario },
    compiledMapHash: state.compiledMapHash,
    requestedTicks: request.ticks,
    finalHash: hashSimulationState(state),
    profile: collector.report(),
  };
}

/**
 * Lower-level authentication seam. Tests may inject a deterministic runner;
 * production callers use authenticatePhase42CalibrationArtifact, whose runner
 * is private and cannot be replaced.
 */
export function authenticatePhase42CalibrationMatrixWithRunnerForTest(
  report: Record<string, unknown>,
  expectedStatus: Phase42DefinitionStatus,
  regenerate: Phase42CalibrationRunRegenerator,
): void {
  assertCompletePhase42CalibrationMatrixEvidence(report, expectedStatus === "FROZEN");
  const definitionEvidence = definitionEvidenceFromReport(report, expectedStatus);
  const artifactRuns = arrayAt(report.runs, "calibration runs");
  const regeneratedRuns: DeterministicMatrixRun[] = [];
  let runIndex = 0;
  for (const scenarioId of SCENARIO_IDS) {
    for (const seed of PHASE_4_2_CALIBRATION_SEEDS) {
      const regenerated = regenerate({
        scenarioId,
        seed,
        ticks: PHASE_4_2_MATRIX_TICKS,
      });
      const retained = rawRunProjection(
        artifactRuns[runIndex],
        `calibration run ${runIndex.toString()}`,
      );
      if (!isDeepStrictEqual(regenerated, retained)) {
        throw new Error(
          `Phase 4.2 calibration run ${scenarioId}:${seed.toString()} failed deterministic regeneration.`,
        );
      }
      regeneratedRuns.push(regenerated);
      runIndex += 1;
    }
  }
  const expected = deriveMatrixEvidenceReport({
    corpus: "phase-4.2-calibration",
    seeds: PHASE_4_2_CALIBRATION_SEEDS,
    ticks: PHASE_4_2_MATRIX_TICKS,
    repeatCount: 0,
    runs: regeneratedRuns,
    determinismComparisons: [],
    phase42Definition: definitionEvidence,
  });
  if (
    !isDeepStrictEqual(stripProcessProvenance(report), stripProcessProvenance(expected))
  ) {
    throw new Error(
      "Phase 4.2 calibration derived evidence does not match deterministic recomputation.",
    );
  }
}

/**
 * Production authentication entry point. It verifies bytes, regenerates all
 * 256 nonprotected calibration runs, and has no injectable execution seam.
 */
export function authenticatePhase42CalibrationArtifact(
  artifactPath: string,
  expectedSha256: string,
  expectedStatus: Phase42DefinitionStatus,
): void {
  if (!/^[0-9a-f]{64}$/u.test(expectedSha256)) {
    throw new Error("Phase 4.2 calibration authentication requires a SHA-256.");
  }
  const bytes = readFileSync(artifactPath);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error("Phase 4.2 calibration artifact changed before authentication.");
  }
  let report: Record<string, unknown>;
  try {
    report = recordAt(
      JSON.parse(gunzipSync(bytes).toString("utf8")) as unknown,
      "calibration artifact",
    );
  } catch (error) {
    throw new Error(
      `Phase 4.2 calibration artifact is not valid gzip JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  authenticatePhase42CalibrationMatrixWithRunnerForTest(
    report,
    expectedStatus,
    regeneratePhase42CalibrationRun,
  );
}
