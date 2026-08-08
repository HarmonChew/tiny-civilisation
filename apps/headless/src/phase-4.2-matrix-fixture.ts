import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

import { runMatrix } from "./index.js";
import { PHASE_4_2_CALIBRATION_SEEDS } from "./phase-4.2-corpora.js";
import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION,
  PHASE_4_2_DEFINITION_FINGERPRINT,
  PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM,
} from "./phase-4.2-definition-contract.js";

type MutableRecord = Record<string, unknown>;

const OUTCOME_LABEL_IDS = [
  "COOPERATIVE_SHARED_STORAGE",
  "FRAGMENTED_SOCIAL_STRUCTURE",
  "PERSISTENT_PRIVATE_RESERVES",
  "RECURRING_CONFLICT",
  "SHARED_HYDRATION",
  "SOURCE_BOTTLENECK",
  "PERSISTENT_DEHYDRATION",
  "CONCENTRATED_WATER_ROUTES",
  "ESTABLISHED_SETTLEMENT",
  "CHRONIC_SHELTER_NEGLECT",
  "SHELTER_CROWDING",
  "GUEST_SHELTERING",
  "SETTLEMENT_RELOCATION",
  "QUIET_STALEMATE",
] as const;

const PHASE_4_2_HARD_INVARIANT_IDS = new Set([
  "PROFILE_SCENARIO_IDENTITY_MATCH",
  "PROFILE_COMPILED_MAP_HASH_MATCH",
  "CRITICAL_RESOURCE_REACHABILITY",
  "OCCUPIED_TILE_P10",
  "OCCUPIED_TILE_MEDIAN",
  "EXACT_OVERLAP_RATE",
  "PER_SEED_KEEP_SHARE",
]);

const PHASE_4_3_DESIRE_KINDS = new Set([
  "RAISE_FAMILY",
  "HONOUR_THE_DEAD",
  "SETTLE_ESTATE",
]);

function freezeScenarioIdentity(value: unknown): void {
  const scenario = objectAt(value, "scenario identity");
  scenario.schemaVersion = 2;
  scenario.behaviorVersion = 5;
  scenario.scenarioVersion = 2;
  scenario.mapGenerationVersion = 1;
}

function preparePhase42Profile(value: unknown): void {
  const profile = objectAt(value, "profile");
  profile.schemaVersion = 5;
  freezeScenarioIdentity(profile.scenario);
  delete profile.lifecycle;

  const desires = objectAt(profile.desires, "profile desires");
  desires.byKind = arrayAt(desires.byKind, "profile desire kinds").filter((item) => {
    const kind = objectAt(item, "profile desire kind").kind;
    return typeof kind !== "string" || !PHASE_4_3_DESIRE_KINDS.has(kind);
  });
  desires.byFamily = arrayAt(desires.byFamily, "profile desire families").filter(
    (item) => objectAt(item, "profile desire family").family !== "LIFECYCLE",
  );
}

function preparePhase42HardInvariants(value: unknown): void {
  const report = objectAt(value, "hard invariants");
  report.evaluations = arrayAt(report.evaluations, "hard-invariant evaluations").filter(
    (item) => {
      const id = objectAt(item, "hard-invariant evaluation").id;
      return typeof id === "string" && PHASE_4_2_HARD_INVARIANT_IDS.has(id);
    },
  );
}

function objectAt(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Synthetic matrix fixture expected ${label} to be an object.`);
  }
  return value as MutableRecord;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Synthetic matrix fixture expected ${label} to be an array.`);
  }
  return value;
}

function cloneRecord(value: unknown, label: string): MutableRecord {
  return structuredClone(objectAt(value, label));
}

let baseMatrix: MutableRecord | undefined;

function completeBaseMatrix(): MutableRecord {
  baseMatrix ??= objectAt(
    runMatrix({ corpus: "nightly", seeds: [1], ticks: 0 }),
    "base matrix",
  );
  return baseMatrix;
}

function setEvaluationStatuses(value: unknown, status: string): void {
  for (const item of arrayAt(value, "evaluations")) {
    objectAt(item, "evaluation").status = status;
  }
}

