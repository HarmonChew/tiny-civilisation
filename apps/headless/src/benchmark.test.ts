import { describe, expect, it } from "vitest";

import {
  BENCHMARK_MEASURED_TRIALS,
  BENCHMARK_WARMUP_TICKS,
  DEFAULT_MINIMUM_TICKS_PER_SECOND,
  parseBenchmarkScenario,
  summarizeBenchmarkTrials,
} from "./benchmark.js";

describe("headless benchmark CLI", () => {
  it("keeps the Petri default and accepts a supported scenario", () => {
    expect(parseBenchmarkScenario([])).toBe("petri-world");
    expect(parseBenchmarkScenario(["--scenario", "split-banks"])).toBe("split-banks");
  });

  it("rejects missing and unsupported scenario values", () => {
    expect(() => parseBenchmarkScenario(["--scenario"])).toThrow(
      "--scenario requires a value.",
    );
    expect(() => parseBenchmarkScenario(["--scenario", "missing-world"])).toThrow(
      /--scenario must be one of/u,
    );
  });

  it("recognises help without running the benchmark", () => {
    expect(parseBenchmarkScenario(["--help"])).toBeNull();
  });

  it("keeps the protected floor and uses one warm-up plus three trials", () => {
    expect(BENCHMARK_WARMUP_TICKS).toBe(2_000);
    expect(BENCHMARK_MEASURED_TRIALS).toBe(3);
    expect(DEFAULT_MINIMUM_TICKS_PER_SECOND).toBe(25_905);
  });

  it("gates on the median measured throughput", () => {
    const summary = summarizeBenchmarkTrials([4_000, 2_000, 1_000], 100_000, 40_000);

    expect(summary.trials.map((trial) => trial.ticksPerSecond)).toEqual([
      25_000, 50_000, 100_000,
    ]);
    expect(summary.medianElapsedMs).toBe(2_000);
    expect(summary.medianTicksPerSecond).toBe(50_000);
    expect(summary.passed).toBe(true);
    expect(summarizeBenchmarkTrials([4_000, 2_000, 1_000], 100_000, 50_001).passed).toBe(
      false,
    );

    const roundedToFloor = summarizeBenchmarkTrials(
      Array.from({ length: 3 }, () => (100_000 * 1_000) / 25_904.96),
      100_000,
      DEFAULT_MINIMUM_TICKS_PER_SECOND,
    );
    expect(roundedToFloor.medianTicksPerSecond).toBe(DEFAULT_MINIMUM_TICKS_PER_SECOND);
    expect(roundedToFloor.passed).toBe(false);
  });

  it("rejects incomplete or invalid trial sets", () => {
    expect(() => summarizeBenchmarkTrials([1_000], 100_000, 25_905)).toThrow(
      "requires three positive measured trials",
    );
    expect(() => summarizeBenchmarkTrials([1_000, 0, 2_000], 100_000, 25_905)).toThrow(
      "requires three positive measured trials",
    );
  });
});
