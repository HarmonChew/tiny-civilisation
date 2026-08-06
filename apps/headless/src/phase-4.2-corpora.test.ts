import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { SCENARIO_IDS } from "@tiny-civ/sim-core";
import { afterEach, describe, expect, it } from "vitest";

import {
  PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH,
  PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
  PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH,
  PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
  PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
  PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH,
  PHASE_4_2_HOLDOUT_ATTEMPT_PATH,
  PHASE_4_2_HOLDOUT_CHECKSUM_PATH,
  PHASE_4_2_HOLDOUT_OUTPUT_PATH,
  PHASE_4_2_HOLDOUT_SEEDS,
  PHASE_4_2_MATRIX_TICKS,
  acquirePhase42HoldoutAttempt,
  assertNotReservedPhase42HoldoutCorpus,
  assertPhase42HoldoutExecutionRequest,
  assertPhase42PostFreezeCalibrationExecutionRequest,
  isExactPhase42HoldoutSeedHorizon,
  type Phase42HoldoutPolicy,
} from "./phase-4.2-corpora.js";
import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_FINGERPRINT,
  phase42DefinitionFingerprint,
} from "./phase-4.2-definition-contract.js";
import { completeCalibrationMatrixFixture } from "./phase-4.2-matrix-fixture.js";

const temporaryDirectories: string[] = [];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function calibrationMatrix(frozenPass: boolean): object {
  return completeCalibrationMatrixFixture(frozenPass);
}

function freezeReviewDocument(
  discoverySha: string,
  candidateFingerprint = PHASE_4_2_DEFINITION_FINGERPRINT,
): string {
  return [
    "# Phase 4.2 freeze review",
    "phase42ReviewType: FREEZE",
    `artifact: ${PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH}`,
    `artifactSha256: ${discoverySha}`,
    "classifierVersion: 3",
    `candidateDefinitionFingerprint: ${candidateFingerprint}`,
    `frozenDefinitionFingerprint: ${PHASE_4_2_DEFINITION_FINGERPRINT}`,
    `candidateDisposition: ${candidateFingerprint === PHASE_4_2_DEFINITION_FINGERPRINT ? "ACCEPTED_UNCHANGED" : "SUPERSEDED_FOR_V2"}`,
    "bandFreezeStatus: FROZEN",
    "decisionStatus: REVIEWED",
    "",
  ].join("\n");
}

function verificationReviewDocument(verificationSha: string): string {
  return [
    "# Phase 4.2 verification review",
    "phase42ReviewType: VERIFICATION",
    `artifact: ${PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH}`,
    `artifactSha256: ${verificationSha}`,
    `frozenDefinitionFingerprint: ${PHASE_4_2_DEFINITION_FINGERPRINT}`,
    "verificationStatus: PASS",
    "hardInvariantsStatus: PASS",
    "outcomeBandsStatus: PASS",
    "dominanceStatus: PASS",
    "legacyMacroBandsStatus: PASS",
    "settlementMacroBandsStatus: PASS",
    "",
  ].join("\n");
}

function writeArtifactBundle(
  directory: string,
  artifactPath: string,
  checksumPath: string,
  report: object,
): string {
  const bytes = gzipSync(Buffer.from(JSON.stringify(report), "utf8"));
  const artifactSha = sha256(bytes);
  const resolvedArtifactPath = resolve(directory, artifactPath);
  mkdirSync(dirname(resolvedArtifactPath), { recursive: true });
  writeFileSync(resolvedArtifactPath, bytes);
  writeFileSync(
    resolve(directory, checksumPath),
    `${artifactSha}  ${resolvedArtifactPath.split(/[\\/]/u).at(-1) ?? "artifact"}\n`,
    "utf8",
  );
  return artifactSha;
}

