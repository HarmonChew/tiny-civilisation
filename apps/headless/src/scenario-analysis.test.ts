import { describe, expect, it } from "vitest";

import { SCENARIO_IDS, createScenarioReference, type ScenarioId } from "@tiny-civ/sim-core";

import type { ActivityProfile } from "./activity-collector.js";
import { profileSimulation } from "./index.js";
import { PHASE_4_2_HOLDOUT_POLICY } from "./phase-4.2-corpora.js";
import {
  analyzeScenarioRuns,
  convergenceDiagnostics,
  evaluateFrozenPairedMacroBands,
  evaluatePairedSeedEligibility,
  evaluateScenarioExpectedBands,
  evaluateScenarioOutcomeBands,
  pairedScenarioComparisons,
  summarizeRunOutcome,
  PHASE_4_2_CLASSIFIER_RULES,
  type Phase42AnalysisDefinitionOverride,
  type ScenarioAnalysisRun,
} from "./scenario-analysis.js";
import {
  PAIRED_MACRO_BANDS,
  PAIRED_MACRO_BAND_TABLE_VERSION,
  PHASE_4_1_CALIBRATION_SHA256,
  PHASE_4_2_CALIBRATION_PROVENANCE,
  PHASE_4_2_PAIRED_MACRO_BANDS,
  PHASE_4_2_POST_FREEZE_VERIFICATION_PROVENANCE,
  PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES,
  PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS,
  SCENARIO_OUTCOME_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
  SCENARIO_EXPECTED_BANDS,
  SCENARIO_EXPECTED_BAND_TABLE_VERSION,
  SCENARIO_OUTCOME_DOMINANCE_RATIONALES,
  SCENARIO_OUTCOME_INCIDENCE_BANDS,
  phase42DefinitionsAreFrozen,
  type PairedMacroBandDefinition,
  type Phase42CalibrationProvenance,
  type ScenarioOutcomeDominanceRationaleDefinition,
  type ScenarioOutcomeIncidenceBandDefinition,
} from "./scenario-bands.js";

