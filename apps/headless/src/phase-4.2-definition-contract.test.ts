import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import {
  PHASE_4_2_DEFINITION_CONTRACT,
  PHASE_4_2_DEFINITION_FINGERPRINT,
  PHASE_4_2_FROZEN_VERSIONS,
  PHASE_4_2_INCIDENCE_BAND_POLICY,
  canonicalPhase42DefinitionJson,
  phase42DefinitionFingerprint,
} from "./phase-4.2-definition-contract.js";
import {
  PHASE_4_2_HOLDOUT_EXECUTION_ENABLED,
  PHASE_4_2_HOLDOUT_STATUS,
} from "./phase-4.2-corpora.js";
import {
  PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION,
  PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION_SHA256,
} from "./phase-4.2-frozen-analysis-contract.js";

describe("Phase 4.2 frozen-definition fingerprint", () => {
  it("pins the recorded definition versions independently of current runtime versions", () => {
    expect(PHASE_4_2_FROZEN_VERSIONS).toEqual({
      behavior: 5,
      activityProfile: 5,
      scenarioEnvelope: 2,
      scenarioDefinition: 2,
      mapGeneration: 1,
      scenarioAnalysis: 4,
      outcomeClassifier: 3,
    });
    expect(PHASE_4_2_DEFINITION_CONTRACT.versions).toEqual(PHASE_4_2_FROZEN_VERSIONS);
    expect(PHASE_4_2_HOLDOUT_STATUS).toBe("RECORDED");
    expect(PHASE_4_2_HOLDOUT_EXECUTION_ENABLED).toBe(false);
  });

  it("preserves the reviewed fingerprint in the operational tsx runtime", () => {
    // The contract intentionally authenticates Function#toString() projections.
    // Vitest rewrites imported functions, so run this exact-hash regression under
    // the same tsx runtime used by the headless evidence commands.
    const require = createRequire(import.meta.url);
    const tsxCliPath = require.resolve("tsx/cli");
    const contractModuleUrl = new URL("./phase-4.2-definition-contract.ts", import.meta.url)
      .href;
    const program = `import(${JSON.stringify(contractModuleUrl)}).then((module) => process.stdout.write(module.PHASE_4_2_DEFINITION_FINGERPRINT))`;
    const operationalFingerprint = execFileSync(
      process.execPath,
      [tsxCliPath, "-e", program],
      { encoding: "utf8" },
    );

    expect(operationalFingerprint).toBe(
      "3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6",
    );
  });

  it("checksums the readable classifier-v3 semantic snapshot", () => {
    expect(
      createHash("sha256")
        .update(JSON.stringify(PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION), "utf8")
        .digest("hex"),
    ).toBe(PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION_SHA256);
  });

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
