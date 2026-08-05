import { readFileSync, rmSync } from "node:fs";
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
      },
      convergence: [{ status: "DIFFERENCE_OBSERVED" }],
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
