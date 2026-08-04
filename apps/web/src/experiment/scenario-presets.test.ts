import {
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_IDS,
  compileScenario,
  scenarioCatalogProjection,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO_PRESET,
  SCENARIO_PRESETS,
  normalizeSeed,
  scenarioPresetById,
} from "./scenario-presets";

describe("scenario presets", () => {
  it("projects all four authoritative scenarios without a parallel browser catalog", () => {
    const authoritative = scenarioCatalogProjection();

    expect(SCENARIO_PRESETS.map((preset) => preset.id)).toEqual(SCENARIO_IDS);
    expect(SCENARIO_PRESETS).toHaveLength(4);
    expect(
      SCENARIO_PRESETS.map(
        ({ id, name, role, prompt, startingFacts, observableTensions, reference }) => ({
          scenarioId: id,
          scenarioVersion: reference.scenarioVersion,
          mapGenerationVersion: reference.mapGenerationVersion,
          name,
          role,
          dramaticQuestion: prompt,
          startingFacts,
          observableTensions,
        }),
      ),
    ).toEqual(authoritative);
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.seed).toBe(SCENARIO_CANONICAL_SEEDS[preset.id]);
      expect(preset.reference.scenarioId).toBe(preset.id);
      expect(preset.reference.seed).toBe(preset.seed);
      expect(preset.compiledMapHash).toBe(
        compileScenario(preset.reference).compiledMapHash,
      );
    }
    expect(scenarioPresetById(DEFAULT_SCENARIO_PRESET.id)).toEqual(DEFAULT_SCENARIO_PRESET);
  });

  it("keeps scenario structure independent from the chosen seed", () => {
    const sharedSeed = 42;
    const hashes = SCENARIO_IDS.map(
      (scenarioId) =>
        compileScenario({
          ...scenarioPresetById(scenarioId)!.reference,
          seed: sharedSeed,
        }).compiledMapHash,
    );

    expect(new Set(hashes).size).toBe(SCENARIO_IDS.length);
  });

  it("normalizes valid seeds and rejects unsafe values", () => {
    expect(normalizeSeed(4_182)).toBe(4_182);
    expect(() => normalizeSeed(-1)).toThrow("whole number");
    expect(() => normalizeSeed(1.2)).toThrow("whole number");
    expect(() => normalizeSeed(0x1_0000_0000)).toThrow("whole number");
  });
});
