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
  matrixEvidenceStdoutChunks,
  writeMatrixEvidence,
  type MatrixEvidenceReport,
} from "./matrix-evidence.js";
import {
  analyzeScenarioRuns,
  convergenceDiagnostics,
  evaluateFrozenPairedMacroBands,
  pairedScenarioComparisons,
  type RunHardInvariantReport,
  type RunOutcomeSummary,
} from "./scenario-analysis.js";

const DEFAULT_SEED = 4_182;
const DEFAULT_TICKS = 10_000;
const MAX_SEED = 0xffff_ffff;
const DEFAULT_PROFILE_SEEDS = [4_182, 921, 23] as const;
const MATRIX_CORPUS_NAMES = ["smoke", "nightly", "calibration", "holdout"] as const;
const MAX_RETAINED_MATRIX_RUNS =
  SCENARIO_CATALOG.length * SCENARIO_CALIBRATION_SEEDS.length;

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

type MatrixRunResult = Omit<ProfileRunResult, "performance">;

interface ReportedMatrixRun extends MatrixRunResult {
  readonly outcomeSummary: RunOutcomeSummary;
  readonly hardInvariants: RunHardInvariantReport;
}

interface DeterminismComparison {
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
  readonly firstFinalHash: string;
  readonly repeatFinalHash: string;
  readonly exactMatch: boolean;
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
    "  npm run headless -- matrix [--corpus smoke|nightly|calibration|holdout] [--ticks N] [--output PATH.json.gz]",
    "",
    "Options:",
    `  --scenario ID  Scenario definition (default: ${DEFAULT_SCENARIO_ID}; ${scenarioIds})`,
    `  --seed N       Unsigned 32-bit world seed (default: ${DEFAULT_SEED})`,
    `  --ticks N      Number of ticks to process (default: ${DEFAULT_TICKS})`,
    "  --seeds SPEC   Inclusive range, comma-separated list, or both",
    "  --count N      Run seeds 1 through N when --seeds is omitted",
    "  --corpus NAME   Locked matrix corpus (default: smoke)",
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
  }
}

function matrixCorpusTicks(corpus: MatrixCorpusName): number {
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

  return {
    scenarioId,
    seeds:
      seeds ??
      (count === undefined
        ? [...DEFAULT_PROFILE_SEEDS]
        : Array.from({ length: count }, (_, index) => index + 1)),
    ticks,
  };
}

