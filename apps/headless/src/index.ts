import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_SCENARIO_ID,
  SCENARIO_CALIBRATION_SEEDS,
  SCENARIO_CATALOG,
  SCENARIO_HOLDOUT_SEEDS,
  SCENARIO_MEASUREMENT_HORIZONS,
  SCENARIO_NIGHTLY_SEEDS,
  SCENARIO_PR_SMOKE_SEEDS,
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  formatSimulationTime,
  hashSimulationState,
  isScenarioId,
  type ScenarioId,
  type ScenarioReferenceV2,
} from "@tiny-civ/sim-core";

import {
  readEventCounts,
  readFinalTick,
  readGroupCount,
  readPopulation,
  type SimulationMetrics,
} from "./metrics.js";
import {
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  ACTIVITY_SAMPLE_EVERY_TICKS,
  SIGNIFICANT_EVENT_TIERS,
  StreamingActivityCollector,
  summarizeActivityProfiles,
  type ActivityProfile,
} from "./activity-collector.js";
import {
  scenarioDefinitionIdentity,
  summarizeScenarioIdentity,
} from "./scenario-reporting.js";
import {
  MAX_RETAINED_MATRIX_RUNS,
  deriveMatrixEvidenceReport,
  type DeterministicMatrixRun,
  type MatrixDeterminismComparison,
} from "./matrix-report-derivation.js";
import {
  assertMatrixEvidenceTargetsAbsent,
  matrixEvidenceStdoutChunks,
  writeMatrixEvidence,
  type MatrixEvidenceReport,
} from "./matrix-evidence.js";
import {
  PHASE_4_2_BAND_FREEZE_STATUS,
  PHASE_4_2_HOLDOUT_SEEDS,
  PHASE_4_2_HOLDOUT_OUTPUT_PATH,
  PHASE_4_2_HOLDOUT_POLICY,
  PHASE_4_2_HOLDOUT_STATUS,
  PHASE_4_2_MATRIX_TICKS,
  acquirePhase42HoldoutAttempt,
  assertNotReservedPhase42HoldoutCorpus,
  assertPhase42PostFreezeCalibrationExecutionRequest,
  assertPhase42HoldoutExecutionRequest,
  phase42CalibrationOutputPath,
  type Phase42HoldoutExecutionRequest,
} from "./phase-4.2-corpora.js";
import { authenticatePhase42CalibrationArtifact } from "./phase-4.2-calibration-auth.js";
import {
  acquirePhase42HoldoutAfterCalibrationAuthentication,
  runAfterPhase42CalibrationAuthentication,
} from "./phase-4.2-execution-order.js";
import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_2_DEFINITION_FINGERPRINT,
  PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
} from "./phase-4.2-definition-contract.js";
import {
  PHASE_4_3_CALIBRATION_SEEDS,
  PHASE_4_3_AUTOMATED_RELEASE_CHECK_PATH,
  PHASE_4_3_CALIBRATION_FREEZE_REVIEW_PATH,
  PHASE_4_3_CALIBRATION_VERIFICATION_REVIEW_PATH,
  PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH,
  PHASE_4_3_CALIBRATION_VERIFICATION_OUTPUT_PATH,
  PHASE_4_3_DEPLOYMENT_SMOKE_PATH,
  PHASE_4_3_FINAL_NVDA_PATH,
  PHASE_4_3_HOLDOUT_OUTPUT_PATH,
  PHASE_4_3_HOLDOUT_POLICY,
  PHASE_4_3_HOLDOUT_SEEDS,
  PHASE_4_3_HOLDOUT_STATUS,
  PHASE_4_3_MATRIX_TICKS,
  acquirePhase43HoldoutAttempt,
  assertNotReservedPhase43HoldoutCorpus,
  assertPhase43CalibrationExecutionRequest,
  assertPhase43HoldoutExecutionRequest,
  phase43CalibrationOutputPath,
  type Phase43HoldoutExecutionRequest,
} from "./phase-4.3-corpora.js";
import {
  PHASE_4_3_DEFINITION_CONTRACT,
  PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_3_DEFINITION_FINGERPRINT,
  PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
  PHASE_4_3_DEFINITION_STATUS,
} from "./phase-4.3-definition-contract.js";
import {
  authenticatePhase43CalibrationArtifact,
  authenticatePhase43HashedArtifact,
  authenticatePhase43ReleaseEvidenceArtifact,
} from "./phase-4.3-release-auth.js";
import { acquirePhase43HoldoutAfterReleaseAuthentication } from "./phase-4.3-execution-order.js";
import { phase42BandsAreFrozen } from "./scenario-bands.js";

const DEFAULT_SEED = 4_182;
const DEFAULT_TICKS = 10_000;
const MAX_SEED = 0xffff_ffff;
const DEFAULT_PROFILE_SEEDS = [4_182, 921, 23] as const;
const MATRIX_CORPUS_NAMES = [
  "smoke",
  "nightly",
  "calibration",
  "holdout",
  "phase-4.2-calibration",
  "phase-4.2-holdout",
  "phase-4.3-calibration",
  "phase-4.3-holdout",
] as const;
const PHASE_4_2_PROTECTED_EXECUTION = Symbol("phase-4.2-protected-execution");
const PHASE_4_3_PROTECTED_EXECUTION = Symbol("phase-4.3-protected-execution");
type ProtectedExecutionAuthorization =
  typeof PHASE_4_2_PROTECTED_EXECUTION | typeof PHASE_4_3_PROTECTED_EXECUTION;