function prepareRun(template: unknown, seed: number, gateStatus: string): MutableRecord {
  const run = cloneRecord(template, "run template");
  run.seed = seed;
  run.requestedTicks = 10_000;
  objectAt(run.scenario, "run scenario").seed = seed;
  freezeScenarioIdentity(run.scenario);

  const profile = objectAt(run.profile, "run profile");
  preparePhase42Profile(profile);
  profile.seed = seed;
  objectAt(profile.scenario, "profile scenario").seed = seed;
  const window = objectAt(profile.window, "profile window");
  window.startTick = 0;
  window.endTick = 10_000;
  window.observedTicks = 10_000;
  window.sampledStates = 10_001;
  window.sampleEveryTicks = 1;
  window.ticksPerSecond = 1;
  objectAt(profile.horizon, "profile horizon").tick = 10_000;
  objectAt(profile.scenarioSpatial, "profile scenario spatial").observedTicks = 10_000;

  const outcome = objectAt(run.outcomeSummary, "run outcome");
  outcome.classifierVersion = 3;
  outcome.seed = seed;
  outcome.evaluatedLabelIds = [...OUTCOME_LABEL_IDS];
  outcome.notEvaluatedLabelIds = [];

  const invariants = objectAt(run.hardInvariants, "run invariants");
  preparePhase42HardInvariants(invariants);
  invariants.seed = seed;
  invariants.status = gateStatus;
  setEvaluationStatuses(invariants.evaluations, gateStatus);
  return run;
}

function prepareOutcomeIncidence(value: unknown): void {
  for (const item of arrayAt(value, "outcome incidence")) {
    const incidence = objectAt(item, "outcome incidence item");
    incidence.totalRuns = 64;
    incidence.eligibleRuns = 64;
    incidence.runs = 64;
    incidence.occurrences = 0;
    incidence.incidence = 0;
  }
}

function prepareDominanceEvaluations(value: unknown, gateStatus: string): unknown[] {
  const existing = arrayAt(value, "dominance evaluations");
  const template = existing[0];
  if (template === undefined)
    throw new Error("Synthetic matrix fixture needs dominance shape.");
  return OUTCOME_LABEL_IDS.map((labelId) => {
    const evaluation = cloneRecord(template, "dominance template");
    evaluation.labelId = labelId;
    evaluation.metricPath = `outcomes.incidence[labelId=${labelId}].incidence`;
    evaluation.status = gateStatus;
    evaluation.incidence = 0;
    evaluation.occurrences = 0;
    evaluation.eligibleRuns = 64;
    evaluation.rationaleRequired = false;
    evaluation.rationale = null;
    evaluation.reason = null;
    return evaluation;
  });
}

function prepareActivity(value: unknown): void {
  const activity = objectAt(value, "scenario activity");
  delete activity.lifecycle;
  activity.runCount = 64;
  activity.totalObservedTicks = 640_000;
  const settlement = objectAt(activity.settlement, "settlement aggregate");
  const distributions = objectAt(
    settlement.seedDistributions,
    "settlement aggregate distributions",
  );
  for (const distribution of Object.values(distributions)) {
    objectAt(distribution, "settlement distribution").samples = 64;
  }
}

function prepareScenarioAnalysis(
  value: unknown,
  scenarioRuns: readonly MutableRecord[],
  frozenPass: boolean,
): void {
  const gateStatus = frozenPass ? "PASS" : "NOT_EVALUATED";
  const analysis = objectAt(value, "scenario analysis");
  analysis.schemaVersion = 4;
  freezeScenarioIdentity(analysis.scenario);
  const outcomes = objectAt(analysis.outcomes, "scenario outcomes");
  outcomes.perRun = scenarioRuns.map((run) => structuredClone(run.outcomeSummary));
  prepareOutcomeIncidence(outcomes.incidence);

  const hard = objectAt(analysis.hardInvariants, "scenario invariants");
  hard.status = gateStatus;
  hard.perRun = scenarioRuns.map((run) => structuredClone(run.hardInvariants));
  setEvaluationStatuses(hard.corpus, gateStatus);

  const expected = objectAt(analysis.expectedBands, "expected bands");
  expected.status = gateStatus;
  const corpusValidation = objectAt(expected.corpusValidation, "corpus validation");
  corpusValidation.status = "MATCHED_LOCKED_CORPUS";
  corpusValidation.expectedSeeds = [...PHASE_4_2_CALIBRATION_SEEDS];
  corpusValidation.observedSeeds = [...PHASE_4_2_CALIBRATION_SEEDS];
  corpusValidation.expectedTicks = 10_000;
  corpusValidation.observedTicks = 10_000;
  setEvaluationStatuses(expected.evaluations, gateStatus);

  const outcomeBands = objectAt(expected.scenarioOutcomeBands, "outcome bands");
  outcomeBands.status = gateStatus;
  objectAt(outcomeBands.eligibility, "outcome eligibility").status = frozenPass
    ? "FULL_PHASE_4_2_CALIBRATION"
    : "PHASE_4_2_CALIBRATION_CANDIDATE";
  setEvaluationStatuses(outcomeBands.evaluations, gateStatus);
  const dominance = objectAt(outcomeBands.dominance, "outcome dominance");
  dominance.status = gateStatus;
  dominance.evaluations = prepareDominanceEvaluations(dominance.evaluations, gateStatus);
  dominance.rationaleFailures = [];
}

