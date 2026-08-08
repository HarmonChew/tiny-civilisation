import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { gunzipSync } from "node:zlib";

import {
  SCENARIO_IDS,
  advanceSimulation,
  createScenarioReference,
  createSimulation,
  hashSimulationState,
  type ScenarioId,
} from "@tiny-civ/sim-core";

import {
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  ACTIVITY_SAMPLE_EVERY_TICKS,
  StreamingActivityCollector,
} from "./activity-collector.js";
import {
  deriveMatrixEvidenceReport,
  type DeterministicMatrixRun,
} from "./matrix-report-derivation.js";
import {
  PHASE_4_3_CALIBRATION_SEEDS,
  PHASE_4_3_MATRIX_TICKS,
} from "./phase-4.3-corpora.js";
import {
  PHASE_4_3_DEFINITION_CONTRACT,
  PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_3_DEFINITION_FINGERPRINT,
  PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
} from "./phase-4.3-definition-contract.js";
import {
  OUTCOME_CLASSIFIER_VERSION,
  SCENARIO_ANALYSIS_SCHEMA_VERSION,
} from "./scenario-analysis.js";

export type Phase43DefinitionStatus = "CANDIDATE" | "FROZEN";
export type Phase43ReleaseEvidenceKind =
  | "tiny-civilisation/phase-4.3-automated-release-check"
  | "tiny-civilisation/phase-4.3-deployment-smoke"
  | "tiny-civilisation/phase-4.3-final-nvda";

interface Phase43ReleaseEvidenceIdentity {
  readonly packageSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Phase 4.3 ${label} must be an object.`);
  return value;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Phase 4.3 ${label} must be an array.`);
  return value;
}

function stringAt(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Phase 4.3 ${label} must be a string.`);
  return value;
}

function integerAt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Phase 4.3 ${label} must be a safe integer.`);
  }
  return value as number;
}

function requireSha256(value: unknown, label: string): string {
  const text = stringAt(value, label);
  if (!/^[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`Phase 4.3 ${label} must be a lowercase SHA-256.`);
  }
  return text;
}

function requireGitObjectId(value: unknown, label: string): string {
  const text = stringAt(value, label);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(text)) {
    throw new Error(`Phase 4.3 ${label} must be a full Git object ID.`);
  }
  return text;
}

