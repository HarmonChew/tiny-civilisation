import { describe, expect, it } from "vitest";

import { SCENARIO_CATALOG, createScenarioReference } from "@tiny-civ/sim-core";

import {
  matrixCases,
  parseBatchOptions,
  parseMatrixOptions,
  parseProfileOptions,
  parseRunOptions,
  runBatch,
  runMatrix,
  runProfile,
  runSimulation,
  simulate,
} from "./index.js";
import { scenarioDefinitionIdentity } from "./scenario-reporting.js";

describe("headless scenario CLI", () => {
  it("preserves the Petri defaults and validates scenario IDs", () => {
    expect(parseRunOptions([])).toEqual({
      scenarioId: "petri-world",
      seed: 4_182,
      ticks: 10_000,
    });
    expect(
      parseRunOptions(["--scenario", "split-banks", "--seed", "17", "--ticks", "25"]),
    ).toEqual({ scenarioId: "split-banks", seed: 17, ticks: 25 });
    expect(() => parseRunOptions(["--scenario", "missing-world"])).toThrow(
      /--scenario must be one of/u,
    );
  });

  it("accepts scenarios without changing existing batch and profile seed syntax", () => {
    expect(
      parseBatchOptions([
        "--scenario",
        "scattered-plenty",
        "--seeds",
        "3,1..2,3",
        "--ticks",
        "0",
      ]),
    ).toEqual({
      scenarioId: "scattered-plenty",
      seeds: [3, 1, 2],
      ticks: 0,
    });
    expect(
      parseProfileOptions(["--scenario", "unequal-table", "--seed", "9", "--ticks", "0"]),
    ).toEqual({ scenarioId: "unequal-table", seeds: [9], ticks: 0 });
  });

  it("reports the full authoritative identity and compiled map hash", () => {
    const result = simulate({ scenarioId: "split-banks", seed: 17, ticks: 0 });
    const scenario = createScenarioReference("split-banks", 17);
    const scenarioDefinition = scenarioDefinitionIdentity(scenario);

    expect(result.scenario).toEqual(scenario);
    expect(result.compiledMapHash).toMatch(/^[0-9a-f]{16}$/u);

    const single = runSimulation({
      scenarioId: "split-banks",
      seed: 17,
      ticks: 0,
    }) as {
      configuration: {
        scenario: unknown;
        compiledMapHash: string;
      };
    };
    expect(single.configuration).toMatchObject({
      scenario: scenarioDefinition,
      compiledMapHash: result.compiledMapHash,
    });

    const batch = runBatch({
      scenarioId: "scattered-plenty",
      seeds: [2],
      ticks: 0,
    }) as {
      configuration: { scenario: unknown; compiledMapHashes: string[] };
      runs: Array<{ scenario: unknown; compiledMapHash: string }>;
      aggregate: { scenario: unknown; compiledMapHashes: string[] };
    };
    const batchScenario = scenarioDefinitionIdentity(
      createScenarioReference("scattered-plenty", 2),
    );
    expect(batch.runs[0]).toMatchObject({
      scenario: createScenarioReference("scattered-plenty", 2),
      compiledMapHash: expect.stringMatching(/^[0-9a-f]{16}$/u),
    });
    expect(batch.configuration).toMatchObject({
      scenario: batchScenario,
      compiledMapHashes: [batch.runs[0]?.compiledMapHash],
    });
    expect(batch.aggregate).toMatchObject({
      scenario: batchScenario,
      compiledMapHashes: [batch.runs[0]?.compiledMapHash],
    });

    const profile = runProfile({
      scenarioId: "unequal-table",
      seeds: [3],
      ticks: 0,
    }) as {
      configuration: { scenario: unknown; compiledMapHashes: string[] };
      runs: Array<{ scenario: unknown; compiledMapHash: string }>;
      aggregate: { scenario: unknown; compiledMapHashes: string[] };
    };
    const profileScenario = scenarioDefinitionIdentity(
      createScenarioReference("unequal-table", 3),
    );
    expect(profile.runs[0]).toMatchObject({
      scenario: createScenarioReference("unequal-table", 3),
      compiledMapHash: expect.stringMatching(/^[0-9a-f]{16}$/u),
    });
    expect(profile.configuration).toMatchObject({
      scenario: profileScenario,
      compiledMapHashes: [profile.runs[0]?.compiledMapHash],
    });
    expect(profile.aggregate).toMatchObject({
      scenario: profileScenario,
      compiledMapHashes: [profile.runs[0]?.compiledMapHash],
    });
  });

  it.each([
    ["smoke", 8, 2_000, 1],
    ["nightly", 32, 10_000, 1],
    ["calibration", 64, 10_000, 1],
    ["holdout", 64, 10_000, 1_001],
  ] as const)("resolves the locked %s corpus", (corpus, seedCount, ticks, firstSeed) => {
    const options = parseMatrixOptions(["--corpus", corpus]);
    expect(options).toMatchObject({ corpus, ticks });
    expect(options.seeds).toHaveLength(seedCount);
    expect(options.seeds[0]).toBe(firstSeed);
  });

  it("orders matrix cases by catalog and then numeric seed", () => {
    const cases = matrixCases({ corpus: "smoke", seeds: [7, 2, 7], ticks: 0 });

    expect(cases.map(({ scenarioId, seed }) => `${scenarioId}:${seed}`)).toEqual(
      SCENARIO_CATALOG.flatMap((scenario) => [
        `${scenario.scenarioId}:2`,
        `${scenario.scenarioId}:7`,
      ]),
    );
  });

  it("keeps matrix results deterministic by excluding timing data", () => {
    const matrix = runMatrix({ corpus: "smoke", seeds: [1], ticks: 0 }) as {
      configuration: {
        ordering: string;
        scenarioDefinitions: unknown[];
        compiledMapHashes: string[];
        repeatCount: number;
        executionsPerCase: number;
      };
      runs: Array<{
        scenario: { scenarioId: string; seed: number };
        compiledMapHash: string;
        outcomeSummary: { interpretation: string };
        hardInvariants: { status: string };
        performance?: unknown;
      }>;
      aggregate: {
        scenarioDefinitions: unknown[];
        compiledMapHashes: string[];
        byScenario: Array<{
          scenario: unknown;
          compiledMapHashes: string[];
          analysis: { outcomes: { incidence: unknown[] } };
        }>;
      };
      analysis: {
        determinism: {
          repeatCount: number;
          executionsPerCase: number;
          comparisonCount: number;
          allExactMatches: boolean | null;
          comparisons: Array<{ exactMatch: boolean }>;
        };
        pairedComparisons: unknown[];
        convergence: unknown[];
        rawProfileRetention: {
          retainedRunCount: number;
          maximumRetainedRunCount: number;
          repeatProfilesRetained: boolean;
        };
      };
    };
    const expectedDefinitions = SCENARIO_CATALOG.map((scenario) =>
      scenarioDefinitionIdentity(createScenarioReference(scenario.scenarioId, 1)),
    );

    expect(matrix.configuration.ordering).toBe("catalog-then-seed");
    expect(matrix.configuration).toMatchObject({
      repeatCount: 1,
      executionsPerCase: 2,
    });
    expect(matrix.configuration.scenarioDefinitions).toEqual(expectedDefinitions);
    expect(matrix.runs.map((run) => run.scenario.scenarioId)).toEqual(
      SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
    );
    expect(matrix.runs.every((run) => run.scenario.seed === 1)).toBe(true);
    expect(matrix.runs.every((run) => run.performance === undefined)).toBe(true);
    expect(
      matrix.runs.every(
        (run) => run.outcomeSummary.interpretation === "FACTUAL_NON_EXCLUSIVE_NO_WINNER",
      ),
    ).toBe(true);
    expect(matrix.runs.every((run) => /^[0-9a-f]{16}$/u.test(run.compiledMapHash))).toBe(
      true,
    );
    expect(matrix.aggregate.scenarioDefinitions).toEqual(expectedDefinitions);
    expect(matrix.aggregate.compiledMapHashes).toEqual(
      [...new Set(matrix.runs.map((run) => run.compiledMapHash))].sort(),
    );
    expect(matrix.configuration.compiledMapHashes).toEqual(
      matrix.aggregate.compiledMapHashes,
    );
    expect(matrix.aggregate.byScenario).toHaveLength(SCENARIO_CATALOG.length);
    expect(matrix.aggregate.byScenario.map((item) => item.scenario)).toEqual(
      expectedDefinitions,
    );
    expect(
      matrix.aggregate.byScenario.every((item) => item.compiledMapHashes.length === 1),
    ).toBe(true);
    expect(
      matrix.aggregate.byScenario.every(
        (item) => item.analysis.outcomes.incidence.length === 5,
      ),
    ).toBe(true);
    expect(matrix.analysis.determinism).toMatchObject({
      repeatCount: 1,
      executionsPerCase: 2,
      comparisonCount: 4,
      allExactMatches: true,
    });
    expect(
      matrix.analysis.determinism.comparisons.every((comparison) => comparison.exactMatch),
    ).toBe(true);
    expect(matrix.analysis.pairedComparisons).toHaveLength(6);
    expect(matrix.analysis.convergence).toHaveLength(24);
    expect(matrix.analysis.rawProfileRetention).toEqual(
      expect.objectContaining({
        retainedRunCount: 4,
        maximumRetainedRunCount: 256,
        repeatProfilesRetained: false,
      }),
    );
  });

  it("runs non-smoke matrix corpora once", () => {
    const matrix = runMatrix({ corpus: "nightly", seeds: [1], ticks: 0 }) as {
      analysis: {
        determinism: {
          repeatCount: number;
          executionsPerCase: number;
          comparisonCount: number;
          allExactMatches: boolean | null;
        };
      };
    };

    expect(matrix.analysis.determinism).toEqual(
      expect.objectContaining({
        repeatCount: 0,
        executionsPerCase: 1,
        comparisonCount: 0,
        allExactMatches: null,
      }),
    );
  });

  it("rejects a matrix that would exceed the retained raw-profile bound", () => {
    expect(() =>
      runMatrix({
        corpus: "calibration",
        seeds: Array.from({ length: 65 }, (_, index) => index + 1),
        ticks: 0,
      }),
    ).toThrow("bounded to 256 runs");
  });
});
