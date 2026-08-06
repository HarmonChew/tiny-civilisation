import { describe, expect, it } from "vitest";

import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_FINGERPRINT,
  PHASE_4_2_INCIDENCE_BAND_POLICY,
  canonicalPhase42DefinitionJson,
  phase42DefinitionFingerprint,
} from "./phase-4.2-definition-contract.js";

describe("Phase 4.2 frozen-definition fingerprint", () => {
  it("canonicalizes object keys while preserving semantic array order", () => {
    expect(canonicalPhase42DefinitionJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalPhase42DefinitionJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(phase42DefinitionFingerprint({ labels: ["A", "B"] })).not.toBe(
      phase42DefinitionFingerprint({ labels: ["B", "A"] }),
    );
  });

  it.each([
    ["undefined", { value: undefined }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative zero", { value: -0 }],
    ["function", { value: () => true }],
  ])("rejects non-canonical %s input", (_label, value) => {
    expect(() => canonicalPhase42DefinitionJson(value)).toThrow(
      "definition contract contains",
    );
  });

  it("fingerprints the reviewed Wilson-floor policy as frozen-only data", () => {
    expect(PHASE_4_2_INCIDENCE_BAND_POLICY).toEqual({
      appliesToDefinitionStatus: "FROZEN",
      appliesToLabelId: "ESTABLISHED_SETTLEMENT",
      candidateAndInheritedDefaultOccurrences: 8,
      reviewedFloorMethod:
        "FLOOR_TWO_SIDED_95_PERCENT_WILSON_LOWER_BOUND_TIMES_REQUIRED_ELIGIBLE_RUNS",
      confidenceLevel: 0.95,
      zScore: 1.95996398454,
      minimumFloorWhenObserved: 1,
      minimumFloorAppliesOnlyWhenObserved: true,
      requiredEligibleRuns: 64,
      interpretation: "RECURRENCE_EVIDENCE_NOT_PREDICTIVE_GUARANTEES",
    });
    expect(PHASE_4_2_DEFINITION_CONTRACT.phase42.incidenceBandPolicy).toEqual(
      PHASE_4_2_INCIDENCE_BAND_POLICY,
    );

    const changedPolicy = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    (changedPolicy.phase42.incidenceBandPolicy as { zScore: number }).zScore = 1.96;
    expect(phase42DefinitionFingerprint(changedPolicy)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );
  });

  it("binds the complete classifier and paired-metric implementation", () => {
    expect(PHASE_4_2_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/u);

    const changedClassifier = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    changedClassifier.analysisImplementation.classifierImplementation.summarizeRunOutcome +=
      "\nsemantic edit";
    expect(phase42DefinitionFingerprint(changedClassifier)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );

    const changedMetric = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    const firstMetric = changedMetric.analysisImplementation.pairedMetricRegistry[0];
    expect(firstMetric).toBeDefined();
    if (firstMetric) firstMetric.readImplementation += "\nsemantic edit";
    expect(phase42DefinitionFingerprint(changedMetric)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );

    const changedGate = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    changedGate.gates.outcomeDominanceThreshold += 0.01;
    expect(phase42DefinitionFingerprint(changedGate)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );

    const changedClassifierRule = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    changedClassifierRule.phase42.classifierRules.shelterCrowdingMinimumEvents += 1;
    expect(phase42DefinitionFingerprint(changedClassifierRule)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );

    const changedPhase42Band = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    changedPhase42Band.phase42.incidenceBands.push({
      tableVersion: 1,
      scenarioId: "petri-world",
      labelId: "ESTABLISHED_SETTLEMENT",
      metricPath: "analysis.outcomes.incidence[ESTABLISHED_SETTLEMENT].occurrences",
      comparison: "GTE",
      threshold: 8,
      requiredEligibleRuns: 64,
    });
    expect(phase42DefinitionFingerprint(changedPhase42Band)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );

    const changedInheritedBand = structuredClone(PHASE_4_2_DEFINITION_CONTRACT);
    const firstBand = changedInheritedBand.inheritedPhase41.pairedMacroBands[0];
    expect(firstBand).toBeDefined();
    if (firstBand) firstBand.minimumAbsoluteMeanDelta += 1;
    expect(phase42DefinitionFingerprint(changedInheritedBand)).not.toBe(
      PHASE_4_2_DEFINITION_FINGERPRINT,
    );
  });
});
