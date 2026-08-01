import { performance } from "node:perf_hooks";

import {
  advanceSimulation,
  createSimulation,
  formatSimulationTime,
  hashSimulationState,
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

const DEFAULT_SEED = 4_182;
const DEFAULT_TICKS = 10_000;
const MAX_SEED = 0xffff_ffff;
const DEFAULT_PROFILE_SEEDS = [4_182, 921, 23] as const;

interface RunOptions {
  seed: number;
  ticks: number;
}

interface BatchOptions {
  seeds: number[];
  ticks: number;
}

type ProfileOptions = BatchOptions;

interface PerformanceMetrics {
  elapsedMs: number;
  ticksPerSecond: number;
}

interface RunResult {
  seed: number;
  requestedTicks: number;
  metrics: SimulationMetrics;
  performance: PerformanceMetrics;
}

interface ProfileRunResult {
  seed: number;
  requestedTicks: number;
  finalHash: string;
  profile: ActivityProfile;
  performance: PerformanceMetrics;
}

class CliError extends Error {}

function usage(): string {
  return [
    "Tiny Civilisation headless simulator",
    "",
    "Usage:",
    "  npm run headless -- [run] [--seed N] [--ticks N]",
    "  npm run headless -- batch [--seeds 1..100|1,4,8] [--count N] [--ticks N]",
    "  npm run headless -- profile [--seed N|--seeds 4182,921,23|--count N] [--ticks N]",
    "",
    "Options:",
    `  --seed N       Unsigned 32-bit world seed (default: ${DEFAULT_SEED})`,
    `  --ticks N      Number of ticks to process (default: ${DEFAULT_TICKS})`,
    "  --seeds SPEC   Inclusive range, comma-separated list, or both",
    "  --count N      Run seeds 1 through N when --seeds is omitted",
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

function parseRunOptions(args: readonly string[]): RunOptions {
  let seed = DEFAULT_SEED;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--seed") {
      seed = parseInteger(optionValue(args, index, argument), argument, 0, MAX_SEED);
      index++;
    } else if (argument === "--ticks") {
      ticks = parseInteger(optionValue(args, index, argument), argument, 0);
      index++;
    } else {
      throw new CliError(`Unknown run option: ${String(argument)}`);
    }
  }

  return { seed, ticks };
}

function parseBatchOptions(args: readonly string[]): BatchOptions {
  let seeds: number[] | undefined;
  let count: number | undefined;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--seeds") {
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
    seeds: resolvedSeeds,
    ticks,
  };
}

function parseProfileOptions(args: readonly string[]): ProfileOptions {
  let seeds: number[] | undefined;
  let count: number | undefined;
  let ticks = DEFAULT_TICKS;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--seed") {
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
    seeds:
      seeds ??
      (count === undefined
        ? [...DEFAULT_PROFILE_SEEDS]
        : Array.from({ length: count }, (_, index) => index + 1)),
    ticks,
  };
}

function round(value: number, decimalPlaces: number): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function simulate({ seed, ticks }: RunOptions): RunResult {
  const state = createSimulation(seed);

  const startedAt = performance.now();
  if (ticks > 0) {
    advanceSimulation(state, ticks);
  }
  const elapsedMs = performance.now() - startedAt;
  const finalTick = readFinalTick(state);
  const eventCounts = readEventCounts(state);

  return {
    seed,
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

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runBatch(options: BatchOptions): object {
  const startedAt = performance.now();
  const runs = options.seeds.map((seed) => simulate({ seed, ticks: options.ticks }));
  const elapsedMs = performance.now() - startedAt;
  const totalTicks = options.ticks * runs.length;

  return {
    command: "batch",
    configuration: {
      seeds: options.seeds,
      ticksPerRun: options.ticks,
    },
    runs,
    aggregate: {
      runCount: runs.length,
      totalTicks,
      meanPopulation: round(mean(runs.map((run) => run.metrics.population)), 2),
      meanGroups: round(mean(runs.map((run) => run.metrics.groups)), 2),
      sharingEvents: runs.reduce((sum, run) => sum + run.metrics.sharingEvents, 0),
      theftEvents: runs.reduce((sum, run) => sum + run.metrics.theftEvents, 0),
      conflictEvents: runs.reduce((sum, run) => sum + run.metrics.conflictEvents, 0),
      storageEvents: runs.reduce((sum, run) => sum + run.metrics.storageEvents, 0),
      elapsedMs: round(elapsedMs, 3),
      ticksPerSecond:
        totalTicks === 0 ? 0 : round((totalTicks * 1_000) / Math.max(elapsedMs, 0.001), 1),
    },
  };
}

function profileSimulation({ seed, ticks }: RunOptions): ProfileRunResult {
  const state = createSimulation(seed);
  const collector = new StreamingActivityCollector(state);
  const startedAt = performance.now();
  for (let tick = 0; tick < ticks; tick += ACTIVITY_SAMPLE_EVERY_TICKS) {
    advanceSimulation(state, ACTIVITY_SAMPLE_EVERY_TICKS);
    collector.observe(state);
  }
  const elapsedMs = performance.now() - startedAt;

  return {
    seed,
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

function runProfile(options: ProfileOptions): object {
  const runs = options.seeds.map((seed) =>
    profileSimulation({ seed, ticks: options.ticks }),
  );
  return {
    schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
    command: "profile",
    configuration: {
      seeds: options.seeds,
      ticksPerRun: options.ticks,
      sampleEveryTicks: ACTIVITY_SAMPLE_EVERY_TICKS,
      significantEventTiers: SIGNIFICANT_EVENT_TIERS,
    },
    runs,
    aggregate: summarizeActivityProfiles(runs.map((run) => run.profile)),
  };
}

function main(args: readonly string[]): void {
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

  const runArgs = first === undefined || first === "run" ? rest : args;
  const options = parseRunOptions(runArgs);
  process.stdout.write(
    `${JSON.stringify(
      {
        command: "run",
        configuration: options,
        result: simulate(options),
      },
      null,
      2,
    )}\n`,
  );
}

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
