import { describe, expect, it } from "vitest";

import { type DeterministicMatrixRun } from "./matrix-report-derivation.js";
import {
  authenticatePhase42CalibrationMatrixWithRunnerForTest,
  derivePhase42MatrixEvidenceWithCurrentRuntimeForTest,
  hydratePhase42IncidenceBandPolicy,
  hydratePhase42IncidenceBands,
  type Phase42CalibrationRunRegenerator,
} from "./phase-4.2-calibration-auth.js";
import { PHASE_4_2_CALIBRATION_SEEDS } from "./phase-4.2-corpora.js";
import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
  PHASE_4_2_INCIDENCE_BAND_POLICY,
  phase42DefinitionFingerprint,
} from "./phase-4.2-definition-contract.js";
import { completeCalibrationMatrixFixture } from "./phase-4.2-matrix-fixture.js";
import { PHASE_4_2_CLASSIFIER_RULES } from "./scenario-analysis.js";
import { PHASE_4_2_CALIBRATION_PROVENANCE } from "./scenario-bands.js";

type MutableRecord = Record<string, unknown>;

function recordAt(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value as MutableRecord;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array.`);
  return value;
}

function candidateDefinitionContract(): MutableRecord {
  const contract = structuredClone(
    PHASE_4_2_DEFINITION_CONTRACT,
  ) as unknown as MutableRecord;
  const phase42 = recordAt(contract.phase42, "candidate definition Phase 4.2");
  delete phase42.incidenceBandPolicy;
  phase42.incidenceBands = [];
  phase42.dominanceRationales = [];
  phase42.settlementPairedMacroBands = [];
  return contract;
}

function rawRun(value: unknown): DeterministicMatrixRun {
  const run = recordAt(value, "fixture run");
  return {
    seed: run.seed as number,
    scenario: run.scenario as DeterministicMatrixRun["scenario"],
    compiledMapHash: run.compiledMapHash as string,
    requestedTicks: run.requestedTicks as number,
    finalHash: run.finalHash as string,
    profile: run.profile as DeterministicMatrixRun["profile"],
  };
}

let cachedReport: MutableRecord | undefined;
let cachedRuns: ReadonlyMap<string, DeterministicMatrixRun> | undefined;

function authenticCandidateFixture(): {
  readonly report: MutableRecord;
  readonly regenerate: Phase42CalibrationRunRegenerator;
} {
  if (cachedReport === undefined || cachedRuns === undefined) {
    const skeleton = completeCalibrationMatrixFixture(false);
    for (const value of arrayAt(skeleton.runs, "fixture runs")) {
      const profile = recordAt(recordAt(value, "fixture run").profile, "fixture profile");
      const stalemate = recordAt(profile.stalemate, "fixture stalemate");
      stalemate.observedWindowTicks = 1_000;
      stalemate.eligible = true;
    }
    const runs = arrayAt(skeleton.runs, "fixture runs").map(rawRun);
    const contract = candidateDefinitionContract();
    const fingerprint = phase42DefinitionFingerprint(contract);
    cachedReport = derivePhase42MatrixEvidenceWithCurrentRuntimeForTest({
      corpus: "phase-4.2-calibration",
      seeds: PHASE_4_2_CALIBRATION_SEEDS,
      ticks: 10_000,
      repeatCount: 0,
      runs,
      determinismComparisons: [],
      phase42Definition: {
        contractSchemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
        status: "CANDIDATE",
        fingerprint,
        contract,
        analysisDefinitions: {
          status: "CANDIDATE",
          classifierRules: PHASE_4_2_CLASSIFIER_RULES,
          incidenceBands: [],
          dominanceRationales: [],
          pairedMacroBands: [],
        },
      },
    }) as unknown as MutableRecord;
    cachedRuns = new Map(
      runs.map((run) => [
        `${run.scenario.scenarioId}:${run.seed.toString()}`,
        structuredClone(run),
      ]),
    );
  }
  const runs = cachedRuns;
  return {
    report: structuredClone(cachedReport),
    regenerate: ({ scenarioId, seed }) => {
      const run = runs.get(`${scenarioId}:${seed.toString()}`);
      if (run === undefined) throw new Error("Missing fake regenerated run.");
      return structuredClone(run);
    },
  };
}

describe("Phase 4.2 calibration authentication", () => {
  it("accepts only the exact reviewed frozen Wilson-floor policy", () => {
    expect(hydratePhase42IncidenceBandPolicy(undefined, "CANDIDATE")).toBeNull();
    expect(
      hydratePhase42IncidenceBandPolicy(
        structuredClone(PHASE_4_2_INCIDENCE_BAND_POLICY),
        "FROZEN",
      ),
    ).toBe(PHASE_4_2_INCIDENCE_BAND_POLICY);
    expect(() =>
      hydratePhase42IncidenceBandPolicy(
        structuredClone(PHASE_4_2_INCIDENCE_BAND_POLICY),
        "CANDIDATE",
      ),
    ).toThrow("may not claim the reviewed frozen incidence-band policy");

    expect(() =>
      hydratePhase42IncidenceBandPolicy(
        { ...PHASE_4_2_INCIDENCE_BAND_POLICY, zScore: 1.96 },
        "FROZEN",
      ),
    ).toThrow("does not match the reviewed Wilson-floor policy");
    expect(() =>
      hydratePhase42IncidenceBandPolicy(
        { ...PHASE_4_2_INCIDENCE_BAND_POLICY, undeclaredScope: true },
        "FROZEN",
      ),
    ).toThrow("unexpected or missing semantic fields");
  });

  it("accepts reviewed per-scenario frozen incidence floors without weakening v1", () => {
    const band = (
      threshold: number,
      metricPath?: string,
      labelId = "ESTABLISHED_SETTLEMENT",
    ) => ({
      tableVersion: 1,
      scenarioId: "petri-world",
      labelId,
      metricPath: metricPath ?? `analysis.outcomes.incidence[${labelId}].occurrences`,
      comparison: "GTE",
      threshold,
      requiredEligibleRuns: 64,
    });

    expect(
      [22, 7, 2, 1].map(
        (threshold) =>
          hydratePhase42IncidenceBands([band(threshold)], "FROZEN")[0]?.threshold,
      ),
    ).toEqual([22, 7, 2, 1]);
    expect(hydratePhase42IncidenceBands([band(8)], "CANDIDATE")[0]?.threshold).toBe(8);
    expect(() => hydratePhase42IncidenceBands([band(1)], "CANDIDATE")).toThrow(
      "locked gate semantics",
    );
    for (const threshold of [0, 65, 1.5, Number.NaN]) {
      expect(() => hydratePhase42IncidenceBands([band(threshold)], "FROZEN")).toThrow();
    }
    expect(() =>
      hydratePhase42IncidenceBands(
        [band(22, "analysis.outcomes.incidence[WRONG].occurrences")],
        "FROZEN",
      ),
    ).toThrow("locked gate semantics");
    expect(() =>
      hydratePhase42IncidenceBands([band(22, undefined, "SHARED_HYDRATION")], "FROZEN"),
    ).toThrow("locked gate semantics");
  });

  it("keeps a policy-free v1 candidate authenticated when every field recomputes", () => {
    const fixture = authenticCandidateFixture();

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        fixture.report,
        "CANDIDATE",
        fixture.regenerate,
      ),
    ).not.toThrow();
  });

  it("recomputes a superseded v1 candidate from its embedded data-only tables", () => {
    const base = authenticCandidateFixture();
    const contract = candidateDefinitionContract();
    const incidenceBand = {
      tableVersion: 1 as const,
      scenarioId: "petri-world" as const,
      labelId: "ESTABLISHED_SETTLEMENT" as const,
      metricPath: "analysis.outcomes.incidence[ESTABLISHED_SETTLEMENT].occurrences",
      comparison: "GTE" as const,
      threshold: 8 as const,
      requiredEligibleRuns: 64 as const,
    };
    arrayAt(
      recordAt(contract.phase42, "candidate Phase 4.2").incidenceBands,
      "candidate incidence bands",
    ).push(incidenceBand);
    const fingerprint = phase42DefinitionFingerprint(contract);
    const report = derivePhase42MatrixEvidenceWithCurrentRuntimeForTest({
      corpus: "phase-4.2-calibration",
      seeds: PHASE_4_2_CALIBRATION_SEEDS,
      ticks: 10_000,
      repeatCount: 0,
      runs: arrayAt(base.report.runs, "candidate runs").map(rawRun),
      determinismComparisons: [],
      phase42Definition: {
        contractSchemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
        status: "CANDIDATE",
        fingerprint,
        contract,
        analysisDefinitions: {
          status: "CANDIDATE",
          classifierRules: PHASE_4_2_CLASSIFIER_RULES,
          incidenceBands: [
            { ...incidenceBand, provenance: PHASE_4_2_CALIBRATION_PROVENANCE },
          ],
          dominanceRationales: [],
          pairedMacroBands: [],
        },
      },
    }) as unknown as MutableRecord;

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        report,
        "CANDIDATE",
        base.regenerate,
      ),
    ).not.toThrow();
  });

  it("recomputes a superseded v1 candidate with its embedded classifier rules", () => {
    const base = authenticCandidateFixture();
    const contract = candidateDefinitionContract();
    recordAt(
      recordAt(contract.phase42, "candidate Phase 4.2").classifierRules,
      "candidate classifier rules",
    ).shelterCrowdingMinimumEvents = 2;
    const classifierRules = {
      ...PHASE_4_2_CLASSIFIER_RULES,
      shelterCrowdingMinimumEvents: 2,
    };
    const runs = arrayAt(base.report.runs, "candidate runs").map((value, index) => {
      const run = structuredClone(rawRun(value));
      const settlement = recordAt(run.profile.settlement, "candidate settlement");
      recordAt(settlement.occupancy, "candidate occupancy").crowdingEvents =
        index === 0 ? 2 : 1;
      return run;
    });
    const runsByIdentity = new Map(
      runs.map((run) => [
        `${run.scenario.scenarioId}:${run.seed.toString()}`,
        structuredClone(run),
      ]),
    );
    const report = derivePhase42MatrixEvidenceWithCurrentRuntimeForTest({
      corpus: "phase-4.2-calibration",
      seeds: PHASE_4_2_CALIBRATION_SEEDS,
      ticks: 10_000,
      repeatCount: 0,
      runs,
      determinismComparisons: [],
      phase42Definition: {
        contractSchemaVersion: PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
        status: "CANDIDATE",
        fingerprint: phase42DefinitionFingerprint(contract),
        contract,
        analysisDefinitions: {
          status: "CANDIDATE",
          classifierRules,
          incidenceBands: [],
          dominanceRationales: [],
          pairedMacroBands: [],
        },
      },
    }) as unknown as MutableRecord;
    const reportedRuns = arrayAt(report.runs, "superseded reported runs");
    const firstOutcome = recordAt(
      recordAt(reportedRuns[0], "first superseded run").outcomeSummary,
      "first superseded outcome",
    );
    const firstCrowdingLabel = arrayAt(firstOutcome.labels, "first outcome labels")
      .map((value) => recordAt(value, "first outcome label"))
      .find((label) => label.id === "SHELTER_CROWDING");
    expect(firstCrowdingLabel?.factualSummary).toBe(
      "Capacity-based shelter crowding met the declared event threshold.",
    );
    expect(
      recordAt(
        arrayAt(firstCrowdingLabel?.evidence, "crowding evidence")[0],
        "crowding evidence item",
      ).threshold,
    ).toBe(2);
    const secondOutcome = recordAt(
      recordAt(reportedRuns[1], "second superseded run").outcomeSummary,
      "second superseded outcome",
    );
    expect(
      arrayAt(secondOutcome.labels, "second outcome labels").some(
        (value) => recordAt(value, "second outcome label").id === "SHELTER_CROWDING",
      ),
    ).toBe(false);

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        report,
        "CANDIDATE",
        ({ scenarioId, seed }) => {
          const run = runsByIdentity.get(`${scenarioId}:${seed.toString()}`);
          if (run === undefined) throw new Error("Missing superseded candidate run.");
          return structuredClone(run);
        },
      ),
    ).not.toThrow();
  });

  it("rejects an embedded definition payload whose retained fingerprint was not updated", () => {
    const fixture = authenticCandidateFixture();
    const configuration = recordAt(fixture.report.configuration, "configuration");
    const contract = recordAt(
      configuration.phase42DefinitionContract,
      "definition contract",
    );
    recordAt(contract.gates, "definition gates").outcomeDominanceThreshold = 0.5;

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        fixture.report,
        "CANDIDATE",
        fixture.regenerate,
      ),
    ).toThrow("does not authenticate its embedded definition contract");
  });

  it("rejects a re-fingerprinted frozen contract with a policy tamper", () => {
    const report = completeCalibrationMatrixFixture(true);
    const configuration = recordAt(report.configuration, "configuration");
    const contract = recordAt(
      configuration.phase42DefinitionContract,
      "definition contract",
    );
    const phase42 = recordAt(contract.phase42, "definition Phase 4.2");
    recordAt(phase42.incidenceBandPolicy, "incidence-band policy").zScore = 1.96;
    configuration.phase42DefinitionFingerprint = phase42DefinitionFingerprint(contract);

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(report, "FROZEN", () => {
        throw new Error("The frozen-policy rejection must precede regeneration.");
      }),
    ).toThrow("exact current frozen definition contract");
  });

  it("rejects a single retained profile mutation even when the artifact shape remains complete", () => {
    const fixture = authenticCandidateFixture();
    const firstRun = recordAt(arrayAt(fixture.report.runs, "runs")[0], "first run");
    const profile = recordAt(firstRun.profile, "profile");
    recordAt(profile.window, "profile window").sampledStates = 10_002;

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        fixture.report,
        "CANDIDATE",
        fixture.regenerate,
      ),
    ).toThrow("failed deterministic regeneration");
  });

  it("rejects derived-only tampering after every raw run regenerates exactly", () => {
    const fixture = authenticCandidateFixture();
    const aggregate = recordAt(fixture.report.aggregate, "aggregate");
    const firstScenario = recordAt(
      arrayAt(aggregate.byScenario, "scenario aggregates")[0],
      "first scenario aggregate",
    );
    const activity = recordAt(firstScenario.activity, "scenario activity");
    activity.completedActions = (activity.completedActions as number) + 1;

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        fixture.report,
        "CANDIDATE",
        fixture.regenerate,
      ),
    ).toThrow("derived evidence does not match deterministic recomputation");
  });

  it("rejects a shape-padded self-attested frozen matrix", () => {
    const padded = completeCalibrationMatrixFixture(true);
    const candidate = authenticCandidateFixture();

    expect(() =>
      authenticatePhase42CalibrationMatrixWithRunnerForTest(
        padded,
        "FROZEN",
        candidate.regenerate,
      ),
    ).toThrow();
  });
});
