import { describe, expect, it } from "vitest";

import {
  PHASE_4_3_DEFINITION_CONTRACT,
  PHASE_4_3_DEFINITION_FINGERPRINT,
  PHASE_4_3_DEFINITION_STATUS,
  canonicalPhase43DefinitionJson,
  phase43DefinitionFingerprint,
} from "./phase-4.3-definition-contract.js";
import {
  PHASE_4_3_HOLDOUT_EXECUTION_ENABLED,
  PHASE_4_3_HOLDOUT_STATUS,
} from "./phase-4.3-corpora.js";

describe("Phase 4.3 candidate-definition fingerprint", () => {
  it("binds lifecycle versions, constants, implementation, corpora, and protocol", () => {
    expect(PHASE_4_3_DEFINITION_STATUS).toBe("CANDIDATE");
    expect(PHASE_4_3_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/u);
    expect(PHASE_4_3_DEFINITION_CONTRACT).toMatchObject({
      versions: {
        behavior: 6,
        state: 6,
        activityProfile: 6,
        scenarioDefinition: 3,
        scenarioAnalysis: 5,
        outcomeClassifier: 4,
        interventionResponse: 4,
      },
      lifecycleRules: {
        fertility: { gestationTicks: 1_000, reproductionCooldownTicks: 6_000 },
        caps: { maximumLivingPopulation: 24, maximumTotalIdentities: 256 },
      },
      unifiedHumanProtocol: {
        formativeParticipants: 5,
        confirmatoryParticipants: 5,
        passingParticipantsRequiredPerRubricRow: 4,
      },
    });
    expect(PHASE_4_3_HOLDOUT_STATUS).toBe("SEALED");
    expect(PHASE_4_3_HOLDOUT_EXECUTION_ENABLED).toBe(false);
  });

  it("canonicalizes object keys while preserving semantic array order", () => {
    expect(canonicalPhase43DefinitionJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalPhase43DefinitionJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(phase43DefinitionFingerprint({ labels: ["A", "B"] })).not.toBe(
      phase43DefinitionFingerprint({ labels: ["B", "A"] }),
    );
  });

  it("invalidates the candidate fingerprint for semantic edits", () => {
    const changedCap = structuredClone(PHASE_4_3_DEFINITION_CONTRACT);
    changedCap.lifecycleRules.caps.maximumLivingPopulation += 1;
    expect(phase43DefinitionFingerprint(changedCap)).not.toBe(
      PHASE_4_3_DEFINITION_FINGERPRINT,
    );

    const changedClassifier = structuredClone(PHASE_4_3_DEFINITION_CONTRACT);
    changedClassifier.analysis.semanticContract.classifierImplementation.summarizeRunOutcome +=
      "\nsemantic edit";
    expect(phase43DefinitionFingerprint(changedClassifier)).not.toBe(
      PHASE_4_3_DEFINITION_FINGERPRINT,
    );

    const changedProtocol = structuredClone(PHASE_4_3_DEFINITION_CONTRACT);
    changedProtocol.unifiedHumanProtocol.passingParticipantsRequiredPerRubricRow = 3;
    expect(phase43DefinitionFingerprint(changedProtocol)).not.toBe(
      PHASE_4_3_DEFINITION_FINGERPRINT,
    );
  });
});
