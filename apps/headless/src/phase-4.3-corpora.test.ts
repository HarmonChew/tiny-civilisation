import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCENARIO_IDS } from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import {
  PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH,
  PHASE_4_3_CALIBRATION_SEEDS,
  PHASE_4_3_HOLDOUT_ATTEMPT_PATH,
  PHASE_4_3_HOLDOUT_OUTPUT_PATH,
  PHASE_4_3_HOLDOUT_POLICY,
  PHASE_4_3_HOLDOUT_SEEDS,
  PHASE_4_3_MATRIX_TICKS,
  acquirePhase43HoldoutAttempt,
  assertNotReservedPhase43HoldoutCorpus,
  assertPhase43CalibrationExecutionRequest,
  assertPhase43HoldoutExecutionRequest,
  isExactPhase43HoldoutSeedHorizon,
  type Phase43HoldoutExecutionRequest,
  type Phase43HoldoutPolicy,
} from "./phase-4.3-corpora.js";

const fingerprint = "a".repeat(64);
const artifactSha = "b".repeat(64);

function request(): Phase43HoldoutExecutionRequest {
  return {
    scenarios: SCENARIO_IDS,
    seeds: PHASE_4_3_HOLDOUT_SEEDS,
    ticks: PHASE_4_3_MATRIX_TICKS,
    outputPath: PHASE_4_3_HOLDOUT_OUTPUT_PATH,
    frozenDefinitionsReady: true,
    definitionFingerprint: fingerprint,
  };
}

function readyPolicy(): Phase43HoldoutPolicy {
  return {
    calibrationStatus: "REVIEWED",
    bandFreezeStatus: "FROZEN",
    holdoutStatus: "READY",
    executionEnabled: true,
    frozenDefinitionFingerprint: fingerprint,
    provenance: {
      discoveryArtifactSha256: artifactSha,
      freezeReviewArtifactSha256: artifactSha,
      verificationArtifactSha256: artifactSha,
      verificationReviewArtifactSha256: artifactSha,
      releaseCandidateCommit: "b".repeat(40),
      automatedReleaseCheckArtifactSha256: artifactSha,
      deploymentSmokeArtifactSha256: artifactSha,
      finalNvdaArtifactSha256: artifactSha,
    },
  };
}

describe("Phase 4.3 corpus process lock", () => {
  it("locks calibration to four scenarios, seeds 1..64, 10,000 ticks, and canonical output", () => {
    expect(() =>
      assertPhase43CalibrationExecutionRequest({
        scenarios: SCENARIO_IDS,
        seeds: PHASE_4_3_CALIBRATION_SEEDS,
        ticks: PHASE_4_3_MATRIX_TICKS,
        outputPath: PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH,
      }),
    ).not.toThrow();
    expect(() =>
      assertPhase43CalibrationExecutionRequest({
        scenarios: SCENARIO_IDS,
        seeds: [1],
        ticks: PHASE_4_3_MATRIX_TICKS,
        outputPath: PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH,
      }),
    ).toThrow("exactly seeds 1..64");
  });

  it("reserves every Phase 4.3 holdout seed from every generic command and horizon", () => {
    for (const command of [
      "run",
      "batch",
      "profile",
      "matrix",
      "raw simulation",
    ] as const) {
      expect(() => assertNotReservedPhase43HoldoutCorpus(command, [3_001], 0)).toThrow(
        "Reserved Phase 4.3 holdout seeds 3001..3064",
      );
    }
    expect(isExactPhase43HoldoutSeedHorizon(PHASE_4_3_HOLDOUT_SEEDS, 10_000)).toBe(true);
    expect(isExactPhase43HoldoutSeedHorizon(PHASE_4_3_HOLDOUT_SEEDS, 9_999)).toBe(false);
  });

  it("keeps the checked-in holdout sealed with no fabricated provenance", () => {
    expect(PHASE_4_3_HOLDOUT_POLICY).toMatchObject({
      calibrationStatus: "NOT_RUN",
      bandFreezeStatus: "NOT_FROZEN",
      holdoutStatus: "SEALED",
      executionEnabled: false,
      frozenDefinitionFingerprint: null,
      provenance: {
        releaseCandidateCommit: null,
        automatedReleaseCheckArtifactSha256: null,
        deploymentSmokeArtifactSha256: null,
        finalNvdaArtifactSha256: null,
      },
    });
    expect(() => assertPhase43HoldoutExecutionRequest(request())).toThrow(
      "holdout is sealed",
    );
  });

  it("acquires one durable consumed-attempt marker and refuses a second attempt", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-civ-phase43-attempt-"));
    const markerPath = acquirePhase43HoldoutAttempt(request(), directory, readyPolicy());
    expect(markerPath.endsWith(PHASE_4_3_HOLDOUT_ATTEMPT_PATH.replaceAll("/", "\\"))).toBe(
      process.platform === "win32",
    );
    expect(readFileSync(markerPath, "utf8")).toContain('"status": "CONSUMED_ATTEMPT"');
    expect(readFileSync(markerPath, "utf8")).toContain(
      '"releaseCandidateCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
    );
    expect(() => acquirePhase43HoldoutAttempt(request(), directory, readyPolicy())).toThrow(
      "already been consumed",
    );
  });

  it("requires release automation, deployment smoke, and final NVDA provenance", () => {
    const policy = readyPolicy();
    for (const missingField of [
      "automatedReleaseCheckArtifactSha256",
      "deploymentSmokeArtifactSha256",
      "finalNvdaArtifactSha256",
    ] as const) {
      expect(() =>
        assertPhase43HoldoutExecutionRequest(request(), process.cwd(), {
          ...policy,
          provenance: { ...policy.provenance, [missingField]: null },
        }),
      ).toThrow("SHA-256");
    }
    expect(() =>
      assertPhase43HoldoutExecutionRequest(request(), process.cwd(), {
        ...policy,
        provenance: { ...policy.provenance, releaseCandidateCommit: null },
      }),
    ).toThrow("full Git object ID");
  });
});