function preparePairedComparisons(value: unknown): void {
  for (const item of arrayAt(value, "paired comparisons")) {
    const comparison = objectAt(item, "paired comparison");
    comparison.pairedSeeds = [...PHASE_4_2_CALIBRATION_SEEDS];
    for (const metricValue of arrayAt(comparison.metrics, "paired metrics")) {
      const metric = objectAt(metricValue, "paired metric");
      const existingPairs = arrayAt(metric.pairs, "paired metric pairs");
      if (metric.missingValuePolicy === "ZERO_IS_OBSERVED") {
        const pairTemplate = existingPairs[0];
        if (pairTemplate === undefined) {
          throw new Error("Synthetic matrix fixture needs a paired-value shape.");
        }
        metric.pairs = PHASE_4_2_CALIBRATION_SEEDS.map((seed) => {
          const pair = cloneRecord(pairTemplate, "paired value template");
          pair.seed = seed;
          return pair;
        });
      } else {
        metric.pairs = [];
      }
      objectAt(metric.summary, "paired metric summary").pairedSeedCount = arrayAt(
        metric.pairs,
        "prepared metric pairs",
      ).length;
    }
  }
}

function prepareFrozenPairedBands(value: unknown, frozenPass: boolean): void {
  const gateStatus = frozenPass ? "PASS" : "NOT_EVALUATED";
  const paired = objectAt(value, "frozen paired bands");
  paired.status = gateStatus;
  paired.bandEvaluationStatus = gateStatus;
  const corpus = objectAt(paired.corpusValidation, "paired corpus validation");
  corpus.status = frozenPass
    ? "FULL_PHASE_4_2_CALIBRATION"
    : "PHASE_4_2_CALIBRATION_CANDIDATE";
  corpus.expectedSeeds = [...PHASE_4_2_CALIBRATION_SEEDS];
  corpus.observedSeedsByScenario = Object.fromEntries(
    SCENARIO_IDS.map((scenarioId) => [scenarioId, [...PHASE_4_2_CALIBRATION_SEEDS]]),
  );
  corpus.expectedTicks = 10_000;
  corpus.observedTicks = 10_000;

  const evaluations = arrayAt(paired.evaluations, "paired band evaluations").map((item) =>
    cloneRecord(item, "paired band evaluation"),
  );
  for (const evaluation of evaluations) {
    evaluation.status = gateStatus;
    evaluation.pairedSeedCount = 64;
    evaluation.requiredPairedSeeds = 64;
  }
  if (frozenPass) {
    const template = evaluations[0];
    if (template === undefined) {
      throw new Error("Synthetic matrix fixture needs a frozen paired-band shape.");
    }
    for (const metricId of ["ACTIVE_SHELTER_COUNT", "SHELTERED_REST_SHARE"]) {
      const evaluation = structuredClone(template);
      evaluation.dimension = "SETTLEMENT";
      evaluation.metricId = metricId;
      evaluation.metricPath = `pairedComparisons.metrics[metricId=${metricId}]`;
      evaluations.push(evaluation);
    }
  }
  paired.evaluations = evaluations;

  const dimensionRequirement = objectAt(
    paired.dimensionRequirement,
    "dimension requirement",
  );
  dimensionRequirement.status = gateStatus;
  dimensionRequirement.observed = frozenPass ? 4 : null;
  dimensionRequirement.passingDimensions = frozenPass
    ? ["SOCIAL", "STORAGE", "CONFLICT", "SPATIAL"]
    : [];
  const settlementRequirement = objectAt(
    paired.settlementRequirement,
    "settlement requirement",
  );
  settlementRequirement.status = gateStatus;
  settlementRequirement.observed = frozenPass ? 2 : null;
}

