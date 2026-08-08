import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

import { syncParentDirectoryForDurability } from "./durable-file.js";

export const PHASE_4_3_MATRIX_TICKS = 10_000 as const;
export const PHASE_4_3_CALIBRATION_SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, index) => index + 1),
);
export const PHASE_4_3_HOLDOUT_SEED_START = 3_001 as const;
export const PHASE_4_3_HOLDOUT_SEED_END = 3_064 as const;
export const PHASE_4_3_HOLDOUT_SEEDS: readonly number[] = Object.freeze(
  Array.from(
    { length: PHASE_4_3_HOLDOUT_SEED_END - PHASE_4_3_HOLDOUT_SEED_START + 1 },
    (_, index) => PHASE_4_3_HOLDOUT_SEED_START + index,
  ),
);

export const PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-v1.json.gz" as const;
export const PHASE_4_3_CALIBRATION_DISCOVERY_CHECKSUM_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-v1.sha256" as const;
export const PHASE_4_3_CALIBRATION_FREEZE_REVIEW_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-review-v1.md" as const;
export const PHASE_4_3_CALIBRATION_VERIFICATION_OUTPUT_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-v2.json.gz" as const;
export const PHASE_4_3_CALIBRATION_VERIFICATION_CHECKSUM_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-v2.sha256" as const;
export const PHASE_4_3_CALIBRATION_VERIFICATION_REVIEW_PATH =
  "docs/baselines/phase-4.3-lifecycle-calibration-verification-review-v1.md" as const;
export const PHASE_4_3_HOLDOUT_OUTPUT_PATH =
  "docs/baselines/phase-4.3-lifecycle-holdout-v1.json.gz" as const;
export const PHASE_4_3_HOLDOUT_CHECKSUM_PATH =
  "docs/baselines/phase-4.3-lifecycle-holdout-v1.sha256" as const;
export const PHASE_4_3_HOLDOUT_SUMMARY_PATH =
  "docs/baselines/phase-4.3-lifecycle-holdout-v1.md" as const;
export const PHASE_4_3_HOLDOUT_ATTEMPT_PATH =
  "docs/baselines/phase-4.3-lifecycle-holdout-v1.attempt.json" as const;
export const PHASE_4_3_AUTOMATED_RELEASE_CHECK_PATH =
  "docs/baselines/phase-4.3-automated-release-check-v1.json" as const;
export const PHASE_4_3_DEPLOYMENT_SMOKE_PATH =
  "docs/baselines/phase-4.3-deployment-smoke-v1.json" as const;
export const PHASE_4_3_FINAL_NVDA_PATH =
  "docs/baselines/phase-4.3-final-nvda-v1.json" as const;

export type Phase43CalibrationStatus =
  "NOT_RUN" | "DISCOVERY_RECORDED" | "VERIFICATION_RECORDED" | "REVIEWED";
export type Phase43BandFreezeStatus = "NOT_FROZEN" | "FROZEN";
export type Phase43HoldoutStatus = "SEALED" | "READY" | "RECORDED" | "FAILED_RECORDED";

export interface Phase43HoldoutProvenance {
  readonly discoveryArtifactSha256: string | null;
  readonly freezeReviewArtifactSha256: string | null;
  readonly verificationArtifactSha256: string | null;
  readonly verificationReviewArtifactSha256: string | null;
  readonly releaseCandidateCommit: string | null;
  readonly automatedReleaseCheckArtifactSha256: string | null;
  readonly deploymentSmokeArtifactSha256: string | null;
  readonly finalNvdaArtifactSha256: string | null;
}

export interface Phase43HoldoutPolicy {
  readonly calibrationStatus: Phase43CalibrationStatus;
  readonly bandFreezeStatus: Phase43BandFreezeStatus;
  readonly holdoutStatus: Phase43HoldoutStatus;
  readonly executionEnabled: boolean;
  readonly frozenDefinitionFingerprint: string | null;
  readonly provenance: Phase43HoldoutProvenance;
}

/**
 * Prospective process lock. Calibration has not been generated or reviewed;
 * the reserved holdout is sealed and execution is intentionally impossible.
 */