const CANDIDATE_PHASE_4_2_DEFINITIONS = {
  status: "CANDIDATE",
  classifierRules: PHASE_4_2_CLASSIFIER_RULES,
  incidenceBands: [],
  dominanceRationales: [],
  pairedMacroBands: [],
} as const satisfies Phase42AnalysisDefinitionOverride;

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
    const template = fullMatrixProfile(scenarioId, 1);
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

  it("emits nonexclusive factual settlement labels at the frozen boundaries", () => {
    const profile = observedProfile("petri-world", 5);
    profile.relationships.componentCount = 1;
    profile.settlement.horizon.activeShelterCount = 1;
    profile.settlement.condition.activeShelterTicks = 1_000;
    profile.settlement.condition.lowConditionExposureRate = 0.5;
    profile.settlement.occupancy.deniedClaims = 1;
    profile.settlement.occupancy.crowdingEvents = 1;
    profile.settlement.rest.guestUseEvents = 1;
    profile.settlement.relocation.relocations = 1;

    const summary = summarizeRunOutcome(profile);

    expect(summary.labels.map((label) => label.id)).toEqual([
      "ESTABLISHED_SETTLEMENT",
      "CHRONIC_SHELTER_NEGLECT",
      "SHELTER_CROWDING",
      "GUEST_SHELTERING",
      "SETTLEMENT_RELOCATION",
    ]);
    expect(summary.labels[1]?.evidence).toEqual([
      {
        metricPath: "profile.settlement.condition.activeShelterTicks",
        value: 1_000,
        comparison: "GTE",
        threshold: 1_000,
      },
      {
        metricPath: "profile.settlement.condition.lowConditionExposureRate",
        value: 0.5,
        comparison: "GTE",
        threshold: 0.5,
      },
    ]);
  });

  it("does not classify an ineligible outsider denial as shelter crowding", () => {
    const profile = observedProfile("petri-world", 6);
    profile.settlement.occupancy.deniedClaims = 1;
    profile.settlement.occupancy.crowdingEvents = 0;

    const summary = summarizeRunOutcome(profile);

    expect(summary.labels.map((label) => label.id)).not.toContain("SHELTER_CROWDING");
  });

  it("keeps an explicit Phase 4.2 candidate definition set ineligible for holdout", () => {
    const template = fullMatrixProfile("petri-world", 1);
    const profiles = Array.from({ length: 64 }, (_, index) => {
      const seed = index + 2_001;
      const profile = structuredClone(template);
      profile.seed = seed;
      profile.scenario = createScenarioReference("petri-world", seed);
      return profile;
    });

    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "phase-4.2-holdout",
      seeds: profiles.map((profile) => profile.seed),
      requestedTicks: 10_000,
      phase42Definitions: CANDIDATE_PHASE_4_2_DEFINITIONS,
    });

    expect(report.eligibility).toMatchObject({
      status: "PHASE_4_2_NOT_FROZEN",
      reason: expect.stringContaining("reserved holdout remains sealed"),
    });
    expect(
      report.evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED"),
    ).toBe(true);
  });

  it("reports Phase 4.2 discovery calibration as candidate classifier-3 evidence", () => {
    const profiles = fullScenarioProfiles("petri-world");
    const report = evaluateScenarioExpectedBands("petri-world", profiles, {
      corpus: "phase-4.2-calibration",
      seeds: profiles.map((profile) => profile.seed),
      requestedTicks: 10_000,
      phase42Definitions: CANDIDATE_PHASE_4_2_DEFINITIONS,
    });

    expect(report.status).toBe("PARTIAL");
    expect(report.provenance).toMatchObject({
      calibrationEvidence: "PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT",
      holdoutEvidence: "NOT_PRESENT",
    });
    expect(report.scenarioOutcomeBands).toMatchObject({
      status: "NOT_EVALUATED",
      eligibility: { status: "PHASE_4_2_CALIBRATION_CANDIDATE" },
      provenance: PHASE_4_2_CALIBRATION_PROVENANCE,
    });
  });

  it("publishes the reviewed frozen Phase 4.2 definition tables", () => {
    expect(PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS).toHaveLength(4);
    expect(
      PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS.map((band) => band.threshold),
    ).toEqual([22, 7, 2, 1]);
    expect(PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES).toHaveLength(9);
    expect(PHASE_4_2_PAIRED_MACRO_BANDS).toHaveLength(1);
    expect(PHASE_4_2_PAIRED_MACRO_BANDS[0]).toMatchObject({
      dimension: "SETTLEMENT",
      metricId: "ACTIVE_SHELTER_COUNT",
      requiredPairedSeeds: 64,
    });
    expect(PHASE_4_2_CALIBRATION_PROVENANCE.bandFreezeStatus).toBe("FROZEN");
    expect(PHASE_4_2_CALIBRATION_PROVENANCE).toMatchObject({
      basis: "LOCKED_PHASE_4_2_CALIBRATION",
      artifact: "docs/baselines/phase-4.2-calibration-v1.json.gz",
      artifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      freezeReviewArtifact: "docs/baselines/phase-4.2-calibration-review-v1.md",
      freezeReviewArtifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      calibrationStatus: "REVIEWED",
      holdoutPolicy: "EVALUATE_UNCHANGED_THRESHOLDS_ONCE",
    });
    expect(PHASE_4_2_HOLDOUT_POLICY).toMatchObject({
      calibrationStatus: "REVIEWED",
      bandFreezeStatus: "FROZEN",
      holdoutStatus: "RECORDED",
      executionEnabled: false,
      frozenDefinitionFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      provenance: {
        verificationArtifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        verificationReviewArtifactSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    });
    expect(PHASE_4_2_POST_FREEZE_VERIFICATION_PROVENANCE).toMatchObject({
      basis: "POST_FREEZE_PHASE_4_2_VERIFICATION",
      artifact: "docs/baselines/phase-4.2-calibration-v2.json.gz",
      artifactSha256: PHASE_4_2_HOLDOUT_POLICY.provenance.verificationArtifactSha256,
      reviewArtifact: "docs/baselines/phase-4.2-calibration-verification-review-v1.md",
      reviewArtifactSha256:
        PHASE_4_2_HOLDOUT_POLICY.provenance.verificationReviewArtifactSha256,
      calibrationStatus: "REVIEWED",
    });
  });

  it("validates a complete frozen definition set before post-freeze verification", () => {
    const discoverySha = "a".repeat(64);
    const reviewSha = "b".repeat(64);
    const definitionFingerprint = "c".repeat(64);
    const policy = {
      ...PHASE_4_2_HOLDOUT_POLICY,
      calibrationStatus: "DISCOVERY_RECORDED",
      bandFreezeStatus: "FROZEN",
      frozenDefinitionFingerprint: definitionFingerprint,
      provenance: {
        ...PHASE_4_2_HOLDOUT_POLICY.provenance,
        discoveryArtifactSha256: discoverySha,
        freezeReviewArtifactSha256: reviewSha,
      },
    } as const;
    const provenance = {
      basis: "LOCKED_PHASE_4_2_CALIBRATION",
      artifact: policy.provenance.discoveryArtifact,
      artifactSha256: discoverySha,
      freezeReviewArtifact: policy.provenance.freezeReviewArtifact,
      freezeReviewArtifactSha256: reviewSha,
      classifierVersion: 3,
      calibrationSeedCount: 64,
      ticksPerRun: 10_000,
      calibrationStatus: "DISCOVERY_RECORDED",
      bandFreezeStatus: "FROZEN",
      holdoutPolicy: "SEALED_PENDING_POST_FREEZE_VERIFICATION",
      releaseClaim: false,
    } as const satisfies Phase42CalibrationProvenance;
    const incidenceBands = SCENARIO_IDS.map(
      (scenarioId) =>
        ({
          tableVersion: SCENARIO_OUTCOME_BAND_TABLE_VERSION,
          scenarioId,
          labelId: "ESTABLISHED_SETTLEMENT",
          metricPath: "analysis.outcomes.incidence[ESTABLISHED_SETTLEMENT].occurrences",
          comparison: "GTE",
          threshold: SCENARIO_OUTCOME_MINIMUM_OCCURRENCES,
          requiredEligibleRuns: 64,
          provenance,
        }) satisfies ScenarioOutcomeIncidenceBandDefinition,
    );
    const dominanceRationales: ScenarioOutcomeDominanceRationaleDefinition[] =
      PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES.map((definition) => ({
        ...definition,
        provenance,
      }));
    const conditionBand = {
      tableVersion: PAIRED_MACRO_BAND_TABLE_VERSION,
      dimension: "SETTLEMENT",
      leftScenarioId: "petri-world",
      rightScenarioId: "split-banks",
      metricId: "MEAN_SHELTER_CONDITION",
      metricPath: "pairedComparisons[petri-world->split-banks].MEAN_SHELTER_CONDITION",
      deltaStatistic: "ABSOLUTE_PAIRED_MEAN_RIGHT_MINUS_LEFT",
      minimumAbsoluteMeanDelta: 100,
      effectStatistic: "ABSOLUTE_COHEN_DZ",
      minimumAbsoluteCohenDz: 0.3,
      requiredPairedSeeds: 61,
      missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
      eligiblePairPolicy: "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION",
      provenance,
    } as const satisfies PairedMacroBandDefinition;

    expect(
      phase42DefinitionsAreFrozen({
        policy,
        incidenceBands,
        dominanceRationales,
        pairedMacroBands: [conditionBand],
        currentDefinitionFingerprint: definitionFingerprint,
      }),
    ).toBe(true);
    expect(
      phase42DefinitionsAreFrozen({
        policy,
        incidenceBands: incidenceBands.slice(1),
        dominanceRationales,
        pairedMacroBands: [conditionBand],
        currentDefinitionFingerprint: definitionFingerprint,
      }),
    ).toBe(false);
    expect(
      phase42DefinitionsAreFrozen({
        policy,
        incidenceBands,
        dominanceRationales,
        pairedMacroBands: [
          {
            ...conditionBand,
            missingValuePolicy: "ZERO_IS_OBSERVED",
          },
        ],
        currentDefinitionFingerprint: definitionFingerprint,
      }),
    ).toBe(false);
    expect(
      phase42DefinitionsAreFrozen({
        policy,
        incidenceBands,
        dominanceRationales,
        pairedMacroBands: [conditionBand],
        currentDefinitionFingerprint: "d".repeat(64),
      }),
    ).toBe(false);
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
    expect(report.outcomes.incidence).toHaveLength(14);
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

  it("keeps Phase 4.2 labels outside the legacy classifier-2 dominance gate", () => {
    const profiles = fullScenarioProfiles("petri-world");
    for (const profile of profiles.slice(0, 8)) {
      addCooperativeStorage(profile);
      addSharedHydration(profile);
    }
    for (const profile of profiles) {
      profile.hydration.sources.depletedSourceTicks = 500;
      profile.settlement.horizon.activeShelterCount = 1;
    }

    const report = evaluateScenarioOutcomeBands("petri-world", profiles, {
      corpus: "calibration",
      seeds: Array.from({ length: 64 }, (_, index) => index + 1),
      requestedTicks: 10_000,
    });

    expect(report.status).toBe("PASS");
    expect(report.dominance.evaluations).toHaveLength(9);
    expect(
      report.dominance.evaluations.some(
        (evaluation) => evaluation.labelId === "ESTABLISHED_SETTLEMENT",
      ),
    ).toBe(false);
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

  it("retains historical macro bands without evaluating the sealed Phase 4.2 holdout", () => {
    const runs = fullMatrixRuns({ seedOffset: 2_000 });
    const report = evaluateFrozenPairedMacroBands(runs, pairedScenarioComparisons(runs), {
      corpus: "phase-4.2-holdout",
      seeds: Array.from({ length: 64 }, (_, index) => index + 2_001),
      requestedTicks: 10_000,
      phase42Definitions: CANDIDATE_PHASE_4_2_DEFINITIONS,
    });

    expect(report.corpusValidation).toMatchObject({
      status: "PHASE_4_2_NOT_FROZEN",
      reason: expect.stringContaining("reserved holdout remains sealed"),
    });
    expect(report.status).toBe("NOT_EVALUATED");
    expect(report.bandEvaluationStatus).toBe("NOT_EVALUATED");
    expect(report.evaluations.map((evaluation) => evaluation.metricId)).toEqual(
      PAIRED_MACRO_BANDS.map((band) => band.metricId),
    );
    expect(
      report.evaluations.every((evaluation) => evaluation.status === "NOT_EVALUATED"),
    ).toBe(true);
    expect(report.settlementRequirement).toMatchObject({
      status: "NOT_EVALUATED",
      observed: null,
      threshold: 1,
    });
  });
});

describe("paired descriptive comparisons and convergence", () => {
  it("supports a frozen eligible-pair threshold for nullable condition metrics", () => {
    const expectedSeeds = Array.from({ length: 64 }, (_, index) => index + 1);
    const conditionPolicy = {
      missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING" as const,
      eligiblePairPolicy: "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION" as const,
      requiredPairedSeeds: 61,
    };

    expect(
      evaluatePairedSeedEligibility(
        conditionPolicy,
        expectedSeeds.slice(0, 61),
        expectedSeeds,
      ),
    ).toEqual({ eligible: true, reason: null });
    expect(
      evaluatePairedSeedEligibility(
        conditionPolicy,
        expectedSeeds.slice(0, 60),
        expectedSeeds,
      ),
    ).toMatchObject({
      eligible: false,
      reason: expect.stringContaining("frozen minimum is 61"),
    });
    expect(
      evaluatePairedSeedEligibility(
        {
          ...conditionPolicy,
          missingValuePolicy: "ZERO_IS_OBSERVED",
        },
        expectedSeeds.slice(0, 61),
        expectedSeeds,
      ),
    ).toMatchObject({
      eligible: false,
      reason: expect.stringContaining("missing-value exclusion band"),
    });
  });

  it("reports right-minus-left paired effects without causal language", () => {
    const left = [1, 2].map((seed) => observedProfile("petri-world", seed));
    const right = [1, 2].map((seed) => observedProfile("split-banks", seed));
    left[0]!.groups.horizon.groupCount = 1;
    left[1]!.groups.horizon.groupCount = 2;
    right[0]!.groups.horizon.groupCount = 3;
    right[1]!.groups.horizon.groupCount = 5;
    left[0]!.settlement.horizon.activeShelterCount = 0;
    left[1]!.settlement.horizon.activeShelterCount = 1;
    right[0]!.settlement.horizon.activeShelterCount = 1;
    right[1]!.settlement.horizon.activeShelterCount = 3;

    const comparisons = pairedScenarioComparisons([...left, ...right].map(runForProfile));
    const comparison = comparisons.find(
      (candidate) =>
        candidate.leftScenarioId === "petri-world" &&
        candidate.rightScenarioId === "split-banks",
    );
    const groupCount = comparison?.metrics.find(
      (metric) => metric.metricId === "GROUP_COUNT",
    );
    const activeShelters = comparison?.metrics.find(
      (metric) => metric.metricId === "ACTIVE_SHELTER_COUNT",
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
    expect(activeShelters).toMatchObject({
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.horizon.activeShelterCount",
    });
    expect(activeShelters?.pairs.map((pair) => pair.delta)).toEqual([1, 2]);

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
      diagnostics.find((diagnostic) => diagnostic.dimension === "SETTLEMENT")?.status,
    ).toBe("DIFFERENCE_OBSERVED");
    expect(
      diagnostics.every((diagnostic) => diagnostic.interpretation.includes("NON_CAUSAL")),
    ).toBe(true);
  });

  it("excludes absent shelters from mean-condition pairs instead of treating them as zero", () => {
    const left = [1, 2].map((seed) => observedProfile("petri-world", seed));
    const right = [1, 2].map((seed) => observedProfile("split-banks", seed));
    left[0]!.settlement.condition.activeShelterTicks = 0;
    left[0]!.settlement.condition.meanCondition = 0;
    right[0]!.settlement.condition.activeShelterTicks = 100;
    right[0]!.settlement.condition.meanCondition = 5_000;
    left[1]!.settlement.condition.activeShelterTicks = 100;
    left[1]!.settlement.condition.meanCondition = 4_000;
    right[1]!.settlement.condition.activeShelterTicks = 100;
    right[1]!.settlement.condition.meanCondition = 6_000;

    const comparison = pairedScenarioComparisons(
      [...left, ...right].map(runForProfile),
    ).find(
      (candidate) =>
        candidate.leftScenarioId === "petri-world" &&
        candidate.rightScenarioId === "split-banks",
    );
    const condition = comparison?.metrics.find(
      (metric) => metric.metricId === "MEAN_SHELTER_CONDITION",
    );

    expect(condition).toMatchObject({
      missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
      pairs: [{ seed: 2, leftValue: 4_000, rightValue: 6_000, delta: 2_000 }],
      summary: { pairedSeedCount: 1, meanDelta: 2_000 },
    });
  });
});