/**
 * Builds a 256-run synthetic artifact by cloning a real zero-tick matrix. This
 * retains the production profile/report shape without running any calibration
 * or reserved holdout seed.
 */
export function completeCalibrationMatrixFixture(frozenPass: boolean): MutableRecord {
  const base = structuredClone(completeBaseMatrix());
  base.schemaVersion = 5;
  const configuration = objectAt(base.configuration, "matrix configuration");
  configuration.corpus = "phase-4.2-calibration";
  configuration.scenarios = [...SCENARIO_IDS];
  configuration.seeds = [...PHASE_4_2_CALIBRATION_SEEDS];
  configuration.ticksPerRun = 10_000;
  configuration.repeatCount = 0;
  configuration.executionsPerCase = 1;
  configuration.scenarioAnalysisSchemaVersion = 4;
  configuration.outcomeClassifierVersion = 3;
  for (const definition of arrayAt(
    configuration.scenarioDefinitions,
    "matrix scenario definitions",
  )) {
    freezeScenarioIdentity(definition);
  }
  configuration.phase42DefinitionContractSchemaVersion =
    PHASE_4_2_DEFINITION_CONTRACT_SCHEMA_VERSION;
  configuration.phase42DefinitionFingerprintAlgorithm =
    PHASE_4_2_DEFINITION_FINGERPRINT_ALGORITHM;
  configuration.phase42DefinitionStatus = frozenPass ? "FROZEN" : "CANDIDATE";
  configuration.phase42DefinitionFingerprint = PHASE_4_2_DEFINITION_FINGERPRINT;
  configuration.phase42DefinitionContract = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);

  const templateRuns = new Map<ScenarioId, MutableRecord>();
  for (const value of arrayAt(base.runs, "base runs")) {
    const run = objectAt(value, "base run");
    const scenarioId = objectAt(run.scenario, "base run scenario").scenarioId;
    if (typeof scenarioId === "string" && SCENARIO_IDS.includes(scenarioId as ScenarioId)) {
      templateRuns.set(scenarioId as ScenarioId, run);
    }
  }

  const runs: MutableRecord[] = [];
  const runsByScenario = new Map<ScenarioId, MutableRecord[]>();
  const gateStatus = frozenPass ? "PASS" : "NOT_EVALUATED";
  for (const scenarioId of SCENARIO_IDS) {
    const template = templateRuns.get(scenarioId);
    if (template === undefined) throw new Error(`Missing ${scenarioId} run template.`);
    const scenarioRuns = PHASE_4_2_CALIBRATION_SEEDS.map((seed) =>
      prepareRun(template, seed, gateStatus),
    );
    runsByScenario.set(scenarioId, scenarioRuns);
    runs.push(...scenarioRuns);
  }
  base.runs = runs;

  const aggregate = objectAt(base.aggregate, "matrix aggregate");
  for (const definition of arrayAt(
    aggregate.scenarioDefinitions,
    "aggregate scenario definitions",
  )) {
    freezeScenarioIdentity(definition);
  }
  for (const value of arrayAt(aggregate.byScenario, "scenario aggregates")) {
    const scenarioAggregate = objectAt(value, "scenario aggregate");
    freezeScenarioIdentity(scenarioAggregate.scenario);
    const scenarioId = objectAt(
      scenarioAggregate.scenario,
      "scenario aggregate identity",
    ).scenarioId;
    if (
      typeof scenarioId !== "string" ||
      !SCENARIO_IDS.includes(scenarioId as ScenarioId)
    ) {
      throw new Error("Synthetic matrix fixture found an unknown scenario aggregate.");
    }
    prepareActivity(scenarioAggregate.activity);
    prepareScenarioAnalysis(
      scenarioAggregate.analysis,
      runsByScenario.get(scenarioId as ScenarioId) ?? [],
      frozenPass,
    );
  }

  const crossScenario = objectAt(base.analysis, "cross-scenario analysis");
  preparePairedComparisons(crossScenario.pairedComparisons);
  prepareFrozenPairedBands(crossScenario.frozenPairedMacroBands, frozenPass);
  const retention = objectAt(crossScenario.rawProfileRetention, "profile retention");
  retention.retainedRunCount = 256;
  retention.maximumRetainedRunCount = 256;
  retention.repeatProfilesRetained = false;
  retention.repeatProfilesComparedExactlyThenDiscarded = false;
  return base;
}
