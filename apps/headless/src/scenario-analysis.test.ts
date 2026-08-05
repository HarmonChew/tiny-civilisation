import { describe, expect, it } from "vitest";

import { createScenarioReference, type ScenarioId } from "@tiny-civ/sim-core";

import type { ActivityProfile } from "./activity-collector.js";
import { profileSimulation } from "./index.js";
import {
  analyzeScenarioRuns,
  convergenceDiagnostics,
  evaluateFrozenPairedMacroBands,
  evaluateScenarioExpectedBands,
  evaluateScenarioOutcomeBands,
  pairedScenarioComparisons,
  summarizeRunOutcome,
  type ScenarioAnalysisRun,
} from "./scenario-analysis.js";
import {
  PAIRED_MACRO_BANDS,
  PHASE_4_1_CALIBRATION_SHA256,
  SCENARIO_EXPECTED_BANDS,
  SCENARIO_EXPECTED_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_DOMINANCE_RATIONALES,
  SCENARIO_OUTCOME_INCIDENCE_BANDS,
} from "./scenario-bands.js";

function baseProfile(scenarioId: ScenarioId, seed: number): ActivityProfile {
  return structuredClone(profileSimulation({ scenarioId, seed, ticks: 0 }).profile);
}

function observedProfile(scenarioId: ScenarioId, seed: number): ActivityProfile {
  const profile = baseProfile(scenarioId, seed);
  profile.window.endTick = 2_000;
  profile.window.observedTicks = 2_000;
  profile.horizon.tick = 2_000;
  profile.scenario = createScenarioReference(scenarioId, seed);
  profile.seed = seed;
  for (const action of profile.actions.byKind.slice(0, 6)) {
    action.count = 1;
    action.share = 1 / 6;
  }
  profile.actions.completedActions = 6;
  for (const desire of profile.desires.byFamily.slice(0, 4)) {
    desire.exposureCreatureTicks = 1;
    desire.exposureRate = 0.01;
  }
  return profile;
}

function fullMatrixProfile(scenarioId: ScenarioId, seed: number): ActivityProfile {
  const profile = observedProfile(scenarioId, seed);
  profile.window.endTick = 10_000;
  profile.window.observedTicks = 10_000;
  profile.horizon.tick = 10_000;
  profile.stalemate.eligible = true;
  profile.stalemate.observedWindowTicks = 1_000;
  profile.relationships.componentCount = 1;
  return profile;
}

function fullScenarioProfiles(scenarioId: ScenarioId): ActivityProfile[] {
  const template = fullMatrixProfile(scenarioId, 1);
  return Array.from({ length: 64 }, (_, index) => {
    const seed = index + 1;
    const profile = structuredClone(template);
    profile.seed = seed;
    profile.scenario = createScenarioReference(scenarioId, seed);
    return profile;
  });
}

function fullMatrixRuns(options?: {
  readonly seedOffset?: number;
  readonly collapseSocialAndStorage?: boolean;
}): ScenarioAnalysisRun[] {
  const seedOffset = options?.seedOffset ?? 0;
  return (
    ["petri-world", "split-banks", "scattered-plenty", "unequal-table"] as const
  ).flatMap((scenarioId) => {
    const template = fullMatrixProfile(scenarioId, seedOffset + 1);
    return Array.from({ length: 64 }, (_, index) => {
      const seed = seedOffset + index + 1;
      const profile = structuredClone(template);
      profile.seed = seed;
      profile.scenario = createScenarioReference(scenarioId, seed);
      const parity = index % 2;
      if (scenarioId === "petri-world") {
        profile.groups.horizon.groupCount = 1 + parity;
        profile.horizon.storage.food = 30 + parity * 20;
        setInteraction(profile, "CREATURE_ATTACKED", 4 + parity * 2);
      }
      if (scenarioId === "scattered-plenty") {
        setInteraction(profile, "CREATURE_ATTACKED", 0);
        profile.spatial.dispersion.creaturePairDistanceTiles.median = 10 + parity * 2;
      }
      if (scenarioId === "unequal-table") {
        profile.groups.horizon.groupCount = options?.collapseSocialAndStorage
          ? 1 + parity
          : 0;
        profile.horizon.storage.food = options?.collapseSocialAndStorage
          ? 30 + parity * 20
          : 0;
        profile.spatial.dispersion.creaturePairDistanceTiles.median = 4;
      }
      return runForProfile(profile);
    });
  });
}

