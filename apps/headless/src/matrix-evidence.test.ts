import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { mkdtempSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  createMatrixEvidenceArtifacts,
  matrixEvidenceStdoutChunks,
  matrixEvidencePaths,
  serializeMatrixEvidence,
  serializeMatrixEvidenceArtifact,
  writeMatrixEvidence,
  type MatrixEvidenceReport,
} from "./matrix-evidence.js";

const temporaryDirectories: string[] = [];

function evidenceReport(): MatrixEvidenceReport {
  return {
    schemaVersion: 4,
    command: "matrix",
    configuration: {
      corpus: "calibration",
      scenarios: ["petri-world"],
      seeds: [1, 2],
      ticksPerRun: 10_000,
      sampleEveryTicks: 10,
      ordering: "catalog-then-seed",
      repeatCount: 0,
      executionsPerCase: 1,
    },
    runs: [{ seed: 1 }, { seed: 2 }],
    aggregate: {
      byScenario: [
        {
          scenario: { scenarioId: "petri-world" },
          analysis: {
            outcomes: {
              incidence: [
                {
                  labelId: "COOPERATIVE_SHARED_STORAGE",
                  title: "Cooperative shared storage",
                  occurrences: 1,
                  eligibleRuns: 2,
                },
              ],
            },
            hardInvariants: { status: "PASS" },
            expectedBands: {
              status: "PASS",
              provenance: {
                releaseOutcomeClaim: false,
                calibrationEvidence: "FULL_CALIBRATION_PRESENT",
                holdoutEvidence: "NOT_PRESENT",
              },
              scenarioOutcomeBands: {
                tableVersion: 1,
                status: "FAIL",
                releaseClaim: false,
                provenance: {
                  artifactSha256:
                    "18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828",
                  classifierVersion: 2,
                },
                evaluations: [
                  {
                    labelId: "COOPERATIVE_SHARED_STORAGE",
                    status: "PASS",
                    observed: 8,
                    eligibleRuns: 64,
                    threshold: 8,
                  },
                ],
                dominance: {
                  status: "FAIL",
                  rationaleFailures: ["RECURRING_CONFLICT"],
                  evaluations: [
                    {
                      labelId: "RECURRING_CONFLICT",
                      status: "FAIL",
                      incidence: 0.9,
                      rationaleRequired: true,
                      rationale: null,
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
    analysis: {
      determinism: {
        comparisonCount: 0,
        allExactMatches: null,
        hardInvariant: { status: "NOT_EVALUATED" },
      },
      pairedComparisons: [],
      frozenPairedMacroBands: {
        tableVersion: 1,
        status: "PASS",
        bandEvaluationStatus: "PASS",
        releaseClaim: false,
        provenance: {
          artifactSha256:
            "18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828",
        },
        corpusValidation: { status: "FULL_CALIBRATION" },
        evaluations: [
          {
            dimension: "SOCIAL",
            leftScenarioId: "petri-world",
            rightScenarioId: "unequal-table",
            metricId: "GROUP_COUNT",
            status: "PASS",
            pairedSeedCount: 64,
            requiredPairedSeeds: 64,
            missingValuePolicy: "ZERO_IS_OBSERVED",
            eligiblePairPolicy: "ALL_LOCKED_SEEDS",
            absoluteMeanDelta: 0.42,
            minimumAbsoluteMeanDelta: 0.25,
            absoluteCohenDz: 0.76,
            minimumAbsoluteCohenDz: 0.5,
          },
        ],
        dimensionRequirement: {
          status: "PASS",
          observed: 4,
          threshold: 3,
          passingDimensions: ["SOCIAL", "STORAGE", "CONFLICT", "SPATIAL"],
        },
        settlementRequirement: {
          status: "NOT_EVALUATED",
          observed: null,
          threshold: 1,
        },
      },
      convergence: [{ status: "DIFFERENCE_OBSERVED" }],
    },
  };
}

function phase42CandidateEvidenceReport(): MatrixEvidenceReport {
  const legacy = evidenceReport();
  const scenario = legacy.aggregate.byScenario[0];
  if (!scenario) throw new Error("Expected evidence fixture scenario.");
  const outcomeBands = scenario.analysis.expectedBands.scenarioOutcomeBands;
  const pairedBands = legacy.analysis.frozenPairedMacroBands;
  const distribution = (median: number | null, samples = 64) => ({ samples, median });
  return {
    ...legacy,
    configuration: {
      ...legacy.configuration,
      corpus: "phase-4.2-calibration",
      scenarioAnalysisSchemaVersion: 4,
      outcomeClassifierVersion: 3,
    },
    aggregate: {
      ...legacy.aggregate,
      byScenario: [
        {
          ...scenario,
          activity: {
            settlement: {
              seedDistributions: {
                activeShelterCount: distribution(1),
                shelteredRestShare: distribution(0.75),
                meanShelterCondition: distribution(7_500, 61),
                reservationUtilization: distribution(0.5, 61),
                guestUseEvents: distribution(2),
                deniedClaims: distribution(1),
              },
            },
          },
          analysis: {
            ...scenario.analysis,
            expectedBands: {
              ...scenario.analysis.expectedBands,
              status: "PARTIAL",
              provenance: {
                releaseOutcomeClaim: false,
                calibrationEvidence: "PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT",
                holdoutEvidence: "NOT_PRESENT",
              },
              scenarioOutcomeBands: {
                ...outcomeBands,
                status: "NOT_EVALUATED",
                provenance: {
                  artifactSha256: null,
                  classifierVersion: 3,
                  basis: "PHASE_4_2_DISCOVERY_CALIBRATION_CANDIDATE",
                },
                evaluations: [],
                dominance: {
                  status: "NOT_EVALUATED",
                  rationaleFailures: [],
                  evaluations: [],
                },
              },
            },
          },
        },
      ],
    },
    analysis: {
      ...legacy.analysis,
      pairedComparisons: [
        {
          leftScenarioId: "petri-world",
          rightScenarioId: "split-banks",
          metrics: [
            {
              metricId: "MEAN_SHELTER_CONDITION",
              dimension: "SETTLEMENT",
              missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
              summary: { pairedSeedCount: 61, meanDelta: 250 },
              effect: { value: 0.42 },
            },
          ],
        },
      ],
      frozenPairedMacroBands: {
        ...pairedBands,
        status: "NOT_EVALUATED",
        bandEvaluationStatus: "NOT_EVALUATED",
        provenance: {
          artifactSha256: null,
          basis: "PHASE_4_2_DISCOVERY_CALIBRATION_CANDIDATE",
        },
        corpusValidation: { status: "PHASE_4_2_CALIBRATION_CANDIDATE" },
        evaluations: [],
        dimensionRequirement: {
          ...pairedBands.dimensionRequirement,
          status: "NOT_EVALUATED",
          observed: null,
          passingDimensions: [],
        },
        settlementRequirement: {
          ...pairedBands.settlementRequirement,
          status: "NOT_EVALUATED",
          observed: null,
        },
      },
    },
  };
}

function phase42FrozenEvidenceReport(
  corpus: "phase-4.2-calibration" | "phase-4.2-holdout",
): MatrixEvidenceReport {
  const candidate = phase42CandidateEvidenceReport();
  const scenario = candidate.aggregate.byScenario[0];
  if (!scenario) throw new Error("Expected Phase 4.2 evidence fixture scenario.");
  const frozenSha = "c".repeat(64);
  return {
    ...candidate,
    configuration: { ...candidate.configuration, corpus },
    aggregate: {
      ...candidate.aggregate,
      byScenario: [
        {
          ...scenario,
          analysis: {
            ...scenario.analysis,
            expectedBands: {
              ...scenario.analysis.expectedBands,
              status: "PASS",
              provenance: {
                releaseOutcomeClaim: false,
                calibrationEvidence:
                  corpus === "phase-4.2-calibration"
                    ? "FULL_PHASE_4_2_CALIBRATION_PRESENT"
                    : "NOT_PRESENT",
                holdoutEvidence:
                  corpus === "phase-4.2-holdout"
                    ? "FULL_PHASE_4_2_HOLDOUT_PRESENT"
                    : "NOT_PRESENT",
              },
              scenarioOutcomeBands: {
                ...scenario.analysis.expectedBands.scenarioOutcomeBands,
                status: "PASS",
                provenance: {
                  artifactSha256: frozenSha,
                  classifierVersion: 3,
                  basis: "LOCKED_PHASE_4_2_CALIBRATION",
                },
              },
            },
          },
        },
      ],
    },
    analysis: {
      ...candidate.analysis,
      frozenPairedMacroBands: {
        ...candidate.analysis.frozenPairedMacroBands,
        status: "PASS",
        bandEvaluationStatus: "PASS",
        provenance: {
          artifactSha256: frozenSha,
          basis: "LOCKED_PHASE_4_2_CALIBRATION",
        },
        corpusValidation: {
          status:
            corpus === "phase-4.2-calibration"
              ? "FULL_PHASE_4_2_CALIBRATION"
              : "FULL_PHASE_4_2_HOLDOUT",
        },
        evaluations: [
          {
            dimension: "SETTLEMENT",
            leftScenarioId: "petri-world",
            rightScenarioId: "split-banks",
            metricId: "MEAN_SHELTER_CONDITION",
            status: "PASS",
            pairedSeedCount: 61,
            requiredPairedSeeds: 61,
            missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
            eligiblePairPolicy: "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION",
            absoluteMeanDelta: 250,
            minimumAbsoluteMeanDelta: 100,
            absoluteCohenDz: 0.42,
            minimumAbsoluteCohenDz: 0.3,
          },
        ],
        settlementRequirement: { status: "PASS", observed: 1, threshold: 1 },
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("matrix evidence export", () => {
  it("creates deterministic portable gzip bytes, a checksum, and a truthful summary", () => {
    const report = evidenceReport();
    const first = createMatrixEvidenceArtifacts(report, "phase-3-calibration-v1.json.gz");
    const second = createMatrixEvidenceArtifacts(report, "phase-3-calibration-v1.json.gz");

    expect(first.gzip.equals(second.gzip)).toBe(true);
    expect(first.sha256).toBe(second.sha256);
    expect([...first.gzip.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(first.gzip[9]).toBe(255);
    expect(gunzipSync(first.gzip).toString("utf8")).toBe(
      serializeMatrixEvidenceArtifact(report),
    );
    expect(first.checksum).toBe(`${first.sha256}  phase-3-calibration-v1.json.gz\n`);
    expect(first.markdown).toContain("FULL_CALIBRATION_PRESENT");
    expect(first.markdown).toContain("RECURRING_CONFLICT");
    expect(first.markdown).toContain("Frozen paired macro bands");
    expect(first.markdown).toContain("Artifact release claim: false");
    expect(first.markdown).toContain("manual assistive-technology pass");
    expect(first.markdown).toContain("not a release claim");
    expect(first.markdown).not.toContain("# Phase 3");
  });

  it("writes all three companions without changing the serialized report", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-civ-matrix-evidence-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "nested", "phase-3-calibration-v1.json.gz");
    const report = evidenceReport();

    const artifacts = writeMatrixEvidence(report, outputPath);
    const paths = matrixEvidencePaths(outputPath);

    expect(readFileSync(paths.gzipPath).equals(artifacts.gzip)).toBe(true);
    expect(readFileSync(paths.checksumPath, "utf8")).toBe(artifacts.checksum);
    expect(readFileSync(paths.summaryPath, "utf8")).toBe(artifacts.markdown);
    expect(gunzipSync(readFileSync(paths.gzipPath)).toString("utf8")).toBe(
      serializeMatrixEvidenceArtifact(report),
    );
  });

  it("never overwrites any member of an existing evidence set", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-civ-matrix-immutable-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "phase-4.2-calibration-v1.json.gz");
    const report = evidenceReport();
    writeMatrixEvidence(report, outputPath);
    const paths = matrixEvidencePaths(outputPath);
    const originalGzip = readFileSync(paths.gzipPath);
    const originalChecksum = readFileSync(paths.checksumPath, "utf8");
    const originalSummary = readFileSync(paths.summaryPath, "utf8");

    expect(() => writeMatrixEvidence(report, outputPath)).toThrow(
      "refusing to overwrite existing artifacts",
    );
    expect(readFileSync(paths.gzipPath).equals(originalGzip)).toBe(true);
    expect(readFileSync(paths.checksumPath, "utf8")).toBe(originalChecksum);
    expect(readFileSync(paths.summaryPath, "utf8")).toBe(originalSummary);
  });

  it("refuses a partial historical companion before creating new files", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-civ-matrix-partial-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "nested", "phase-4.1-calibration-v2.json.gz");
    const paths = matrixEvidencePaths(outputPath);
    mkdirSync(join(directory, "nested"), { recursive: true });
    writeFileSync(paths.checksumPath, "historical checksum\n", "utf8");

    expect(() => writeMatrixEvidence(evidenceReport(), outputPath)).toThrow(
      "refusing to overwrite existing artifact",
    );
    expect(existsSync(paths.gzipPath)).toBe(false);
    expect(existsSync(paths.summaryPath)).toBe(false);
    expect(readFileSync(paths.checksumPath, "utf8")).toBe("historical checksum\n");
  });

  it("labels Phase 4.2 discovery as candidate and exposes settlement distributions", () => {
    const artifacts = createMatrixEvidenceArtifacts(
      phase42CandidateEvidenceReport(),
      "phase-4.2-calibration-v1.json.gz",
    );

    expect(artifacts.markdown).toContain(
      "Candidate Phase 4.2 outcome-incidence review (not frozen)",
    );
    expect(artifacts.markdown).toContain(
      "Candidate Phase 4.2 paired macro review (not frozen)",
    );
    expect(artifacts.markdown).toContain("Phase 4.2 settlement discovery distributions");
    expect(artifacts.markdown).toContain("7500 (61 seeds)");
    expect(artifacts.markdown).toContain("Candidate SETTLEMENT pair effects");
    expect(artifacts.markdown).toContain("MEAN_SHELTER_CONDITION");
    expect(artifacts.markdown).toContain("EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING");
    expect(artifacts.markdown).toContain("| 61 | 250 | 0.42 |");
    expect(artifacts.markdown).toContain("Calibration SHA-256: `n/a`");
    expect(artifacts.markdown).not.toContain("### Frozen outcome-incidence bands");
    expect(artifacts.markdown).not.toContain("## Frozen paired macro bands");
  });

  it("labels post-freeze calibration and holdout settlement evidence distinctly", () => {
    const verification = createMatrixEvidenceArtifacts(
      phase42FrozenEvidenceReport("phase-4.2-calibration"),
      "phase-4.2-calibration-v2.json.gz",
    ).markdown;
    const holdout = createMatrixEvidenceArtifacts(
      phase42FrozenEvidenceReport("phase-4.2-holdout"),
      "phase-4.2-holdout-v1.json.gz",
    ).markdown;

    expect(verification).toContain(
      "Phase 4.2 post-freeze settlement verification distributions",
    );
    expect(verification).toContain("Frozen SETTLEMENT pair effects");
    expect(verification).toContain(
      "Passing SETTLEMENT bands: PASS (1 observed; 1 required)",
    );
    expect(verification).toContain(
      "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION; EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
    );
    expect(verification).not.toContain("settlement discovery distributions");

    expect(holdout).toContain("Phase 4.2 settlement holdout distributions");
    expect(holdout).toContain("Holdout SETTLEMENT pair effects");
    expect(holdout).toContain("unchanged frozen definitions");
    expect(holdout).not.toContain("settlement discovery distributions");
  });

  it("streams the historical pretty stdout bytes in bounded chunks", () => {
    const streamed = [...matrixEvidenceStdoutChunks(evidenceReport())].join("");

    expect(streamed).toBe(serializeMatrixEvidence(evidenceReport()));
  });

  it("requires an explicit compressed JSON output filename", () => {
    expect(() => matrixEvidencePaths("phase-3-calibration-v1.json")).toThrow(
      "must end with .json.gz",
    );
  });

  it("resolves documented relative paths from the npm invocation directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-civ-matrix-invocation-"));
    temporaryDirectories.push(directory);

    const paths = matrixEvidencePaths(
      "docs/baselines/phase-4.1-calibration-v1.json.gz",
      directory,
    );

    expect(paths.gzipPath).toBe(
      join(directory, "docs", "baselines", "phase-4.1-calibration-v1.json.gz"),
    );
    expect(paths.summaryPath).toBe(
      join(directory, "docs", "baselines", "phase-4.1-calibration-v1.md"),
    );
  });
});
