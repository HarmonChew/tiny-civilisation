import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_SCENARIO_ID,
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_CATALOG,
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  isScenarioId,
  type ScenarioId,
} from "@tiny-civ/sim-core";

import { summarizeScenarioIdentity } from "./scenario-reporting.js";

const DEFAULT_SEEDS = 20;
const DEFAULT_TICKS = 10_000;
export const BENCHMARK_WARMUP_TICKS = 2_000;
export const BENCHMARK_MEASURED_TRIALS = 3;
// Phase 2.5 reference: median of three 20-seed x 10,000-tick runs on the
// documented local Windows baseline (47,572.6 / 47,100.3 / 45,191.9).
const REFERENCE_TICKS_PER_SECOND = 47_100;
const REGRESSION_FLOOR_RATIO = 0.55;
export const DEFAULT_MINIMUM_TICKS_PER_SECOND = Math.floor(
  REFERENCE_TICKS_PER_SECOND * REGRESSION_FLOOR_RATIO,
);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class BenchmarkCliError extends Error {}

export interface BenchmarkTrialMeasurement {
  readonly elapsedMs: number;
  readonly ticksPerSecond: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Benchmark median requires finite measurements.");
  }
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) throw new Error("Benchmark median has no middle value.");
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  if (lower === undefined) throw new Error("Benchmark median has no lower value.");
  return (lower + upper) / 2;
}

export function summarizeBenchmarkTrials(
  elapsedMilliseconds: readonly number[],
  ticksPerTrial: number,
  minimumTicksPerSecond: number,
): {
  readonly trials: readonly BenchmarkTrialMeasurement[];
  readonly medianElapsedMs: number;
  readonly medianTicksPerSecond: number;
  readonly passed: boolean;
} {
  if (
    elapsedMilliseconds.length !== BENCHMARK_MEASURED_TRIALS ||
    elapsedMilliseconds.some(
      (elapsedMs) => !Number.isFinite(elapsedMs) || elapsedMs <= 0,
    ) ||
    !Number.isSafeInteger(ticksPerTrial) ||
    ticksPerTrial <= 0 ||
    !Number.isFinite(minimumTicksPerSecond) ||
    minimumTicksPerSecond <= 0
  ) {
    throw new Error("Benchmark summary requires three positive measured trials.");
  }
  const rawTicksPerSecond = elapsedMilliseconds.map(
    (elapsedMs) => (ticksPerTrial / elapsedMs) * 1_000,
  );
  const trials = elapsedMilliseconds.map((elapsedMs, index) => ({
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ticksPerSecond: Number(rawTicksPerSecond[index]?.toFixed(1)),
  }));
  const medianElapsedMs = Number(median(elapsedMilliseconds).toFixed(3));
  const rawMedianTicksPerSecond = median(rawTicksPerSecond);
  const medianTicksPerSecond = Number(rawMedianTicksPerSecond.toFixed(1));
  return {
    trials,
    medianElapsedMs,
    medianTicksPerSecond,
    passed: rawMedianTicksPerSecond >= minimumTicksPerSecond,
  };
}

function usage(): string {
  return [
    "Tiny Civilisation headless benchmark",
    "",
    "Usage:",
    "  npm run benchmark -- [--scenario ID]",
    "",
    `Scenario IDs: ${SCENARIO_CATALOG.map((scenario) => scenario.scenarioId).join(", ")}`,
  ].join("\n");
}

export function parseBenchmarkScenario(args: readonly string[]): ScenarioId | null {
  let scenarioId: ScenarioId = DEFAULT_SCENARIO_ID;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return null;
    if (argument !== "--scenario") {
      throw new BenchmarkCliError(`Unknown benchmark option: ${String(argument)}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new BenchmarkCliError("--scenario requires a value.");
    }
    if (!isScenarioId(value)) {
      throw new BenchmarkCliError(
        `--scenario must be one of: ${SCENARIO_CATALOG.map((scenario) => scenario.scenarioId).join(", ")}.`,
      );
    }
    scenarioId = value;
    index++;
  }
  return scenarioId;
}

export function main(args: readonly string[]): void {
  const scenarioId = parseBenchmarkScenario(args);
  if (scenarioId === null) {
    console.log(usage());
    return;
  }

  const seedCount = positiveInteger(process.env.TINY_CIV_BENCHMARK_SEEDS, DEFAULT_SEEDS);
  const ticksPerSeed = positiveInteger(process.env.TINY_CIV_BENCHMARK_TICKS, DEFAULT_TICKS);
  const minimumTicksPerSecond = positiveInteger(
    process.env.TINY_CIV_MIN_TICKS_PER_SECOND,
    DEFAULT_MINIMUM_TICKS_PER_SECOND,
  );

  const canonicalSeed = SCENARIO_CANONICAL_SEEDS[scenarioId];
  const warmupState = createSimulation(createScenarioReference(scenarioId, canonicalSeed));

  // Warm JIT paths before timing the representative corpus.
  advanceSimulation(warmupState, BENCHMARK_WARMUP_TICKS);

  const observedCompiledMapHashes = new Set<string>();
  const elapsedMilliseconds: number[] = [];
  for (let trial = 0; trial < BENCHMARK_MEASURED_TRIALS; trial += 1) {
    const startedAt = performance.now();
    for (let seed = 1; seed <= seedCount; seed += 1) {
      const state = createSimulation(createScenarioReference(scenarioId, seed));
      observedCompiledMapHashes.add(state.compiledMapHash);
      advanceSimulation(state, ticksPerSeed);
    }
    elapsedMilliseconds.push(performance.now() - startedAt);
  }
  const ticksPerTrial = seedCount * ticksPerSeed;
  const performanceSummary = summarizeBenchmarkTrials(
    elapsedMilliseconds,
    ticksPerTrial,
    minimumTicksPerSecond,
  );
  const compiledMapHashes = [...observedCompiledMapHashes].sort();
  const scenarioIdentity = summarizeScenarioIdentity(
    compiledMapHashes.map((compiledMapHash) => ({
      scenario: warmupState.scenario,
      compiledMapHash,
    })),
  );

  const result = {
    corpus: {
      ...scenarioIdentity,
      compiledMapHash: warmupState.compiledMapHash,
      seeds: `1..${seedCount}`,
      ticksPerSeed,
      totalTicks: ticksPerTrial,
      ticksPerTrial,
      measuredTrials: BENCHMARK_MEASURED_TRIALS,
      measuredTotalTicks: ticksPerTrial * BENCHMARK_MEASURED_TRIALS,
    },
    aggregate: scenarioIdentity,
    performance: {
      warmupTicks: BENCHMARK_WARMUP_TICKS,
      trials: performanceSummary.trials,
      elapsedMs: performanceSummary.medianElapsedMs,
      medianElapsedMs: performanceSummary.medianElapsedMs,
      ticksPerSecond: performanceSummary.medianTicksPerSecond,
      referenceTicksPerSecond: REFERENCE_TICKS_PER_SECOND,
      minimumTicksPerSecond,
    },
    passed: performanceSummary.passed,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    console.error(
      `Median headless throughput ${result.performance.ticksPerSecond} fell below ${minimumTicksPerSecond} ticks/sec.`,
    );
    process.exitCode = 1;
  }
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
    if (error instanceof BenchmarkCliError) {
      console.error(`Error: ${error.message}\n\n${usage()}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