function runForProfile(profile: ActivityProfile): ScenarioAnalysisRun {
  return {
    scenario: profile.scenario,
    compiledMapHash: profile.compiledMapHash,
    finalHash: profile.seed.toString(16).padStart(16, "0"),
    profile,
  };
}

function setInteraction(profile: ActivityProfile, eventType: string, count: number): void {
  const interaction = profile.interactions.byType.find(
    (candidate) => candidate.eventType === eventType,
  );
  if (!interaction) throw new Error(`Missing interaction fixture ${eventType}.`);
  interaction.count = count;
}

describe("scenario outcome analysis", () => {
  it("emits deterministic coexisting factual labels with metric evidence", () => {
    const profile = observedProfile("petri-world", 1);
    profile.horizon.storage.completedStorageCount = 1;
    profile.horizon.storage.food = 3;
    profile.groups.horizon.groupedCreatureCount = 4;
    profile.relationships.componentCount = 2;
    setInteraction(profile, "FOOD_SHARED", 1);
    setInteraction(profile, "CREATURE_ATTACKED", 2);

    const summary = summarizeRunOutcome(profile);

    expect(summary.interpretation).toBe("FACTUAL_NON_EXCLUSIVE_NO_WINNER");
    expect(summary.labels.map((label) => label.id)).toEqual([
      "COOPERATIVE_SHARED_STORAGE",
      "FRAGMENTED_SOCIAL_STRUCTURE",
      "RECURRING_CONFLICT",
    ]);
    expect(summary.labels[0]?.evidence).toContainEqual({
      metricPath: "profile.horizon.storage.completedStorageCount",
      value: 1,
      comparison: "GTE",
      threshold: 1,
    });
    expect(summary.notEvaluatedLabelIds).toEqual(["QUIET_STALEMATE"]);
  });

  it("grounds private reserves and quiet stalemate in retained facts", () => {
    const profile = observedProfile("scattered-plenty", 2);
    const keep = profile.actions.byKind.find((action) => action.kind === "KEEP");
    if (!keep) throw new Error("Missing KEEP fixture.");
    keep.count = 1;
    keep.share = 0.1;
    profile.actions.completedActions += 1;
    profile.horizon.resources.ungroupedCarriedFood = 2;
    profile.window.endTick = 10_000;
    profile.window.observedTicks = 10_000;
    profile.horizon.tick = 10_000;
    profile.stalemate.eligible = true;
    profile.stalemate.observedWindowTicks = 1_000;
    profile.stalemate.declared = true;

    const summary = summarizeRunOutcome(profile);

    expect(summary.labels.map((label) => label.id)).toContain(
      "PERSISTENT_PRIVATE_RESERVES",
    );
    expect(summary.labels.map((label) => label.id)).toContain("QUIET_STALEMATE");
    expect(
      summary.labels.find((label) => label.id === "QUIET_STALEMATE")?.evidence,
    ).toContainEqual({
      metricPath: "profile.stalemate.declared",
      value: true,
      comparison: "EQ",
      threshold: true,
    });
  });

  it("applies the frozen hydration classifier thresholds as nonexclusive facts", () => {
    const profile = observedProfile("split-banks", 3);
    profile.hydration.flow.sharedUnits = 4;
    profile.hydration.flow.recipientIds = [2, 3, 4];
    profile.hydration.flow.distinctRecipients = 3;
    profile.hydration.sources.depletedSourceTicks = 500;
    profile.hydration.need.severeExposureRate = 0.1;
    profile.hydration.routes.dominantEdgeShare = 0.35;
    profile.hydration.routes.herfindahlIndex = 0.15;

    const summary = summarizeRunOutcome(profile);

    expect(summary.labels.map((label) => label.id)).toEqual(
      expect.arrayContaining([
        "SHARED_HYDRATION",
        "SOURCE_BOTTLENECK",
        "PERSISTENT_DEHYDRATION",
        "CONCENTRATED_WATER_ROUTES",
      ]),
    );
    expect(
      summary.labels.find((label) => label.id === "SOURCE_BOTTLENECK")?.evidence,
    ).toEqual([
      {
        metricPath: "profile.hydration.sources.depletedSourceTicks",
        value: 500,
        comparison: "GTE",
        threshold: 500,
      },
    ]);
  });

  it("keeps hydration labels below threshold and accepts the contention alternative", () => {
    const below = observedProfile("split-banks", 4);
    below.hydration.flow.sharedUnits = 3;
    below.hydration.flow.distinctRecipients = 2;
    below.hydration.sources.depletedSourceTicks = 499;
    below.hydration.sources.gatherAttempts = 10;
    below.hydration.sources.contentionRate = 0.099999;
    below.hydration.need.severeExposureRate = 0.099999;
    below.hydration.need.longestSevereSpellTicks = 999;
    below.hydration.routes.dominantEdgeShare = 0.349999;
    below.hydration.routes.herfindahlIndex = 0.149999;
    expect(summarizeRunOutcome(below).labels.map((label) => label.id)).not.toEqual(
      expect.arrayContaining([
        "SHARED_HYDRATION",
        "SOURCE_BOTTLENECK",
        "PERSISTENT_DEHYDRATION",
        "CONCENTRATED_WATER_ROUTES",
      ]),
    );

    below.hydration.sources.contentionRate = 0.1;
    expect(summarizeRunOutcome(below).labels.map((label) => label.id)).toContain(
      "SOURCE_BOTTLENECK",
    );
  });
});

