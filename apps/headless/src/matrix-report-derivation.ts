import { SCENARIO_CATALOG, type ScenarioReferenceV2 } from "@tiny-civ/sim-core";

import {
  ACTIVITY_PROFILE_SCHEMA_VERSION,
  ACTIVITY_SAMPLE_EVERY_TICKS,
  SIGNIFICANT_EVENT_TIERS,
  summarizeActivityProfiles,
  type ActivityProfile,
} from "./activity-collector.js";
import type { MatrixEvidenceReport } from "./matrix-evidence.js";
import {
  OUTCOME_CLASSIFIER_VERSION,
  SCENARIO_ANALYSIS_SCHEMA_VERSION,
  analyzeScenarioRuns,
  convergenceDiagnostics,
  evaluateFrozenPairedMacroBands,
  pairedScenarioComparisons,
  type Phase42AnalysisDefinitionOverride,
  type RunHardInvariantReport,
  type RunOutcomeSummary,
  type ScenarioCorpusName,
} from "./scenario-analysis.js";
import { summarizeScenarioIdentity } from "./scenario-reporting.js";

export const MAX_RETAINED_MATRIX_RUNS = SCENARIO_CATALOG.length * 64;

export interface DeterministicMatrixRun {
  readonly seed: number;
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
  readonly requestedTicks: number;
  readonly finalHash: string;
  readonly profile: ActivityProfile;
}

export interface MatrixDeterminismComparison {
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
  readonly firstFinalHash: string;
  readonly repeatFinalHash: string;
  readonly exactMatch: boolean;
}

export interface Phase42DefinitionEvidence {
  readonly contractSchemaVersion: number;
  readonly fingerprintAlgorithm: string;
  readonly status: "CANDIDATE" | "FROZEN";
  readonly fingerprint: string;
  readonly contract: unknown;
  readonly analysisDefinitions?: Phase42AnalysisDefinitionOverride;
}

export interface Phase43DefinitionEvidence {
  readonly contractSchemaVersion: number;
  readonly fingerprintAlgorithm: string;
  readonly status: "CANDIDATE" | "FROZEN";
  readonly fingerprint: string;
  readonly contract: unknown;
}

export interface MatrixReportDerivationInput {
  readonly corpus: ScenarioCorpusName;
  readonly seeds: readonly number[];
  readonly ticks: number;
  readonly repeatCount: number;
  readonly runs: readonly DeterministicMatrixRun[];
  readonly determinismComparisons: readonly MatrixDeterminismComparison[];
  readonly phase42Definition?: Phase42DefinitionEvidence;
  readonly phase43Definition?: Phase43DefinitionEvidence;
}

interface ReportedMatrixRun extends DeterministicMatrixRun {
  readonly outcomeSummary: RunOutcomeSummary;
  readonly hardInvariants: RunHardInvariantReport;
}

/**
 * Pure report composition shared by the writer and artifact authenticator.
 * Given retained deterministic runs and trusted data-only definitions, this is
 * the single implementation for every derived matrix field.
 */
