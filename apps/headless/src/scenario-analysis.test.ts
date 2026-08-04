import { describe, expect, it } from "vitest";

import { createScenarioReference, type ScenarioId } from "@tiny-civ/sim-core";

import type { ActivityProfile } from "./activity-collector.js";
import { profileSimulation } from "./index.js";
import {
  analyzeScenarioRuns,
  convergenceDiagnostics,
  evaluateScenarioExpectedBands,
  pairedScenarioComparisons,
  summarizeRunOutcome,
  type ScenarioAnalysisRun,
} from "./scenario-analysis.js";
import {
  PENDING_SCENARIO_OUTCOME_BAND_DIMENSIONS,
  SCENARIO_EXPECTED_BANDS,
  SCENARIO_EXPECTED_BAND_TABLE_VERSION,
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
    expect(report.expectedBands.scenarioOutcomeBands).toEqual({
      status: "PENDING_FULL_CALIBRATION_AND_HOLDOUT",
      releaseClaim: false,
      pendingDimensions: PENDING_SCENARIO_OUTCOME_BAND_DIMENSIONS,
    });
    expect(report.hardInvariants.status).toBe("PASS");
    expect(report.outcomes.incidence).toHaveLength(5);
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

  it("keeps the versioned table explicit about pending calibration and holdout", () => {
    expect(SCENARIO_EXPECTED_BAND_TABLE_VERSION).toBe(1);
    expect(SCENARIO_EXPECTED_BANDS).toHaveLength(4 * 7);
    expect(
      SCENARIO_EXPECTED_BANDS.every(
        (band) =>
          band.provenance.calibrationEvidence === "PENDING_FULL_64_SEED_CORPUS" &&
          band.provenance.holdoutEvidence === "PENDING_FULL_64_SEED_CORPUS" &&
          band.provenance.releaseClaim === false,
      ),
    ).toBe(true);
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
