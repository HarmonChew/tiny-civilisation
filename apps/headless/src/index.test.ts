import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { SCENARIO_CATALOG, createScenarioReference } from "@tiny-civ/sim-core";

import {
  matrixCases,
  parseBatchOptions,
  parseMatrixOptions,
  parseProfileOptions,
  parseRunOptions,
  profileSimulation,
  runBatch,
  runMatrix,
  runProfile,
  runSimulation,
  simulate,
} from "./index.js";
import { canonicalPhase42DefinitionJson } from "./phase-4.2-definition-contract.js";
import { scenarioDefinitionIdentity } from "./scenario-reporting.js";

const PHASE_4_2_REVIEWABLE_DEFINITION_FIELDS = [
  "classifierRules",
  "incidenceBandPolicy",
  "incidenceBands",
  "dominanceRationales",
  "settlementPairedMacroBands",
] as const;

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function staticDefinitionProjection(
  contract: unknown,
  allowMissingIncidenceBandPolicy = false,
): Record<string, unknown> {
  const projection = structuredClone(recordAt(contract, "definition contract"));
  const phase42 = recordAt(projection.phase42, "definition contract phase42");
  const expectedPhase42Fields = allowMissingIncidenceBandPolicy
    ? PHASE_4_2_REVIEWABLE_DEFINITION_FIELDS.filter(
        (field) => field !== "incidenceBandPolicy",
      )
    : PHASE_4_2_REVIEWABLE_DEFINITION_FIELDS;
  expect(Object.keys(phase42).sort()).toEqual([...expectedPhase42Fields].sort());
  phase42.classifierRules = {};
  delete phase42.incidenceBandPolicy;
  phase42.incidenceBands = [];
  phase42.dominanceRationales = [];
  phase42.settlementPairedMacroBands = [];
  return projection;
}

