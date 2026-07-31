import { performance } from "node:perf_hooks";
import { advanceSimulation, createSimulation } from "@tiny-civ/sim-core";

const DEFAULT_SEEDS = 20;
const DEFAULT_TICKS = 10_000;
const REFERENCE_TICKS_PER_SECOND = 23_408;
const REGRESSION_FLOOR_RATIO = 0.55;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const seedCount = positiveInteger(process.env.TINY_CIV_BENCHMARK_SEEDS, DEFAULT_SEEDS);
const ticksPerSeed = positiveInteger(process.env.TINY_CIV_BENCHMARK_TICKS, DEFAULT_TICKS);
const minimumTicksPerSecond = positiveInteger(
  process.env.TINY_CIV_MIN_TICKS_PER_SECOND,
  Math.floor(REFERENCE_TICKS_PER_SECOND * REGRESSION_FLOOR_RATIO),
);

// Warm JIT paths before timing the representative corpus.
advanceSimulation(createSimulation(4_182), 2_000);

const startedAt = performance.now();
for (let seed = 1; seed <= seedCount; seed += 1) {
  advanceSimulation(createSimulation(seed), ticksPerSeed);
}
const elapsedMs = performance.now() - startedAt;
const totalTicks = seedCount * ticksPerSeed;
const ticksPerSecond = (totalTicks / elapsedMs) * 1_000;

const result = {
  corpus: {
    seeds: `1..${seedCount}`,
    ticksPerSeed,
    totalTicks,
  },
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