export function deriveMatrixEvidenceReport(
  input: MatrixReportDerivationInput,
): MatrixEvidenceReport {
  const normalizedSeeds = [...new Set(input.seeds)].sort((left, right) => left - right);
  const analysisContext = {
    corpus: input.corpus,
    seeds: normalizedSeeds,
    requestedTicks: input.ticks,
    ...(input.phase42Definition === undefined
      ? {}
      : {
          phase42DefinitionFingerprint: input.phase42Definition.fingerprint,
          ...(input.phase42Definition.analysisDefinitions === undefined
            ? {}
            : { phase42Definitions: input.phase42Definition.analysisDefinitions }),
        }),
  } as const;
  const byScenario = SCENARIO_CATALOG.map((scenario) => {
    const scenarioRuns = input.runs.filter(
      (run) => run.scenario.scenarioId === scenario.scenarioId,
    );
    return {
      ...summarizeScenarioIdentity(scenarioRuns),
      activity: summarizeActivityProfiles(scenarioRuns.map((run) => run.profile)),
      analysis: analyzeScenarioRuns(scenarioRuns, analysisContext),
    };
  });
  const scenarioDefinitions = byScenario.map((aggregate) => aggregate.scenario);
  const compiledMapHashes = [
    ...new Set(byScenario.flatMap((aggregate) => aggregate.compiledMapHashes)),
  ].sort();
  const perRunAnalysis = new Map(
    byScenario.flatMap((aggregate) =>
      aggregate.analysis.outcomes.perRun.map((outcomeSummary, index) => {
        const hardInvariants = aggregate.analysis.hardInvariants.perRun[index];
        if (hardInvariants === undefined) {
          throw new Error("Scenario hard-invariant analysis lost run alignment.");
        }
        return [
          `${aggregate.scenario.scenarioId}:${outcomeSummary.seed.toString()}`,
          { outcomeSummary, hardInvariants },
        ] as const;
      }),
    ),
  );
  const reportedRuns: ReportedMatrixRun[] = input.runs.map((run) => {
    const analysis = perRunAnalysis.get(
      `${run.scenario.scenarioId}:${run.scenario.seed.toString()}`,
    );
    if (analysis === undefined) throw new Error("Scenario analysis lost a matrix run.");
    return { ...run, ...analysis };
  });
  const pairedComparisons = pairedScenarioComparisons(input.runs);
  const frozenPairedMacroBands = evaluateFrozenPairedMacroBands(
    input.runs,
    pairedComparisons,
    analysisContext,
  );
  const convergence = convergenceDiagnostics(pairedComparisons);
  const allRepeatComparisonsMatch = input.determinismComparisons.every(
    (comparison) => comparison.exactMatch,
  );

  return {
    schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
    command: "matrix",
    configuration: {
      corpus: input.corpus,
      scenarios: SCENARIO_CATALOG.map((scenario) => scenario.scenarioId),
      scenarioDefinitions,
      compiledMapHashes,
      seeds: normalizedSeeds,
      ticksPerRun: input.ticks,
      sampleEveryTicks: ACTIVITY_SAMPLE_EVERY_TICKS,
      significantEventTiers: SIGNIFICANT_EVENT_TIERS,
      ordering: "catalog-then-seed",
      repeatCount: input.repeatCount,
      executionsPerCase: input.repeatCount + 1,
      maximumRetainedPrimaryRuns: MAX_RETAINED_MATRIX_RUNS,
      scenarioAnalysisSchemaVersion: SCENARIO_ANALYSIS_SCHEMA_VERSION,
      outcomeClassifierVersion: OUTCOME_CLASSIFIER_VERSION,
      ...(input.phase42Definition === undefined
        ? {}
        : {
            phase42DefinitionContractSchemaVersion:
              input.phase42Definition.contractSchemaVersion,
            phase42DefinitionFingerprintAlgorithm:
              input.phase42Definition.fingerprintAlgorithm,
            phase42DefinitionStatus: input.phase42Definition.status,
            phase42DefinitionFingerprint: input.phase42Definition.fingerprint,
            phase42DefinitionContract: input.phase42Definition.contract,
          }),
      ...(input.phase43Definition === undefined
        ? {}
        : {
            phase43DefinitionContractSchemaVersion:
              input.phase43Definition.contractSchemaVersion,
            phase43DefinitionFingerprintAlgorithm:
              input.phase43Definition.fingerprintAlgorithm,
            phase43DefinitionStatus: input.phase43Definition.status,
            phase43DefinitionFingerprint: input.phase43Definition.fingerprint,
            phase43DefinitionContract: input.phase43Definition.contract,
          }),
    },
    runs: reportedRuns,
    aggregate: {
      scenarioDefinitions,
      compiledMapHashes,
      byScenario,
    },
    analysis: {
      interpretation: "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL",
      determinism: {
        repeatCount: input.repeatCount,
        executionsPerCase: input.repeatCount + 1,
        comparisonCount: input.determinismComparisons.length,
        allExactMatches: input.repeatCount === 0 ? null : allRepeatComparisonsMatch,
        hardInvariant: {
          id: "EXACT_REPEAT_DETERMINISM",
          classification: "HARD_INVARIANT",
          status:
            input.repeatCount === 0
              ? "NOT_EVALUATED"
              : allRepeatComparisonsMatch
                ? "PASS"
                : "FAIL",
          reason:
            input.repeatCount === 0
              ? "Only the locked smoke corpus repeats each run internally."
              : null,
        },
        comparisons: input.determinismComparisons,
      },
      pairedComparisons,
      frozenPairedMacroBands,
      convergence,
      rawProfileRetention: {
        policy: "RETAIN_ALL_PRIMARY_PROFILES",
        retainedRunCount: reportedRuns.length,
        maximumRetainedRunCount: MAX_RETAINED_MATRIX_RUNS,
        repeatProfilesRetained: false,
        repeatProfilesComparedExactlyThenDiscarded: input.repeatCount > 0,
        bound:
          "Four catalog scenarios times at most 64 locked seeds equals 256 retained primary profiles.",
      },
    },
  };
}
