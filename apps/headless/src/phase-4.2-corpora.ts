import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

import { syncParentDirectoryForDurability } from "./durable-file.js";
import { canonicalPhase42DefinitionJson } from "./phase-4.2-canonical-json.js";
import { assertCompletePhase42CalibrationMatrixEvidence } from "./phase-4.2-matrix-contract.js";

export const PHASE_4_2_HOLDOUT_SEED_START = 2_001 as const;
export const PHASE_4_2_HOLDOUT_SEED_END = 2_064 as const;
export const PHASE_4_2_HOLDOUT_SEEDS: readonly number[] = Object.freeze(
  Array.from(
    { length: PHASE_4_2_HOLDOUT_SEED_END - PHASE_4_2_HOLDOUT_SEED_START + 1 },
    (_, index) => PHASE_4_2_HOLDOUT_SEED_START + index,
  ),
);
export const PHASE_4_2_MATRIX_TICKS = 10_000 as const;
export const PHASE_4_2_CALIBRATION_SEEDS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, index) => index + 1),
);

export const PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH =
  "docs/baselines/phase-4.2-calibration-v1.json.gz" as const;
export const PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH =
  "docs/baselines/phase-4.2-calibration-v1.sha256" as const;
export const PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH =
  "docs/baselines/phase-4.2-calibration-review-v1.md" as const;
/** Backward-compatible name for the discovery/freeze review. */
export const PHASE_4_2_CALIBRATION_REVIEW_PATH = PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH;
export const PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH =
  "docs/baselines/phase-4.2-calibration-v2.json.gz" as const;
export const PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH =
  "docs/baselines/phase-4.2-calibration-v2.sha256" as const;
export const PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH =
  "docs/baselines/phase-4.2-calibration-verification-review-v1.md" as const;
export const PHASE_4_2_HOLDOUT_OUTPUT_PATH =
  "docs/baselines/phase-4.2-holdout-v1.json.gz" as const;
export const PHASE_4_2_HOLDOUT_CHECKSUM_PATH =
  "docs/baselines/phase-4.2-holdout-v1.sha256" as const;
export const PHASE_4_2_HOLDOUT_SUMMARY_PATH =
  "docs/baselines/phase-4.2-holdout-v1.md" as const;
export const PHASE_4_2_HOLDOUT_ATTEMPT_PATH =
  "docs/baselines/phase-4.2-holdout-v1.attempt.json" as const;

const EXPECTED_ACTIVITY_PROFILE_SCHEMA_VERSION = 5 as const;
const EXPECTED_BEHAVIOR_VERSION = 5 as const;
const EXPECTED_SCENARIO_SCHEMA_VERSION = 2 as const;
const EXPECTED_SCENARIO_DEFINITION_VERSION = 2 as const;
const EXPECTED_MAP_GENERATION_VERSION = 1 as const;
const EXPECTED_SCENARIO_ANALYSIS_SCHEMA_VERSION = 4 as const;
const EXPECTED_OUTCOME_CLASSIFIER_VERSION = 3 as const;
const EXPECTED_DEFINITION_CONTRACT_SCHEMA_VERSION = 1 as const;
const EXPECTED_DEFINITION_FINGERPRINT_ALGORITHM = "SHA256_CANONICAL_JSON_V1" as const;

export type Phase42CalibrationStatus =
  "NOT_RUN" | "DISCOVERY_RECORDED" | "VERIFICATION_RECORDED" | "REVIEWED";
export type Phase42BandFreezeStatus = "NOT_FROZEN" | "FROZEN";
export type Phase42HoldoutStatus = "SEALED" | "READY" | "RECORDED";

export interface Phase42ReviewedCalibrationProvenance {
  readonly discoveryArtifact: typeof PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH;
  readonly discoveryArtifactSha256: string | null;
  readonly discoveryChecksumArtifact: typeof PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH;
  readonly freezeReviewArtifact: typeof PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH;
  readonly freezeReviewArtifactSha256: string | null;
  readonly verificationArtifact: typeof PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH;
  readonly verificationArtifactSha256: string | null;
  readonly verificationChecksumArtifact: typeof PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH;
  readonly verificationReviewArtifact: typeof PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH;
  readonly verificationReviewArtifactSha256: string | null;
}