describe("scenario bands and invariants", () => {
  it("evaluates only contract-derived safety floors on a locked corpus", () => {
    const profiles = Array.from({ length: 8 }, (_, index) =>
      observedProfile("petri-world", index + 1),
    );
    const report = analyzeScenarioRuns(profiles.map(runForProfile), {
      corpus: "smoke",
      seeds: Array.from({ length: 8 }, (_, index) => index + 1),
      requestedTicks: 2_000,
    });

    expect(report.expectedBands.status).toBe("PASS");
    expect(report.expectedBands.corpusValidation.status).toBe("MATCHED_LOCKED_CORPUS");
    expect(report.expectedBands.provenance).toEqual({
      releaseOutcomeClaim: false,
      calibrationEvidence: "SMOKE_SUBSET_ONLY",
      holdoutEvidence: "NOT_PRESENT",
    });
    expect(report.expectedBands.scenarioOutcomeBands).toMatchObject({
      status: "NOT_EVALUATED",
      eligibility: { status: "NOT_EVALUATED" },
      releaseClaim: false,
      dominance: { status: "NOT_EVALUATED", rationaleFailures: [] },
    });
    expect(report.hardInvariants.status).toBe("PASS");
    expect(report.outcomes.incidence).toHaveLength(9);
    expect(
      report.outcomes.incidence.find(
        (incidence) => incidence.labelId === "FRAGMENTED_SOCIAL_STRUCTURE",
      ),
    ).toMatchObject({
      runs: 8,
      eligibleRuns: 8,
      occurrences: 8,
      incidence: 1,
      wilson95: { confidence: 0.95 },
    });
    expect(
      report.outcomes.incidence.find(
        (incidence) => incidence.labelId === "QUIET_STALEMATE",
      ),
    ).toMatchObject({ runs: 0, eligibleRuns: 0, incidence: null });
  });

  it("returns NOT_EVALUATED for an incorrect horizon or corpus", () => {
    const profile = observedProfile("split-banks", 1);
    const wrongCorpus = evaluateScenarioExpectedBands("split-banks", [profile], {
      corpus: "smoke",
      seeds: [1],
      requestedTicks: 2_000,
    });
    const fullSmoke = Array.from({ length: 8 }, (_, index) =>
      observedProfile("split-banks", index + 1),
    );
    const wrongHorizon = evaluateScenarioExpectedBands("split-banks", fullSmoke, {
      corpus: "smoke",
      seeds: Array.from({ length: 8 }, (_, index) => index + 1),
      requestedTicks: 1_999,
    });

    expect(wrongCorpus.status).toBe("NOT_EVALUATED");
    expect(wrongCorpus.corpusValidation.status).toBe("CORPUS_MISMATCH");
    expect(
      wrongCorpus.evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED"),
    ).toBe(true);
    expect(wrongHorizon.status).toBe("NOT_EVALUATED");
    expect(wrongHorizon.corpusValidation.status).toBe("HORIZON_MISMATCH");
  });

  it("reports hard-invariant and expected-band failures as machine-readable data", () => {
    const profiles = Array.from({ length: 8 }, (_, index) =>
      observedProfile("unequal-table", index + 1),
    );
    profiles[0]!.spatial.exactOverlap.rate = 0.02;
    const report = analyzeScenarioRuns(profiles.map(runForProfile), {
      corpus: "smoke",
      seeds: Array.from({ length: 8 }, (_, index) => index + 1),
      requestedTicks: 2_000,
    });

    expect(report.expectedBands.status).toBe("FAIL");
    expect(
      report.expectedBands.evaluations.find(
        (evaluation) => evaluation.metricId === "MAXIMUM_RUN_EXACT_OVERLAP_RATE",
      ),
    ).toMatchObject({
      status: "FAIL",
      observed: 0.02,
      comparison: "LT",
      threshold: 0.01,
    });
    expect(report.hardInvariants.status).toBe("FAIL");
    expect(
      report.hardInvariants.perRun[0]?.evaluations.find(
        (evaluation) => evaluation.id === "EXACT_OVERLAP_RATE",
      )?.status,
    ).toBe("FAIL");
  });

  it("records the locked calibration provenance on the versioned safety table", () => {
    expect(SCENARIO_EXPECTED_BAND_TABLE_VERSION).toBe(2);
    expect(SCENARIO_EXPECTED_BANDS).toHaveLength(4 * 7);
    expect(
      SCENARIO_EXPECTED_BANDS.every(
        (band) =>
          band.provenance.calibrationEvidence === "LOCKED_PHASE_4_1_CALIBRATION" &&
          band.provenance.calibrationArtifactSha256 === PHASE_4_1_CALIBRATION_SHA256 &&
          band.provenance.holdoutEvidence === "PENDING_FULL_64_SEED_CORPUS" &&
          band.provenance.releaseClaim === false,
      ),
    ).toBe(true);
  });
});

