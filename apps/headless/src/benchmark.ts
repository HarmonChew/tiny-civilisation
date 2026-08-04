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
// Phase 2.5 reference: median of three 20-seed x 10,000-tick runs on the
// documented local Windows baseline (47,572.6 / 47,100.3 / 45,191.9).
const REFERENCE_TICKS_PER_SECOND = 47_100;
const REGRESSION_FLOOR_RATIO = 0.55;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class BenchmarkCliError extends Error {}

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
    Math.floor(REFERENCE_TICKS_PER_SECOND * REGRESSION_FLOOR_RATIO),
  );

  const canonicalSeed = SCENARIO_CANONICAL_SEEDS[scenarioId];
  const warmupState = createSimulation(createScenarioReference(scenarioId, canonicalSeed));

  // Warm JIT paths before timing the representative corpus.
  advanceSimulation(warmupState, 2_000);

  const observedCompiledMapHashes = new Set<string>();
  const startedAt = performance.now();
  for (let seed = 1; seed <= seedCount; seed += 1) {
    const state = createSimulation(createScenarioReference(scenarioId, seed));
    observedCompiledMapHashes.add(state.compiledMapHash);
    advanceSimulation(state, ticksPerSeed);
  }
  const elapsedMs = performance.now() - startedAt;
  const totalTicks = seedCount * ticksPerSeed;
  const ticksPerSecond = (totalTicks / elapsedMs) * 1_000;
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
      totalTicks,
    },
    aggregate: scenarioIdentity,
    performance: {
      elapsedMs: Number(elapsedMs.toFixed(3)),
      ticksPerSecond: Number(ticksPerSecond.toFixed(1)),
      referenceTicksPerSecond: REFERENCE_TICKS_PER_SECOND,
      minimumTicksPerSecond,
    },
    passed: ticksPerSecond >= minimumTicksPerSecond,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    console.error(
      `Headless throughput ${result.performance.ticksPerSecond} fell below ${minimumTicksPerSecond} ticks/sec.`,
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