export interface Phase42HoldoutPolicy {
  readonly calibrationStatus: Phase42CalibrationStatus;
  readonly bandFreezeStatus: Phase42BandFreezeStatus;
  readonly holdoutStatus: Phase42HoldoutStatus;
  readonly executionEnabled: boolean;
  readonly frozenDefinitionFingerprint: string | null;
  readonly provenance: Phase42ReviewedCalibrationProvenance;
}

/**
 * Release-process lock. Discovery evidence, the reviewed classifier/bands,
 * and the passing same-seed v2 verification are frozen here. The exact
 * reserved holdout completed its single durable, no-retry execution and is
 * resealed as RECORDED after successful evidence installation.
 */
export const PHASE_4_2_HOLDOUT_POLICY: Phase42HoldoutPolicy = Object.freeze({
  calibrationStatus: "REVIEWED",
  bandFreezeStatus: "FROZEN",
  holdoutStatus: "RECORDED",
  executionEnabled: false,
  frozenDefinitionFingerprint:
    "3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6",
  provenance: Object.freeze({
    discoveryArtifact: PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
    discoveryArtifactSha256:
      "296239c70c1e13de577e5a5b19b5871584acb37d22ce21349782de4b3a6c1e78",
    discoveryChecksumArtifact: PHASE_4_2_CALIBRATION_DISCOVERY_CHECKSUM_PATH,
    freezeReviewArtifact: PHASE_4_2_CALIBRATION_FREEZE_REVIEW_PATH,
    freezeReviewArtifactSha256:
      "3fff144ca7c375dd673d1c6a1b4e97c87bb475c81b2dd3d2c4d9a8120a77677e",
    verificationArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
    verificationArtifactSha256:
      "1b7fd1e4cedcde43a4601d42109dfa7dc2c7a17e1cbce27031a31e9ee41ac52a",
    verificationChecksumArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_CHECKSUM_PATH,
    verificationReviewArtifact: PHASE_4_2_CALIBRATION_VERIFICATION_REVIEW_PATH,
    verificationReviewArtifactSha256:
      "c4e33906bff857a93a413dd579dd6c0f69339a3bd98ee14918350456e9b7d1e4",
  }),
});

export const PHASE_4_2_CALIBRATION_STATUS = PHASE_4_2_HOLDOUT_POLICY.calibrationStatus;
export const PHASE_4_2_BAND_FREEZE_STATUS = PHASE_4_2_HOLDOUT_POLICY.bandFreezeStatus;
export const PHASE_4_2_HOLDOUT_STATUS = PHASE_4_2_HOLDOUT_POLICY.holdoutStatus;
export const PHASE_4_2_HOLDOUT_EXECUTION_ENABLED =
  PHASE_4_2_HOLDOUT_POLICY.executionEnabled;

export function phase42CalibrationOutputPath(
  policy: Phase42HoldoutPolicy = PHASE_4_2_HOLDOUT_POLICY,
):
  | typeof PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH
  | typeof PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH {
  return policy.bandFreezeStatus === "FROZEN"
    ? PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH
    : PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH;
}

function sameSequence<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

export function isExactPhase42HoldoutSeedHorizon(
  seeds: readonly number[],
  ticks: number,
): boolean {
  const sortedUnique = [...new Set(seeds)].sort((left, right) => left - right);
  return (
    ticks === PHASE_4_2_MATRIX_TICKS && sameSequence(sortedUnique, PHASE_4_2_HOLDOUT_SEEDS)
  );
}

export function isPhase42HoldoutSeed(seed: number): boolean {
  return seed >= PHASE_4_2_HOLDOUT_SEED_START && seed <= PHASE_4_2_HOLDOUT_SEED_END;
}