type MatrixCorpusName = (typeof MATRIX_CORPUS_NAMES)[number];

export interface RunOptions {
  scenarioId: ScenarioId;
  seed: number;
  ticks: number;
}

export interface BatchOptions {
  scenarioId: ScenarioId;
  seeds: number[];
  ticks: number;
}

type ProfileOptions = BatchOptions;

export interface MatrixOptions {
  corpus: MatrixCorpusName;
  seeds: readonly number[];
  ticks: number;
  outputPath?: string;
}

interface PerformanceMetrics {
  elapsedMs: number;
  ticksPerSecond: number;
}

interface RunResult {
  seed: number;
  scenario: ScenarioReferenceV2;
  compiledMapHash: string;
  requestedTicks: number;
  metrics: SimulationMetrics;
  performance: PerformanceMetrics;
}

interface ProfileRunResult {
  seed: number;
  scenario: ScenarioReferenceV2;
  compiledMapHash: string;
  requestedTicks: number;
  finalHash: string;
  profile: ActivityProfile;
  performance: PerformanceMetrics;
}

export class CliError extends Error {}

function usage(): string {
  const scenarioIds = SCENARIO_CATALOG.map((scenario) => scenario.scenarioId).join(", ");
  return [
    "Tiny Civilisation headless simulator",
    "",
    "Usage:",
    "  npm run headless -- [run] [--scenario ID] [--seed N] [--ticks N]",
    "  npm run headless -- batch [--scenario ID] [--seeds 1..100|1,4,8] [--count N] [--ticks N]",
    "  npm run headless -- profile [--scenario ID] [--seed N|--seeds 4182,921,23|--count N] [--ticks N]",
    "  npm run headless -- matrix [--corpus smoke|nightly|calibration|holdout|phase-4.2-calibration|phase-4.2-holdout|phase-4.3-calibration|phase-4.3-holdout] [--ticks N] [--output PATH.json.gz]",
    "  npm run headless -- phase-4.2-definition-contract",
    "  npm run headless -- phase-4.3-definition-contract",
    "  npm run headless -- phase-4.3-definition-fingerprint",
    "  npm run headless -- definition-fingerprint",
    "",
    "Options:",
    `  --scenario ID  Scenario definition (default: ${DEFAULT_SCENARIO_ID}; ${scenarioIds})`,
    `  --seed N       Unsigned 32-bit world seed (default: ${DEFAULT_SEED})`,
    `  --ticks N      Number of ticks to process (default: ${DEFAULT_TICKS})`,
    "  --seeds SPEC   Inclusive range, comma-separated list, or both",
    "  --count N      Run seeds 1 through N when --seeds is omitted",
    "  --corpus NAME   Locked matrix corpus (default: smoke)",
    `                    Phase 4.2 holdout is ${PHASE_4_2_HOLDOUT_STATUS.toLowerCase()} while bands are ${PHASE_4_2_BAND_FREEZE_STATUS.toLowerCase().replace("_", " ")}`,
    `                    Phase 4.3 holdout is ${PHASE_4_3_HOLDOUT_STATUS.toLowerCase()} pending reviewed lifecycle calibration and final NVDA`,
    "  --output PATH   Also write deterministic .json.gz, .sha256, and .md evidence files",
    "  --help, -h     Show this help",
  ].join("\n");
}