describe("frozen Phase 4.1 outcome-incidence bands", () => {
  function addCooperativeStorage(profile: ActivityProfile): void {
    profile.horizon.storage.completedStorageCount = 1;
    profile.horizon.storage.food = 1;
    profile.groups.horizon.groupedCreatureCount = 2;
    setInteraction(profile, "FOOD_SHARED", 1);
  }

  function addSharedHydration(profile: ActivityProfile): void {
    profile.hydration.flow.sharedUnits = 4;
    profile.hydration.flow.recipientIds = [2, 3, 4];
    profile.hydration.flow.distinctRecipients = 3;
  }

  it("passes the frozen minima and accepts a checked-in dominant-label rationale", () => {
    const profiles = fullScenarioProfiles("petri-world");
    for (const profile of profiles.slice(0, 8)) {
      addCooperativeStorage(profile);
      addSharedHydration(profile);
    }
    for (const profile of profiles) {
      profile.hydration.sources.depletedSourceTicks = 500;
    }

    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "calibration",
      seeds: Array.from({ length: 64 }, (_, index) => index + 1),
      requestedTicks: 10_000,
    });

    expect(report.status).toBe("PASS");
    expect(report.releaseClaim).toBe(false);
    expect(report.provenance.artifactSha256).toBe(PHASE_4_1_CALIBRATION_SHA256);
    expect(report.evaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelId: "COOPERATIVE_SHARED_STORAGE",
          status: "PASS",
          observed: 8,
          eligibleRuns: 64,
          threshold: 8,
        }),
        expect.objectContaining({
          labelId: "SHARED_HYDRATION",
          status: "PASS",
          observed: 8,
        }),
      ]),
    );
    expect(
      report.dominance.evaluations.find(
        (evaluation) => evaluation.labelId === "SOURCE_BOTTLENECK",
      ),
    ).toMatchObject({
      status: "PASS",
      incidence: 1,
      rationaleRequired: true,
      rationale: {
        interpretation: "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME",
      },
    });
    expect(report.dominance.rationaleFailures).toEqual([]);
  });

  it("fails a frozen incidence minimum below eight occurrences", () => {
    const profiles = fullScenarioProfiles("petri-world");
    for (const profile of profiles.slice(0, 8)) addCooperativeStorage(profile);
    for (const profile of profiles.slice(0, 7)) addSharedHydration(profile);

    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "calibration",
      seeds: Array.from({ length: 64 }, (_, index) => index + 1),
      requestedTicks: 10_000,
    });

    expect(report.status).toBe("FAIL");
    expect(
      report.evaluations.find((evaluation) => evaluation.labelId === "SHARED_HYDRATION"),
    ).toMatchObject({ status: "FAIL", observed: 7, threshold: 8 });
  });

  it("fails an incidence above 85% when no checked-in rationale exists", () => {
    const profiles = fullScenarioProfiles("petri-world");
    for (const profile of profiles.slice(0, 8)) {
      addCooperativeStorage(profile);
      addSharedHydration(profile);
    }
    for (const profile of profiles) setInteraction(profile, "CREATURE_ATTACKED", 2);

    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "calibration",
      seeds: Array.from({ length: 64 }, (_, index) => index + 1),
      requestedTicks: 10_000,
    });

    expect(report.status).toBe("FAIL");
    expect(report.dominance.rationaleFailures).toEqual(["RECURRING_CONFLICT"]);
    expect(
      report.dominance.evaluations.find(
        (evaluation) => evaluation.labelId === "RECURRING_CONFLICT",
      ),
    ).toMatchObject({
      status: "FAIL",
      incidence: 1,
      rationaleRequired: true,
      rationale: null,
    });
  });

  it("marks every frozen outcome check NOT_EVALUATED for a non-full corpus", () => {
    const profiles = Array.from({ length: 8 }, (_, index) =>
      observedProfile("petri-world", index + 1),
    );
    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "smoke",
      seeds: Array.from({ length: 8 }, (_, index) => index + 1),
      requestedTicks: 2_000,
    });

    expect(report.status).toBe("NOT_EVALUATED");
    expect(
      report.evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED"),
    ).toBe(true);
    expect(
      report.dominance.evaluations.every(
        (evaluation) => evaluation.status === "NOT_EVALUATED",
      ),
    ).toBe(true);
  });

  it("checks in exactly the calibrated required bands and dominant rationales", () => {
    expect(SCENARIO_OUTCOME_INCIDENCE_BANDS).toHaveLength(8);
    expect(
      SCENARIO_OUTCOME_INCIDENCE_BANDS.every(
        (band) =>
          band.threshold === 8 &&
          band.requiredEligibleRuns === 64 &&
          band.provenance.classifierVersion === 2 &&
          band.provenance.artifactSha256 === PHASE_4_1_CALIBRATION_SHA256 &&
          band.provenance.releaseClaim === false,
      ),
    ).toBe(true);
    expect(SCENARIO_OUTCOME_DOMINANCE_RATIONALES).toHaveLength(9);
    expect(
      SCENARIO_OUTCOME_DOMINANCE_RATIONALES.every(
        (rationale) =>
          rationale.interpretation ===
            "EXPLAINS_CALIBRATION_PREVALENCE_NOT_A_SCRIPTED_OUTCOME" &&
          rationale.mechanicsAndScenarioBasis.includes("explain") &&
          rationale.mechanicsAndScenarioBasis.includes("do not prescribe or script"),
      ),
    ).toBe(true);
  });
});