export function assertNotReservedPhase42HoldoutCorpus(
  command: "run" | "batch" | "profile" | "matrix" | "raw simulation",
  seeds: readonly number[],
  _ticks: number,
): void {
  if (seeds.some(isPhase42HoldoutSeed)) {
    throw new Error(
      `Reserved Phase 4.2 holdout seeds 2001..2064 may not run through generic ${command}; use the locked phase-4.2-holdout matrix workflow.`,
    );
  }
}

export interface Phase42HoldoutExecutionRequest {
  readonly scenarios: readonly ScenarioId[];
  readonly seeds: readonly number[];
  readonly ticks: number;
  readonly outputPath: string | undefined;
  readonly frozenDefinitionsReady: boolean;
  readonly definitionFingerprint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Phase 4.2 ${label} must be an object.`);
  return value;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Phase 4.2 ${label} must be an array.`);
  return value;
}

function requireSha256(value: string | null, label: string): string {
  if (value === null || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Phase 4.2 holdout requires a reviewed ${label} SHA-256.`);
  }
  return value;
}

function requireDefinitionFingerprint(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Phase 4.2 ${label} must be a canonical SHA-256 fingerprint.`);
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

function parseMatrixArtifact(bytes: Buffer, label: string): Record<string, unknown> {
  try {
    return recordAt(
      JSON.parse(gunzipSync(bytes).toString("utf8")) as unknown,
      `${label} matrix`,
    );
  } catch (error) {
    throw new Error(
      `Phase 4.2 ${label} is not a valid gzip JSON matrix artifact: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function assertScenarioEnvelope(
  value: unknown,
  expectedScenarioId: ScenarioId,
  expectedSeed: number,
  label: string,
): void {
  const scenario = recordAt(value, label);
  if (
    scenario.kind !== "tiny-civilisation/scenario" ||
    scenario.schemaVersion !== EXPECTED_SCENARIO_SCHEMA_VERSION ||
    scenario.behaviorVersion !== EXPECTED_BEHAVIOR_VERSION ||
    scenario.scenarioId !== expectedScenarioId ||
    scenario.scenarioVersion !== EXPECTED_SCENARIO_DEFINITION_VERSION ||
    scenario.mapGenerationVersion !== EXPECTED_MAP_GENERATION_VERSION ||
    scenario.seed !== expectedSeed
  ) {
    throw new Error(`Phase 4.2 ${label} has an incompatible scenario envelope.`);
  }
}

function assertCalibrationMatrixContract(
  report: Record<string, unknown>,
  requireFrozenPass: boolean,
  expectedFrozenFingerprint?: string,
): string {
  if (report.schemaVersion !== EXPECTED_ACTIVITY_PROFILE_SCHEMA_VERSION) {
    throw new Error("Phase 4.2 calibration must use activity-profile schema 5.");
  }
  if (report.command !== "matrix") {
    throw new Error("Phase 4.2 calibration provenance must reference a matrix artifact.");
  }
  const configuration = recordAt(report.configuration, "calibration configuration");
  if (
    configuration.corpus !== "phase-4.2-calibration" ||
    configuration.ticksPerRun !== PHASE_4_2_MATRIX_TICKS ||
    configuration.scenarioAnalysisSchemaVersion !==
      EXPECTED_SCENARIO_ANALYSIS_SCHEMA_VERSION ||
    configuration.outcomeClassifierVersion !== EXPECTED_OUTCOME_CLASSIFIER_VERSION
  ) {
    throw new Error(
      "Phase 4.2 calibration configuration must use the locked horizon and analysis/classifier versions 4/3.",
    );
  }
  const definitionFingerprint = requireDefinitionFingerprint(
    configuration.phase42DefinitionFingerprint,
    "calibration definition fingerprint",
  );
  const definitionContract = recordAt(
    configuration.phase42DefinitionContract,
    "calibration definition contract",
  );
  const embeddedDefinitionFingerprint = createHash("sha256")
    .update(canonicalPhase42DefinitionJson(definitionContract), "utf8")
    .digest("hex");
  if (embeddedDefinitionFingerprint !== definitionFingerprint) {
    throw new Error(
      "Phase 4.2 calibration definition fingerprint does not authenticate its embedded contract.",
    );
  }
  const expectedDefinitionStatus = requireFrozenPass ? "FROZEN" : "CANDIDATE";
  if (
    configuration.phase42DefinitionContractSchemaVersion !==
      EXPECTED_DEFINITION_CONTRACT_SCHEMA_VERSION ||
    configuration.phase42DefinitionFingerprintAlgorithm !==
      EXPECTED_DEFINITION_FINGERPRINT_ALGORITHM ||
    configuration.phase42DefinitionStatus !== expectedDefinitionStatus
  ) {
    throw new Error(
      `Phase 4.2 calibration definition evidence must use canonical contract 1 and status ${expectedDefinitionStatus}.`,
    );
  }
  if (
    requireFrozenPass &&
    (expectedFrozenFingerprint === undefined ||
      definitionFingerprint !== expectedFrozenFingerprint)
  ) {
    throw new Error(
      "Phase 4.2 verification calibration definition fingerprint does not match the reviewed frozen policy.",
    );
  }
  const configuredScenarios = arrayAt(
    configuration.scenarios,
    "calibration configuration scenarios",
  );
  const configuredSeeds = arrayAt(configuration.seeds, "calibration configuration seeds");
  if (
    !sameSequence(configuredScenarios, SCENARIO_IDS) ||
    !sameSequence(configuredSeeds, PHASE_4_2_CALIBRATION_SEEDS)
  ) {
    throw new Error(
      "Phase 4.2 calibration must contain exactly four scenarios and seeds 1..64.",
    );
  }

  const runs = arrayAt(report.runs, "calibration runs");
  if (runs.length !== SCENARIO_IDS.length * PHASE_4_2_CALIBRATION_SEEDS.length) {
    throw new Error("Phase 4.2 calibration must contain exactly 256 primary runs.");
  }
  const observedRunKeys = new Set<string>();
  for (const [index, value] of runs.entries()) {
    const run = recordAt(value, `calibration run ${index.toString()}`);
    const scenario = recordAt(run.scenario, `calibration run ${index.toString()} scenario`);
    const scenarioId = scenario.scenarioId;
    const seed = run.seed;
    if (
      !SCENARIO_IDS.some((candidate) => candidate === scenarioId) ||
      typeof seed !== "number" ||
      !PHASE_4_2_CALIBRATION_SEEDS.includes(seed) ||
      run.requestedTicks !== PHASE_4_2_MATRIX_TICKS
    ) {
      throw new Error(`Phase 4.2 calibration run ${index.toString()} has wrong identity.`);
    }
    const typedScenarioId = scenarioId as ScenarioId;
    assertScenarioEnvelope(run.scenario, typedScenarioId, seed, `run ${index.toString()}`);
    const profile = recordAt(run.profile, `calibration run ${index.toString()} profile`);
    const window = recordAt(profile.window, `calibration run ${index.toString()} window`);
    if (
      profile.schemaVersion !== EXPECTED_ACTIVITY_PROFILE_SCHEMA_VERSION ||
      profile.seed !== seed ||
      window.observedTicks !== PHASE_4_2_MATRIX_TICKS
    ) {
      throw new Error(
        `Phase 4.2 calibration run ${index.toString()} has incompatible profile evidence.`,
      );
    }
    assertScenarioEnvelope(
      profile.scenario,
      typedScenarioId,
      seed,
      `run ${index.toString()} profile`,
    );
    const outcomeSummary = recordAt(
      run.outcomeSummary,
      `calibration run ${index.toString()} outcome summary`,
    );
    if (outcomeSummary.classifierVersion !== EXPECTED_OUTCOME_CLASSIFIER_VERSION) {
      throw new Error("Phase 4.2 calibration run uses the wrong outcome classifier.");
    }
    if (
      requireFrozenPass &&
      recordAt(run.hardInvariants, `calibration run ${index.toString()} invariants`)
        .status !== "PASS"
    ) {
      throw new Error(
        "Phase 4.2 verification calibration has a non-passing run invariant.",
      );
    }
    const key = `${typedScenarioId}:${seed.toString()}`;
    if (observedRunKeys.has(key)) {
      throw new Error(`Phase 4.2 calibration contains duplicate run ${key}.`);
    }
    observedRunKeys.add(key);
  }

  const byScenario = arrayAt(
    recordAt(report.aggregate, "calibration aggregate").byScenario,
    "calibration scenario aggregates",
  );
  if (byScenario.length !== SCENARIO_IDS.length) {
    throw new Error("Phase 4.2 calibration must contain four scenario aggregates.");
  }
  const observedScenarioAggregates: string[] = [];
  for (const value of byScenario) {
    const aggregate = recordAt(value, "calibration scenario aggregate");
    const scenario = recordAt(aggregate.scenario, "calibration aggregate scenario");
    if (!SCENARIO_IDS.some((candidate) => candidate === scenario.scenarioId)) {
      throw new Error("Phase 4.2 calibration contains an unknown scenario aggregate.");
    }
    observedScenarioAggregates.push(scenario.scenarioId as string);
    const analysis = recordAt(aggregate.analysis, "calibration scenario analysis");
    const expectedBands = recordAt(analysis.expectedBands, "calibration expected bands");
    const outcomeBands = recordAt(
      expectedBands.scenarioOutcomeBands,
      "calibration outcome bands",
    );
    if (requireFrozenPass) {
      if (
        recordAt(analysis.hardInvariants, "calibration aggregate invariants").status !==
          "PASS" ||
        expectedBands.status !== "PASS" ||
        outcomeBands.status !== "PASS" ||
        recordAt(outcomeBands.dominance, "calibration dominance").status !== "PASS"
      ) {
        throw new Error(
          "Phase 4.2 verification calibration must pass hard, expected, outcome, and dominance gates.",
        );
      }
    } else if (
      expectedBands.status === "PASS" ||
      outcomeBands.status !== "NOT_EVALUATED" ||
      recordAt(outcomeBands.eligibility, "discovery outcome eligibility").status !==
        "PHASE_4_2_CALIBRATION_CANDIDATE"
    ) {
      throw new Error(
        "Phase 4.2 discovery calibration must remain candidate/not-frozen evidence.",
      );
    }
  }
  if (!sameSequence(observedScenarioAggregates, SCENARIO_IDS)) {
    throw new Error(
      "Phase 4.2 calibration scenario aggregates are incomplete or reordered.",
    );
  }
  if (requireFrozenPass) {
    const paired = recordAt(
      recordAt(report.analysis, "calibration analysis").frozenPairedMacroBands,
      "calibration paired macro bands",
    );
    if (
      paired.status !== "PASS" ||
      paired.bandEvaluationStatus !== "PASS" ||
      recordAt(paired.corpusValidation, "calibration paired corpus validation").status !==
        "FULL_PHASE_4_2_CALIBRATION" ||
      recordAt(paired.dimensionRequirement, "calibration legacy macro requirement")
        .status !== "PASS" ||
      recordAt(paired.settlementRequirement, "calibration settlement macro requirement")
        .status !== "PASS"
    ) {
      throw new Error(
        "Phase 4.2 verification calibration must pass frozen legacy and SETTLEMENT macro gates.",
      );
    }
  } else {
    const paired = recordAt(
      recordAt(report.analysis, "discovery calibration analysis").frozenPairedMacroBands,
      "discovery calibration paired macro bands",
    );
    if (
      paired.status !== "NOT_EVALUATED" ||
      recordAt(paired.corpusValidation, "discovery paired corpus validation").status !==
        "PHASE_4_2_CALIBRATION_CANDIDATE"
    ) {
      throw new Error(
        "Phase 4.2 discovery paired macros must remain candidate/not-frozen evidence.",
      );
    }
  }
  assertCompletePhase42CalibrationMatrixEvidence(report, requireFrozenPass);
  return definitionFingerprint;
}

function verifyArtifact(
  artifactPath: string,
  expectedSha: string,
  checksumPath: string,
  label: string,
): Buffer {
  for (const [path, description] of [
    [artifactPath, `${label} artifact`],
    [checksumPath, `${label} checksum`],
  ] as const) {
    if (!existsSync(path))
      throw new Error(`Phase 4.2 holdout requires ${description}: ${path}.`);
  }
  const bytes = readFileSync(artifactPath);
  const observedSha = createHash("sha256").update(bytes).digest("hex");
  if (observedSha !== expectedSha) {
    throw new Error(`Phase 4.2 ${label} artifact SHA-256 does not match policy.`);
  }
  const expectedChecksum = `${expectedSha}  ${basename(artifactPath)}\n`;
  if (readFileSync(checksumPath, "utf8") !== expectedChecksum) {
    throw new Error(`Phase 4.2 ${label} checksum companion is invalid.`);
  }
  return bytes;
}

function verifyReview(
  reviewPath: string,
  expectedReviewSha: string,
  citedArtifactSha: string,
  label: string,
  requiredMarkers: Readonly<Record<string, string>>,
): void {
  if (!existsSync(reviewPath)) {
    throw new Error(`Phase 4.2 holdout requires ${label}: ${reviewPath}.`);
  }
  const review = readFileSync(reviewPath, "utf8");
  if (createHash("sha256").update(review).digest("hex") !== expectedReviewSha) {
    throw new Error(`Phase 4.2 ${label} SHA-256 does not match policy.`);
  }
  const lines = review.split(/\r?\n/u);
  for (const [key, value] of Object.entries(requiredMarkers)) {
    const matchingKeyLines = lines.filter((line) => line.startsWith(`${key}: `));
    if (matchingKeyLines.length !== 1 || matchingKeyLines[0] !== `${key}: ${value}`) {
      throw new Error(
        `Phase 4.2 ${label} must contain exactly one unambiguous review marker ${key}: ${value}.`,
      );
    }
  }
  const artifactShaLines = lines.filter((line) => line.startsWith("artifactSha256: "));
  if (
    artifactShaLines.length !== 1 ||
    artifactShaLines[0] !== `artifactSha256: ${citedArtifactSha}`
  ) {
    throw new Error(`Phase 4.2 ${label} does not cite its artifact SHA-256 marker.`);
  }
}

function verifyReviewedDiscoveryProvenance(
  policy: Phase42HoldoutPolicy,
  invocationDirectory: string,
): string {
  const frozenDefinitionFingerprint = requireSha256(
    policy.frozenDefinitionFingerprint,
    "frozen definition fingerprint",
  );
  const discoverySha = requireSha256(
    policy.provenance.discoveryArtifactSha256,
    "discovery calibration artifact",
  );
  const freezeReviewSha = requireSha256(
    policy.provenance.freezeReviewArtifactSha256,
    "freeze review artifact",
  );
  const discoveryBytes = verifyArtifact(
    resolve(invocationDirectory, policy.provenance.discoveryArtifact),
    discoverySha,
    resolve(invocationDirectory, policy.provenance.discoveryChecksumArtifact),
    "discovery calibration",
  );
  const discoveryReport = parseMatrixArtifact(
    discoveryBytes,
    "discovery calibration artifact",
  );
  const candidateDefinitionFingerprint = assertCalibrationMatrixContract(
    discoveryReport,
    false,
  );
  verifyReview(
    resolve(invocationDirectory, policy.provenance.freezeReviewArtifact),
    freezeReviewSha,
    discoverySha,
    "freeze review artifact",
    {
      phase42ReviewType: "FREEZE",
      artifact: PHASE_4_2_CALIBRATION_DISCOVERY_OUTPUT_PATH,
      classifierVersion: EXPECTED_OUTCOME_CLASSIFIER_VERSION.toString(),
      candidateDefinitionFingerprint,
      frozenDefinitionFingerprint,
      candidateDisposition:
        candidateDefinitionFingerprint === frozenDefinitionFingerprint
          ? "ACCEPTED_UNCHANGED"
          : "SUPERSEDED_FOR_V2",
      bandFreezeStatus: "FROZEN",
      decisionStatus: "REVIEWED",
    },
  );
  return frozenDefinitionFingerprint;
}

export function assertPhase42PostFreezeCalibrationExecutionRequest(
  currentDefinitionFingerprint: string,
  invocationDirectory = process.cwd(),
  policy: Phase42HoldoutPolicy = PHASE_4_2_HOLDOUT_POLICY,
): void {
  if (
    policy.calibrationStatus !== "DISCOVERY_RECORDED" ||
    policy.bandFreezeStatus !== "FROZEN" ||
    policy.holdoutStatus !== "SEALED" ||
    policy.executionEnabled
  ) {
    throw new Error(
      "Phase 4.2 post-freeze calibration requires reviewed discovery evidence, frozen definitions, and a sealed holdout.",
    );
  }
  const frozenDefinitionFingerprint = verifyReviewedDiscoveryProvenance(
    policy,
    invocationDirectory,
  );
  if (
    requireDefinitionFingerprint(
      currentDefinitionFingerprint,
      "post-freeze runtime definition fingerprint",
    ) !== frozenDefinitionFingerprint
  ) {
    throw new Error(
      "Phase 4.2 post-freeze calibration runtime definitions do not match the reviewed freeze.",
    );
  }
}

function verifyReviewedProvenance(
  policy: Phase42HoldoutPolicy,
  invocationDirectory: string,
): void {
  const frozenDefinitionFingerprint = verifyReviewedDiscoveryProvenance(
    policy,
    invocationDirectory,
  );
  const verificationSha = requireSha256(
    policy.provenance.verificationArtifactSha256,
    "post-freeze verification artifact",
  );
  const verificationReviewSha = requireSha256(
    policy.provenance.verificationReviewArtifactSha256,
    "verification review artifact",
  );

  const verificationBytes = verifyArtifact(
    resolve(invocationDirectory, policy.provenance.verificationArtifact),
    verificationSha,
    resolve(invocationDirectory, policy.provenance.verificationChecksumArtifact),
    "post-freeze verification calibration",
  );
  verifyReview(
    resolve(invocationDirectory, policy.provenance.verificationReviewArtifact),
    verificationReviewSha,
    verificationSha,
    "verification review artifact",
    {
      phase42ReviewType: "VERIFICATION",
      artifact: PHASE_4_2_CALIBRATION_VERIFICATION_OUTPUT_PATH,
      frozenDefinitionFingerprint,
      verificationStatus: "PASS",
      hardInvariantsStatus: "PASS",
      outcomeBandsStatus: "PASS",
      dominanceStatus: "PASS",
      legacyMacroBandsStatus: "PASS",
      settlementMacroBandsStatus: "PASS",
    },
  );
  assertCalibrationMatrixContract(
    parseMatrixArtifact(verificationBytes, "post-freeze verification artifact"),
    true,
    frozenDefinitionFingerprint,
  );
}

export function assertPhase42HoldoutExecutionRequest(
  request: Phase42HoldoutExecutionRequest,
  invocationDirectory = process.cwd(),
  policy: Phase42HoldoutPolicy = PHASE_4_2_HOLDOUT_POLICY,
): void {
  if (policy.holdoutStatus === "RECORDED") {
    throw new Error("The Phase 4.2 holdout is already recorded and cannot be rerun.");
  }
  if (!sameSequence(request.scenarios, SCENARIO_IDS)) {
    throw new Error(
      "Phase 4.2 holdout requires the exact four locked scenarios in catalog order.",
    );
  }
  if (!sameSequence(request.seeds, PHASE_4_2_HOLDOUT_SEEDS)) {
    throw new Error("Phase 4.2 holdout requires exactly seeds 2001..2064.");
  }
  if (request.ticks !== PHASE_4_2_MATRIX_TICKS) {
    throw new Error("Phase 4.2 holdout requires exactly 10,000 ticks per run.");
  }
  assertCanonicalPath(
    request.outputPath,
    PHASE_4_2_HOLDOUT_OUTPUT_PATH,
    invocationDirectory,
    "Phase 4.2 holdout output",
  );
  if (
    policy.calibrationStatus !== "REVIEWED" ||
    policy.bandFreezeStatus !== "FROZEN" ||
    policy.holdoutStatus !== "READY" ||
    !policy.executionEnabled
  ) {
    throw new Error(
      "The Phase 4.2 holdout is sealed until reviewed post-freeze calibration and frozen classifier, incidence, dominance, and settlement macro bands are recorded.",
    );
  }
  if (!request.frozenDefinitionsReady) {
    throw new Error(
      "The Phase 4.2 holdout requires checked-in classifier-3 incidence, dominance, and SETTLEMENT macro definitions.",
    );
  }
  const frozenDefinitionFingerprint = requireSha256(
    policy.frozenDefinitionFingerprint,
    "frozen definition fingerprint",
  );
  if (
    requireDefinitionFingerprint(
      request.definitionFingerprint,
      "holdout definition fingerprint",
    ) !== frozenDefinitionFingerprint
  ) {
    throw new Error(
      "The Phase 4.2 holdout runtime definition fingerprint does not match the reviewed frozen policy.",
    );
  }
  verifyReviewedProvenance(policy, invocationDirectory);
}

export function acquirePhase42HoldoutAttempt(
  request: Phase42HoldoutExecutionRequest,
  invocationDirectory = process.cwd(),
  policy: Phase42HoldoutPolicy = PHASE_4_2_HOLDOUT_POLICY,
): string {
  const attemptPath = resolve(invocationDirectory, PHASE_4_2_HOLDOUT_ATTEMPT_PATH);
  if (existsSync(attemptPath)) {
    throw new Error(
      "The Phase 4.2 holdout has already been consumed or invalidated; its durable attempt marker requires explicit audit.",
    );
  }
  assertPhase42HoldoutExecutionRequest(request, invocationDirectory, policy);
  const evidencePaths = [
    PHASE_4_2_HOLDOUT_OUTPUT_PATH,
    PHASE_4_2_HOLDOUT_CHECKSUM_PATH,
    PHASE_4_2_HOLDOUT_SUMMARY_PATH,
  ].map((path) => resolve(invocationDirectory, path));
  if (evidencePaths.some(existsSync)) {
    throw new Error(
      "Phase 4.2 holdout evidence already exists or is partial; explicit audit is required and rerun is forbidden.",
    );
  }
  mkdirSync(dirname(attemptPath), { recursive: true });
  const marker = `${JSON.stringify(
    {
      schemaVersion: 1,
      status: "CONSUMED_ATTEMPT",
      corpus: "phase-4.2-holdout",
      scenarios: request.scenarios,
      seeds: request.seeds,
      ticksPerRun: request.ticks,
      outputPath: PHASE_4_2_HOLDOUT_OUTPUT_PATH,
      discoveryArtifactSha256: policy.provenance.discoveryArtifactSha256,
      verificationArtifactSha256: policy.provenance.verificationArtifactSha256,
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
      `The Phase 4.2 holdout attempt could not acquire its exclusive durable marker; execution is forbidden and any created marker requires audit: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    syncParentDirectoryForDurability(attemptPath);
  } catch (error) {
    throw new Error(
      `The Phase 4.2 holdout attempt marker file was flushed, but its parent directory could not be made durable; execution is forbidden and the marker requires audit: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return attemptPath;
}