function parseInteger(
  raw: string | undefined,
  option: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new CliError(`${option} requires a whole number.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CliError(`${option} must be between ${minimum} and ${maximum}.`);
  }

  return value;
}

function optionValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliError(`${option} requires a value.`);
  }

  return value;
}

function parseScenarioId(raw: string | undefined): ScenarioId {
  if (raw !== undefined && isScenarioId(raw)) return raw;
  throw new CliError(
    `--scenario must be one of: ${SCENARIO_CATALOG.map((scenario) => scenario.scenarioId).join(", ")}.`,
  );
}

function parseMatrixCorpus(raw: string | undefined): MatrixCorpusName {
  if (raw !== undefined && MATRIX_CORPUS_NAMES.some((corpusName) => corpusName === raw)) {
    return raw as MatrixCorpusName;
  }
  throw new CliError(`--corpus must be one of: ${MATRIX_CORPUS_NAMES.join(", ")}.`);
}

function matrixCorpusSeeds(corpus: MatrixCorpusName): readonly number[] {
  switch (corpus) {
    case "smoke":
      return SCENARIO_PR_SMOKE_SEEDS;
    case "nightly":
      return SCENARIO_NIGHTLY_SEEDS;
    case "calibration":
      return SCENARIO_CALIBRATION_SEEDS;
    case "holdout":
      return SCENARIO_HOLDOUT_SEEDS;
    case "phase-4.2-calibration":
      return SCENARIO_CALIBRATION_SEEDS;
    case "phase-4.2-holdout":
      return PHASE_4_2_HOLDOUT_SEEDS;
    case "phase-4.3-calibration":
      return PHASE_4_3_CALIBRATION_SEEDS;
    case "phase-4.3-holdout":
      return PHASE_4_3_HOLDOUT_SEEDS;
  }
}

function matrixCorpusTicks(corpus: MatrixCorpusName): number {
  if (corpus === "phase-4.2-calibration" || corpus === "phase-4.2-holdout") {
    return PHASE_4_2_MATRIX_TICKS;
  }
  if (corpus === "phase-4.3-calibration" || corpus === "phase-4.3-holdout") {
    return PHASE_4_3_MATRIX_TICKS;
  }
  return corpus === "smoke"
    ? SCENARIO_MEASUREMENT_HORIZONS.smokeTicks
    : SCENARIO_MEASUREMENT_HORIZONS.matrixTicks;
}

function parseSeedList(specification: string): number[] {
  const seeds: number[] = [];

  for (const segment of specification.split(",")) {
    const trimmed = segment.trim();
    if (trimmed === "") {
      throw new CliError("--seeds contains an empty segment.");
    }

    const range = /^(\d+)\.\.(\d+)$/.exec(trimmed);
    if (range !== null) {
      const start = parseInteger(range[1], "--seeds", 0, MAX_SEED);
      const end = parseInteger(range[2], "--seeds", 0, MAX_SEED);
      if (end < start) {
        throw new CliError("--seeds ranges must be ascending.");
      }
      if (end - start > 9_999) {
        throw new CliError("--seeds accepts at most 10,000 seeds per range.");
      }

      for (let seed = start; seed <= end; seed++) {
        seeds.push(seed);
      }
      continue;
    }

    seeds.push(parseInteger(trimmed, "--seeds", 0, MAX_SEED));
  }

  return [...new Set(seeds)];
}

export function parseRunOptions(args: readonly string[]): RunOptions {
  let scenarioId: ScenarioId = DEFAULT_SCENARIO_ID;
  let seed = DEFAULT_SEED;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--scenario") {
      scenarioId = parseScenarioId(optionValue(args, index, argument));
      index++;
    } else if (argument === "--seed") {
      seed = parseInteger(optionValue(args, index, argument), argument, 0, MAX_SEED);
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
      index++;
    } else {
      throw new CliError(`Unknown run option: ${String(argument)}`);
    }
  }

  assertGenericCommandDoesNotUseReservedHoldout("run", [seed], ticks);
  return { scenarioId, seed, ticks };
}

export function parseBatchOptions(args: readonly string[]): BatchOptions {
  let scenarioId: ScenarioId = DEFAULT_SCENARIO_ID;
  let seeds: number[] | undefined;
  let count: number | undefined;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--scenario") {
      scenarioId = parseScenarioId(optionValue(args, index, argument));
      index++;
    } else if (argument === "--seeds") {
      seeds = parseSeedList(optionValue(args, index, argument));
      index++;
    } else if (argument === "--count") {
      count = parseInteger(optionValue(args, index, argument), argument, 1, 10_000);
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
      index++;
    } else {
      throw new CliError(`Unknown batch option: ${String(argument)}`);
    }
  }

  if (seeds !== undefined && count !== undefined) {
    throw new CliError("Use either --seeds or --count, not both.");
  }

  const resolvedSeeds =
    seeds ?? Array.from({ length: count ?? 10 }, (_, index) => index + 1);

  assertGenericCommandDoesNotUseReservedHoldout("batch", resolvedSeeds, ticks);

  return {
    scenarioId,
    seeds: resolvedSeeds,
    ticks,
  };
}

export function parseProfileOptions(args: readonly string[]): ProfileOptions {
  let scenarioId: ScenarioId = DEFAULT_SCENARIO_ID;
  let seeds: number[] | undefined;
  let count: number | undefined;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--scenario") {
      scenarioId = parseScenarioId(optionValue(args, index, argument));
      index++;
    } else if (argument === "--seed") {
      if (seeds !== undefined) {
        throw new CliError("Use only one of --seed, --seeds, or --count.");
      }
      seeds = [parseInteger(optionValue(args, index, argument), argument, 0, MAX_SEED)];
      index++;
    } else if (argument === "--seeds") {
      if (seeds !== undefined) {
        throw new CliError("Use only one of --seed, --seeds, or --count.");
      }
      seeds = parseSeedList(optionValue(args, index, argument));
      index++;
    } else if (argument === "--count") {
      count = parseInteger(optionValue(args, index, argument), argument, 1, 10_000);
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
      index++;
    } else {
      throw new CliError(`Unknown profile option: ${String(argument)}`);
    }
  }

  if (seeds !== undefined && count !== undefined) {
    throw new CliError("Use only one of --seed, --seeds, or --count.");
  }

  const resolvedSeeds =
    seeds ??
    (count === undefined
      ? [...DEFAULT_PROFILE_SEEDS]
      : Array.from({ length: count }, (_, index) => index + 1));
  assertGenericCommandDoesNotUseReservedHoldout("profile", resolvedSeeds, ticks);

  return {
    scenarioId,
    seeds: resolvedSeeds,
    ticks,
  };
}

function assertGenericCommandDoesNotUseReservedHoldout(
  command: "run" | "batch" | "profile" | "matrix",
  seeds: readonly number[],
  ticks: number,
): void {
  try {
    assertNotReservedPhase42HoldoutCorpus(command, seeds, ticks);
    assertNotReservedPhase43HoldoutCorpus(command, seeds, ticks);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}

export function parseMatrixOptions(args: readonly string[]): MatrixOptions {
  let corpus: MatrixCorpusName = "smoke";
  let ticks: number | undefined;
  let outputPath: string | undefined;
  let ticksSpecified = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--corpus") {
      corpus = parseMatrixCorpus(optionValue(args, index, argument));
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
      ticksSpecified = true;
      index++;
    } else if (argument === "--output") {
      outputPath = optionValue(args, index, argument);
      if (!outputPath.toLowerCase().endsWith(".json.gz")) {
        throw new CliError("--output must end with .json.gz.");
      }
      index++;
    } else {
      throw new CliError(`Unknown matrix option: ${String(argument)}`);
    }
  }

  const lockedPhaseCorpus =
    corpus === "phase-4.2-calibration" ||
    corpus === "phase-4.2-holdout" ||
    corpus === "phase-4.3-calibration" ||
    corpus === "phase-4.3-holdout";
  if (lockedPhaseCorpus && ticksSpecified) {
    throw new CliError(`${corpus} has a locked 10,000-tick horizon; --ticks is forbidden.`);
  }
  const canonicalOutputPath =
    corpus === "phase-4.2-calibration"
      ? phase42CalibrationOutputPath()
      : corpus === "phase-4.2-holdout"
        ? PHASE_4_2_HOLDOUT_OUTPUT_PATH
        : corpus === "phase-4.3-calibration"
          ? phase43CalibrationOutputPath()
          : corpus === "phase-4.3-holdout"
            ? PHASE_4_3_HOLDOUT_OUTPUT_PATH
            : undefined;
  if (
    canonicalOutputPath !== undefined &&
    outputPath !== undefined &&
    outputPath !== canonicalOutputPath
  ) {
    throw new CliError(`${corpus} output must use canonical path ${canonicalOutputPath}.`);
  }
  const resolvedOutputPath = canonicalOutputPath ?? outputPath;

  return {
    corpus,
    seeds: [...matrixCorpusSeeds(corpus)].sort((left, right) => left - right),
    ticks: ticks ?? matrixCorpusTicks(corpus),
    ...(resolvedOutputPath === undefined ? {} : { outputPath: resolvedOutputPath }),
  };
}

function round(value: number, decimalPlaces: number): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function assertRawExecutionIsAuthorized(
  seed: number,
  ticks: number,
  authorization?: ProtectedExecutionAuthorization,
): void {
  try {
    if (authorization !== PHASE_4_2_PROTECTED_EXECUTION) {
      assertNotReservedPhase42HoldoutCorpus("raw simulation", [seed], ticks);
    }
    if (authorization !== PHASE_4_3_PROTECTED_EXECUTION) {
      assertNotReservedPhase43HoldoutCorpus("raw simulation", [seed], ticks);
    }
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}

function simulateInternal(
  { scenarioId, seed, ticks }: RunOptions,
  authorization?: ProtectedExecutionAuthorization,
): RunResult {
  assertRawExecutionIsAuthorized(seed, ticks, authorization);
  const state = createSimulation(createScenarioReference(scenarioId, seed));

  const startedAt = performance.now();
  if (ticks > 0) {
    advanceSimulation(state, ticks);
  }
  const elapsedMs = performance.now() - startedAt;
  const finalTick = readFinalTick(state);
  const eventCounts = readEventCounts(state);

  return {
    seed,
    scenario: { ...state.scenario },
    compiledMapHash: state.compiledMapHash,
    requestedTicks: ticks,
    metrics: {
      finalTick,
      finalHash: hashSimulationState(state),
      simulationTime: formatSimulationTime(finalTick),
      population: readPopulation(state),
      groups: readGroupCount(state),
      ...eventCounts,
    },
    performance: {
      elapsedMs: round(elapsedMs, 3),
      ticksPerSecond:
        ticks === 0 ? 0 : round((ticks * 1_000) / Math.max(elapsedMs, 0.001), 1),
    },
  };
}

export function simulate(options: RunOptions): RunResult {
  return simulateInternal(options);
}

export function runSimulation(options: RunOptions): object {
  assertGenericCommandDoesNotUseReservedHoldout("run", [options.seed], options.ticks);
  const result = simulate(options);
  return {
    command: "run",
    configuration: {
      ...options,
      scenario: scenarioDefinitionIdentity(result.scenario),
      compiledMapHash: result.compiledMapHash,
    },
    result,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runBatch(options: BatchOptions): object {
  assertGenericCommandDoesNotUseReservedHoldout("batch", options.seeds, options.ticks);
  const startedAt = performance.now();
  const runs = options.seeds.map((seed) =>
    simulate({ scenarioId: options.scenarioId, seed, ticks: options.ticks }),
  );
  const elapsedMs = performance.now() - startedAt;
  const totalTicks = options.ticks * runs.length;
  const scenarioIdentity = summarizeScenarioIdentity(runs);

  return {
    command: "batch",
    configuration: {
      scenarioId: options.scenarioId,
      ...scenarioIdentity,
      seeds: options.seeds,
      ticksPerRun: options.ticks,
    },
    runs,
    aggregate: {
      ...scenarioIdentity,
      runCount: runs.length,
      totalTicks,
      meanPopulation: round(mean(runs.map((run) => run.metrics.population)), 2),
      meanGroups: round(mean(runs.map((run) => run.metrics.groups)), 2),
      sharingEvents: runs.reduce((sum, run) => sum + run.metrics.sharingEvents, 0),
      waterGatheredUnits: runs.reduce(
        (sum, run) => sum + run.metrics.waterGatheredUnits,
        0,
      ),
      waterDrunkUnits: runs.reduce((sum, run) => sum + run.metrics.waterDrunkUnits, 0),
      waterSharedUnits: runs.reduce((sum, run) => sum + run.metrics.waterSharedUnits, 0),
      theftEvents: runs.reduce((sum, run) => sum + run.metrics.theftEvents, 0),
      conflictEvents: runs.reduce((sum, run) => sum + run.metrics.conflictEvents, 0),
      storageEvents: runs.reduce((sum, run) => sum + run.metrics.storageEvents, 0),
      sheltersCompleted: runs.reduce((sum, run) => sum + run.metrics.sheltersCompleted, 0),
      shelteredRests: runs.reduce((sum, run) => sum + run.metrics.shelteredRests, 0),
      outdoorRests: runs.reduce((sum, run) => sum + run.metrics.outdoorRests, 0),
      shelterMaintenanceMaterial: runs.reduce(
        (sum, run) => sum + run.metrics.shelterMaintenanceMaterial,
        0,
      ),
      shelterDeniedClaims: runs.reduce(
        (sum, run) => sum + run.metrics.shelterDeniedClaims,
        0,
      ),
      shelterGuestUses: runs.reduce((sum, run) => sum + run.metrics.shelterGuestUses, 0),
      shelterRelocations: runs.reduce(
        (sum, run) => sum + run.metrics.shelterRelocations,
        0,
      ),
      elapsedMs: round(elapsedMs, 3),
      ticksPerSecond:
        totalTicks === 0 ? 0 : round((totalTicks * 1_000) / Math.max(elapsedMs, 0.001), 1),
    },
  };
}

function profileSimulationInternal(
  { scenarioId, seed, ticks }: RunOptions,
  authorization?: ProtectedExecutionAuthorization,
): ProfileRunResult {
  assertRawExecutionIsAuthorized(seed, ticks, authorization);
  const state = createSimulation(createScenarioReference(scenarioId, seed));
  const collector = new StreamingActivityCollector(state);
  const startedAt = performance.now();
  for (let tick = 0; tick < ticks; tick += ACTIVITY_SAMPLE_EVERY_TICKS) {
    advanceSimulation(state, ACTIVITY_SAMPLE_EVERY_TICKS);
    collector.observe(state);
  }
  const elapsedMs = performance.now() - startedAt;

  return {
    seed,
    scenario: { ...state.scenario },
    compiledMapHash: state.compiledMapHash,
    requestedTicks: ticks,
    finalHash: hashSimulationState(state),
    profile: collector.report(),
    performance: {
      elapsedMs: round(elapsedMs, 3),
      ticksPerSecond:
        ticks === 0 ? 0 : round((ticks * 1_000) / Math.max(elapsedMs, 0.001), 1),
    },
  };
}

export function profileSimulation(options: RunOptions): ProfileRunResult {
  return profileSimulationInternal(options);
}

export function runProfile(options: ProfileOptions): object {
  assertGenericCommandDoesNotUseReservedHoldout("profile", options.seeds, options.ticks);
  const runs = options.seeds.map((seed) =>
    profileSimulation({ scenarioId: options.scenarioId, seed, ticks: options.ticks }),
  );
  const scenarioIdentity = summarizeScenarioIdentity(runs);
  return {
    schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
    command: "profile",
    configuration: {
      scenarioId: options.scenarioId,
      ...scenarioIdentity,
      seeds: options.seeds,
      ticksPerRun: options.ticks,
      sampleEveryTicks: ACTIVITY_SAMPLE_EVERY_TICKS,
      significantEventTiers: SIGNIFICANT_EVENT_TIERS,
    },
    runs,
    aggregate: {
      ...scenarioIdentity,
      ...summarizeActivityProfiles(runs.map((run) => run.profile)),
    },
  };
}

export function matrixCases(options: MatrixOptions): RunOptions[] {
  const seeds = [...new Set(options.seeds)].sort((left, right) => left - right);
  return SCENARIO_CATALOG.flatMap((scenario) =>
    seeds.map((seed) => ({
      scenarioId: scenario.scenarioId,
      seed,
      ticks: options.ticks,
    })),
  );
}

function phase42HoldoutRequest(options: MatrixOptions): Phase42HoldoutExecutionRequest {
  return {
    scenarios: SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
    seeds: options.seeds,
    ticks: options.ticks,
    outputPath: options.outputPath,
    frozenDefinitionsReady: phase42BandsAreFrozen(PHASE_4_2_DEFINITION_FINGERPRINT),
    definitionFingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
  };
}

function assertProtectedHoldoutRequest(
  options: MatrixOptions,
  invocationDirectory: string,
): Phase42HoldoutExecutionRequest {
  const request = phase42HoldoutRequest(options);
  try {
    assertPhase42HoldoutExecutionRequest(request, invocationDirectory);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
  return request;
}

function phase43DefinitionsAreFrozen(): boolean {
  return (
    (PHASE_4_3_DEFINITION_STATUS as string) === "FROZEN" &&
    PHASE_4_3_HOLDOUT_POLICY.frozenDefinitionFingerprint ===
      PHASE_4_3_DEFINITION_FINGERPRINT
  );
}

function phase43HoldoutRequest(options: MatrixOptions): Phase43HoldoutExecutionRequest {
  return {
    scenarios: SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
    seeds: options.seeds,
    ticks: options.ticks,
    outputPath: options.outputPath,
    frozenDefinitionsReady: phase43DefinitionsAreFrozen(),
    definitionFingerprint: PHASE_4_3_DEFINITION_FINGERPRINT,
  };
}

function assertProtectedPhase43HoldoutRequest(
  options: MatrixOptions,
  invocationDirectory: string,
): Phase43HoldoutExecutionRequest {
  const request = phase43HoldoutRequest(options);
  try {
    assertPhase43HoldoutExecutionRequest(request, invocationDirectory);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
  return request;
}

function executeMatrix(
  options: MatrixOptions,
  invocationDirectory = process.cwd(),
  authorization?: ProtectedExecutionAuthorization,
): object {
  let authenticateDiscoveryBeforeExecution = false;
  if (options.corpus === "phase-4.2-holdout") {
    if (authorization !== PHASE_4_2_PROTECTED_EXECUTION) {
      throw new CliError(
        "Phase 4.2 holdout execution must be bound to the protected evidence writer.",
      );
    }
  } else if (options.corpus === "phase-4.3-holdout") {
    if (authorization !== PHASE_4_3_PROTECTED_EXECUTION) {
      throw new CliError(
        "Phase 4.3 holdout execution must be bound to the protected evidence writer.",
      );
    }
    assertProtectedPhase43HoldoutRequest(options, invocationDirectory);
  } else if (options.corpus === "phase-4.2-calibration") {
    const expectedOutputPath = phase42CalibrationOutputPath();
    if (
      PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN" &&
      !phase42BandsAreFrozen(PHASE_4_2_DEFINITION_FINGERPRINT)
    ) {
      throw new CliError(
        "Phase 4.2 post-freeze calibration is forbidden because the runtime definition fingerprint does not match the reviewed frozen policy.",
      );
    }
    if (PHASE_4_2_BAND_FREEZE_STATUS === "FROZEN") {
      try {
        assertPhase42PostFreezeCalibrationExecutionRequest(
          PHASE_4_2_DEFINITION_FINGERPRINT,
          invocationDirectory,
        );
      } catch (error) {
        throw new CliError(error instanceof Error ? error.message : String(error));
      }
      authenticateDiscoveryBeforeExecution = true;
    }
    const seedsMatch =
      options.seeds.length === SCENARIO_CALIBRATION_SEEDS.length &&
      options.seeds.every((seed, index) => seed === SCENARIO_CALIBRATION_SEEDS[index]);
    if (
      options.ticks !== PHASE_4_2_MATRIX_TICKS ||
      !seedsMatch ||
      options.outputPath !== expectedOutputPath
    ) {
      throw new CliError(
        `phase-4.2-calibration requires exactly four catalog scenarios, seeds 1..64, 10,000 ticks, and canonical output ${expectedOutputPath}.`,
      );
    }
    try {
      assertMatrixEvidenceTargetsAbsent(expectedOutputPath, invocationDirectory);
    } catch (error) {
      throw new CliError(error instanceof Error ? error.message : String(error));
    }
  } else if (options.corpus === "phase-4.3-calibration") {
    const expectedOutputPath = phase43CalibrationOutputPath();
    try {
      assertPhase43CalibrationExecutionRequest(
        {
          scenarios: SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
          seeds: options.seeds,
          ticks: options.ticks,
          outputPath: options.outputPath,
        },
        invocationDirectory,
      );
      assertMatrixEvidenceTargetsAbsent(expectedOutputPath, invocationDirectory);
    } catch (error) {
      throw new CliError(error instanceof Error ? error.message : String(error));
    }
  } else {
    assertGenericCommandDoesNotUseReservedHoldout("matrix", options.seeds, options.ticks);
  }
  const cases = matrixCases(options);
  if (cases.length > MAX_RETAINED_MATRIX_RUNS) {
    throw new CliError(
      `Matrix output retains every primary profile and is bounded to ${MAX_RETAINED_MATRIX_RUNS.toString()} runs.`,
    );
  }
  const repeatCount = options.corpus === "smoke" ? 1 : 0;
  const collectMatrixRuns = (): {
    readonly runs: DeterministicMatrixRun[];
    readonly determinismComparisons: MatrixDeterminismComparison[];
  } => {
    const runs: DeterministicMatrixRun[] = [];
    const determinismComparisons: MatrixDeterminismComparison[] = [];
    // Keep only one authoritative simulation and streaming collector alive at a time.
    for (const matrixCase of cases) {
      const { performance: _performance, ...deterministicRun } = profileSimulationInternal(
        matrixCase,
        authorization,
      );
      runs.push(deterministicRun);

      for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        const { performance: _repeatPerformance, ...repeatedRun } =
          profileSimulationInternal(matrixCase, authorization);
        determinismComparisons.push({
          scenario: { ...deterministicRun.scenario },
          compiledMapHash: deterministicRun.compiledMapHash,
          firstFinalHash: deterministicRun.finalHash,
          repeatFinalHash: repeatedRun.finalHash,
          exactMatch: JSON.stringify(deterministicRun) === JSON.stringify(repeatedRun),
        });
      }
    }
    return { runs, determinismComparisons };
  };
  const authenticateDiscovery = (): void => {
    const discoverySha256 = PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifactSha256;
    if (discoverySha256 === null) {
      throw new Error(
        "Phase 4.2 post-freeze calibration requires a reviewed discovery SHA-256.",
      );
    }
    authenticatePhase42CalibrationArtifact(
      resolve(invocationDirectory, PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifact),
      discoverySha256,
      "CANDIDATE",
    );
  };
  let collected;
  try {
    collected = authenticateDiscoveryBeforeExecution
      ? runAfterPhase42CalibrationAuthentication(authenticateDiscovery, collectMatrixRuns)
      : collectMatrixRuns();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
  const { runs, determinismComparisons } = collected;

  const phase42Definition =
    options.corpus === "phase-4.2-calibration" || options.corpus === "phase-4.2-holdout"
      ? {
          contractSchemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
          fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
          status: phase42BandsAreFrozen(PHASE_4_2_DEFINITION_FINGERPRINT)
            ? ("FROZEN" as const)
            : ("CANDIDATE" as const),
          fingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
          contract: PHASE_4_2_DEFINITION_CONTRACT,
        }
      : undefined;
  const phase43Definition =
    options.corpus === "phase-4.3-calibration" || options.corpus === "phase-4.3-holdout"
      ? {
          contractSchemaVersion: PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
          fingerprintAlgorithm: PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
          status: PHASE_4_3_DEFINITION_STATUS,
          fingerprint: PHASE_4_3_DEFINITION_FINGERPRINT,
          contract: PHASE_4_3_DEFINITION_CONTRACT,
        }
      : undefined;
  return deriveMatrixEvidenceReport({
    corpus: options.corpus,
    seeds: options.seeds,
    ticks: options.ticks,
    repeatCount,
    runs,
    determinismComparisons,
    ...(phase42Definition === undefined ? {} : { phase42Definition }),
    ...(phase43Definition === undefined ? {} : { phase43Definition }),
  });
}

export function runMatrix(
  options: MatrixOptions,
  invocationDirectory = process.cwd(),
): object {
  if (options.corpus === "phase-4.2-holdout" || options.corpus === "phase-4.3-holdout") {
    if (options.corpus === "phase-4.2-holdout") {
      assertProtectedHoldoutRequest(options, invocationDirectory);
    } else {
      assertProtectedPhase43HoldoutRequest(options, invocationDirectory);
    }
    throw new CliError(
      `Imported runMatrix cannot execute the ${options.corpus === "phase-4.2-holdout" ? "Phase 4.2" : "Phase 4.3"} holdout without its protected evidence writer.`,
    );
  }
  return executeMatrix(options, invocationDirectory);
}

function runProtectedHoldoutAndWrite(
  options: MatrixOptions,
  invocationDirectory: string,
): MatrixEvidenceReport {
  const request = assertProtectedHoldoutRequest(options, invocationDirectory);
  try {
    const discoverySha256 = PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifactSha256;
    const verificationSha256 =
      PHASE_4_2_HOLDOUT_POLICY.provenance.verificationArtifactSha256;
    if (discoverySha256 === null || verificationSha256 === null) {
      throw new Error(
        "Phase 4.2 holdout authentication requires reviewed discovery and verification SHA-256 values.",
      );
    }
    acquirePhase42HoldoutAfterCalibrationAuthentication(
      () =>
        authenticatePhase42CalibrationArtifact(
          resolve(
            invocationDirectory,
            PHASE_4_2_HOLDOUT_POLICY.provenance.discoveryArtifact,
          ),
          discoverySha256,
          "CANDIDATE",
        ),
      () =>
        authenticatePhase42CalibrationArtifact(
          resolve(
            invocationDirectory,
            PHASE_4_2_HOLDOUT_POLICY.provenance.verificationArtifact,
          ),
          verificationSha256,
          "FROZEN",
        ),
      () => acquirePhase42HoldoutAttempt(request, invocationDirectory),
    );
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
  const report = executeMatrix(
    options,
    invocationDirectory,
    PHASE_4_2_PROTECTED_EXECUTION,
  ) as MatrixEvidenceReport;
  writeMatrixEvidence(report, PHASE_4_2_HOLDOUT_OUTPUT_PATH, invocationDirectory);
  return report;
}

function requiredPhase43Provenance(value: string | null, label: string): string {
  if (value === null) {
    throw new Error(`Phase 4.3 holdout authentication requires ${label}.`);
  }
  return value;
}

function runProtectedPhase43HoldoutAndWrite(
  options: MatrixOptions,
  invocationDirectory: string,
): MatrixEvidenceReport {
  const request = assertProtectedPhase43HoldoutRequest(options, invocationDirectory);
  try {
    const provenance = PHASE_4_3_HOLDOUT_POLICY.provenance;
    const frozenFingerprint = requiredPhase43Provenance(
      PHASE_4_3_HOLDOUT_POLICY.frozenDefinitionFingerprint,
      "a frozen definition fingerprint",
    );
    const releaseCandidateCommit = requiredPhase43Provenance(
      provenance.releaseCandidateCommit,
      "a release-candidate commit",
    );
    let packageSha256: string | undefined;
    acquirePhase43HoldoutAfterReleaseAuthentication(
      () => {
        authenticatePhase43CalibrationArtifact(
          resolve(invocationDirectory, PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH),
          requiredPhase43Provenance(
            provenance.discoveryArtifactSha256,
            "a discovery artifact SHA-256",
          ),
          "CANDIDATE",
          null,
        );
        authenticatePhase43HashedArtifact(
          resolve(invocationDirectory, PHASE_4_3_CALIBRATION_FREEZE_REVIEW_PATH),
          requiredPhase43Provenance(
            provenance.freezeReviewArtifactSha256,
            "a freeze-review artifact SHA-256",
          ),
          "freeze review artifact",
        );
      },
      () => {
        authenticatePhase43CalibrationArtifact(
          resolve(invocationDirectory, PHASE_4_3_CALIBRATION_VERIFICATION_OUTPUT_PATH),
          requiredPhase43Provenance(
            provenance.verificationArtifactSha256,
            "a verification artifact SHA-256",
          ),
          "FROZEN",
          frozenFingerprint,
        );
        authenticatePhase43HashedArtifact(
          resolve(invocationDirectory, PHASE_4_3_CALIBRATION_VERIFICATION_REVIEW_PATH),
          requiredPhase43Provenance(
            provenance.verificationReviewArtifactSha256,
            "a verification-review artifact SHA-256",
          ),
          "verification review artifact",
        );
      },
      () => {
        packageSha256 = authenticatePhase43ReleaseEvidenceArtifact(
          resolve(invocationDirectory, PHASE_4_3_AUTOMATED_RELEASE_CHECK_PATH),
          requiredPhase43Provenance(
            provenance.automatedReleaseCheckArtifactSha256,
            "an automated release-check artifact SHA-256",
          ),
          "tiny-civilisation/phase-4.3-automated-release-check",
          releaseCandidateCommit,
          frozenFingerprint,
        ).packageSha256;
      },
      () => {
        authenticatePhase43ReleaseEvidenceArtifact(
          resolve(invocationDirectory, PHASE_4_3_DEPLOYMENT_SMOKE_PATH),
          requiredPhase43Provenance(
            provenance.deploymentSmokeArtifactSha256,
            "a deployment-smoke artifact SHA-256",
          ),
          "tiny-civilisation/phase-4.3-deployment-smoke",
          releaseCandidateCommit,
          frozenFingerprint,
          packageSha256,
        );
      },
      () => {
        authenticatePhase43ReleaseEvidenceArtifact(
          resolve(invocationDirectory, PHASE_4_3_FINAL_NVDA_PATH),
          requiredPhase43Provenance(
            provenance.finalNvdaArtifactSha256,
            "a final-NVDA artifact SHA-256",
          ),
          "tiny-civilisation/phase-4.3-final-nvda",
          releaseCandidateCommit,
          frozenFingerprint,
          packageSha256,
        );
      },
      () => acquirePhase43HoldoutAttempt(request, invocationDirectory),
    );
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
  const report = executeMatrix(
    options,
    invocationDirectory,
    PHASE_4_3_PROTECTED_EXECUTION,
  ) as MatrixEvidenceReport;
  writeMatrixEvidence(report, PHASE_4_3_HOLDOUT_OUTPUT_PATH, invocationDirectory);
  return report;
}

export function main(args: readonly string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const [first, ...rest] = args;
  if (first === "phase-4.2-definition-contract") {
    if (rest.length > 0) {
      throw new CliError("phase-4.2-definition-contract accepts no options.");
    }
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
        fingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
        contract: PHASE_4_2_DEFINITION_CONTRACT,
      })}\n`,
    );
    return;
  }
  if (first === "phase-4.3-definition-contract") {
    if (rest.length > 0) {
      throw new CliError("phase-4.3-definition-contract accepts no options.");
    }
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
        status: PHASE_4_3_DEFINITION_STATUS,
        fingerprint: PHASE_4_3_DEFINITION_FINGERPRINT,
        contract: PHASE_4_3_DEFINITION_CONTRACT,
      })}\n`,
    );
    return;
  }
  if (first === "phase-4.3-definition-fingerprint") {
    if (rest.length > 0) {
      throw new CliError("phase-4.3-definition-fingerprint accepts no options.");
    }
    process.stdout.write(`${PHASE_4_3_DEFINITION_FINGERPRINT}\n`);
    return;
  }
  if (first === "definition-fingerprint") {
    if (rest.length > 0) {
      throw new CliError("definition-fingerprint accepts no options.");
    }
    process.stdout.write(`${PHASE_4_2_DEFINITION_FINGERPRINT}\n`);
    return;
  }
  if (first === "batch") {
    process.stdout.write(`${JSON.stringify(runBatch(parseBatchOptions(rest)), null, 2)}\n`);
    return;
  }
  if (first === "profile") {
    process.stdout.write(
      `${JSON.stringify(runProfile(parseProfileOptions(rest)), null, 2)}\n`,
    );
    return;
  }
  if (first === "matrix") {
    const options = parseMatrixOptions(rest);
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    const report =
      options.corpus === "phase-4.2-holdout"
        ? runProtectedHoldoutAndWrite(options, invocationDirectory)
        : options.corpus === "phase-4.3-holdout"
          ? runProtectedPhase43HoldoutAndWrite(options, invocationDirectory)
          : (runMatrix(options, invocationDirectory) as MatrixEvidenceReport);
    if (
      options.corpus !== "phase-4.2-holdout" &&
      options.corpus !== "phase-4.3-holdout" &&
      options.outputPath !== undefined
    ) {
      writeMatrixEvidence(report, options.outputPath, invocationDirectory);
    }
    for (const chunk of matrixEvidenceStdoutChunks(report)) process.stdout.write(chunk);
    return;
  }

  const runArgs = first === undefined || first === "run" ? rest : args;
  const options = parseRunOptions(runArgs);
  process.stdout.write(`${JSON.stringify(runSimulation(options), null, 2)}\n`);
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined && pathToFileURL(resolve(entryPath)).href === import.meta.url
  );
}

if (isMainModule()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`Error: ${error.message}\n\n${usage()}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