function reviewedPolicyFixture(
  candidateContract: unknown = PHASE_4_2_DEFINITION_CONTRACT,
): {
  readonly directory: string;
  readonly policy: Phase42HoldoutPolicy;
} {
  const directory = mkdtempSync(join(tmpdir(), "tiny-civ-phase-4-2-policy-"));
  temporaryDirectories.push(directory);
  const candidateFingerprint = phase42DefinitionFingerprint(candidateContract);
  const discoveryReport = calibrationMatrix(false) as {
    configuration: {
      phase42DefinitionFingerprint: string;
      phase42DefinitionContract: unknown;
    };
  };
  discoveryReport.configuration.phase42DefinitionFingerprint = candidateFingerprint;
  discoveryReport.configuration.phase42DefinitionContract =
    structuredClone(candidateContract);
  const discoverySha = writeArtifactBundle(
    directory,
    PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
    PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH,
    discoveryReport,
  );
  const verificationSha = writeArtifactBundle(
    directory,
    PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
    PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
    calibrationMatrix(true),
  );
  const freezeReview = freezeReviewDocument(discoverySha, candidateFingerprint);
  const verificationReview = verificationReviewDocument(verificationSha);
  writeFileSync(
    resolve(directory, PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH),
    freezeReview,
    "utf8",
  );
  writeFileSync(
    resolve(directory, PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH),
    verificationReview,
    "utf8",
  );
  return {
    directory,
    policy: {
      calibrationStatus: "REVIEWED",
      bandFreezeStatus: "FROZEN",
      holdoutStatus: "READY",
      executionEnabled: true,
      frozenDefinitionFingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
      provenance: {
        discoveryArtifact: PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
        discoveryArtifactSha256: discoverySha,
        discoveryChecksumArtifact: PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH,
        freezeReviewArtifact: PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH,
        freezeReviewArtifactSha256: sha256(freezeReview),
        verificationArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
        verificationArtifactSha256: verificationSha,
        verificationChecksumArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
        verificationReviewArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH,
        verificationReviewArtifactSha256: sha256(verificationReview),
      },
    },
  };
}

function exactRequest() {
  return {
    scenarios: SCENARIO_IDS,
    seeds: PHASE_4_2_HOLDOUT_SEEDS,
    ticks: PHASE_4_2_MATRIX_TICKS,
    outputPath: PHASE_4_2_HOLDOUT_OUTPUT_PATH,
    frozenDefinitionsReady: true,
    definitionFingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
  } as const;
}

function objectAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array.`);
  return value;
}

function verificationPolicyForReport(
  fixture: ReturnType<typeof reviewedPolicyFixture>,
  report: object,
): Phase42HoldoutPolicy {
  const verificationSha = writeArtifactBundle(
    fixture.directory,
    PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
    PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
    report,
  );
  const verificationReview = verificationReviewDocument(verificationSha);
  writeFileSync(
    resolve(fixture.directory, PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH),
    verificationReview,
    "utf8",
  );
  return {
    ...fixture.policy,
    provenance: {
      ...fixture.policy.provenance,
      verificationArtifactSha256: verificationSha,
      verificationReviewArtifactSha256: sha256(verificationReview),
    },
  };
}

function discoveryPolicyForReport(
  fixture: ReturnType<typeof reviewedPolicyFixture>,
  report: object,
): Phase42HoldoutPolicy {
  const discoverySha = writeArtifactBundle(
    fixture.directory,
    PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
    PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH,
    report,
  );
  const freezeReview = freezeReviewDocument(discoverySha);
  writeFileSync(
    resolve(fixture.directory, PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH),
    freezeReview,
    "utf8",
  );
  return {
    ...fixture.policy,
    provenance: {
      ...fixture.policy.provenance,
      discoveryArtifactSha256: discoverySha,
      freezeReviewArtifactSha256: sha256(freezeReview),
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Phase 4.2 corpus lock", () => {
  it("recognizes only the exact reserved seed set and horizon", () => {
    expect(isExactPhase42HoldoutSeedHorizon(PHASE_4_2_HOLDOUT_SEEDS, 10_000)).toBe(true);
    expect(isExactPhase42HoldoutSeedHorizon([2_001], 10_000)).toBe(false);
    expect(isExactPhase42HoldoutSeedHorizon(PHASE_4_2_HOLDOUT_SEEDS, 9_999)).toBe(false);
  });

  it("blocks every reserved seed through generic and raw commands at every horizon", () => {
    for (const command of [
      "run",
      "batch",
      "profile",
      "matrix",
      "raw simulation",
    ] as const) {
      for (const ticks of [0, 1, 9_999, 10_000, 12_000]) {
        expect(() =>
          assertNotReservedPhase42HoldoutCorpus(command, [2_001], ticks),
        ).toThrow("Reserved Phase 4.2 holdout seeds");
      }
    }
  });

  it("accepts only an exact, reviewed, canonical holdout request", () => {
    const fixture = reviewedPolicyFixture();

    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        exactRequest(),
        fixture.directory,
        fixture.policy,
      ),
    ).not.toThrow();
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), seeds: PHASE_4_2_HOLDOUT_SEEDS.slice(1) },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("exactly seeds 2001..2064");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), seeds: [...PHASE_4_2_HOLDOUT_SEEDS].reverse() },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("exactly seeds 2001..2064");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        {
          ...exactRequest(),
          seeds: [...PHASE_4_2_HOLDOUT_SEEDS, PHASE_4_2_HOLDOUT_SEEDS[0] ?? 2_001],
        },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("exactly seeds 2001..2064");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), ticks: 9_999 },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("exactly 10,000 ticks");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), scenarios: SCENARIO_IDS.slice(0, 3) },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("exact four locked scenarios");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), outputPath: "phase-4.2-holdout.json.gz" },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("canonical path");
  });

  it("accepts an explicitly reviewed v1 candidate superseded by frozen v2 definitions", () => {
    const candidateContract = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    candidateContract.phase42.incidenceBands.push({
      tableVersion: 1,
      scenarioId: "petri-world",
      labelId: "ESTABLISHED_SETTLEMENT",
      metricPath: "analysis.outcomes.incidence[ESTABLISHED_SETTLEMENT].occurrences",
      comparison: "GTE",
      threshold: 8,
      requiredEligibleRuns: 64,
    });
    const fixture = reviewedPolicyFixture(candidateContract);

    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        exactRequest(),
        fixture.directory,
        fixture.policy,
      ),
    ).not.toThrow();
    expect(
      readFileSync(
        resolve(fixture.directory, PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH),
        "utf8",
      ),
    ).toContain("candidateDisposition: SUPERSEDED_FOR_V2");
  });

  it("allows post-freeze verification only after reviewed v1 discovery evidence", () => {
    const fixture = reviewedPolicyFixture();
    const postFreezePolicy: Phase42HoldoutPolicy = {
      ...fixture.policy,
      calibrationStatus: "DISCOVERY_RECORDED",
      holdoutStatus: "SEALED",
      executionEnabled: false,
    };

    expect(() =>
      assertPhase42PostFreezeCalibrationExecutionRequest(
        PHASE_4_2_DEFINITION_FINGERPRINT,
        fixture.directory,
        postFreezePolicy,
      ),
    ).not.toThrow();
    expect(() =>
      assertPhase42PostFreezeCalibrationExecutionRequest(
        "2".repeat(64),
        fixture.directory,
        postFreezePolicy,
      ),
    ).toThrow("runtime definitions do not match the reviewed freeze");
  });

  it("rejects missing or invalid v1 discovery evidence before post-freeze execution", () => {
    const missingFixture = reviewedPolicyFixture();
    const missingPolicy: Phase42HoldoutPolicy = {
      ...missingFixture.policy,
      calibrationStatus: "DISCOVERY_RECORDED",
      holdoutStatus: "SEALED",
      executionEnabled: false,
    };
    rmSync(resolve(missingFixture.directory, PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH));
    expect(() =>
      assertPhase42PostFreezeCalibrationExecutionRequest(
        PHASE_4_2_DEFINITION_FINGERPRINT,
        missingFixture.directory,
        missingPolicy,
      ),
    ).toThrow("requires discovery calibration artifact");

    const invalidFixture = reviewedPolicyFixture();
    const invalidBytes = Buffer.from("not a discovery matrix gzip", "utf8");
    const invalidSha = sha256(invalidBytes);
    writeFileSync(
      resolve(invalidFixture.directory, PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH),
      invalidBytes,
    );
    writeFileSync(
      resolve(invalidFixture.directory, PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH),
      `${invalidSha}  phase-4.2-calibration-v1.json.gz\n`,
      "utf8",
    );
    const invalidPolicy: Phase42HoldoutPolicy = {
      ...invalidFixture.policy,
      calibrationStatus: "DISCOVERY_RECORDED",
      holdoutStatus: "SEALED",
      executionEnabled: false,
      provenance: {
        ...invalidFixture.policy.provenance,
        discoveryArtifactSha256: invalidSha,
      },
    };
    expect(() =>
      assertPhase42PostFreezeCalibrationExecutionRequest(
        PHASE_4_2_DEFINITION_FINGERPRINT,
        invalidFixture.directory,
        invalidPolicy,
      ),
    ).toThrow("not a valid gzip JSON matrix artifact");
  });

  it("rejects unreviewed, malformed, and non-passing verification evidence", () => {
    const fixture = reviewedPolicyFixture();
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        calibrationStatus: "VERIFICATION_RECORDED",
      }),
    ).toThrow("sealed until reviewed post-freeze calibration");
    expect(() =>
      assertPhase42HoldoutExecutionRequest(
        { ...exactRequest(), frozenDefinitionsReady: false },
        fixture.directory,
        fixture.policy,
      ),
    ).toThrow("requires checked-in classifier-3 incidence");

    const nonPassing = calibrationMatrix(true) as {
      runs: Array<{
        hardInvariants: { status: string; evaluations: Array<{ status: string }> };
      }>;
    };
    const firstRun = nonPassing.runs[0];
    if (firstRun === undefined) throw new Error("Missing synthetic verification run.");
    firstRun.hardInvariants.status = "FAIL";
    const firstEvaluation = firstRun.hardInvariants.evaluations[0];
    if (firstEvaluation !== undefined) firstEvaluation.status = "FAIL";
    const nonPassingSha = writeArtifactBundle(
      fixture.directory,
      PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
      PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
      nonPassing,
    );
    const verificationReview = verificationReviewDocument(nonPassingSha);
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH),
      verificationReview,
      "utf8",
    );
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        provenance: {
          ...fixture.policy.provenance,
          verificationArtifactSha256: nonPassingSha,
          verificationReviewArtifactSha256: sha256(verificationReview),
        },
      }),
    ).toThrow("non-passing run invariant");
  });

  it("rejects checksum-valid arbitrary bytes instead of trusting their hash", () => {
    const fixture = reviewedPolicyFixture();
    const arbitraryBytes = Buffer.from("not a matrix gzip", "utf8");
    const arbitrarySha = sha256(arbitraryBytes);
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH),
      arbitraryBytes,
    );
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH),
      `${arbitrarySha}  phase-4.2-calibration-v2.json.gz\n`,
      "utf8",
    );
    const review = verificationReviewDocument(arbitrarySha);
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH),
      review,
      "utf8",
    );

    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        provenance: {
          ...fixture.policy.provenance,
          verificationArtifactSha256: arbitrarySha,
          verificationReviewArtifactSha256: sha256(review),
        },
      }),
    ).toThrow("not a valid gzip JSON matrix artifact");
  });

  it("rejects stripped verification profiles, outcomes, analyses, definitions, and comparisons", () => {
    const fixture = reviewedPolicyFixture();
    const cases: Array<{
      name: string;
      expected: string;
      mutate: (report: Record<string, unknown>) => void;
    }> = [
      {
        name: "profile settlement section",
        expected: "profile settlement must be an object",
        mutate: (report) => {
          const run = objectAt(arrayAt(report.runs, "runs")[0], "run");
          delete objectAt(run.profile, "profile").settlement;
        },
      },
      {
        name: "outcome evaluation identity",
        expected: "incomplete or incompatible shape",
        mutate: (report) => {
          const run = objectAt(arrayAt(report.runs, "runs")[0], "run");
          delete objectAt(run.outcomeSummary, "outcome").evaluatedLabelIds;
        },
      },
      {
        name: "per-run invariant evaluations",
        expected: "retain all hard-invariant evaluations",
        mutate: (report) => {
          const run = objectAt(arrayAt(report.runs, "runs")[0], "run");
          objectAt(run.hardInvariants, "hard invariants").evaluations = [];
        },
      },
      {
        name: "aggregate activity",
        expected: "must be an object",
        mutate: (report) => {
          const aggregate = objectAt(report.aggregate, "aggregate");
          const scenario = objectAt(
            arrayAt(aggregate.byScenario, "scenario aggregates")[0],
            "scenario aggregate",
          );
          delete objectAt(scenario.activity, "activity").settlement;
        },
      },
      {
        name: "aggregate outcomes",
        expected: "retain 64 per-run outcomes",
        mutate: (report) => {
          const aggregate = objectAt(report.aggregate, "aggregate");
          const scenario = objectAt(
            arrayAt(aggregate.byScenario, "scenario aggregates")[0],
            "scenario aggregate",
          );
          objectAt(objectAt(scenario.analysis, "analysis").outcomes, "outcomes").perRun =
            [];
        },
      },
      {
        name: "expected-band definitions",
        expected: "retain all expected-band definitions",
        mutate: (report) => {
          const aggregate = objectAt(report.aggregate, "aggregate");
          const scenario = objectAt(
            arrayAt(aggregate.byScenario, "scenario aggregates")[0],
            "scenario aggregate",
          );
          objectAt(
            objectAt(scenario.analysis, "analysis").expectedBands,
            "expected bands",
          ).evaluations = [];
        },
      },
      {
        name: "paired comparisons",
        expected: "retain all six scenario comparisons",
        mutate: (report) => {
          objectAt(report.analysis, "cross-scenario analysis").pairedComparisons = [];
        },
      },
      {
        name: "frozen macro definitions",
        expected: "retain legacy paired macro definitions",
        mutate: (report) => {
          const analysis = objectAt(report.analysis, "cross-scenario analysis");
          objectAt(analysis.frozenPairedMacroBands, "frozen paired bands").evaluations = [];
        },
      },
    ];

    for (const testCase of cases) {
      const report = objectAt(calibrationMatrix(true), testCase.name);
      testCase.mutate(report);
      const policy = verificationPolicyForReport(fixture, report);
      expect(
        () =>
          assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, policy),
        testCase.name,
      ).toThrow(testCase.expected);
    }
  }, 20_000);

  it("rejects a stripped discovery candidate even when its checksum and review match", () => {
    const fixture = reviewedPolicyFixture();
    const discovery = objectAt(calibrationMatrix(false), "discovery report");
    const firstRun = objectAt(arrayAt(discovery.runs, "discovery runs")[0], "run");
    delete objectAt(firstRun.profile, "profile").settlement;
    const policy = discoveryPolicyForReport(fixture, discovery);

    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, policy),
    ).toThrow("profile settlement must be an object");
  });

  it("requires separate immutable discovery and verification review provenance", () => {
    const fixture = reviewedPolicyFixture();
    expect(fixture.policy.provenance.discoveryArtifactSha256).not.toBeNull();
    expect(fixture.policy.provenance.verificationArtifactSha256).not.toBeNull();
    expect(fixture.policy.provenance.freezeReviewArtifact).not.toBe(
      fixture.policy.provenance.verificationReviewArtifact,
    );
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        provenance: {
          ...fixture.policy.provenance,
          freezeReviewArtifactSha256: "0".repeat(64),
        },
      }),
    ).toThrow("freeze review artifact SHA-256 does not match policy");

    const weakReview = `artifactSha256: ${fixture.policy.provenance.discoveryArtifactSha256 ?? "missing"}\n`;
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH),
      weakReview,
      "utf8",
    );
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        provenance: {
          ...fixture.policy.provenance,
          freezeReviewArtifactSha256: sha256(weakReview),
        },
      }),
    ).toThrow("exactly one unambiguous review marker phase42ReviewType: FREEZE");

    const discoverySha = fixture.policy.provenance.discoveryArtifactSha256;
    if (discoverySha === null) throw new Error("Missing synthetic discovery SHA.");
    const ambiguousReview = `${freezeReviewDocument(discoverySha)}frozenDefinitionFingerprint: ${PHASE_4_2_DEFINITION_FINGERPRINT}\n`;
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH),
      ambiguousReview,
      "utf8",
    );
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        provenance: {
          ...fixture.policy.provenance,
          freezeReviewArtifactSha256: sha256(ambiguousReview),
        },
      }),
    ).toThrow("exactly one unambiguous review marker frozenDefinitionFingerprint");
  });

  it("acquires one durable attempt marker before execution and never silently retries", () => {
    const fixture = reviewedPolicyFixture();
    const markerPath = acquirePhase42HoldoutAttempt(
      exactRequest(),
      fixture.directory,
      fixture.policy,
    );

    expect(markerPath).toBe(resolve(fixture.directory, PHASE_4_2_HOLDOUT_ATTEMPT_PATH));
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toMatchObject({
      status: "CONSUMED_ATTEMPT",
      corpus: "phase-4.2-holdout",
      frozenDefinitionFingerprint: PHASE_4_2_DEFINITION_FINGERPRINT,
      durabilityModel:
        process.platform === "win32"
          ? "FILE_FSYNC_WINDOWS_DIRECTORY_FSYNC_UNAVAILABLE_IN_NODE"
          : "FILE_AND_PARENT_DIRECTORY_FSYNC",
      retryPolicy: "NO_RETRY_WITHOUT_EXPLICIT_AUDIT",
    });
    expect(() =>
      acquirePhase42HoldoutAttempt(exactRequest(), fixture.directory, fixture.policy),
    ).toThrow("already been consumed or invalidated");
  });

  it("treats a partial evidence set as invalid instead of overwriting or retrying", () => {
    const fixture = reviewedPolicyFixture();
    writeFileSync(
      resolve(fixture.directory, PHASE_4_2_HOLDOUT_CHECKSUM_PATH),
      "partial\n",
      "utf8",
    );

    expect(() =>
      acquirePhase42HoldoutAttempt(exactRequest(), fixture.directory, fixture.policy),
    ).toThrow("evidence already exists or is partial");
    expect(existsSync(resolve(fixture.directory, PHASE_4_2_HOLDOUT_ATTEMPT_PATH))).toBe(
      false,
    );
  });

  it("permanently refuses a policy already marked recorded", () => {
    const fixture = reviewedPolicyFixture();
    expect(() =>
      assertPhase42HoldoutExecutionRequest(exactRequest(), fixture.directory, {
        ...fixture.policy,
        holdoutStatus: "RECORDED",
        executionEnabled: false,
      }),
    ).toThrow("already recorded and cannot be rerun");
  });
});
