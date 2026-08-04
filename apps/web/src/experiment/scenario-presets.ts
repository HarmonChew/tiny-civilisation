import {
  DEFAULT_SCENARIO_ID,
  SCENARIO_CANONICAL_SEEDS,
  compileScenario,
  createScenarioReference,
  scenarioCatalogProjection,
  type ScenarioId,
  type ScenarioReferenceV2,
} from "@tiny-civ/sim-core";
import type { ScenarioView } from "../model";

/** Browser projection of the authoritative sim-core catalog. */
export interface ScenarioPreset {
  id: ScenarioId;
  name: string;
  role: string;
  seed: number;
  prompt: string;
  startingFacts: readonly string[];
  observableTensions: readonly string[];
  landmarks: ScenarioView["landmarks"];
  reference: ScenarioReferenceV2;
  compiledMapHash: string;
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = Object.freeze(
  scenarioCatalogProjection().map((scenario) => {
    const seed = SCENARIO_CANONICAL_SEEDS[scenario.scenarioId];
    const reference = createScenarioReference(scenario.scenarioId, seed);
    const compiled = compileScenario(reference);
    return Object.freeze({
      id: scenario.scenarioId,
      name: scenario.name,
      role: scenario.role,
      seed,
      prompt: scenario.dramaticQuestion,
      startingFacts: Object.freeze([...scenario.startingFacts]),
      observableTensions: Object.freeze([...scenario.observableTensions]),
      landmarks: Object.freeze([
        ...compiled.regions.map((region) =>
          Object.freeze({
            kind: "REGION" as const,
            id: region.id,
            label: region.label,
            tileIndices: Object.freeze([...region.tileIndices]),
          }),
        ),
        ...compiled.chokepoints.map((chokepoint) =>
          Object.freeze({
            kind: "CHOKEPOINT" as const,
            id: chokepoint.id,
            label: chokepoint.label,
            tileIndices: Object.freeze([...chokepoint.tileIndices]),
          }),
        ),
      ]),
      reference,
      compiledMapHash: compiled.compiledMapHash,
    });
  }),
);

export const DEFAULT_SCENARIO_PRESET =
  SCENARIO_PRESETS.find((scenario) => scenario.id === DEFAULT_SCENARIO_ID) ??
  SCENARIO_PRESETS[0]!;

export const DEFAULT_SCENARIO_VIEW: ScenarioView = Object.freeze({
  reference: DEFAULT_SCENARIO_PRESET.reference,
  compiledMapHash: DEFAULT_SCENARIO_PRESET.compiledMapHash,
  name: DEFAULT_SCENARIO_PRESET.name,
  role: DEFAULT_SCENARIO_PRESET.role,
  dramaticQuestion: DEFAULT_SCENARIO_PRESET.prompt,
  startingFacts: [...DEFAULT_SCENARIO_PRESET.startingFacts],
  observableTensions: [...DEFAULT_SCENARIO_PRESET.observableTensions],
  landmarks: DEFAULT_SCENARIO_PRESET.landmarks.map((landmark) => ({
    ...landmark,
    tileIndices: [...landmark.tileIndices],
  })),
});

export function scenarioPresetById(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((preset) => preset.id === id);
}

export function normalizeSeed(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Seed must be a whole number from 0 to 4,294,967,295.");
  }
  return value >>> 0;
}