describe("headless scenario CLI", () => {
  it("emits a self-authenticating Phase 4.2 definition contract through the file-loader entrypoint", () => {
    const entryPath = fileURLToPath(new URL("./index.ts", import.meta.url));
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", entryPath, "phase-4.2-definition-contract"],
      { encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const payload = recordAt(JSON.parse(result.stdout) as unknown, "CLI payload");
    expect(result.stdout).toBe(`${JSON.stringify(payload)}\n`);

    const contract = recordAt(payload.contract, "CLI definition contract");
    const fingerprint = createHash("sha256")
      .update(canonicalPhase42DefinitionJson(contract), "utf8")
      .digest("hex");
    expect(payload).toMatchObject({
      schemaVersion: contract.schemaVersion,
      fingerprintAlgorithm: contract.fingerprintAlgorithm,
      fingerprint,
    });
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);

    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const committedV1 = recordAt(
      JSON.parse(
        gunzipSync(
          readFileSync(
            resolve(repositoryRoot, "docs/baselines/phase-4.2-calibration-v1.json.gz"),
          ),
        ).toString("utf8"),
      ) as unknown,
      "committed Phase 4.2 calibration v1",
    );
    const configuration = recordAt(
      committedV1.configuration,
      "committed Phase 4.2 calibration v1 configuration",
    );
    expect(staticDefinitionProjection(contract)).toEqual(
      staticDefinitionProjection(configuration.phase42DefinitionContract, true),
    );
  });

  it("prints only the definition fingerprint through the hash-only alias", () => {
    const entryPath = fileURLToPath(new URL("./index.ts", import.meta.url));
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", entryPath, "definition-fingerprint"],
      { encoding: "utf8" },
    );
    const contractResult = spawnSync(
      process.execPath,
      ["--import", "tsx", entryPath, "phase-4.2-definition-contract"],
      { encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(contractResult.error).toBeUndefined();
    expect(contractResult.status).toBe(0);
    expect(contractResult.stderr).toBe("");
    const contractPayload = recordAt(
      JSON.parse(contractResult.stdout) as unknown,
      "CLI contract payload",
    );
    expect(result.stdout).toBe(`${String(contractPayload.fingerprint)}\n`);
    expect(result.stdout).toMatch(/^[0-9a-f]{64}\n$/u);
  });

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
    ["smoke", 8, 2_000, 1, 8],
    ["nightly", 32, 10_000, 1, 32],
    ["calibration", 64, 10_000, 1, 64],
    ["holdout", 64, 10_000, 1_001, 1_064],
    ["phase-4.2-calibration", 64, 10_000, 1, 64],
    ["phase-4.2-holdout", 64, 10_000, 2_001, 2_064],
  ] as const)(
    "resolves the locked %s corpus",
    (corpus, seedCount, ticks, firstSeed, lastSeed) => {
      const options = parseMatrixOptions(["--corpus", corpus]);
      expect(options).toMatchObject({ corpus, ticks });
      expect(options.seeds).toHaveLength(seedCount);
      expect(options.seeds[0]).toBe(firstSeed);
      expect(options.seeds.at(-1)).toBe(lastSeed);
    },
  );

  it("accepts an opt-in compressed matrix evidence path", () => {
    expect(
      parseMatrixOptions([
        "--corpus",
        "calibration",
        "--output",
        "docs/baselines/phase-3-calibration-v1.json.gz",
      ]),
    ).toMatchObject({
      corpus: "calibration",
      outputPath: "docs/baselines/phase-3-calibration-v1.json.gz",
    });
    expect(() =>
      parseMatrixOptions(["--output", "docs/baselines/phase-3-calibration-v1.json"]),
    ).toThrow("--output must end with .json.gz");
  });

  it("resolves the canonical Phase 4.2 holdout request without executing it", () => {
    const options = parseMatrixOptions(["--corpus", "phase-4.2-holdout"]);

    expect(options).toMatchObject({
      corpus: "phase-4.2-holdout",
      ticks: 10_000,
      outputPath: "docs/baselines/phase-4.2-holdout-v1.json.gz",
    });
    expect(options.seeds).toHaveLength(64);
    expect(options.seeds[0]).toBe(2_001);
    expect(options.seeds.at(-1)).toBe(2_064);
  });

  it("locks Phase 4.2 matrix horizons and canonical output paths", () => {
    expect(parseMatrixOptions(["--corpus", "phase-4.2-calibration"])).toMatchObject({
      ticks: 10_000,
      outputPath: "docs/baselines/phase-4.2-calibration-v2.json.gz",
    });
    expect(() =>
      parseMatrixOptions(["--corpus", "phase-4.2-calibration", "--ticks", "9999"]),
    ).toThrow("--ticks is forbidden");
    expect(() =>
      parseMatrixOptions(["--corpus", "phase-4.2-holdout", "--ticks", "10000"]),
    ).toThrow("--ticks is forbidden");
    expect(() =>
      parseMatrixOptions([
        "--corpus",
        "phase-4.2-holdout",
        "--output",
        "tmp/holdout.json.gz",
      ]),
    ).toThrow("must use canonical path");
    expect(() =>
      parseMatrixOptions(["--corpus", "phase-4.2-holdout", "--seeds", "2001"]),
    ).toThrow("Unknown matrix option: --seeds");
    expect(() =>
      parseMatrixOptions([
        "--corpus",
        "phase-4.2-calibration",
        "--output",
        "docs/baselines/phase-4.2-calibration-v1.json.gz",
      ]),
    ).toThrow("must use canonical path docs/baselines/phase-4.2-calibration-v2.json.gz");
  });

  it("protects every reserved seed at the holdout horizon through generic commands", () => {
    expect(() => parseRunOptions(["--seed", "2001", "--ticks", "0"])).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() => simulate({ scenarioId: "petri-world", seed: 2_001, ticks: 0 })).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() =>
      profileSimulation({ scenarioId: "petri-world", seed: 2_001, ticks: 1 }),
    ).toThrow("Reserved Phase 4.2 holdout seeds");
    expect(() =>
      runSimulation({ scenarioId: "petri-world", seed: 2_064, ticks: 9_999 }),
    ).toThrow("Reserved Phase 4.2 holdout seeds");
    expect(() => parseRunOptions(["--seed", "2001", "--ticks", "10000"])).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() => parseBatchOptions(["--seeds", "2001", "--ticks", "12000"])).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() => parseProfileOptions(["--seed", "2064", "--ticks", "10000"])).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() => runMatrix({ corpus: "nightly", seeds: [2_001], ticks: 10_000 })).toThrow(
      "Reserved Phase 4.2 holdout seeds",
    );
    expect(() =>
      runMatrix({
        corpus: "phase-4.2-holdout",
        seeds: [2_001],
        ticks: 10_000,
        outputPath: "docs/baselines/phase-4.2-holdout-v1.json.gz",
      }),
    ).toThrow("already recorded and cannot be rerun");
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
        (item) => item.analysis.outcomes.incidence.length === 14,
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
    expect(matrix.analysis.convergence).toHaveLength(36);
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