describe("frozen Phase 4.1 paired macro bands", () => {
  const calibrationContext = {
    corpus: "calibration",
    seeds: Array.from({ length: 64 }, (_, index) => index + 1),
    requestedTicks: 10_000,
  } as const;

  it("passes four material original Phase 3 dimensions with locked provenance", () => {
    const runs = fullMatrixRuns();
    const report = evaluateFrozenPairedMacroBands(
      runs,
      pairedScenarioComparisons(runs),
      calibrationContext,
    );

    expect(report.status).toBe("PASS");
    expect(report.bandEvaluationStatus).toBe("PASS");
    expect(report.releaseClaim).toBe(false);
    expect(report.provenance.artifactSha256).toBe(PHASE_4_1_CALIBRATION_SHA256);
    expect(report.dimensionRequirement).toMatchObject({
      status: "PASS",
      observed: 4,
      threshold: 3,
      passingDimensions: ["SOCIAL", "STORAGE", "CONFLICT", "SPATIAL"],
    });
    expect(report.evaluations.every((evaluation) => evaluation.status === "PASS")).toBe(
      true,
    );
  });

  it("enforces both metric thresholds and the three-dimension requirement", () => {
    const runs = fullMatrixRuns({ collapseSocialAndStorage: true });
    const report = evaluateFrozenPairedMacroBands(
      runs,
      pairedScenarioComparisons(runs),
      calibrationContext,
    );

    expect(report.status).toBe("FAIL");
    expect(report.bandEvaluationStatus).toBe("FAIL");
    expect(report.dimensionRequirement).toMatchObject({
      status: "FAIL",
      observed: 2,
      threshold: 3,
      passingDimensions: ["CONFLICT", "SPATIAL"],
    });
    expect(report.evaluations.filter((evaluation) => evaluation.status === "FAIL")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: "SOCIAL", absoluteMeanDelta: 0 }),
        expect.objectContaining({ dimension: "STORAGE", absoluteMeanDelta: 0 }),
      ]),
    );
  });

  it("marks paired bands NOT_EVALUATED outside a full calibration or holdout", () => {
    const runs = fullMatrixRuns().filter((run) => run.scenario.seed <= 8);
    const report = evaluateFrozenPairedMacroBands(runs, pairedScenarioComparisons(runs), {
      corpus: "smoke",
      seeds: Array.from({ length: 8 }, (_, index) => index + 1),
      requestedTicks: 2_000,
    });

    expect(report.status).toBe("NOT_EVALUATED");
    expect(report.bandEvaluationStatus).toBe("NOT_EVALUATED");
    expect(report.dimensionRequirement.observed).toBeNull();
    expect(
      report.evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED"),
    ).toBe(true);
  });

  it("uses the unchanged calibration thresholds for the untouched holdout shape", () => {
    const runs = fullMatrixRuns({ seedOffset: 1_000 });
    const report = evaluateFrozenPairedMacroBands(runs, pairedScenarioComparisons(runs), {
      corpus: "holdout",
      seeds: Array.from({ length: 64 }, (_, index) => index + 1_001),
      requestedTicks: 10_000,
    });

    expect(report.corpusValidation.status).toBe("FULL_HOLDOUT");
    expect(report.status).toBe("PASS");
    expect(report.evaluations.map((evaluation) => evaluation.provenance)).toEqual(
      PAIRED_MACRO_BANDS.map((band) => band.provenance),
    );
    expect(
      report.evaluations.map((evaluation) => evaluation.minimumAbsoluteMeanDelta),
    ).toEqual([0.25, 20, 2, 2]);
    expect(
      report.evaluations.map((evaluation) => evaluation.minimumAbsoluteCohenDz),
    ).toEqual([0.5, 0.5, 0.3, 0.5]);
  });
});

