import type { ScenarioId } from "./types.js";

export const SCENARIO_CANONICAL_SEEDS: Readonly<Record<ScenarioId, number>> = Object.freeze(
  {
    "petri-world": 4_182,
    "split-banks": 7_319,
    "scattered-plenty": 1_203,
    "unequal-table": 921,
  },
);

export const SCENARIO_CALIBRATION_SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, index) => index + 1),
);

export const SCENARIO_HOLDOUT_SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, index) => index + 1_001),
);

export const SCENARIO_PR_SMOKE_SEEDS: readonly number[] = Object.freeze(
  SCENARIO_CALIBRATION_SEEDS.slice(0, 8),
);

export const SCENARIO_NIGHTLY_SEEDS: readonly number[] = Object.freeze(
  SCENARIO_CALIBRATION_SEEDS.slice(0, 32),
);

export const SCENARIO_MEASUREMENT_HORIZONS = Object.freeze({
  smokeTicks: 2_000,
  matrixTicks: 10_000,
  stalemateWindowTicks: 1_000,
});