export function parseMatrixOptions(args: readonly string[]): MatrixOptions {
  let corpus: MatrixCorpusName = "smoke";
  let ticks: number | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--corpus") {
      corpus = parseMatrixCorpus(optionValue(args, index, argument));
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
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

  return {
    corpus,
    seeds: [...matrixCorpusSeeds(corpus)].sort((left, right) => left - right),
    ticks: ticks ?? matrixCorpusTicks(corpus),
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

function round(value: number, decimalPlaces: number): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

export function simulate({ scenarioId, seed, ticks }: RunOptions): RunResult {
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

export function runSimulation(options: RunOptions): object {
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
      elapsedMs: round(elapsedMs, 3),
      ticksPerSecond:
        totalTicks === 0 ? 0 : round((totalTicks * 1_000) / Math.max(elapsedMs, 0.001), 1),
    },
  };
}

export function profileSimulation({
  scenarioId,
  seed,
  ticks,
}: RunOptions): ProfileRunResult {
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

export function runProfile(options: ProfileOptions): object {
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

export function runMatrix(options: MatrixOptions): object {
  const cases = matrixCases(options);
  if (cases.length > MAX_RETAINED_MATRIX_RUNS) {
    throw new CliError(
      `Matrix output retains every primary profile and is bounded to ${MAX_RETAINED_MATRIX_RUNS.toString()} runs.`,
    );
  }
  const runs: MatrixRunResult[] = [];
  const determinismComparisons: DeterminismComparison[] = [];
  const repeatCount = options.corpus === "smoke" ? 1 : 0;

  // Keep only one authoritative simulation and streaming collector alive at a time.
  for (const matrixCase of cases) {
    const { performance: _performance, ...deterministicRun } =
      profileSimulation(matrixCase);
    runs.push(deterministicRun);

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const { performance: _repeatPerformance, ...repeatedRun } =
        profileSimulation(matrixCase);
      determinismComparisons.push({
        scenario: { ...deterministicRun.scenario },
        compiledMapHash: deterministicRun.compiledMapHash,
        firstFinalHash: deterministicRun.finalHash,
        repeatFinalHash: repeatedRun.finalHash,
        exactMatch: JSON.stringify(deterministicRun) === JSON.stringify(repeatedRun),
      });
    }
  }

  const analysisContext = {
    corpus: options.corpus,
    seeds: [...new Set(options.seeds)].sort((left, right) => left - right),
    requestedTicks: options.ticks,
  } as const;
  const byScenario = SCENARIO_CATALOG.map((scenario) => {
    const scenarioRuns = runs.filter(
      (run) => run.scenario.scenarioId === scenario.scenarioId,
    );
    return {
      ...summarizeScenarioIdentity(scenarioRuns),
      activity: summarizeActivityProfiles(scenarioRuns.map((run) => run.profile)),
      analysis: analyzeScenarioRuns(scenarioRuns, analysisContext),
    };
  });
  const scenarioDefinitions = byScenario.map((aggregate) => aggregate.scenario);
  const compiledMapHashes = [
    ...new Set(byScenario.flatMap((aggregate) => aggregate.compiledMapHashes)),
  ].sort();
  const perRunAnalysis = new Map(
    byScenario.flatMap((aggregate) =>
      aggregate.analysis.outcomes.perRun.map((outcomeSummary, index) => {
        const hardInvariants = aggregate.analysis.hardInvariants.perRun[index];
        if (hardInvariants === undefined) {
          throw new Error("Scenario hard-invariant analysis lost run alignment.");
        }
        return [
          `${aggregate.scenario.scenarioId}:${outcomeSummary.seed.toString()}`,
          { outcomeSummary, hardInvariants },
        ] as const;
      }),
    ),
  );
  const reportedRuns: ReportedMatrixRun[] = runs.map((run) => {
    const analysis = perRunAnalysis.get(
      `${run.scenario.scenarioId}:${run.scenario.seed.toString()}`,
    );
    if (analysis === undefined) throw new Error("Scenario analysis lost a matrix run.");
    return { ...run, ...analysis };
  });
  const pairedComparisons = pairedScenarioComparisons(runs);
  const frozenPairedMacroBands = evaluateFrozenPairedMacroBands(
    runs,
    pairedComparisons,
    analysisContext,
  );
  const convergence = convergenceDiagnostics(pairedComparisons);
  const allRepeatComparisonsMatch = determinismComparisons.every(
    (comparison) => comparison.exactMatch,
  );

  return {
    schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
    command: "matrix",
    configuration: {
      corpus: options.corpus,
      scenarios: SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
      scenarioDefinitions,
      compiledMapHashes,
      seeds: [...new Set(options.seeds)].sort((left, right) => left - right),
      ticksPerRun: options.ticks,
      sampleEveryTicks: ACTIVITY_SAMPLE_EVERY_TICKS,
      significantEventTiers: SIGNIFICANT_EVENT_TIERS,
      ordering: "catalog-then-seed",
      repeatCount,
      executionsPerCase: repeatCount + 1,
      maximumRetainedPrimaryRuns: MAX_RETAINED_MATRIX_RUNS,
    },
    runs: reportedRuns,
    aggregate: {
      scenarioDefinitions,
      compiledMapHashes,
      byScenario,
    },
    analysis: {
      interpretation: "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL",
      determinism: {
        repeatCount,
        executionsPerCase: repeatCount + 1,
        comparisonCount: determinismComparisons.length,
        allExactMatches: repeatCount === 0 ? null : allRepeatComparisonsMatch,
        hardInvariant: {
          id: "EXACT_REPEAT_DETERMINISM",
          classification: "HARD_INVARIANT",
          status:
            repeatCount === 0
              ? "NOT_EVALUATED"
              : allRepeatComparisonsMatch
                ? "PASS"
                : "FAIL",
          reason:
            repeatCount === 0
              ? "Only the locked smoke corpus repeats each run internally."
              : null,
        },
        comparisons: determinismComparisons,
      },
      pairedComparisons,
      frozenPairedMacroBands,
      convergence,
      rawProfileRetention: {
        policy: "RETAIN_ALL_PRIMARY_PROFILES",
        retainedRunCount: reportedRuns.length,
        maximumRetainedRunCount: MAX_RETAINED_MATRIX_RUNS,
        repeatProfilesRetained: false,
        repeatProfilesComparedExactlyThenDiscarded: repeatCount > 0,
        bound:
          "Four catalog scenarios times at most 64 locked seeds equals 256 retained primary profiles.",
      },
    },
  } satisfies MatrixEvidenceReport;
}

export function main(args: readonly string[]): void {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const [first, ...rest] = args;
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
    const report = runMatrix(options) as MatrixEvidenceReport;
    if (options.outputPath !== undefined) {
      writeMatrixEvidence(
        report,
        options.outputPath,
        process.env.INIT_CWD ?? process.cwd(),
      );
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