export const PHASE_4_3_HOLDOUT_POLICY: Phase43HoldoutPolicy = Object.freeze({
  calibrationStatus: "NOT_RUN",
  bandFreezeStatus: "NOT_FROZEN",
  holdoutStatus: "SEALED",
  executionEnabled: false,
  frozenDefinitionFingerprint: null,
  provenance: Object.freeze({
    discoveryArtifactSha256: null,
    freezeReviewArtifactSha256: null,
    verificationArtifactSha256: null,
    verificationReviewArtifactSha256: null,
    releaseCandidateCommit: null,
    automatedReleaseCheckArtifactSha256: null,
    deploymentSmokeArtifactSha256: null,
    finalNvdaArtifactSha256: null,
  }),
});

export const PHASE_4_3_CALIBRATION_STATUS = PHASE_4_3_HOLDOUT_POLICY.calibrationStatus;
export const PHASE_4_3_BAND_FREEZE_STATUS = PHASE_4_3_HOLDOUT_POLICY.bandFreezeStatus;
export const PHASE_4_3_HOLDOUT_STATUS = PHASE_4_3_HOLDOUT_POLICY.holdoutStatus;
export const PHASE_4_3_HOLDOUT_EXECUTION_ENABLED =
  PHASE_4_3_HOLDOUT_POLICY.executionEnabled;

function sameSequence<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function requireSha256(value: string | null, label: string): string {
  if (value === null || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Phase 4.3 holdout requires a reviewed ${label} SHA-256.`);
  }
  return value;
}

function requireCanonicalFingerprint(value: string | null, label: string): string {
  if (value === null || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Phase 4.3 ${label} must be a canonical SHA-256 fingerprint.`);
  }
  return value;
}

function requireGitObjectId(value: string | null, label: string): string {
  if (value === null || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
    throw new Error(`Phase 4.3 ${label} must be a full Git object ID.`);
  }
  return value;
}

function assertCanonicalPath(
  actualPath: string | undefined,
  canonicalPath: string,
  invocationDirectory: string,
  label: string,
): void {
  if (
    actualPath === undefined ||
    resolve(invocationDirectory, actualPath) !== resolve(invocationDirectory, canonicalPath)
  ) {
    throw new Error(`${label} must use canonical path ${canonicalPath}.`);
  }
}

export function phase43CalibrationOutputPath(
  policy: Phase43HoldoutPolicy = PHASE_4_3_HOLDOUT_POLICY,
):
  | typeof PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH
  | typeof PHASE_4_3_CALIBRATION_VERIFICATION_OUTPUT_PATH {
  return policy.bandFreezeStatus === "FROZEN"
    ? PHASE_4_3_CALIBRATION_VERIFICATION_OUTPUT_PATH
    : PHASE_4_3_CALIBRATION_DISCOVERY_OUTPUT_PATH;
}

export function isPhase43HoldoutSeed(seed: number): boolean {
  return seed >= PHASE_4_3_HOLDOUT_SEED_START && seed <= PHASE_4_3_HOLDOUT_SEED_END;
}

export function isExactPhase43HoldoutSeedHorizon(
  seeds: readonly number[],
  ticks: number,
): boolean {
  const sortedUnique = [...new Set(seeds)].sort((left, right) => left - right);
  return (
    ticks === PHASE_4_3_MATRIX_TICKS && sameSequence(sortedUnique, PHASE_4_3_HOLDOUT_SEEDS)
  );
}

export function assertNotReservedPhase43HoldoutCorpus(
  command: "run" | "batch" | "profile" | "matrix" | "raw simulation",
  seeds: readonly number[],
  _ticks: number,
): void {
  if (seeds.some(isPhase43HoldoutSeed)) {
    throw new Error(
      `Reserved Phase 4.3 holdout seeds 3001..3064 may not run through generic ${command}; use the locked phase-4.3-holdout matrix workflow.`,
    );
  }
}

export interface Phase43CalibrationExecutionRequest {
  readonly scenarios: readonly ScenarioId[];
  readonly seeds: readonly number[];
  readonly ticks: number;
  readonly outputPath: string | undefined;
}