describe("paired descriptive comparisons and convergence", () => {
  it("reports right-minus-left paired effects without causal language", () => {
    const left = [1, 2].map((seed) => observedProfile("petri-world", seed));
    const right = [1, 2].map((seed) => observedProfile("split-banks", seed));
    left[0]!.groups.horizon.groupCount = 1;
    left[1]!.groups.horizon.groupCount = 2;
    right[0]!.groups.horizon.groupCount = 3;
    right[1]!.groups.horizon.groupCount = 5;

    const comparisons = pairedScenarioComparisons([...left, ...right].map(runForProfile));
    const comparison = comparisons.find(
      (candidate) =>
        candidate.leftScenarioId === "petri-world" &&
        candidate.rightScenarioId === "split-banks",
    );
    const groupCount = comparison?.metrics.find(
      (metric) => metric.metricId === "GROUP_COUNT",
    );

    expect(comparison).toMatchObject({
      comparisonKind: "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL",
      pairedSeeds: [1, 2],
    });
    expect(groupCount?.pairs.map((pair) => pair.delta)).toEqual([2, 3]);
    expect(groupCount?.summary).toMatchObject({
      pairedSeedCount: 2,
      meanDelta: 2.5,
      medianDelta: 2.5,
      positiveDeltas: 2,
    });
    expect(groupCount?.effect).toMatchObject({
      method: "PAIRED_STANDARDIZED_MEAN_DELTA_COHEN_DZ",
      value: 3.535533,
      interpretation: "DESCRIPTIVE_NON_CAUSAL",
    });

    const diagnostics = convergenceDiagnostics(comparisons).filter(
      (diagnostic) =>
        diagnostic.leftScenarioId === "petri-world" &&
        diagnostic.rightScenarioId === "split-banks",
    );
    expect(
      diagnostics.find((diagnostic) => diagnostic.dimension === "SOCIAL")?.status,
    ).toBe("DIFFERENCE_OBSERVED");
    expect(
      diagnostics.find((diagnostic) => diagnostic.dimension === "STORAGE")?.status,
    ).toBe("EXACT_CONVERGENCE");
    expect(
      diagnostics.every((diagnostic) => diagnostic.interpretation.includes("NON_CAUSAL")),
    ).toBe(true);
  });
});