function sameSequence(left: readonly unknown[], right: readonly unknown[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function readAuthenticatedBytes(
  path: string,
  expectedSha256: string,
  label: string,
): Buffer {
  requireSha256(expectedSha256, `${label} expected SHA-256`);
  const bytes = readFileSync(path);
  const observed = createHash("sha256").update(bytes).digest("hex");
  if (observed !== expectedSha256) {
    throw new Error(
      `Phase 4.3 ${label} SHA-256 mismatch: expected ${expectedSha256}, observed ${observed}.`,
    );
  }
  return bytes;
}

export function authenticatePhase43HashedArtifact(
  path: string,
  expectedSha256: string,
  label: string,
): void {
  readAuthenticatedBytes(path, expectedSha256, label);
}

function regenerateRun(scenarioId: ScenarioId, seed: number): DeterministicMatrixRun {
  const state = createSimulation(createScenarioReference(scenarioId, seed));
  const collector = new StreamingActivityCollector(state);
  for (let tick = 0; tick < PHASE_4_3_MATRIX_TICKS; tick += ACTIVITY_SAMPLE_EVERY_TICKS) {
    advanceSimulation(state, ACTIVITY_SAMPLE_EVERY_TICKS);
    collector.observe(state);
  }
  return {
    seed,
    scenario: { ...state.scenario },
    compiledMapHash: state.compiledMapHash,
    requestedTicks: PHASE_4_3_MATRIX_TICKS,
    finalHash: hashSimulationState(state),
    profile: collector.report(),
  };
}

function retainedRunProjection(value: unknown, label: string): DeterministicMatrixRun {
  const run = recordAt(value, label);
  const scenario = recordAt(run.scenario, `${label}.scenario`);
  const scenarioId = stringAt(scenario.scenarioId, `${label}.scenario.scenarioId`);
  if (!SCENARIO_IDS.includes(scenarioId as ScenarioId)) {
    throw new Error(`Phase 4.3 ${label} has unknown scenario ${scenarioId}.`);
  }
  return {
    seed: integerAt(run.seed, `${label}.seed`),
    scenario: run.scenario as DeterministicMatrixRun["scenario"],
    compiledMapHash: stringAt(run.compiledMapHash, `${label}.compiledMapHash`),
    requestedTicks: integerAt(run.requestedTicks, `${label}.requestedTicks`),
    finalHash: stringAt(run.finalHash, `${label}.finalHash`),
    profile: recordAt(
      run.profile,
      `${label}.profile`,
    ) as unknown as DeterministicMatrixRun["profile"],
  };
}

function assertPhase43CalibrationReportShape(
  value: unknown,
  expectedStatus: Phase43DefinitionStatus,
  expectedFrozenFingerprint: string | null,
): { readonly report: Record<string, unknown>; readonly runs: DeterministicMatrixRun[] } {
  const report = recordAt(value, "calibration report");
  if (
    report.command !== "matrix" ||
    report.schemaVersion !== ACTIVITY_PROFILE_SCHEMA_VERSION
  ) {
    throw new Error(
      "Phase 4.3 calibration report command or activity schema is incompatible.",
    );
  }
  const configuration = recordAt(report.configuration, "calibration configuration");
  if (configuration.corpus !== "phase-4.3-calibration") {
    throw new Error("Phase 4.3 calibration artifact has the wrong corpus identity.");
  }
  if (
    !sameSequence(arrayAt(configuration.scenarios, "configuration.scenarios"), SCENARIO_IDS)
  ) {
    throw new Error("Phase 4.3 calibration artifact has the wrong scenario sequence.");
  }
  if (
    !sameSequence(
      arrayAt(configuration.seeds, "configuration.seeds"),
      PHASE_4_3_CALIBRATION_SEEDS,
    ) ||
    configuration.ticksPerRun !== PHASE_4_3_MATRIX_TICKS
  ) {
    throw new Error("Phase 4.3 calibration artifact has the wrong seeds or horizon.");
  }
  if (
    configuration.scenarioAnalysisSchemaVersion !== SCENARIO_ANALYSIS_SCHEMA_VERSION ||
    configuration.outcomeClassifierVersion !== OUTCOME_CLASSIFIER_VERSION ||
    configuration.phase43DefinitionContractSchemaVersion !==
      PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION ||
    configuration.phase43DefinitionFingerprintAlgorithm !==
      PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM ||
    configuration.phase43DefinitionStatus !== expectedStatus
  ) {
    throw new Error(
      "Phase 4.3 calibration artifact has incompatible analysis definitions.",
    );
  }
  const artifactFingerprint = requireSha256(
    configuration.phase43DefinitionFingerprint,
    "calibration definition fingerprint",
  );
  if (
    expectedStatus === "FROZEN" &&
    (expectedFrozenFingerprint === null ||
      artifactFingerprint !== expectedFrozenFingerprint)
  ) {
    throw new Error(
      "Phase 4.3 frozen verification fingerprint does not match the reviewed policy.",
    );
  }

  const rawRuns = arrayAt(report.runs, "calibration runs");
  const expectedRunCount = SCENARIO_IDS.length * PHASE_4_3_CALIBRATION_SEEDS.length;
  if (rawRuns.length !== expectedRunCount) {
    throw new Error(`Phase 4.3 calibration requires exactly ${expectedRunCount} runs.`);
  }
  const runs = rawRuns.map((run, index) => retainedRunProjection(run, `runs[${index}]`));
  const identities = runs.map((run) => `${run.scenario.scenarioId}:${run.seed}`);
  if (new Set(identities).size !== expectedRunCount) {
    throw new Error("Phase 4.3 calibration contains duplicate scenario/seed identities.");
  }
  const expectedIdentities = SCENARIO_IDS.flatMap((scenarioId) =>
    PHASE_4_3_CALIBRATION_SEEDS.map((seed) => `${scenarioId}:${seed}`),
  );
  if (!sameSequence(identities, expectedIdentities)) {
    throw new Error("Phase 4.3 calibration runs are not in catalog-then-seed order.");
  }
  return { report, runs };
}

export function authenticatePhase43CalibrationArtifact(
  artifactPath: string,
  expectedSha256: string,
  expectedStatus: Phase43DefinitionStatus,
  expectedFrozenFingerprint: string | null,
): void {
  const bytes = readAuthenticatedBytes(
    artifactPath,
    expectedSha256,
    `${expectedStatus.toLowerCase()} calibration artifact`,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(
      `Phase 4.3 calibration artifact is not valid deterministic gzip JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const { report, runs } = assertPhase43CalibrationReportShape(
    parsed,
    expectedStatus,
    expectedFrozenFingerprint,
  );
  const regenerated: DeterministicMatrixRun[] = [];
  for (const run of runs) {
    const replayed = regenerateRun(run.scenario.scenarioId, run.seed);
    if (!isDeepStrictEqual(run, replayed)) {
      throw new Error(
        `Phase 4.3 calibration run ${run.scenario.scenarioId}:${run.seed} did not regenerate exactly.`,
      );
    }
    regenerated.push(replayed);
  }

  const configuration = recordAt(report.configuration, "calibration configuration");
  const artifactFingerprint = stringAt(
    configuration.phase43DefinitionFingerprint,
    "calibration definition fingerprint",
  );
  if (
    expectedStatus === "FROZEN" ||
    artifactFingerprint === PHASE_4_3_DEFINITION_FINGERPRINT
  ) {
    const rederived = deriveMatrixEvidenceReport({
      corpus: "phase-4.3-calibration",
      seeds: PHASE_4_3_CALIBRATION_SEEDS,
      ticks: PHASE_4_3_MATRIX_TICKS,
      repeatCount: 0,
      runs: regenerated,
      determinismComparisons: [],
      phase43Definition: {
        contractSchemaVersion: PHASE_4_3_DEFINITION_CONTRACT_SCHEMA_VERSION,
        fingerprintAlgorithm: PHASE_4_3_DEFINITION_FINGERPRINT_ALGORITHM,
        status: expectedStatus,
        fingerprint: artifactFingerprint,
        contract: PHASE_4_3_DEFINITION_CONTRACT,
      },
    });
    if (!isDeepStrictEqual(report, rederived)) {
      throw new Error(
        "Phase 4.3 calibration derived report does not match regenerated profiles and definitions.",
      );
    }
  }
}

export function authenticatePhase43ReleaseEvidenceArtifact(
  artifactPath: string,
  expectedSha256: string,
  expectedKind: Phase43ReleaseEvidenceKind,
  expectedReleaseCandidateCommit: string,
  expectedDefinitionFingerprint: string,
  expectedPackageSha256?: string,
): Phase43ReleaseEvidenceIdentity {
  const bytes = readAuthenticatedBytes(artifactPath, expectedSha256, expectedKind);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(
      `Phase 4.3 ${expectedKind} evidence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const evidence = recordAt(parsed, `${expectedKind} evidence`);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.kind !== expectedKind ||
    evidence.status !== "PASS"
  ) {
    throw new Error(
      `Phase 4.3 ${expectedKind} evidence must be schema 1 with PASS status.`,
    );
  }
  if (
    requireGitObjectId(evidence.releaseCandidateCommit, "evidence release candidate") !==
    expectedReleaseCandidateCommit
  ) {
    throw new Error(`Phase 4.3 ${expectedKind} evidence refers to a different commit.`);
  }
  if (
    requireSha256(evidence.definitionFingerprint, "evidence definition fingerprint") !==
    expectedDefinitionFingerprint
  ) {
    throw new Error(`Phase 4.3 ${expectedKind} evidence refers to a different definition.`);
  }
  const packageSha256 = requireSha256(evidence.packageSha256, "evidence package SHA-256");
  if (expectedPackageSha256 !== undefined && packageSha256 !== expectedPackageSha256) {
    throw new Error(`Phase 4.3 ${expectedKind} evidence refers to a different package.`);
  }
  return { packageSha256 };
}

export function assertPhase43CalibrationArtifactShapeForTest(
  value: unknown,
  expectedStatus: Phase43DefinitionStatus,
  expectedFrozenFingerprint: string | null,
): void {
  assertPhase43CalibrationReportShape(value, expectedStatus, expectedFrozenFingerprint);
}
