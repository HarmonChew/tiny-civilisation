import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO_PRESET,
  SCENARIO_PRESETS,
  normalizeSeed,
  scenarioPresetById,
} from "./scenario-presets";

describe("scenario presets", () => {
  it("provides distinct, discoverable deterministic seeds", () => {
    expect(new Set(SCENARIO_PRESETS.map((preset) => preset.seed)).size).toBe(
      SCENARIO_PRESETS.length,
    );
    expect(scenarioPresetById(DEFAULT_SCENARIO_PRESET.id)).toEqual(DEFAULT_SCENARIO_PRESET);
  });

  it("normalizes valid seeds and rejects unsafe values", () => {
    expect(normalizeSeed(4_182)).toBe(4_182);
    expect(() => normalizeSeed(-1)).toThrow("whole number");
    expect(() => normalizeSeed(1.2)).toThrow("whole number");
    expect(() => normalizeSeed(0x1_0000_0000)).toThrow("whole number");
  });
});