export function assertPhase43CalibrationExecutionRequest(
  request: Phase43CalibrationExecutionRequest,
  invocationDirectory = process.cwd(),
  policy: Phase43HoldoutPolicy = PHASE_4_3_HOLDOUT_POLICY,
): void {
  if (!sameSequence(request.scenarios, SCENARIO_IDS)) {
    throw new Error(
      "Phase 4.3 calibration requires the exact four locked scenarios in catalog order.",
    );
  }
  if (!sameSequence(request.seeds, PHASE_4_3_CALIBRATION_SEEDS)) {
    throw new Error("Phase 4.3 calibration requires exactly seeds 1..64.");
  }
  if (request.ticks !== PHASE_4_3_MATRIX_TICKS) {
    throw new Error("Phase 4.3 calibration requires exactly 10,000 ticks per run.");
  }
  assertCanonicalPath(
    request.outputPath,
    phase43CalibrationOutputPath(policy),
    invocationDirectory,
    "Phase 4.3 calibration output",
  );
  if (policy.holdoutStatus !== "SEALED" || policy.executionEnabled) {
    throw new Error("Phase 4.3 calibration requires a sealed, disabled holdout.");
  }
  if (policy.bandFreezeStatus === "NOT_FROZEN" && policy.calibrationStatus !== "NOT_RUN") {
    throw new Error(
      "Phase 4.3 discovery calibration is no-clobber and may run only from NOT_RUN state.",
    );
  }
  if (
    policy.bandFreezeStatus === "FROZEN" &&
    policy.calibrationStatus !== "DISCOVERY_RECORDED"
  ) {
    throw new Error(
      "Phase 4.3 frozen verification requires recorded discovery and reviewed frozen definitions.",
    );
  }
}

export interface Phase43HoldoutExecutionRequest {
  readonly scenarios: readonly ScenarioId[];
  readonly seeds: readonly number[];
  readonly ticks: number;
  readonly outputPath: string | undefined;
  readonly frozenDefinitionsReady: boolean;
  readonly definitionFingerprint: string;
}

export function assertPhase43HoldoutExecutionRequest(
  request: Phase43HoldoutExecutionRequest,
  invocationDirectory = process.cwd(),
  policy: Phase43HoldoutPolicy = PHASE_4_3_HOLDOUT_POLICY,
): void {
  if (policy.holdoutStatus === "RECORDED" || policy.holdoutStatus === "FAILED_RECORDED") {
    throw new Error(
      "The Phase 4.3 holdout attempt is already recorded and cannot be rerun.",
    );
  }
  if (!sameSequence(request.scenarios, SCENARIO_IDS)) {
    throw new Error(
      "Phase 4.3 holdout requires the exact four locked scenarios in catalog order.",
    );
  }
  if (!sameSequence(request.seeds, PHASE_4_3_HOLDOUT_SEEDS)) {
    throw new Error("Phase 4.3 holdout requires exactly seeds 3001..3064.");
  }
  if (request.ticks !== PHASE_4_3_MATRIX_TICKS) {
    throw new Error("Phase 4.3 holdout requires exactly 10,000 ticks per run.");
  }
  assertCanonicalPath(
    request.outputPath,
    PHASE_4_3_HOLDOUT_OUTPUT_PATH,
    invocationDirectory,
    "Phase 4.3 holdout output",
  );
  if (
    policy.calibrationStatus !== "REVIEWED" ||
    policy.bandFreezeStatus !== "FROZEN" ||
    policy.holdoutStatus !== "READY" ||
    !policy.executionEnabled
  ) {
    throw new Error(
      "The Phase 4.3 holdout is sealed until reviewed frozen verification, final unified NVDA, and an explicit reviewed unlock are recorded.",
    );
  }
  if (!request.frozenDefinitionsReady) {
    throw new Error(
      "The Phase 4.3 holdout requires checked-in classifier-4 incidence, dominance, population, and LIFECYCLE macro definitions.",
    );
  }
  const frozenFingerprint = requireCanonicalFingerprint(
    policy.frozenDefinitionFingerprint,
    "frozen definition fingerprint",
  );
  if (
    requireCanonicalFingerprint(
      request.definitionFingerprint,
      "runtime definition fingerprint",
    ) !== frozenFingerprint
  ) {
    throw new Error(
      "The Phase 4.3 holdout runtime definition fingerprint does not match the reviewed frozen policy.",
    );
  }
  requireSha256(policy.provenance.discoveryArtifactSha256, "discovery artifact");
  requireSha256(policy.provenance.freezeReviewArtifactSha256, "freeze review artifact");
  requireSha256(policy.provenance.verificationArtifactSha256, "verification artifact");
  requireSha256(
    policy.provenance.verificationReviewArtifactSha256,
    "verification review artifact",
  );
  requireGitObjectId(policy.provenance.releaseCandidateCommit, "release candidate commit");
  requireSha256(
    policy.provenance.automatedReleaseCheckArtifactSha256,
    "automated release-check artifact",
  );
  requireSha256(
    policy.provenance.deploymentSmokeArtifactSha256,
    "deployment-smoke artifact",
  );
  requireSha256(policy.provenance.finalNvdaArtifactSha256, "final unified NVDA artifact");
}

