export interface ScenarioPreset {
  id: string;
  name: string;
  seed: number;
  prompt: string;
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: "food-pressure",
    name: "Food pressure",
    seed: 4_182,
    prompt: "What happens when scarcity tests generosity, trust, and shared storage?",
  },
  {
    id: "quiet-accord",
    name: "Quiet accord",
    seed: 921,
    prompt:
      "Will repeated cooperation hold when creatures have room to form familiar bonds?",
  },
  {
    id: "uneasy-passage",
    name: "Uneasy passage",
    seed: 23,
    prompt: "How will proximity around the central passage alter sharing and rivalry?",
  },
] as const;

export const DEFAULT_SCENARIO_PRESET = SCENARIO_PRESETS[0]!;

export function scenarioPresetById(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((preset) => preset.id === id);
}

export function normalizeSeed(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Seed must be a whole number from 0 to 4,294,967,295.");
  }
  return value >>> 0;
}