export function acquirePhase43HoldoutAttempt(
  request: Phase43HoldoutExecutionRequest,
  invocationDirectory = process.cwd(),
  policy: Phase43HoldoutPolicy = PHASE_4_3_HOLDOUT_POLICY,
): string {
  const attemptPath = resolve(invocationDirectory, PHASE_4_3_HOLDOUT_ATTEMPT_PATH);
  if (existsSync(attemptPath)) {
    throw new Error(
      "The Phase 4.3 holdout has already been consumed or invalidated; its durable attempt marker requires explicit audit.",
    );
  }
  assertPhase43HoldoutExecutionRequest(request, invocationDirectory, policy);
  const evidencePaths = [
    PHASE_4_3_HOLDOUT_OUTPUT_PATH,
    PHASE_4_3_HOLDOUT_CHECKSUM_PATH,
    PHASE_4_3_HOLDOUT_SUMMARY_PATH,
  ].map((path) => resolve(invocationDirectory, path));
  if (evidencePaths.some(existsSync)) {
    throw new Error(
      "Phase 4.3 holdout evidence already exists or is partial; explicit audit is required and rerun is forbidden.",
    );
  }
  mkdirSync(dirname(attemptPath), { recursive: true });
  const marker = `${JSON.stringify(
    {
      schemaVersion: 1,
      status: "CONSUMED_ATTEMPT",
      corpus: "phase-4.3-holdout",
      scenarios: request.scenarios,
      seeds: request.seeds,
      ticksPerRun: request.ticks,
      outputPath: PHASE_4_3_HOLDOUT_OUTPUT_PATH,
      discoveryArtifactSha256: policy.provenance.discoveryArtifactSha256,
      verificationArtifactSha256: policy.provenance.verificationArtifactSha256,
      releaseCandidateCommit: policy.provenance.releaseCandidateCommit,
      automatedReleaseCheckArtifactSha256:
        policy.provenance.automatedReleaseCheckArtifactSha256,
      deploymentSmokeArtifactSha256: policy.provenance.deploymentSmokeArtifactSha256,
      finalNvdaArtifactSha256: policy.provenance.finalNvdaArtifactSha256,
      frozenDefinitionFingerprint: request.definitionFingerprint,
      durabilityModel:
        process.platform === "win32"
          ? "FILE_FSYNC_WINDOWS_DIRECTORY_FSYNC_UNAVAILABLE_IN_NODE"
          : "FILE_AND_PARENT_DIRECTORY_FSYNC",
      retryPolicy: "NO_RETRY_WITHOUT_EXPLICIT_AUDIT",
    },
    null,
    2,
  )}\n`;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(attemptPath, "wx");
    writeFileSync(descriptor, marker, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    throw new Error(
      `The Phase 4.3 holdout attempt could not acquire its exclusive durable marker; execution is forbidden and any created marker requires audit: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    syncParentDirectoryForDurability(attemptPath);
  } catch (error) {
    throw new Error(
      `The Phase 4.3 holdout marker file was flushed, but its parent directory could not be made durable; execution is forbidden and the marker requires audit: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return attemptPath;
}
